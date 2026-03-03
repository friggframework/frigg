# Architecture Decision Record: Multi-Provider Support

**Status**: Accepted
**Date**: 2026-03-02

## Context

Frigg was originally built as an AWS-first framework: Lambda for compute, SQS for queues, EventBridge Scheduler for one-time jobs, KMS for encryption, and Serverless Framework for deployment. Every CLI command (`deploy`, `build`, `start`, `doctor`, `repair`, `generate-iam`) assumed AWS.

Customers and community members want to deploy Frigg integrations to platforms beyond AWS — starting with Netlify, with potential for Vercel, GCP Cloud Run, and others. Adding a second provider forces the right abstraction boundaries; supporting N providers is then incremental.

### Requirements

1. Existing AWS deployments must work with minimal migration (see ADR-010 for breaking changes and migration guide).
2. A single `provider` field in the app definition switches the entire toolchain.
3. Provider-specific code lives in separate, installable packages.
4. Core framework code must not import provider-specific modules directly.
5. The CLI, runtime handlers, queues, scheduling, and encryption must all dispatch through the same provider abstraction.

## Decision

Introduce a **provider plugin system** with a standard interface. Each provider is an npm package (`@friggframework/provider-{name}`) that exports adapters for every platform-dependent concern: deployment, configuration generation, queue dispatch, job scheduling, secret loading, and handler creation.

### Provider Plugin Interface

A provider package exports an object conforming to this shape:

```javascript
module.exports = {
    // ─── Identity ────────────────────────────────────
    name: 'netlify',                    // Provider identifier

    // ─── Runtime adapters ────────────────────────────
    createHandler,                      // Express handler factory for the platform
    createAppHandler,                   // App-level handler factory
    QueueProvider,                      // Class: send(), batchSend(), parseEvent()
    SchedulerAdapter,                   // Class: scheduleOneTime(), deleteSchedule(), getScheduleStatus()
    ScheduledJobRepository,             // Class: save(), delete(), findByName(), findDue()
    loadSecrets,                        // async fn: load secrets from platform vault
    invokeFunctionAdapter,              // { invoke(name, payload) }

    // ─── Encryption & WebSockets (optional) ──────────
    CryptorAdapter: null,               // null = reuse core Cryptor
    WebSocketAdapter: null,             // null = not supported

    // ─── Build-time ──────────────────────────────────
    generateConfig,                     // fn(appDef) → config file content (e.g. netlify.toml)
    generateEnvTemplate,                // fn(appDef) → { VAR_NAME: 'description' }
    getFunctionEntryPoints,             // fn(appDef) → { 'api.js': '...code...' }

    // ─── Deployment ──────────────────────────────────
    deploy,                             // async fn(appDef, options)
    preflightCheck,                     // async fn(appDef) → { ready, missing }
    validate,                           // fn(appDef) → { valid, errors[], warnings[] }
    teardown,                           // async fn() — cleanup

    // ─── Detection & metadata ────────────────────────
    detect,                             // fn() → boolean (is this env the provider?)
    recommendedDatabases: ['postgresql'],
    providedEnvVars: ['NETLIFY', 'URL'],
};
```

### Resolution Chain

The `resolveProvider(appDefinition, options)` function in `@friggframework/core` resolves a provider name to its package:

```
1. Explicit providerName argument     (programmatic override)
2. appDefinition.provider             (app definition file)
3. FRIGG_PROVIDER env var             (CI/CD override)
4. Default: 'aws'
```

Name → package: `'netlify'` → `require('@friggframework/provider-netlify')`

AWS is the default, so existing apps that don't set `provider` continue to work unchanged.

### CLI Command Dispatch

Each CLI command follows the same pattern:

```
1. loadProviderForCli()     — reads appDefinition, resolves provider
2. if provider is non-AWS   — delegate to provider.{method}()
3. if provider is AWS/null  — fall through to existing serverless behavior
```

| Command | AWS path | Non-AWS path |
|---------|----------|-------------|
| `deploy` | `osls deploy` | `provider.validate()` → `provider.deploy()` |
| `build` | `osls package` | `provider.validate()` → `provider.generateConfig()` → `provider.getFunctionEntryPoints()` |
| `start` | `serverless-offline` | Platform CLI (e.g. `netlify dev`) |
| `doctor` | CloudFormation health check | Rejected with message (AWS-only) |
| `repair` | CloudFormation import | Rejected with message (AWS-only) |
| `generate-iam` | IAM policy generation | Rejected with message (AWS-only) |

Commands that are inherently AWS-specific (`doctor`, `repair`, `generate-iam`) guard with an early exit for non-AWS providers rather than implementing no-op stubs.

### Runtime Adapter Dispatch

At runtime, integrations use platform-agnostic interfaces. Factories create the right adapter based on the provider:

**Scheduler**: `SchedulerServiceFactory` creates either:
- `EventBridgeSchedulerAdapter` — AWS push model (precise timing, cloud-native)
- `NetlifySchedulerAdapter` — poll-and-dispatch model (cron queries database for due jobs)
- `MockSchedulerAdapter` — in-memory for dev/test

**Queue**: `QueueProvider` base class with platform-specific subclasses:
- AWS SQS provider — SQS send/batch/parse
- `NetlifyBackgroundProvider` — HTTP POST to background functions

**Encryption**: Core `Cryptor` shared across providers. Providers can optionally supply a `CryptorAdapter` override, but `null` reuses the default (KMS or AES based on env vars).

### Scheduling: Push vs Poll-and-Dispatch

This is the most significant architectural divergence between providers:

```
AWS (Push Model)                    Netlify (Poll-and-Dispatch)
─────────────────                   ───────────────────────────
scheduleOneTime()                   scheduleOneTime()
    │                                   │
    ▼                                   ▼
EventBridge Scheduler               Database (state: PENDING)
creates a one-time rule                 │
    │                                   │  ← cron fires every N min
    │  at(2025-06-01T12:00)            │
    │                                   ▼
    ▼                               processDueSchedules()
SQS receives message                   │  mark PROCESSING
at exact time                          │  send to queue
                                       │  delete on success
                                       │  mark FAILED on error
```

**Trade-offs**:
- Push is more precise (sub-second), poll has up to cron-interval delay
- Push requires cloud-specific APIs, poll works on any platform with a database
- Poll needs the PROCESSING state guard to prevent duplicate dispatch (race condition between concurrent cron invocations)

### State Machine for Netlify Schedules

```
PENDING ──→ PROCESSING ──→ (deleted)
                │
                └──→ FAILED
```

`findDue()` only returns `PENDING` records, so `PROCESSING` acts as a distributed lock — if a second cron invocation fires while the first is dispatching, it won't re-pick the same schedule.

## Package Structure

```
packages/
├── core/
│   ├── providers/
│   │   └── resolve-provider.js          # Resolution chain
│   ├── infrastructure/scheduler/
│   │   ├── scheduler-service-interface.js
│   │   ├── scheduler-service-factory.js
│   │   ├── eventbridge-scheduler-adapter.js
│   │   ├── netlify-scheduler-adapter.js
│   │   └── mock-scheduler-adapter.js
│   └── queues/
│       ├── queue-provider.js            # Base class
│       └── providers/
│           └── netlify-background-provider.js
├── providers/
│   ├── aws/                             # @friggframework/provider-aws
│   │   ├── queues/sqs-queue-client.js
│   │   ├── encryption/kms-encryption-key-provider.js
│   │   ├── websocket/api-gateway-message-sender.js
│   │   ├── lambda/lambda-invoker.js
│   │   └── storage/migration-status-repository-s3.js
│   └── netlify/                         # @friggframework/provider-netlify
│       ├── index.js                     # Plugin interface export
│       └── lib/
│           ├── generate-netlify-config.js
│           ├── get-function-entry-points.js
│           ├── netlify-background-provider.js
│           ├── scheduled-job-repository.js
│           └── ...
├── devtools/
│   └── frigg-cli/
│       ├── utils/provider-helper.js     # CLI provider loading
│       ├── deploy-command/              # Provider dispatch
│       ├── build-command/               # Provider dispatch
│       └── start-command/               # Provider dispatch
```

## How to Add a New Provider

1. Create `packages/providers/{name}/` implementing the plugin interface.
2. Add the name to `KNOWN_PROVIDERS` in `resolve-provider.js`.
3. Run the existing provider dispatch tests — they should pass without changes.
4. Add provider-specific tests in the new package.
5. Publish as `@friggframework/provider-{name}`.

The provider dispatch tests (`provider-dispatch.test.js`) verify that:
- AWS falls through to existing serverless behavior
- Non-AWS providers delegate to the plugin methods
- AWS-only commands reject non-AWS providers cleanly

These tests are provider-agnostic, so they validate the wiring for any new provider.

## Alternatives Considered

### Alternative 1: Conditional imports in core

Scatter `if (provider === 'netlify')` checks throughout framework code.

**Rejected**: Violates open-closed principle. Every new provider requires modifying core code. Leads to import-time side effects and difficult-to-test conditionals.

### Alternative 2: Abstract factory for everything

Create factories for every concern (handler, queue, scheduler, encryption, deployment) and compose them in a single configuration object.

**Partially adopted**: We use factories for scheduler and queue, but the provider plugin itself acts as the top-level factory. This avoids factory-of-factories complexity while keeping each concern independently testable.

### Alternative 3: Docker-based universal deployment

Containerize the app and deploy the same Docker image everywhere.

**Rejected for now**: Loses platform-native advantages (Netlify Edge Functions, Lambda cold-start optimizations, platform-specific DX). May revisit as a "universal provider" in the future.

### Alternative 4: Provider stubs for AWS-only commands

Instead of rejecting `doctor`/`repair`/`generate-iam` for non-AWS providers, implement no-op or generic versions.

**Rejected**: These commands are deeply tied to CloudFormation concepts. No-op stubs would be misleading. Clear rejection messages are more honest and push providers to implement equivalent commands when platform support exists.

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Provider interface grows unwieldy | Keep interface minimal; optional fields return `null` to skip features |
| Breaking changes to plugin interface | Semantic versioning; interface is tested via `provider-plugin-interface.test.js` |
| Poll-and-dispatch causes duplicate jobs | PROCESSING state guard prevents re-dispatch; tested in `netlify-scheduler-adapter.test.js` |
| Provider packages not installed | `resolveProvider` throws a clear error with `npm install` instructions |
| AWS assumptions leak into core | Provider dispatch tests catch AWS-specific calls that should be guarded |

## Test Coverage

| Test Suite | Location | Tests |
|-----------|----------|-------|
| Core resolver | `packages/core/providers/resolve-provider.test.js` | 11 |
| CLI provider helper | `frigg-cli/utils/__tests__/provider-helper.test.js` | 4 |
| Provider dispatch (CLI commands) | `frigg-cli/__tests__/unit/commands/provider-dispatch.test.js` | 9 |
| Netlify scheduler adapter | `core/infrastructure/scheduler/netlify-scheduler-adapter.test.js` | 23 |
| Scheduled job repository | `packages/providers/netlify/__tests__/scheduled-job-repository.test.js` | 9 |
| Netlify plugin interface | `packages/providers/netlify/__tests__/provider-plugin-interface.test.js` | — |
| Netlify config generation | `packages/providers/netlify/__tests__/generate-netlify-config.test.js` | — |
| Netlify deploy | `packages/providers/netlify/__tests__/deploy.test.js` | — |
| Netlify validate | `packages/providers/netlify/__tests__/validate.test.js` | — |

## References

- Plugin interface: `packages/providers/netlify/index.js`
- Resolution chain: `packages/core/providers/resolve-provider.js`
- Scheduler interface: `packages/core/infrastructure/scheduler/scheduler-service-interface.js`
- Queue provider base: `packages/core/queues/queue-provider.js`
- CLI dispatch: `packages/devtools/frigg-cli/deploy-command/index.js`
