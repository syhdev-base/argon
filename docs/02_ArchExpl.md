# Project "Argon" Architecture Explanations
*Version: 0.1.0*

## 1. Overall Architecture Layers

The system consists of four independent, loosely coupled core components:

- **Kernel**: Maintains the entity registry, generates unique IDs, manages lifecycle (register/destroy), and provides the `resolveEntity` query interface (returns IDs only). It does not maintain inter-entity relationships or forward any business messages.
- **Message Bus**: An independently running forwarding layer that provides two communication modes:
  - **Message Communication (Session)**: Long-lived connections based on MessageChannel, supporting broadcast, pursuing speed and low latency.
  - **Data Communication (Request)**: Single request/response with built-in timeout detection (throws `TimeoutError` on timeout). Timeout duration is passed by the caller in each `ctx.request()` call via an `options` parameter (e.g., `ctx.request(id, data, { timeout: 30000 })`). If not specified, the Bus applies a default timeout of 30000ms. Retry strategies are left to entities to implement (e.g., exponential backoff).
  The Message Bus internally contains a **Scheduler** that maintains a Data Queue (high priority, capacity 1000) and a Message Queue (low priority, capacity 5000), processing with **weighted fairness**.
- **Sandbox**: Intercepts entity access to `globalThis` via ES Proxy. `eval` and `new Function` are explicitly disabled (`globalThis.eval = undefined`, `globalThis.Function = undefined`) to prevent sandbox escape. Only two categories of capabilities are allowed:
  - **Base Capabilities** (console, setTimeout, send, kernel interfaces, etc.) — injected automatically upon registration without declaration.
  - **Privileged Drivers** (fetch, localStorage, etc.) — only allowed when declared in the entity's `capabilities` list at registration.
  The capability list is frozen at registration (`ReadonlySet`), with no runtime modification interfaces.
- **Entity**: A container for business logic with completely free internal code organization. It accesses drivers, communication, and kernel interfaces through `ctx` (context). All code runs inside the Sandbox.

## 2. Entity Lifecycle States

Each entity transitions through the following states:

| State | Description |
|:---|:---|
| `'registered'` | Entity has been registered with the Kernel, but `init()` has not yet completed. |
| `'active'` | Entity is fully initialized and ready to receive/send messages. |
| `'destroyed'` | Entity has been destroyed and removed from the registry. All sessions are closed. |

**State Transition Rules**:
- Upon successful registration, the entity enters `'registered'` state.
- After `init()` completes successfully, the entity transitions to `'active'`.
- If `init()` throws an error or returns a rejected Promise, the Kernel **automatically catches** the exception, transitions the entity directly to `'destroyed'`, cleans up all registration information, and throws a `RegistrationError` to the caller. The entity will not remain in `'registered'` as a zombie.
- `resolveEntity(name)` returns the ID **only if** the target entity is in `'active'` state; otherwise returns `null`.
- Entities that receive `null` from `resolveEntity` should implement retry logic (e.g., exponential backoff with jitter).

## 3. Directory Structure

```
{root}/
├── src/
│   ├── core/
│   │   ├── Kernel.js                 # Kernel main class (register/destroy/ID management)
│   │   └── Sandbox.js                # Sandbox isolation layer (Proxy interception)
│   ├── bus/
│   │   ├── MessageBus.js             # Message Bus (message + data dual-mode)
│   │   ├── Session.js                # Session object (message communication)
│   │   └── Scheduler.js              # Dual-queue scheduler (backpressure control)
│   ├── drivers/
│   │   ├── Driver.js                 # Driver base class / interface definition
│   │   ├── FetchDriver.js            # Network driver (fetch wrapper)
│   │   ├── StorageDriver.js          # Storage driver (localStorage/IndexedDB)
│   │   └── HistoryDriver.js          # Routing driver (history API)
│   ├── types/
│   │   └── index.js                  # JSDoc type definitions (for IDE intellisense)
│   └── index.js                      # Entry point (exposes ArgonKernel singleton)
├── docs/                             # Project documents
├── package.json
├── README.md
└── LICENSE

```

## 4. Core Interaction Flows

- **Registration Phase**: An entity registers with the Kernel, providing its `name` and `capabilities` list. The Kernel generates a unique high-entropy ID (e.g., `ent_xxxx`), records the `name → id` mapping, transitions the entity to `'registered'` state, and injects the frozen capability list into the Sandbox. After `init()` completes successfully, the entity transitions to `'active'` state. If `init()` fails, the entity is automatically destroyed and cleaned up.
- **Runtime Driver Invocation**: The entity calls `fetch(url)`. The Sandbox intercepts `globalThis.fetch`, checks that the capability is present, and returns the driver proxy directly (synchronous, no IPC). The driver performs the actual I/O and returns the result.
- **Inter-Entity Communication**: Entity A must obtain the target ID via `ctx.resolveEntity('order-broker')` (requires prior knowledge of the name, returns `null` if target is not `'active'`). After obtaining the ID, it uses `ctx.createSession(id)` or `ctx.request(id)` to communicate. The Kernel verifies permissions — specifically: (1) checking that the calling entity is `'active'`, and (2) checking that the target entity exists and is `'active'`. No additional Access Control List (ACL) is consulted. Any active entity can initiate a session to any other active entity. The Kernel then creates the session and hands it over to the Message Bus. All subsequent messages flow directly through the Bus, with the Kernel uninvolved.
- **Lifecycle Control**: An entity can self-destruct via `ctx.kernel.destroy()` (no arguments — destroys only itself). The Kernel can also actively destroy an entity. Upon destruction, the Kernel notifies the Message Bus to forcibly close all sessions involving the entity, triggering the `onClose` callback on the other side.

## 5. Security Model

- **Information Hiding**: Entities cannot query the status, capabilities, or list of other entities through the Kernel.
- **Name/ID Separation**: Names are for human readability, IDs (high-entropy UUIDs) are for routing. Querying an ID requires prior knowledge of the name, with rate limiting (50 requests/minute per calling entity) and error obfuscation (non-existent/not-active/destroyed entities all return `null`).
- **Frozen Capabilities**: No runtime `grant`/`revoke` interfaces exist, preventing privilege escalation.
- **Sandbox Interception**: Any access to global properties not in the capability list throws an error. `eval` and `new Function` are explicitly disabled.
- **`ctx.kernel` Scope**: The `ctx.kernel` object provides interfaces that operate **only on the calling entity itself**. `ctx.kernel.destroy()` destroys only the caller. `ctx.kernel.getStatus()` returns the calling entity's own current state (`'registered'` | `'active'` | `'destroyed'`). It does not accept any arguments, and any attempt to query another entity's status is impossible by design — the interface simply does not expose such functionality. `resolveEntity` is mounted directly on `ctx` (not on `ctx.kernel`) to clearly separate query APIs from management APIs.
- **Resource Isolation**: Storage keys are automatically prefixed with the entity name to prevent key collisions. **This prefix does not provide security isolation** — security is enforced by the Sandbox's capability control. Drivers may implement additional key validation (e.g., rejecting access to keys with other entity prefixes).

## 6. Weighted Fair Dual-Queue Scheduler

The Scheduler prevents both overload and starvation through weighted fairness:

| Queue | Carries | Priority | Capacity | Per-Frame Limit | Full Behavior |
|:---|:---|:---|:---|:---|:---|
| **Data Queue** | `ctx.request` calls | High | 1000 | Up to 50 tasks | Throws `BusOverloadedError` |
| **Message Queue** | `session.send` real-time messages | Low | 5000 | At least 10 tasks | Drops oldest messages |

**Scheduling Loop** (per `requestAnimationFrame`):
1. Process up to 50 tasks from the Data Queue.
2. **Regardless of whether the Data Queue is empty**, process at least 10 tasks from the Message Queue (and up to 100 if Data Queue is empty).
3. This guarantees that real-time messages are never completely starved, even under heavy data request load.

## 7. Driver Layer Design

- Drivers are divided into **Privileged Drivers** (Fetch, Storage, History, etc.) and **Public Utilities** (setTimeout, console, etc.). Public utilities are injected directly without declaration; privileged drivers must be declared in `capabilities`.
- Driver interfaces maintain native style (e.g., `fetch(url)`, `localStorage.setItem(key, value)`). The Sandbox returns driver functions directly without modifying signatures (preserving sync/async characteristics).
- Storage drivers automatically prefix keys with the entity name to prevent collisions. **This prefix provides collision avoidance, not security isolation.** Security is enforced by the Sandbox's capability list.
- Drivers may implement additional validation (e.g., rejecting keys that do not match the entity's own prefix).

## 8. Error Handling and Backpressure

- When the Data Queue is full, `ctx.request` immediately throws a `BusOverloadedError`. Entities must catch it and implement retries (e.g., exponential backoff with jitter).
- When the Message Queue is full, it silently drops old messages to keep the system running.
- When an entity is destroyed, all active sessions trigger `onClose` on the remote side, allowing it to clean up resources.
- Rate limiting (50 `resolveEntity` queries per minute) is enforced **per calling entity ID**, with counters stored in the Kernel. Exceeding the limit returns `null` (consistent with the "not found" behavior).
- Data Communication requests have built-in timeout detection: if a request exceeds the timeout (specified per-call via `options.timeout`, defaulting to 30000ms), the Bus throws a `TimeoutError`. Retry strategies are left to entities to implement.

## 9. Design Decisions and Constraints

- **No Chunked Transfer in v1.0**: Although mentioned as a potential future extension, chunked transfer for large data is **not implemented** in v1.0. Entities requiring large data transfers should split data manually and send via multiple `request` calls.
- **No Suspend State in v1.0**: The `suspend` state is removed from v1.0 to keep the Kernel simple and stable. Only `'registered'`, `'active'`, and `'destroyed'` states are supported.
- **Zero Manual Serialization**: The Message Bus uses `MessageChannel` for Session-based communication. While the browser's structured clone algorithm still performs serialization under the hood, developers are not required to manually serialize/deserialize data.
- **eval and new Function Disabled**: These are explicitly set to `undefined` in the Sandbox to prevent escape attempts.
- **Resource Isolation Disclaimer**: Storage key prefixes prevent collisions but do not provide security isolation. Security is solely enforced by the Sandbox's capability control.
- **Timeout Detection Only**: The Bus provides timeout detection for Data Communication requests (throws `TimeoutError`). Retry logic is the responsibility of individual entities.
- **No ACL**: The Kernel does not maintain any Access Control List beyond the capability list. Any active entity can communicate with any other active entity.
