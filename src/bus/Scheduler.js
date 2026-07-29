import {
  DATA_QUEUE_CAPACITY,
  MSG_QUEUE_CAPACITY,
  DATA_PER_FRAME,
  MSG_MIN_PER_FRAME,
  MSG_MAX_PER_FRAME
} from '../types/index.js';

export class BusOverloadedError extends Error {
  constructor() {
    super('BusOverloadedError');
    this.name = 'BusOverloadedError';
  }
}

export class Scheduler {
  constructor() {
    this.dataQueue = [];
    this.msgQueue = [];
    this.running = false;
    this.rafId = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  enqueueData(task) {
    if (this.dataQueue.length >= DATA_QUEUE_CAPACITY) {
      throw new BusOverloadedError();
    }
    this.dataQueue.push(task);
  }

  enqueueMessage(task) {
    if (this.msgQueue.length >= MSG_QUEUE_CAPACITY) {
      this.msgQueue.shift();
    }
    this.msgQueue.push(task);
  }

  _loop() {
    if (!this.running) return;
    const dataQueue = this.dataQueue;
    const msgQueue = this.msgQueue;
    const dataLimit = Math.min(DATA_PER_FRAME, dataQueue.length);
    for (let i = 0; i < dataLimit; i++) {
      const task = dataQueue.shift();
      if (task) task();
    }
    const msgLimit = dataQueue.length === 0
      ? Math.min(MSG_MAX_PER_FRAME, msgQueue.length)
      : Math.min(MSG_MIN_PER_FRAME, msgQueue.length);
    for (let i = 0; i < msgLimit; i++) {
      const task = msgQueue.shift();
      if (task) task();
    }
    this.rafId = requestAnimationFrame(() => this._loop());
  }
}
