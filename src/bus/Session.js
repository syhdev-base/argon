export class Session {
  #port;
  #closeCallbacks = [];
  #messageCallbacks = [];

  constructor(port) {
    this.#port = port;
    this.#port.onmessage = (event) => {
      for (const cb of this.#messageCallbacks) {
        cb(event.data);
      }
    };
    this.#port.onmessageerror = (event) => {
      for (const cb of this.#messageCallbacks) {
        cb(event);
      }
    };
  }

  send(data) {
    this.#port.postMessage(data);
  }

  close() {
    this.#port.close();
    for (const cb of this.#closeCallbacks) {
      cb();
    }
  }

  onMessage(callback) {
    this.#messageCallbacks.push(callback);
  }

  onClose(callback) {
    this.#closeCallbacks.push(callback);
  }
}
