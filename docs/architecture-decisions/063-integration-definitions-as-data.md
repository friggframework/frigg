# ADR-063: Integration Definitions as Data

**Status**: Proposed (exploratory: direction set, mechanics deliberately open)
**Date**: 2026-10-15
**Deciders**: Sean Matthews

## Context

### How an integration exists today (verified in `next`)

An integration is a JavaScript class that extends `IntegrationBase` and carries a `static Definition` literal.

- **Loading.** `loadAppDefinition()` (`packages/core/handlers/app-definition-loader.js`) loads every class named in `appDefinition.integrations` at cold start.
- **Routes.** `integration-defined-routers.js` mounts each class at `/api/${Definition.name}-integration`. `Definition.routes` entries can be objects (path → event), functions or express Routers.
- **Events.** `this.events` is set in the constructor, merged with extension events, and dispatched by `IntegrationEventDispatcher`.
- **Infrastructure.** The devtools integration builder emits three functions per integration (`${name}`, `${name}Webhook`, `${name}QueueWorker`) plus a `${Name}Queue`, all in one CloudFormation stack per app.

So adding or changing an integration means a code change, a build and a deploy. The stack also grows with every integration. CloudFormation allows 500 resources per stack and 200 outputs; nested stacks raise that to 2,500 resources per operation.

### How much of it is already data

More than the class shape suggests:

- **Definition literal.** Most of `Definition` is plain data: `name`, `version`, `display`, module references, and object-form routes mapping a path to an event name.
- **Canonical mappings.** [ADR-057](./057-canonical-schema.md) makes canonical mappings, `canonical.rules` and capability `flows` **data only**, with transforms referenced by name and validated by JSON Schema in `@friggframework/schemas`.
- **Capabilities.** [ADR-020](./020-capabilities.md) capabilities are declarations, not code.
- **Versioning.** [ADR-030](./030-integration-versioning.md) already treats an integration's version as a routing dimension it has to reason about.

What remains code is the *orchestration*: the event handler that reads from one module, maps, and writes to another. In most pair integrations that handler is the same five steps with different nouns.

### Why this matters now

- **The Integrator.** One product will carry many pair integrations (Klaviyo ⇄ HubSpot, Shopify → NetSuite, …). Each must appear in **both** sides' marketplace storefronts, so the runtime cannot be split per storefront. A code-per-integration runtime grows its stack with every listing.
- **Per-workspace custom integrations.** A customer-specific variant is today either a fork of a class or arbitrary user code. Arbitrary user code needs process isolation to be safe.
- **Agent authoring.** A document that validates against a JSON Schema is far easier for an agent to produce, diff and check than a class. "Checks still compile" becomes literal: schema validation, reference resolution and a Test Bench run.
- **Reasoning.** Integration-as-code is easier for a person to reason about: you can read it, step through it and grep it. Any data form has to keep that property, or it loses.

## Decision

Frigg supports **two authoring forms behind one runtime contract**:

1. **Code-defined integrations**: exactly as today. Nothing existing changes.
2. **Data-defined integrations**: an `IntegrationDefinition` document, interpreted at runtime by one generic class, `DataDefinedIntegration extends IntegrationBase`.

Code is the escape hatch and data is the composition. A data definition never contains code. It names building blocks that exist as code, and the app has registered and versioned them.

### 1. What is data and what stays code

| Concern | Data-defined | Stays code (referenced by name + version) |
|---|---|---|
| Identity, display, category | ✅ | |
| Which modules, which module instance | ✅ (`moduleName@version`) | The API module itself: auth, requester, pagination |
| Routes | ✅ path → event | Custom express routers |
| Events and triggers (`USER_ACTION`, `CRON`, `QUEUE`, `WEBHOOK`) | ✅ trigger → step list | |
| Steps | ✅ ordered list of step *references* + arguments | **Step types** (`module.call`, `map`, `filter`, `upsert`, `enqueue`, `branch`, …) |
| Field mappings, master record, conflict rules | ✅ ([ADR-057](./057-canonical-schema.md) `extensions.mapping` / `canonical.rules`) | **Transforms** (`dateToIso`, `splitName`, `currencyMinorUnits`, …) |
| Config form | ✅ JSON Schema + uiSchema | |
| Capabilities, schedules | ✅ | |
| Webhook signature validation | ✅ (selects the module's validator) | Validator implementation |

**The allow-list rule:** a definition may only name step types, transforms and modules registered in the app it runs in. It cannot define new ones. Anything the vocabulary can't express is written as a code step type or an integration extension ([ADR-018](./018-integration-extensions.md)), versioned and released like any other code.

**No general-purpose expression language.** Arguments are literals, references (`$.trigger.body.email`, `$.steps.fetch.result.id`) or calls to named transforms. Conditions are a small, total, side-effect-free predicate set (`eq`, `in`, `exists`, `and`, `or`, `not`). The day a definition needs a loop or arbitrary arithmetic is the day it should become a code step. Without this rule the format turns into a programming language with worse tooling than JavaScript.

### 2. Shape (sketch, not final)

```jsonc
{
  "$schema": "https://schemas.friggframework.org/integration-definition/v1.json",
  "name": "klaviyo-hubspot",
  "version": "1.2.0",
  "display": { "label": "Klaviyo for HubSpot", "category": "Marketing" },
  "modules": {
    "klaviyo": { "module": "klaviyo@^2" },
    "hubspot": { "module": "hubspot@^3", "instance": "hubspot-klaviyo" }   // ADR-062 (proposed)
  },
  "config": { "schema": { /* JSON Schema */ }, "uiSchema": { /* … */ } },
  "events": {
    "PROFILE_SUBSCRIBED": {
      "trigger": { "type": "WEBHOOK", "module": "klaviyo", "topic": "profile.subscribed" },
      "steps": [
        { "id": "contact", "use": "map",    "with": { "from": "$.trigger.body", "mapping": "klaviyo.Profile->Contact" } },
        { "id": "upsert",  "use": "upsert", "with": { "module": "hubspot", "object": "Contact", "record": "$.steps.contact.result", "identity": "email" } },
        { "use": "emit",   "with": { "event": "contact.synced", "id": "$.steps.upsert.result.id" } }
      ]
    },
    "INITIAL_SYNC": {
      "trigger": { "type": "USER_ACTION", "label": "Sync existing profiles" },
      "steps": [ { "use": "sync.backfill", "with": { "source": "klaviyo", "target": "hubspot", "object": "Contact", "pageSize": 100 } } ]
    }
  },
  "capabilities": ["marketing.profile.sync.to-crm"]
}
```

### 3. Source of truth and lifecycle

Data does not mean "edited in a database admin screen". The lifecycle mirrors code:

1. **Authored as files** in git, or produced by an agent or The Integrator's canvas and committed. That keeps them diffable, reviewable and blameable, and keeps integration-as-code's main reasoning property.
2. **Compiled** by a `frigg integration check` step: JSON Schema validation (`@friggframework/schemas`, one `integration-definition.schema.json` and a `validateIntegrationDefinition()` helper, following the existing conventions), reference resolution against the app's registered modules / step types / transforms, mapping validation (ADR-057's `validateCanonicalMapping`), and a Test Bench run against recorded fixtures. A definition that fails any check is not publishable.
3. **Published** to a definition store as an **immutable** `(name, version, contentHash)` row. Publishing is the only write. A version is never edited in place.
4. **Pinned.** Every integration record stores the `definitionVersion` it was created with. Upgrading a running integration is an explicit migration, the same problem ADR-030 already frames. Data makes Path D of that ADR ("version as a routing dimension outside the class") almost free, because the version is just a key into the store.

A code-defined app can also ship data definitions **in the bundle** (as files loaded at cold start) without a store. That is the zero-infrastructure first step, and it changes nothing about deployment.

### 4. Runtime shape

- **One class, many types.** `DataDefinedIntegration` resolves `(name, definitionVersion)` from the integration record (or from the route) and caches the parsed definition by content hash for the life of the process.
- **Routes keep their paths.** The existing `/api/${name}-integration/*` contract is preserved. A generic router resolves `name` from the path segment at request time instead of mounting one router per class at cold start.
- **Constant infrastructure.** Data-defined integrations share one HTTP function, one webhook function and a small, fixed set of worker queues. Messages carry `{ integrationType, definitionVersion, event }`. The stack's resource count stops growing with the number of integrations, which removes the CloudFormation ceiling for The Integrator without nested stacks or sharding.
- **Noisy neighbours are the price of sharing.** One integration's backfill must not starve another's webhooks. The runtime therefore needs per-type concurrency keys or hashing onto N queues, with separate queues for interactive and bulk work. This is the main *new* operational problem this ADR creates.

### 5. Why this is safe for per-workspace customization

Because a definition can only compose allow-listed, versioned code, a workspace-specific definition is configuration, not user code. It can run in the shared runtime without the process isolation that arbitrary customer code would require. It cannot reach a module the app didn't register, call a transform that doesn't exist, or loop. Credentials, encryption and module auth are untouched: they stay in the API module and the framework.

### 6. Explicitly not decided here

- The step-type vocabulary beyond the sketch, and how it relates to `BaseCRMIntegration`-style sync helpers.
- The definition store's storage (Prisma model in the existing database vs a separate registry service).
- Whether code integrations can be lowered to data. Probably not in general; possibly for the subset that only uses object routes plus mapping.
- How a visual editor (The Integrator canvas) round-trips with hand-edited files.

## Where this leads: Frigg in other runtimes

The bigger consequence is not "fewer CloudFormation resources". **Once an integration is a portable document, the runtime is the only thing that must exist per environment.** Today Frigg's portability is limited by being Node-on-Lambda-with-SQS. A data definition is indifferent to all three. This section maps that space; choosing runtime targets is a follow-up ADR.

### What the runtime depends on today

| Port | Today | Already abstracted? |
|---|---|---|
| HTTP host | express app (`createApp`) wrapped by `serverless-http` per Lambda | **Mostly.** The express app is independent of Lambda, so `app.listen()` is a small step |
| Queue | SQS only (`queues/queuer-util.js` uses `@aws-sdk/client-sqs` directly; local dev uses LocalStack) | **No.** No port; this is the largest gap |
| Scheduler | EventBridge Scheduler, with `SCHEDULER_PROVIDER=mock` | **Yes**, a port with two adapters |
| Encryption | KMS or AES via `Cryptor` | **Yes** |
| Database | Prisma, MongoDB or PostgreSQL | **Yes**, for those two |
| Infrastructure | osls / CloudFormation generation | Serverless-only by design |

### Architecture: serverless vs packaged

A **packaged** runtime is one long-lived process (or a few) running the same express app, an in-process or database-backed queue, cron in place of EventBridge, and AES in place of KMS. It needs exactly one new port: a queue abstraction with SQS, in-process and Postgres-backed (`SKIP LOCKED`) adapters. Nothing in a data definition knows which one it runs on. Code-defined integrations would work too. Data definitions matter more here because a packaged runtime cannot redeploy per integration change either.

### Where: cloud, edge, local, home server, Raspberry Pi

| Target | Fits | Constraints to design for |
|---|---|---|
| AWS Lambda (today) | Everything | Resource ceiling (solved above), cold starts |
| Container (ECS, Fly, Kubernetes) | Packaged runtime as-is | Needs the queue port |
| Edge (Cloudflare Workers, Lambda@Edge) | **Webhook ingress, signature validation, light single-call steps** | CPU-time limits, no long jobs, database access over HTTP or driver adapters, partial Node API support. Edge should *receive and route*, not backfill: hand heavy work to a regional queue |
| Local / home server / Raspberry Pi | Packaged runtime, SQLite or Postgres, in-process queue | OAuth redirects and inbound webhooks need public HTTPS, so a tunnel or a relay (a natural Frigg Cloud service). SQLite would be a third Prisma target. Small memory favours a lean runtime |

The pattern is **one definition, several placements**. A webhook can be validated at the edge and fanned into a regional queue, then processed by a Lambda worker in the cloud or by a Pi in a closet, and the definition does not change.

### Language: can it run in Rust?

The integration layer, yes, once it is data. A Rust interpreter of `IntegrationDefinition` is a well-bounded program: load, validate, resolve references, run steps. The hard part is everything a step *calls*:

- **API modules are JavaScript** (the whole api-module-library), and so are transforms, step types and the framework's credential refresh, encryption and repositories.

So "Frigg in Rust" splits into options with very different costs:

1. **Node stays the reference runtime** and Rust appears nowhere. Cheapest; portability comes from ports, not language.
2. **Rust host, embedded JavaScript engine** for modules (e.g. deno_core / V8 or QuickJS). Small static binary, fast start, good for Pi and edge. But it re-implements the framework core in Rust and still runs JS for every API call.
3. **Modules as WebAssembly components** (WASI component model). Any language can author a module, and any host (Rust, Node, edge runtimes with Wasm support) can run it, sandboxed. This is the most portable end state, and the most work: every module is rebuilt, and Wasm networking and host interfaces are still maturing.
4. **Declarative modules** for the long tail: an OpenAPI document plus an auth descriptor drives a generic requester. These become runtime-neutral data as well, leaving code only for modules with genuinely odd auth or pagination.

**Recommendation:** keep Node as the reference runtime. Make portability a property of the *contract*, not the language, by defining a **conformance suite**: definitions plus recorded HTTP fixtures plus expected outbound requests, which any runtime must pass. A Rust (or Wasm-hosted) runtime is then a bounded experiment against that suite, and it is worth starting where Rust's advantages are real (Pi, edge ingress), not as a rewrite.

## Consequences

### Positive

- **Infrastructure stops scaling with integration count** for data-defined integrations; The Integrator fits in one stack.
- **Adding or changing an integration is a publish, not a deploy**, with the same review and checks a code change gets.
- **Agents and the canvas author something they can validate**, and a failing check is a schema error, not a runtime surprise.
- **Per-workspace custom integrations are safe** without per-tenant process isolation.
- **Versioning becomes a store lookup**, giving ADR-030 a concrete, cheap path.
- **Runtime portability** (packaged, edge, home hardware, another language) becomes a matter of implementing ports and an interpreter, not porting every integration.

### Negative

- **Two authoring forms** to document, test and support. Without the allow-list discipline, the data form drifts into a weaker programming language.
- **Debugging an interpreted step list is harder** than stepping through a class. The runtime must provide step-level traces (inputs, outputs, timing per step) from day one, or the form will be avoided.
- **Shared queues create noisy-neighbour risk** that per-integration queues avoided for free.
- **The interpreter is a small workflow engine**, and the most likely failure mode is scope creep toward a general iPaaS DSL.
- **Load-on-request adds a store read** on cold paths. It is cacheable by content hash, but it is a new dependency on the request path.

### Neutral

- Code-defined integrations are unchanged and remain the default for anything complex.
- API modules, credentials and encryption are untouched.
- The definition format joins `@friggframework/schemas` and follows its conventions.

## Alternatives Considered

- **Code only, scale the stack.** Nested stacks (to 2,500 resources per operation) or sharding integrations across several Frigg apps (free, because credentials are per app). This solves the resource ceiling and nothing else: every change is still a deploy, and customization is still a fork.
- **Generate code from data at build time.** The data document is the source; a generator emits a JS class. This keeps "it's just code" debugging, but keeps the per-integration deploy and resource growth. It is a reasonable bridge, and can coexist: the same document could either be interpreted or compiled.
- **A full workflow DSL / embedded scripting** (JSONata everywhere, sandboxed JS snippets). This is maximally expressive, and it is also unsafe for per-workspace use and a second programming language. Rejected for the reasons in "No general-purpose expression language".
- **Adopt an external workflow engine** (Temporal, Step Functions) as the interpreter. This was not rejected outright: it is a candidate *implementation* of long-running steps. But it binds the definition to one vendor's runtime, which is exactly the portability this ADR opens up.

## Related

- [ADR-015](./015-extensions-taxonomy.md) / [ADR-018](./018-integration-extensions.md): code escape hatch for steps the vocabulary can't express
- [ADR-020](./020-capabilities.md): capabilities declared by definitions
- [ADR-021](./021-ontology.md): agent context for authoring definitions (not a field vocabulary)
- [ADR-027](./027-ssm-parameter-offload-and-env-scoping.md): per-function environment, relevant once many integrations share functions
- [ADR-030](./030-integration-versioning.md): versioning, which the definition store makes concrete
- [ADR-057](./057-canonical-schema.md) (PR #676): data-only mappings this format reuses
- ADR-062 (proposed, not yet written): per-app module instances, referenced by `modules.*.instance`
- Follow-up: an ADR on runtime targets and the queue port
