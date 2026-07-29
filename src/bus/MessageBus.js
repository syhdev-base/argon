import { Scheduler, BusOverloadedError } from './Scheduler.js';
import { DEFAULT_TIMEOUT } from '../types/index.js';

export class TimeoutError extends Error {
  constructor() {
    super('TimeoutError');
    this.name = 'TimeoutError';
  }
}

export class MessageBus {
  #scheduler = new Scheduler();
  #pending = new Map();
  #requestIdCounter = 0;
  #dispatcher = null;

  constructor() {
    this.#scheduler.start();
  }

  setDispatcher(dispatcher) {
    this.#dispatcher = dispatcher;
  }

  request(fromId, targetId, data, timeout = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const requestId = this.#nextRequestId();
      const timer = setTimeout(() => {
        const pending = this.#pending.get(requestId);
        if (pending) {
          this.#pending.delete(requestId);
          reject(new TimeoutError());
        }
      }, timeout);
      this.#pending.set(requestId, { resolve, reject, timer });
      try {
        this.#scheduler.enqueueData(() => {
          if (!this.#dispatcher) {
            this.#pending.delete(requestId);
            clearTimeout(timer);
            reject(new Error('Dispatcher not set'));
            return;
          }
          this.#dispatcher(fromId, {
            type: 'request',
            targetId,
            requestId,
            data
          });
        });
      } catch (err) {
        this.#pending.delete(requestId);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  send(fromId, targetId, data) {
    this.#scheduler.enqueueMessage(() => {
      if (!this.#dispatcher) return;
      this.#dispatcher(fromId, {
        type: 'send',
        targetId,
        data
      });
    });
  }

  sendResponse(requestId, data) {
    const pending = this.#pending.get(requestId);
    if (pending) {
      this.#pending.delete(requestId);
      clearTimeout(pending.timer);
      pending.resolve(data);
    }
  }

  #nextRequestId() {
    return ++this.#requestIdCounter;
  }
}

export { BusOverloadedError };
