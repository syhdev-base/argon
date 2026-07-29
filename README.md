# Project "Argon"
*Version: 0.1.0*

## Overview

**Project Name**: Argon  
**Motto**: Efficient, Stable, Economical, Secure  
**Tagline**: A microkernel-style Web application framework for the browser — let developers focus on business logic while achieving extreme performance and security.

## Technology Stack

- **Language**: Pure JavaScript (ES Modules), zero transpilation dependencies.
- **Runtime**: Modern browsers (supporting ES Proxy, MessageChannel, crypto.randomUUID), compatible with the `file://` protocol.
- **Dependencies**: Zero third-party libraries.
- **Testing**: Recommended to use Node.js with native test runner (`node:test`) or browser-side frameworks (e.g., Jest/jsdom) for unit testing.
- **Build**: No bundler required; can be directly consumed via `<script type="importmap">` or native ESM imports.

## Core Highlights

- **Minimalist Microkernel**: The Kernel manages only entity lifecycle and permissions. It never participates in business data flow.
- **High-Performance Communication**: Inter-entity communication goes through a dedicated Message Bus (MessageChannel), bypassing the Kernel entirely with zero manual serialization overhead.
- **Dual-Queue with Weighted Fairness**: The Data Queue is prioritized over the Message Queue, but Message Queue is guaranteed a minimum throughput per frame to prevent starvation, ensuring both data integrity and real-time responsiveness.
- **Sandbox Isolation**: Global interception via ES Proxy; `eval` and `new Function` are explicitly disabled. Capability lists are frozen at registration time, with no runtime permission modification interfaces.
- **Complete Entity Isolation**: Entities cannot obtain information about other entities through the Kernel. They can only communicate after querying IDs by name — achieving extreme information hiding.

## Use Cases

Large single-page applications, micro-frontend architectures, real-time collaboration tools, and data-intensive management dashboards.

## License

MIT.
