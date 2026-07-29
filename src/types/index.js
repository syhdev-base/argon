export const DEFAULT_TIMEOUT = 30000;
export const DATA_QUEUE_CAPACITY = 1000;
export const MSG_QUEUE_CAPACITY = 5000;
export const DATA_PER_FRAME = 50;
export const MSG_MIN_PER_FRAME = 10;
export const MSG_MAX_PER_FRAME = 100;
export const RESOLVE_RATE_LIMIT = 50;
export const RESOLVE_RATE_WINDOW_MS = 60000;

/**
 * @typedef {'registered' | 'active' | 'destroyed'} EntityState
 */

/**
 * @typedef {Object} EntityDefinition
 * @property {string} name
 * @property {string[]} capabilities
 * @property {() => Promise<void>} init
 * @property {(() => void)=} destroy
 */

/**
 * @typedef {Object} Session
 * @property {(data: any) => void} send
 * @property {() => void} close
 * @property {(callback: () => void) => void} onClose
 */

/**
 * @typedef {Object} KernelAPI
 * @property {() => void} destroy
 * @property {() => EntityState} getStatus
 */

/**
 * @typedef {Object} Context
 * @property {(name: string) => string | null} resolveEntity
 * @property {(targetId: string, data: any, options?: { timeout?: number }) => Promise<any>} request
 * @property {(targetId: string, data: any) => void} send
 * @property {(targetId: string) => Session} createSession
 * @property {KernelAPI} kernel
 */

/**
 * @typedef {Object} EntityMeta
 * @property {string} id
 * @property {string} name
 * @property {EntityState} state
 * @property {ReadonlySet<string>} capabilities
 * @property {EntityDefinition} def
 */
