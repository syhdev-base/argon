import { Sandbox } from './Sandbox.js';
import { Session } from '../bus/Session.js';
import { createStorageDriver } from '../drivers/StorageDriver.js';
import { createHistoryDriver } from '../drivers/HistoryDriver.js';
import { RESOLVE_RATE_LIMIT, RESOLVE_RATE_WINDOW_MS } from '../types/index.js';

export class RegistrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistrationError';
  }
}

export class Kernel {
  #bus;
  #entities = new Map();
  #nameToId = new Map();
  #resolveCounters = new Map();
  #idCounter = 0;
  #entitySessions = new Map();

  constructor(bus) {
    this.#bus = bus;
    this.#bus.setDispatcher((fromId, message) => this.#dispatch(fromId, message));
  }

  register(def) {
    const { name, capabilities, init, destroy } = def;
    if (this.#nameToId.has(name)) {
      throw new RegistrationError(`Entity name "${name}" already registered`);
    }
    const id = this.#generateId();
    const capSet = new Set(capabilities);
    const entityMeta = {
      id,
      name,
      state: 'registered',
      capabilities: capSet,
      def: { init, destroy },
      sandbox: null,
      ctx: null,
      sessions: new Set(),
      messageHandler: null
    };
    this.#entities.set(id, entityMeta);
    this.#nameToId.set(name, id);
    this.#entitySessions.set(id, new Set());
    const ctx = this.#createContext(id);
    entityMeta.ctx = ctx;
    const sandbox = new Sandbox(id, ctx, capSet);
    entityMeta.sandbox = sandbox;
    const globalProxy = sandbox.proxy;
    const wrappedInit = init.bind(globalProxy);
    try {
      const result = wrappedInit();
      if (result && typeof result.then === 'function') {
        return result.then(() => {
          entityMeta.state = 'active';
          return id;
        }).catch((err) => {
          this.#destroyEntity(id, true);
          throw new RegistrationError(`Init failed: ${err.message}`);
        });
      } else {
        entityMeta.state = 'active';
        return Promise.resolve(id);
      }
    } catch (err) {
      this.#destroyEntity(id, true);
      throw new RegistrationError(`Init failed: ${err.message}`);
    }
  }

  #dispatch(fromId, message) {
    const targetId = message.targetId || message.fromId;
    if (!targetId) return;
    const target = this.#entities.get(targetId);
    if (!target || target.state !== 'active') return;
    if (target.messageHandler) {
      const handler = target.messageHandler;
      try {
        const result = handler(fromId, message);
        if (message.type === 'request') {
          if (result && typeof result.then === 'function') {
            result.then((data) => {
              this.#bus.sendResponse(message.requestId, data);
            }).catch(() => {
              this.#bus.sendResponse(message.requestId, undefined);
            });
          } else {
            this.#bus.sendResponse(message.requestId, result);
          }
        }
      } catch (err) {
        if (message.type === 'request') {
          this.#bus.sendResponse(message.requestId, undefined);
        }
      }
    }
  }

  resolveEntity(callerId, name) {
    const caller = this.#entities.get(callerId);
    if (!caller || caller.state !== 'active') {
      return null;
    }
    const counter = this.#resolveCounters.get(callerId);
    const now = Date.now();
    if (counter) {
      const recent = counter.filter(t => now - t < RESOLVE_RATE_WINDOW_MS);
      if (recent.length >= RESOLVE_RATE_LIMIT) {
        return null;
      }
      recent.push(now);
      this.#resolveCounters.set(callerId, recent);
    } else {
      this.#resolveCounters.set(callerId, [now]);
    }
    const targetId = this.#nameToId.get(name);
    if (!targetId) {
      return null;
    }
    const target = this.#entities.get(targetId);
    if (!target || target.state !== 'active') {
      return null;
    }
    return targetId;
  }

  request(callerId, targetId, data, options = {}) {
    const caller = this.#entities.get(callerId);
    if (!caller || caller.state !== 'active') {
      return Promise.reject(new Error('Caller not active'));
    }
    const target = this.#entities.get(targetId);
    if (!target || target.state !== 'active') {
      return Promise.reject(new Error('Target not active'));
    }
    const timeout = options.timeout || 30000;
    return this.#bus.request(callerId, targetId, data, timeout);
  }

  send(callerId, targetId, data) {
    const caller = this.#entities.get(callerId);
    if (!caller || caller.state !== 'active') {
      return;
    }
    const target = this.#entities.get(targetId);
    if (!target || target.state !== 'active') {
      return;
    }
    this.#bus.send(callerId, targetId, data);
  }

  createSession(callerId, targetId) {
    const caller = this.#entities.get(callerId);
    if (!caller || caller.state !== 'active') {
      throw new Error('Caller not active');
    }
    const target = this.#entities.get(targetId);
    if (!target || target.state !== 'active') {
      throw new Error('Target not active');
    }
    const channel = new MessageChannel();
    const session = new Session(channel.port1);
    const sessions = this.#entitySessions.get(callerId);
    if (sessions) {
      sessions.add(session);
    }
    session.onClose(() => {
      if (sessions) {
        sessions.delete(session);
      }
    });
    const sessionId = this.#generateId();
    this.#bus.send(callerId, targetId, {
      type: 'session',
      sessionId,
      port: channel.port2
    });
    return session;
  }

  destroyEntity(entityId) {
    const entity = this.#entities.get(entityId);
    if (!entity) {
      return;
    }
    this.#destroyEntity(entityId, false);
  }

  #destroyEntity(entityId, internal) {
    const entity = this.#entities.get(entityId);
    if (!entity) {
      return;
    }
    if (entity.state === 'destroyed') {
      return;
    }
    entity.state = 'destroyed';
    const sessions = this.#entitySessions.get(entityId);
    if (sessions) {
      for (const session of sessions) {
        try {
          session.close();
        } catch (_) {}
      }
      this.#entitySessions.delete(entityId);
    }
    if (entity.def.destroy && !internal) {
      try {
        entity.def.destroy();
      } catch (_) {}
    }
    if (entity.ctx && entity.ctx._historyDriver && entity.ctx._historyDriver._cleanup) {
      try {
        entity.ctx._historyDriver._cleanup();
      } catch (_) {}
    }
    this.#entities.delete(entityId);
    this.#nameToId.delete(entity.name);
    this.#resolveCounters.delete(entityId);
  }

  #generateId() {
    this.#idCounter++;
    return 'ent_' + Date.now().toString(36) + '_' + this.#idCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  #createContext(entityId) {
    const self = this;
    const ctx = {
      resolveEntity: function(name) {
        return self.resolveEntity(entityId, name);
      },
      request: function(targetId, data, options = {}) {
        return self.request(entityId, targetId, data, options);
      },
      send: function(targetId, data) {
        self.send(entityId, targetId, data);
      },
      createSession: function(targetId) {
        return self.createSession(entityId, targetId);
      },
      setMessageHandler: function(handler) {
        const entity = self.#entities.get(entityId);
        if (entity) {
          entity.messageHandler = handler;
        }
      },
      kernel: {
        destroy: function() {
          self.destroyEntity(entityId);
        },
        getStatus: function() {
          const entity = self.#entities.get(entityId);
          if (!entity) {
            return 'destroyed';
          }
          return entity.state;
        }
      },
      _storageDriver: null,
      _historyDriver: null
    };
    const entity = this.#entities.get(entityId);
    if (entity && entity.capabilities.has('localStorage')) {
      ctx._storageDriver = createStorageDriver(entity.name);
    }
    if (entity && entity.capabilities.has('history')) {
      ctx._historyDriver = createHistoryDriver();
    }
    return ctx;
  }
}
