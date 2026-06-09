# Architecture Decision Record: Plugins

**Status**: Proposed
**Date**: 2026-06-09
**Author**: Sean Matthews

## Context

Frigg's core packages today have to know how to deploy to AWS, how to talk to Mongo *and* Postgres *and* DocumentDB, how to use AWS KMS *and* AES encryption, how to wire up Netlify *and* Vercel *and* raw Lambda. Every deployment target and every infrastructure choice the framework supports leaves its dependencies inside `@friggframework/core`, whether the adopter ever uses them or not.

That's wrong for two reasons. First, an adopter deploying to GCP doesn't want the AWS SDK shipped in their Lambda; an adopter using Postgres doesn't want Mongoose loaded; an adopter using AES encryption doesn't want AWS KMS dependencies in their tree. Second, it makes adding a *new* provider (Cloudflare Workers, Fly.io, a new database) a core-package change rather than a community-extensible one.

**Plugins** are how Frigg lets adopters swap *required* infrastructure pieces without forking core.

## Decision

A **Plugin** is a package that satisfies a specific core-defined interface so that the framework can run on top of it. Plugins are **required-with-defaults** — core needs *some* plugin of each type to function, but the choice is the adopter's.

Plugins differ from [Extensions](./ADR-EXTENSIONS-TAXONOMY.md) in two ways:

- **Required vs optional.** Without a database plugin selected, the framework can't run. Without an alerting extension, it just doesn't alert.
- **Infra vs functionality.** Plugins swap *infrastructure* under the framework (deploy target, persistence, encryption). Extensions add *functionality* on top of the framework (alerting, sync engines, provider webhooks).

### Plugin types (initial set)

| Type | What it abstracts | Examples |
|---|---|---|
| **Provider** | Deployment target | `@friggframework/provider-aws`, `@friggframework/provider-netlify`, `@friggframework/provider-vercel`, `@friggframework/provider-gcp` |
| **Database** | Persistence layer | `@friggframework/database-postgres`, `@friggframework/database-mongo`, `@friggframework/database-documentdb`, `@friggframework/database-sqlite` |
| **Encryption** | Field-level encryption mechanism | `@friggframework/encryption-kms`, `@friggframework/encryption-aes` |
| **Queue** | Async job dispatch | `@friggframework/queue-sqs`, `@friggframework/queue-rabbitmq`, `@friggframework/queue-redis` |
| **Scheduler** | Cron / one-time job execution | `@friggframework/scheduler-eventbridge`, `@friggframework/scheduler-mock` |

Each plugin type has a typed interface in core that *all* plugins of that type must satisfy. Core depends on the interface, not on any specific plugin.

## Shape (worked example)

```javascript
// backend/index.js
const appDefinition = {
    name: 'my-frigg-app',

    plugins: {
        provider: { kind: '@friggframework/provider-netlify', region: 'us-east-1' },
        database: { kind: '@friggframework/database-postgres', minCapacity: 0.5, maxCapacity: 1 },
        encryption: { kind: '@friggframework/encryption-aes' },
        queue: { kind: '@friggframework/queue-sqs' },
        scheduler: { kind: '@friggframework/scheduler-eventbridge' },
    },

    integrations: [ /* ... */ ],
};
```

Core resolves each plugin entry at app construction time, validates it satisfies the interface for its type, and wires it into the framework's runtime. Any plugin not listed falls back to a default (typically the AWS-flavored option for backwards compatibility with v1 deployments).

## Architecture

```mermaid
flowchart TB
    subgraph App["Adopter's Frigg app"]
        AppDef["appDefinition.plugins<br/>{ provider, database, encryption, queue, scheduler }"]
    end
    subgraph Core["@friggframework/core"]
        Interfaces["Plugin interfaces<br/>(typed contracts core depends on)"]
        Runtime["Framework runtime"]
    end
    subgraph Plugins["Plugin packages (one per swap)"]
        P1["provider-netlify"]
        P2["database-postgres"]
        P3["encryption-aes"]
        P4["queue-sqs"]
        P5["scheduler-eventbridge"]
    end
    AppDef -- "selects" --> P1 & P2 & P3 & P4 & P5
    P1 & P2 & P3 & P4 & P5 -- "satisfy" --> Interfaces
    Interfaces -- "called by" --> Runtime
```

Adding a new deployment target (e.g. Cloudflare Workers) means publishing `@friggframework/provider-cloudflare-workers` that satisfies the Provider interface — no core change required.

## Why this matters for capabilities and the harness

[Capabilities](./ADR-CAPABILITIES.md) can declare `requires` against plugin types — e.g. a capability that uses signed S3 URLs declares `requires: { provider: 'aws' }`. The capability resolver can then warn at boot if the selected provider plugin doesn't support a required capability, instead of failing at runtime.

The [Agent Harness](./ADR-AGENT-HARNESS.md) reads the selected plugins at session start and constrains its planning accordingly — an agent working in a Netlify-deployed Frigg app shouldn't suggest using AWS-specific primitives.

## Cross-references

- [CAPABILITIES](./ADR-CAPABILITIES.md) — capabilities may declare plugin-type requirements
- [EXTENSIONS-TAXONOMY](./ADR-EXTENSIONS-TAXONOMY.md) — extensions are optional and add functionality; plugins are required and swap infrastructure
- [AGENT-HARNESS](./ADR-AGENT-HARNESS.md) — the harness reads selected plugins to constrain agent planning

## Open questions

1. **Plugin discovery.** How does the framework find available plugins of a type? Convention (`@friggframework/provider-*`)? Explicit registry? Both?
2. **Plugin composition.** Can two plugins of the same type coexist (e.g. write-through caching across two database plugins)? Lean: no, one of each type. Composition is a separate ADR if needed.
3. **Versioning across plugins.** A v2 core may demand a v2 plugin interface. How are mismatches surfaced — at install time, at boot, or at runtime?
4. **Default plugin selection.** AWS-flavored as the v1 backwards-compat default, or fail-loud and require explicit selection?

## References

- [Multi-provider support discussion](https://github.com/friggframework/frigg/issues/) (link TBD once issue exists)
- The `module-plugin` directory in core is a related but distinct mechanism (extends the framework, not the infrastructure under it) — currently named confusingly; renaming proposed as part of this rework
