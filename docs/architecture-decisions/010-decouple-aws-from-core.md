# ADR-010: Decouple AWS SDK Dependencies from @friggframework/core

**Status**: Accepted
**Date**: 2026-03-03
**Deciders**: Sean, Frigg Team

## Context

`@friggframework/core` directly imported multiple AWS SDK v3 packages:

- `@aws-sdk/client-sqs` — in `Worker.js`, `queuer-util.js`
- `@aws-sdk/client-kms` — in `Cryptor.js`
- `@aws-sdk/client-apigatewaymanagementapi` — in WebSocket connection repositories and the Mongoose `WebsocketConnection` model
- AWS-specific health check logic (VPC detection, KMS capability) — in `health.js`

This tight coupling meant that **any** consumer of `@friggframework/core` pulled in all AWS SDKs at install time, even if deploying to a non-AWS platform (e.g., Netlify, Vercel, or Docker on GCP/Azure). Bundle size on Netlify was unnecessarily large, and esbuild would fail or produce warnings when tree-shaking unused AWS SDK code.

The recent DDD/hexagonal architecture work established clean layer boundaries (handlers → use cases → repositories), but the infrastructure layer itself was still AWS-native throughout.

## Decision

**Extract all AWS SDK dependencies from `@friggframework/core` into `@friggframework/provider-aws`.**

This is a **breaking change**. Instead of using lazy-loading with backward-compatible auto-discovery of AWS adapters, we require consumers to explicitly install `@friggframework/provider-aws` and inject the appropriate adapters via constructor options or setter methods.

### Why breaking change instead of backward compatibility?

1. **Explicit is better than implicit** — Lazy-loading hid a hard dependency behind a `require()` call that would fail at runtime with a confusing error if `@friggframework/provider-aws` wasn't installed. An explicit constructor error at initialization time is clearer.

2. **No phantom dependencies** — With lazy-loading, `@friggframework/core` still had a runtime dependency on `@friggframework/provider-aws` for AWS users, but this wasn't declared in `package.json`. Forgetting to install it would cause cryptic failures deep in the call stack.

3. **Clean architecture** — Hexagonal architecture requires that adapters are explicitly wired at the composition root (app startup), not auto-discovered at call time. Lazy-loading violated this principle.

4. **Bundle safety** — Even with lazy `require()`, some bundlers (esbuild, webpack) will follow the require path and include the AWS SDK in the bundle. Removing the `require()` entirely guarantees zero AWS SDK code in non-AWS bundles.

### Architecture

```
@friggframework/core (ports/interfaces)
├── QueueClientInterface          — port for queue messaging
├── EncryptionKeyProviderInterface — port for envelope encryption keys
├── WebSocketMessageSenderInterface — port for WebSocket message sending
├── AesEncryptionKeyProvider       — built-in AES adapter (no AWS)
└── StaleConnectionError           — shared error type

@friggframework/provider-aws (adapters)
├── SqsQueueClient                — implements QueueClientInterface
├── KmsEncryptionKeyProvider       — implements EncryptionKeyProviderInterface
├── ApiGatewayMessageSender        — implements WebSocketMessageSenderInterface
├── EventBridgeSchedulerAdapter    — scheduler adapter
└── health/kms-health-check        — KMS + VPC health checks

@friggframework/provider-netlify (adapters)
├── NetlifyBackgroundProvider      — implements QueueProvider
└── QStashQueueProvider            — implements QueueProvider
```

## Migration Guide

### 1. Install the AWS provider package

```bash
npm install @friggframework/provider-aws
```

### 2. Worker — inject queueClient

**Before (v2):**
```javascript
const { Worker } = require('@friggframework/core');

class MyWorker extends Worker {
    // queueClient was auto-loaded from SQS
}
const worker = new MyWorker();
```

**After (v3):**
```javascript
const { Worker } = require('@friggframework/core');
const { SqsQueueClient } = require('@friggframework/provider-aws');

class MyWorker extends Worker {
    // Same _run() implementation — no changes needed
}
const worker = new MyWorker({ queueClient: new SqsQueueClient() });
```

### 3. Cryptor — inject keyProvider for KMS

**Before (v2):**
```javascript
const { Cryptor } = require('@friggframework/core');
const cryptor = new Cryptor({ shouldUseAws: true });
```

**After (v3):**
```javascript
const { Cryptor } = require('@friggframework/core');
const { KmsEncryptionKeyProvider } = require('@friggframework/provider-aws');

const cryptor = new Cryptor({
    shouldUseAws: true,
    keyProvider: new KmsEncryptionKeyProvider(),
});
```

**AES mode (unchanged):**
```javascript
// AES mode still works without provider-aws — no changes needed
const cryptor = new Cryptor({ shouldUseAws: false });
```

### 4. QueuerUtil — call setQueueClient() at startup

**Before (v2):**
```javascript
const { QueuerUtil } = require('@friggframework/core');
await QueuerUtil.send(message, queueUrl); // auto-loaded SQS
```

**After (v3):**
```javascript
const { QueuerUtil } = require('@friggframework/core');
const { SqsQueueClient } = require('@friggframework/provider-aws');

// At application startup:
QueuerUtil.setQueueClient(new SqsQueueClient());

// Then use as before:
await QueuerUtil.send(message, queueUrl);
```

### 5. WebSocket Connection Repositories — inject messageSender

**Before (v2):**
```javascript
const repo = new WebsocketConnectionRepository(prisma);
// messageSender was auto-loaded from API Gateway
```

**After (v3):**
```javascript
const { ApiGatewayMessageSender } = require('@friggframework/provider-aws');

const repo = new WebsocketConnectionRepository(
    prisma,
    new ApiGatewayMessageSender()
);
```

### 6. WebsocketConnection Mongoose model — call setMessageSender()

**Before (v2):**
```javascript
const { WebsocketConnection } = require('@friggframework/core');
const connections = await WebsocketConnection.getActiveConnections();
// messageSender was auto-loaded from API Gateway
```

**After (v3):**
```javascript
const { WebsocketConnection } = require('@friggframework/core');
const { ApiGatewayMessageSender } = require('@friggframework/provider-aws');

// At application startup:
WebsocketConnection.setMessageSender(new ApiGatewayMessageSender());

// Then use as before:
const connections = await WebsocketConnection.getActiveConnections();
```

### 7. Health checks — no changes needed

The health router (`health.js`) uses a try/catch around `require('@friggframework/provider-aws')`. If the package is installed, AWS health checks (KMS, VPC) run as before. If not, they return `{ status: 'skipped' }`. No migration needed.

### 8. Recommended: wire adapters at the composition root

For clean architecture, wire all adapters at your application's entry point:

```javascript
// app.js or handler.js — composition root
const { SqsQueueClient, KmsEncryptionKeyProvider, ApiGatewayMessageSender } =
    require('@friggframework/provider-aws');
const { QueuerUtil } = require('@friggframework/core');

// Wire queue adapter
QueuerUtil.setQueueClient(new SqsQueueClient());

// Wire encryption adapter (in prisma.js or wherever Cryptor is instantiated)
const cryptor = new Cryptor({
    shouldUseAws: true,
    keyProvider: new KmsEncryptionKeyProvider(),
});

// Wire WebSocket adapter (in WebSocket handler setup)
const wsRepo = new WebsocketConnectionRepository(
    prisma,
    new ApiGatewayMessageSender()
);
```

## Consequences

### Positive

- **Zero AWS SDK in non-AWS bundles** — `@friggframework/core` has no AWS SDK imports at all
- **Explicit dependencies** — consumers declare which provider they use in `package.json`
- **Clean hexagonal architecture** — ports in core, adapters in provider packages, wired at composition root
- **Platform flexibility** — same core works on AWS, Netlify, Vercel, Docker, or any other platform
- **Better error messages** — clear errors at initialization time instead of cryptic failures deep in the call stack
- **Testability** — easy to inject mock adapters in tests without mocking AWS SDK internals

### Negative

- **Breaking change** — all existing AWS consumers must update their wiring code
- **More boilerplate at startup** — a few extra lines to instantiate and inject adapters
- **Two packages to install** — AWS users need both `@friggframework/core` and `@friggframework/provider-aws`

### Risks

- **Missed injection** — if a consumer forgets to inject an adapter, they get a clear error message pointing to this ADR and showing exactly what code to add
- **Version drift** — core and provider-aws must be compatible; managed via monorepo versioning

## Affected Files

### Core (ports/interfaces created)
- `packages/core/queues/queue-client-interface.js`
- `packages/core/encrypt/encryption-key-provider-interface.js`
- `packages/core/websocket/websocket-message-sender-interface.js`
- `packages/core/encrypt/aes-encryption-key-provider.js`

### Core (lazy-loading removed, explicit injection required)
- `packages/core/core/Worker.js`
- `packages/core/encrypt/Cryptor.js`
- `packages/core/queues/queuer-util.js`
- `packages/core/websocket/repositories/websocket-connection-repository.js`
- `packages/core/websocket/repositories/websocket-connection-repository-mongo.js`
- `packages/core/websocket/repositories/websocket-connection-repository-postgres.js`
- `packages/core/websocket/repositories/websocket-connection-repository-documentdb.js`
- `packages/core/database/models/WebsocketConnection.js`
- `packages/core/handlers/routers/health.js` (graceful try/catch, not strict)

### Provider-AWS (adapters created)
- `packages/providers/aws/queues/sqs-queue-client.js`
- `packages/providers/aws/encryption/kms-encryption-key-provider.js`
- `packages/providers/aws/websocket/api-gateway-message-sender.js`
- `packages/providers/aws/health/kms-health-check.js`
