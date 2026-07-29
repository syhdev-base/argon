import { MessageBus } from './bus/MessageBus.js';
import { Kernel, RegistrationError } from './core/Kernel.js';
import { BusOverloadedError } from './bus/Scheduler.js';
import { TimeoutError } from './bus/MessageBus.js';

const bus = new MessageBus();
const kernel = new Kernel(bus);

export const ArgonKernel = {
  register: function(def) {
    return kernel.register(def);
  },
  resolveEntity: function(callerId, name) {
    return kernel.resolveEntity(callerId, name);
  },
  destroyEntity: function(entityId) {
    kernel.destroyEntity(entityId);
  },
  request: function(callerId, targetId, data, options) {
    return kernel.request(callerId, targetId, data, options);
  },
  send: function(callerId, targetId, data) {
    kernel.send(callerId, targetId, data);
  },
  createSession: function(callerId, targetId) {
    return kernel.createSession(callerId, targetId);
  }
};

export { RegistrationError, TimeoutError, BusOverloadedError };
