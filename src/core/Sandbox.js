const baseCapabilities = new Set([
  'console',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval'
]);

export class Sandbox {
  #entityId;
  #ctx;
  #capabilities;
  #proxy;

  constructor(entityId, ctx, capabilities) {
    this.#entityId = entityId;
    this.#ctx = ctx;
    this.#capabilities = new Set(capabilities);
    this.#proxy = this.#createProxy();
  }

  get proxy() {
    return this.#proxy;
  }

  #createProxy() {
    const ctx = this.#ctx;
    const caps = this.#capabilities;
    const allowedGlobals = new Set([
      'console',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'performance',
      'crypto',
      'URL',
      'URLSearchParams',
      'Blob',
      'File',
      'FormData',
      'TextEncoder',
      'TextDecoder',
      'ArrayBuffer',
      'Uint8Array',
      'DataView'
    ]);
    const self = this;
    return new Proxy(globalThis, {
      get(target, prop, receiver) {
        if (prop === 'eval' || prop === 'Function') {
          return undefined;
        }
        if (prop === 'globalThis' || prop === 'window' || prop === 'self') {
          return self.#proxy;
        }
        if (prop === 'ctx') {
          return ctx;
        }
        if (prop === '_argon_entity_id_') {
          return self.#entityId;
        }
        if (caps.has(prop) || allowedGlobals.has(prop)) {
          return Reflect.get(target, prop, receiver);
        }
        throw new ReferenceError(`Access to global property "${prop}" is not allowed. Missing capability: "${prop}"`);
      },
      set(target, prop, value, receiver) {
        if (prop === 'ctx' || prop === '_argon_entity_id_') {
          return false;
        }
        if (caps.has(prop) || allowedGlobals.has(prop)) {
          return false;
        }
        return Reflect.set(target, prop, value, receiver);
      },
      has(target, prop) {
        if (prop === 'eval' || prop === 'Function') {
          return false;
        }
        if (prop === 'ctx' || prop === '_argon_entity_id_') {
          return true;
        }
        if (caps.has(prop) || allowedGlobals.has(prop)) {
          return true;
        }
        return Reflect.has(target, prop);
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop === 'eval' || prop === 'Function') {
          return undefined;
        }
        if (prop === 'ctx') {
          return {
            enumerable: true,
            configurable: false,
            writable: false,
            value: ctx
          };
        }
        if (prop === '_argon_entity_id_') {
          return {
            enumerable: false,
            configurable: false,
            writable: false,
            value: self.#entityId
          };
        }
        if (caps.has(prop) || allowedGlobals.has(prop)) {
          return Reflect.getOwnPropertyDescriptor(target, prop);
        }
        return undefined;
      }
    });
  }
}
