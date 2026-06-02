# Architecture Decision Record: Plugins, Extensions, and Artifacts

**Status**: Mixed (revised 2026-05-30) — **Tier 3 Integration Extensions is Implemented** ([PR #590](https://github.com/friggframework/frigg/pull/590) + [PR #596](https://github.com/friggframework/frigg/pull/596); see [`packages/core/integrations/EXTENSIONS.md`](../../packages/core/integrations/EXTENSIONS.md)). **Tier 1 Core Plugins, Tier 2 Application Extensions, Artifacts, and the Capability Declaration remain Proposed.**
**Date**: 2026-05-22 (original), 2026-05-23 (revised), 2026-05-30 (reconciled with shipped Tier 3 implementation)
**Author**: Sean Matthews

## Context

As Frigg has grown, multiple unrelated mechanisms have all been informally called "plugins" or "extensions":

- The **provider plugin** system that lets the same app deploy to AWS, Netlify, Vercel, etc. (see [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md)).
- An emerging **app-level extensions** array on the App Definition that adds Prisma models, encrypted fields, admin routes, and bootstrap hooks (prototyped in branch [`claude/frigg-netlify-exploration-aY2Bh`](https://github.com/friggframework/frigg/tree/claude/frigg-netlify-exploration-aY2Bh/packages/core/extensions), exemplified by [`@friggframework/extension-db-credentials`](https://github.com/friggframework/frigg/tree/claude/frigg-netlify-exploration-aY2Bh/packages/extensions/db-credentials)).
- An **integration-level `this.extensions` map** appearing on `IntegrationBase` subclasses that bundles a handler library (e.g. `extensions.hubspotWebhooks`) with named event handlers (seen in `stack-global--frigg-2.0`, `frigg-2.0-prototyping`, `vartopia--frigg-2.0` — see [Prior Art](#prior-art)).

These three things solve different problems, run at different lifecycle stages, are authored by different roles, and have different shapes — but they share a vocabulary, which makes them easy to confuse and hard to document.

A fourth concept sits adjacent to the three above and was not in the original draft: **Artifacts** — code or configuration the API module helps the developer generate (sometimes via a vendor CLI like `hs project add` or `slack scaffold`) but which then runs *outside* Frigg, on the target platform. The HubSpot Project that ships UI extensions; the Slack App manifest; the Salesforce managed package. These are required-or-optional pre-conditions for some capabilities, and the API module's job is to point at how to generate them and provide the Frigg-side glue (typically a Tier 3 Integration Extension) that serves them once deployed.

This ADR also introduces a **Capability Declaration** on the API module's Definition. Capabilities answer "what can I do with this API module?" Each capability points to the spec that describes it (OpenAPI, Fenestra, AsyncAPI, Arazzo) and the mechanism that implements it (the API class, a Tier 3 Integration Extension, an Artifact, or a combination).

This ADR establishes a **three-tier taxonomy** for what's pluggable in Frigg, names each tier, defines its contract and lifecycle, aligns existing prototypes to the model, and then defines Artifacts and the Capability Declaration as sibling concepts that ride on top.

## Decision

Frigg recognizes three distinct categories of pluggable code that run **inside** the Frigg runtime. Each has its own name, its own contract, and its own authoring role.

| Tier | Name | Authored by | Required? | Lives on |
|------|------|-------------|-----------|----------|
| 1 | **Core Plugins** | Frigg core / provider package authors | Required (with defaults) | The runtime / app construction |
| 2 | **Application Extensions** | App developer | Optional | `appDefinition.extensions` |
| 3 | **Integration Extensions** | API module author / community | Optional | `IntegrationBase.Definition.extensions` |

Separate from the three tiers, this ADR also defines:

- **Artifacts** — code or configuration the API module helps a developer generate (often via a vendor CLI) that runs *outside* Frigg on the target platform. Required (`base`) or optional per artifact. Lives on `apiModule.Definition.artifacts`.
- **The Capability Declaration** — a `capabilities` block on the API module Definition that organises what the module can do, points at the specs that describe each capability, and binds each capability to its implementation (API class, Tier 3 Extension, or Artifact). Lives on `apiModule.Definition.capabilities`.

The rest of this ADR defines each of the three tiers, then Artifacts, then the Capability Declaration, and resolves the shape mismatches in the current prototypes.

---

## Tier 1 — Core Plugins

**Required infrastructure that Frigg needs in order to construct a working application. Ships with defaults; the app developer may override.**

A Core Plugin is *substitutable infrastructure*. Frigg cannot run without a queue, a database, an encryption key source, a deployment target, a handler factory, etc. — but the *implementation* of each is plug-replaceable.

### Examples

- **Provider plugin** — deployment target (AWS, Netlify, Vercel, GCP). Selected via `appDefinition.provider`. See [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md).
- **Queue provider** — SQS, QStash, Netlify Background. Bundled with the provider plugin or overridden directly.
- **Encryption key provider** — AES (default), AWS KMS, Vault.
- **Database provider** — MongoDB / PostgreSQL via Prisma.
- **Serverless framework plugin** — `packages/serverless-plugin` (build-time tooling).

### Contract

A Core Plugin exports an object conforming to a known interface (e.g. `ProviderPlugin`, `QueueProvider`, `EncryptionKeyProvider`). Frigg resolves the implementation at boot via a factory (`provider-factory.js`, `queue-provider-factory.js`, etc.) that reads the App Definition.

### Lifecycle

Resolved **once at app construction**, before any extensions or integration code runs. Failure to resolve is a boot-time fatal error.

### Authoring

Most app developers never write a Core Plugin. They are written by:
- The Frigg core team (defaults)
- Provider package maintainers (`@friggframework/provider-netlify`, etc.)

### What this ADR does *not* change

Core Plugins are already covered by existing ADRs (notably [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md)). This ADR names the category for clarity and contrast with the other two tiers.

---

## Tier 2 — Application Extensions

**Optional, declarative additions to the core Frigg application. Listed in the App Definition. Add cross-cutting framework features that are not specific to any one integration.**

An Application Extension extends the *Frigg app itself*, not any particular integration. It can add database tables, encrypted columns, admin-protected HTTP routes, and bootstrap-time async work.

### Shape (on the App Definition)

```js
// app-definition.js
module.exports = {
    name: 'my-frigg-app',
    integrations: [HubSpotIntegration, SalesforceIntegration],
    extensions: [
        require('@friggframework/extension-db-credentials'),
        require('@friggframework/extension-audit-log'),
        myCustomExtension,
    ],
    // ...
};
```

### Extension contract

```js
// my-extension/index.js
module.exports = {
    name: 'my-extension',              // required, unique
    schema: './prisma/schema.prisma',  // optional — composed into core schema
    encryption: {                      // optional — registered with cryptor
        MyModel: { fields: ['secret', 'apiKey'] },
    },
    routes: {                          // optional — mounted with admin auth
        path: '/my-extension',
        handler: require('./routes'),  // Express router or factory(prisma, appDef)
    },
    bootstrap: require('./bootstrap'), // optional — async fn(prisma, appDef)
};
```

### Lifecycle

1. **Build time** — `schema-composer` merges extension `.prisma` fragments into the core schema. Prisma client is regenerated.
2. **Boot time** — `extension-loader` validates and normalizes the array. `bootstrap-runner` runs each `bootstrap` fn in order, post-DB, pre-router.
3. **Request time** — `route-mounter` mounts each extension's router on the main app, guarded by `validateAdminApiKey` by default.

### Authoring

Written by:
- The Frigg core team (first-party extensions like `@friggframework/extension-db-credentials`)
- App developers (custom in-tree extensions)
- Community (`@friggframework/extension-*` packages)

### Reference implementation

- Loader/composer/mounter/bootstrap: [`packages/core/extensions/`](https://github.com/friggframework/frigg/tree/claude/frigg-netlify-exploration-aY2Bh/packages/core/extensions) on `claude/frigg-netlify-exploration-aY2Bh`.
- Example extension: [`packages/extensions/db-credentials/`](https://github.com/friggframework/frigg/tree/claude/frigg-netlify-exploration-aY2Bh/packages/extensions/db-credentials).
- Design rationale: commit [`69acce55`](https://github.com/friggframework/frigg/commit/69acce55) ("feat(core): add extension system for DB-backed OAuth credentials").

### Decisions

- **Array, not object.** Application Extensions are an *ordered list* so bootstrap order is deterministic.
- **Admin-protected by default.** Routes mount behind `validateAdminApiKey`. An extension can opt out by exporting its own router with custom middleware.
- **Schema composition happens at build time, not runtime.** Prisma requires schema to be known before client generation. This is enforced by the CLI.
- **Bootstraps fail fast.** A throwing bootstrap is fatal; partial-init state is not allowed.

---

## Tier 3 — Integration Extensions

**Status**: **Implemented.** Ratified by [PR #590](https://github.com/friggframework/frigg/pull/590) (initial framework load — route + event seams, fail-loud defaults) and [PR #596](https://github.com/friggframework/frigg/pull/596) (route namespacing under binding key, `useDatabase` extension-level field). Authoritative quick-start lives in code at [`packages/core/integrations/EXTENSIONS.md`](../../packages/core/integrations/EXTENSIONS.md); this ADR documents the *decision* shape, the quick-start documents the *current* shape — keep both in sync when the contract evolves.

**Optional, off-the-shelf functionality bundled *with* an integration — typically with an API module or a sibling extensions library. Provides reusable handler bundles (webhooks, sync routines, etc.) that an integration class wires into its own `Definition`.**

An Integration Extension is *integration-scoped reuse*. The HubSpot webhook plumbing — verifying signatures, routing payloads to event handlers, queueing work — is the same for every HubSpot integration ever built. Rather than copy-paste that into each integration class, the API module exposes it as an extension that the integration "plugs in."

### Shape (in the integration class)

```js
const hubspot = require('@friggframework/api-module-hubspot');

class HubSpotIntegration extends IntegrationBase {
    static Definition = {
        name: 'hubspot',
        modules: { hubspot: { definition: hubspot.Definition } },
        routes: [ /* integration-owned routes */ ],
        extensions: {
            // key = local name for this extension binding
            hubspotWebhooks: {
                extension: hubspot.extensions.webhooks, // imported handler bundle
                handlers: {
                    // event-name → method on this integration class
                    WEBHOOK_EVENT: 'handleWebhookEvent',
                },
            },
        },
    };

    async handleWebhookEvent(params) { /* ... */ }
}
```

### Extension contract (what the API module exports)

```js
// @friggframework/api-module-hubspot/extensions/webhooks.js
module.exports = {
    name: 'hubspot-webhooks',
    useDatabase: false,                              // shipped in #596; default false for extension routes
    routes: [
        { path: '/webhooks', method: 'POST', event: 'WEBHOOK_EVENT' },  // mounted at /api/{integration}-integration/{bindingKey}/webhooks
    ],
    events: {
        WEBHOOK_EVENT: { /* event definition, queueing, etc. */ },
    },
    queues: [ /* queue definitions — Phase 2 */ ],
    workers: [ /* worker definitions — Phase 2 */ ],
};
```

This shape matches the stub already present in [`backend/src/extensions.js`](https://github.com/lefthookhq/frigg-2.0-prototyping/blob/main/backend/src/extensions.js) in `frigg-2.0-prototyping` (and identically in `stack-global--frigg-2.0`, `vartopia--frigg-2.0`).

### Lifecycle

1. **Definition merge** — when an integration class is registered, its `Definition.extensions` map is iterated. Each extension's `routes`, `events`, `queues`, and `workers` are merged into the integration's effective definition.
2. **Handler binding** — the `handlers` map on each extension binding wires extension-declared events to methods on the integration instance.
3. **Request/event time** — incoming webhook hits route → routed to event → dispatched to bound handler method on the integration instance.

### Authoring

Written by:
- API module authors (`@friggframework/api-module-hubspot` ships webhook + OAuth-refresh extensions)
- A central extensions library (`@friggframework/integration-extensions/*`) for cross-cutting integration patterns (rate-limit handling, retry policies, etc.)
- Integration developers (in-tree custom extensions)

### Prior art

| Repo | File | What it shows |
|------|------|---------------|
| [`lefthookhq/frigg-2.0-prototyping`](https://github.com/lefthookhq/frigg-2.0-prototyping/blob/main/backend/src/integrations/HubSpotIntegration.js) | `backend/src/integrations/HubSpotIntegration.js` | `this.extensions = { hubspotWebhooks: { extension, handlers } }` (constructor wiring) |
| `stack-global--frigg-2.0` | same path | Same pattern, richer event map |
| `vartopia--frigg-2.0` | same path | Same pattern |

All three repos define a stub `backend/src/extensions.js` exporting `hubspotWebhookHandler` with the `{ routes, events, queues, workers }` shape — confirming the contract above.

### Decisions

- **Object, not array.** Integration Extensions are keyed by *local binding name* so the same extension can be applied multiple times (e.g. two webhook endpoints) and handlers can reference the binding by name.
- **Declarative in `Definition.extensions`, not imperative in the constructor.** Today's prototypes assign `this.extensions = {...}` in the constructor. The framework should read this from `static Definition.extensions` like every other piece of integration metadata. The constructor assignment is a current-state implementation detail, not the desired API.
- **Handlers are referenced by name, not bound directly.** `handlers: { WEBHOOK_EVENT: 'handleWebhookEvent' }` rather than `handlers: { WEBHOOK_EVENT: this.handleWebhookEvent.bind(this) }`. The framework does the binding at instantiation time. Eliminates the `this`-in-static-Definition bootstrapping problem the current prototypes hit.

### Framework load mechanism

The contract above is implemented by [PR #590](https://github.com/friggframework/frigg/pull/590) (initial framework load) and [PR #596](https://github.com/friggframework/frigg/pull/596) (route namespacing under binding key, `useDatabase`), both authored by Daniel Klotz. The framework splits the work into two seams:

**Boot-time (once per integration class).** `packages/core/handlers/routers/integration-defined-routers.js` walks each `IntegrationClass.Definition.extensions` via `getExtensionRoutes(IntegrationClass)`. Since [#596](https://github.com/friggframework/frigg/pull/596), each binding's routes are mounted under its **binding key**, producing the URL pattern:

```
/api/{integration-name}-integration/{bindingKey}{route.path}
```

For example, a HubSpot integration with binding key `hubspot` and route `POST /webhooks` mounts at `POST /api/hubspot-integration/hubspot/webhooks`. Each binding gets its **own dedicated handler / Lambda function** (registered as `handlers['{extension-name}__{bindingKey}']`), so two modules' extensions on the same integration (e.g. a HubSpot and a Clockwork webhook receiver) cannot collide on route paths. Within-binding duplicate `method + path` still throws. Conflicts between `Definition.routes` and an extension's namespaced path also throw.

**Per-instance (every integration instantiation).** `IntegrationBase._mergeExtensions()` runs inside `initialize()`, just before `registerEventHandlers()`. It walks `static Definition.extensions`, validates each binding, and merges extension events into `this.events` with handlers bound to the live instance.

Event-handler resolution priority:
1. Subclass-defined `this.events[event]` (constructor) wins — any matching `binding.handlers[event]` is `console.warn`'d as ignored
2. Else `binding.handlers[event]` → method-name string, resolved on `this` (throws if method missing)
3. Else extension's own default `eventDef.handler`
4. Else throw at boot

**Event names are *not* namespaced** — two bindings declaring the same event name still throw at `_mergeExtensions`. Routes are namespaced by binding key (#596) but events are not, so binding the same extension twice only works when the extension defines disjoint event sets per use-case (e.g. an API module shipping `webhooks` and `sandboxWebhooks` as separate bundles with distinct event names).

**`useDatabase` resolution (added in #596).** Each extension declares whether its route handler opens a DB connection via the optional `useDatabase` field. Resolution order at boot:

```
binding.useDatabase ?? extension.useDatabase ?? false
```

Default is **`false`** for extension routes — a receiver that only verifies a signature and enqueues should not pay for a DB connection (faster cold start; the Lambda doesn't get the Prisma layer at build time). Scope note: this `false` default applies only to per-binding extension handlers. `createHandler` itself still defaults `shouldUseDatabase: true` for the integration's own catch-all handler and the legacy `Definition.webhooks: true` path. When `useDatabase: false`, the receiver must not touch the database — DB-dependent work (e.g. `portalId → integrationId` lookup) belongs in the queue worker that processes the dispatched event.

**Instantiation sites added in #590** — anywhere an integration is freshly constructed, `initialize()` now runs and `_mergeExtensions` folds extension events in before dispatch:
- `loadRouterFromObject`'s per-request closure (HTTP path)
- `createQueueWorker`'s dry-instance branch (queue path)

**Fail-loud defaults:**
- Two bindings claiming the same event name → throw (events are not namespaced)
- Two routes claiming the same `method + path` *within a single binding* → throw (cross-binding collisions are structurally impossible since #596)
- `Definition.routes` entry exactly matching an extension's namespaced path → throw
- Binding handler references a method that doesn't exist on the integration → throw
- `binding.handlers` typo referencing an event the extension doesn't declare → throw
- Extension's `useDatabase` (or binding override) is not a boolean → throw
- `findIntegrationByPortalId` ambiguous resolution (one externalId, multiple integrations) → throw (cross-tenant routing guard)
- Subclass shadows a binding-declared handler → `console.warn` (subclass wins by design)

**Breaking change in #596 to flag for adopters.** Extension routes used to mount un-namespaced (`/api/{x}-integration{route.path}`). They are now namespaced under the binding key. Any provider webhook already registered against the old path must be re-pointed at the new `/{bindingKey}` URL — and for signature schemes that sign the full URL (e.g. HubSpot v3), the old registration will also fail signature verification until updated.

Quickstart for integration authors and API module authors: [`packages/core/integrations/EXTENSIONS.md`](https://github.com/friggframework/frigg/blob/next/packages/core/integrations/EXTENSIONS.md).

### Deferred from the initial implementation

[#590](https://github.com/friggframework/frigg/pull/590) lands the route + event seams. Three Phase-2 items remain explicitly deferred:

1. **Per-class merged-event cache.** `_mergeExtensions` re-runs every instantiation (every HTTP request, every queue worker run). Pure function of `static Definition.extensions`; cacheable per class at first call. Matters for webhook firehoses.
2. **Worker-side consumption of `getExtensionWorkers`.** Helper is exported but `integration-defined-workers.js` is a `TODO(Phase 2)`. Extension events ride the default per-integration queue worker for now.
3. **Declarative `route.middleware: []` seam.** Extensions own signature verification but have no declared place for it. An author who forgets leaves an open endpoint.

A pre-existing gap that extensions now inherit:

4. **`IntegrationBase` dependency injection.** Repositories are factory'd inline (`integrationRepository = createIntegrationRepository()`); the `// todo: maybe we can pass this as Dependency Injection in the sub-class constructor` comment is untouched. `findIntegrationByPortalId` (new in #590) continues the `require()`-inside-method pattern. Worth a separate ADR before extension authors hit the same wall.

### Beyond `{ routes, events, queues, workers }` — extending the contract

The current contract is enough to bundle a webhook receiver and queue dispatcher. Other Frigg primitives are not yet declarable on extensions and should be considered for v1.1:

| Primitive | What it is | Should extensions declare it? |
|---|---|---|
| **Custom queues** | Integration-specific queues with their own handlers, beyond the default per-integration queue | Already in the contract shape per #590; worker consumption is Phase 2 |
| **Crons / schedules** | EventBridge schedules, periodic sync triggers | Yes — `schedules: [{ rate, event }]` would let extensions ship reusable scheduled-sync patterns |
| **User Actions** | Events typed `USER_ACTION` that `loadUserActions()` exposes to the integration UI | Yes — would let extensions ship pre-built bulk operations (e.g. "resync all contacts" on a HubSpot extension) |
| **Config options** | Schema for per-integration config UI returned by `getConfigOptions()` | Maybe — depends on whether they merge additively across extensions or stay integration-owned |
| **Dynamic options** | Lists fetched from the API for config UI dropdowns | Maybe — same merge-vs-own question |

Crons and User Actions feel like the highest-leverage adds since they unlock "reusable scheduled-sync extension" and "reusable bulk-operation user action" as bundled patterns directly. Config options and dynamic options need a clearer story for whether they compose additively across extensions or stay owned by the integration class.

### Core / API module boundary — worked example

[#590](https://github.com/friggframework/frigg/pull/590) added `IntegrationBase.findIntegrationByPortalId(externalId, moduleName?)` — a reverse-lookup helper for resolving an inbound platform identifier to a Frigg integration ID. "Portal ID" is HubSpot's vocabulary; the generic operation is "find an integration by an entity's external ID."

The boundary this draws (worth encoding as a general rule for any helper):

- **Core** should expose `IntegrationBase.findIntegrationByEntityExternalId(externalId, moduleName?)` — the platform-neutral primitive. Likely also a `list*` variant for the legitimate case where one externalId maps to multiple integrations, distinct from the cross-tenant guard that the current `findIntegrationByPortalId` throws on.
- **The HubSpot api-module's extension** exposes the thin platform-vocabulary wrapper: `hubspot.helpers.findIntegrationByPortalId(portalId)` calls the core primitive.

Why this matters: a healthy number of API modules route inbound webhooks by account identifier alone — `team_id` (Slack), `tenant_id` (Microsoft Teams), `workspace_id` (Asana, Google Workspace), `portal_id` (HubSpot). Every one will reach for this reverse-lookup. Keeping the generic operation in core (platform-neutral, reusable) and the platform-vocabulary wrapper in each extension (self-documenting for that platform's developers) is the right split.

The rule applies more broadly to any helper: **if you can name it in a single platform's vocabulary, it belongs in that platform's extension, not in core.** Filed as Open Question 14 — encode as a contributor guideline, or trust to code review.

---

## Artifacts

**Code or configuration that must be generated and deployed *outside* the Frigg runtime in order to enable certain capabilities. Frigg often acts as the backend for the deployed artifact.**

An Artifact is anything that has to exist on the target platform — or as a deployable bundle uploaded somewhere — for a capability to work. Sometimes the artifact is a full code project (HubSpot Project, Salesforce managed package). Sometimes it's just a manifest (Slack App manifest, web app manifest). Sometimes it's generated by a vendor CLI (`hs project add`, `slack scaffold`). The constant is: **it doesn't run inside Frigg; Frigg helps the developer produce it, and Frigg may serve as its backend once deployed**.

Artifacts are deliberately **not** a fourth tier — the three tiers above describe pluggable code that runs inside the Frigg runtime; Artifacts run outside it. They sit alongside the tiers as a separate category.

### Examples

| Module | Artifact | Requirement | What it unlocks |
|--------|----------|-------------|------------------|
| HubSpot | HubSpot Project | `base` (required to publish on Marketplace) | UI extensions, serverless functions |
| Slack | Slack App manifest | `base` (required to ship a Slack app) | Slash commands, event subscriptions, OAuth flows |
| Salesforce | Managed package | `optional` | Lightning Web Components, custom objects |
| Canva | Canva App | `base` (required for Marketplace) | Custom panels |
| Zendesk | Zendesk App | `optional` | App framework integrations |
| DocuSign | Extension App | `optional` | Embedded signing UI, agent UI |

### Shape (on the API module's Definition)

```js
artifacts: {
    'hubspot-project': {
        requirement: 'base',                // 'base' (required to ship the module) | 'optional' (unlocks specific capabilities)
        unlocks:     ['ui.contactSidebar', 'actions.serverlessFunctions'],
        spec:        '../../specs/fenestra/examples/0.1.0/hubspot.fenestra.yaml',
        scaffold: {
            cli:      'hs project add',     // vendor CLI command, if any
            docs:     'https://developers.hubspot.com/docs/platform/build-an-app',
            template: './artifacts/hubspot-project-template/',   // optional, shipped by the module
        },
        extensions: ['UIExtensionBridge'],   // Tier 3 extensions Frigg uses to serve this artifact at runtime
    },
}
```

### Lifecycle

1. **Author time** — the developer (or their agent) reads `module.artifacts` to find out what needs to be created. The `scaffold` block points at the vendor CLI, docs, and any template the module ships.
2. **Generate time** — invoking the scaffold (manually or via a future `frigg artifact scaffold hubspot-project`) produces the artifact in a known location alongside the integration in the consuming repo.
3. **Deploy time** — the artifact is uploaded/deployed to the target platform via vendor tooling (typically the same CLI: `hs project upload`).
4. **Runtime** — the Tier 3 Integration Extensions listed in `extensions: [...]` provide the Frigg-side backend that the deployed artifact talks to.

### Authoring

Written by:
- API module authors — ship the scaffold pointers, optional template, and the bridge Tier 3 extensions
- Integration developers — the generated artifact lives in the consuming app's repo and gets versioned with the integration

### Decisions

- **Artifacts live alongside the integration in the consuming app's repo**, not inside the API module. The API module ships scaffolds and templates; the *generated* code is the integration's, not the module's.
- **`requirement` is `base | optional`.** A `base` artifact is a hard requirement to ship the module on the target platform. An `optional` artifact unlocks specific capabilities listed in `unlocks`.
- **The vendor CLI is referenced, not bundled.** `scaffold.cli` is a string the developer/agent invokes. We don't shadow vendor tooling; the source of truth for `hs project add` is HubSpot's `@hubspot/cli`.
- **Capabilities depending on an artifact must declare it explicitly** in `implementedBy.artifact`. This lets a future `frigg doctor` warn when a capability is in use but its artifact isn't generated/deployed.

### What Artifacts are *not*

- Not a Tier 3 Integration Extension. Extensions run inside Frigg; Artifacts run outside Frigg.
- Not a Core Plugin. Core Plugins are substitutable infrastructure; Artifacts are integration-target-specific generated code.
- Not bundled-and-built by the API module. The module ships pointers and (optionally) templates; the consuming repo owns the generated bytes.

---

## API Module Capability Declaration

**A structured declaration on the API module's Definition that answers "what can I do with this API module?" Capabilities point to the specs that describe them and bind to the mechanisms that implement them.**

The three extension tiers and the Artifact category together describe *how* Frigg gets extended. The Capability Declaration describes *what each API module exposes*, organised so a developer (or their agent) can answer integration-design questions without reading the API class line by line:

- What objects/entities does this API expose, and what operations on each?
- What other actions does it expose?
- What configuration/settings are accessible via API?
- What constraints (rate limits, page sizes, bulk endpoints, webhooks) apply?
- What's required to release on this platform (which artifacts)?
- What detail spec describes each of the above?

### Two faces of every capability

Every capability has two faces:

- **Backed by** a *spec* — the formal detail. Today's spec families:
  - [OpenAPI](https://spec.openapis.org/oas/latest.html) — REST endpoints
  - [AsyncAPI](https://www.asyncapi.com/) — events / webhooks
  - [Arazzo](https://spec.openapis.org/arazzo/latest.html) — composite workflows
  - [Fenestra](https://github.com/friggframework/api-module-library/tree/claude/fenestra-spec-draft-Q367t/specs/fenestra) — UI extension ecosystems (Frigg-authored draft, OAI submission target)
- **Implemented by** one of three mechanisms (or a combination):
  1. **The API class** — atomic operations the API exposes (the actual HTTP call)
  2. **A Tier 3 Integration Extension** — Frigg primitives composed into reusable handler bundles (sync engines, webhook routing, retry policies)
  3. **An Artifact** — code or configuration that lives outside Frigg, generated by the module's scaffold and served by Frigg's Tier 3 extensions

### Shape (on the API module's Definition)

```js
// packages/api-module-hubspot/definition.js  (excerpt)
const Definition = {
    API: Api,
    moduleName: config.name,
    requiredAuthMethods: { /* existing */ },
    env: { /* existing */ },

    capabilities: {
        objects: {
            Contact: {
                operations:    ['list', 'get', 'create', 'update', 'delete', 'search'],
                bulk:          ['create', 'update'],
                backedBy:      { spec: 'openapi', ref: '#/paths/~1crm~1v3~1objects~1contacts' },
                implementedBy: { apiClass: ['listContacts', 'getContact', 'createContact'] },
            },
            // Deal, Company, ...
        },

        actions: {
            mergeContacts:  { backedBy:      { spec: 'openapi', ref: '#/paths/...' },
                              implementedBy: { apiClass: ['mergeContacts'] } },
            moveDealStage:  { /* ... */ },
        },

        ui: {
            contactSidebar: {
                backedBy:      { spec: 'fenestra', ref: '#/extensionPoints/crm-sidebar' },
                implementedBy: { artifact: 'hubspot-project', extension: 'UIExtensionBridge' },
            },
        },

        sync: {
            contactBidirectional: {
                backedBy:      null,                                  // a Frigg pattern, not a vendor spec
                implementedBy: { extension: 'ContactSync' },
            },
        },

        constraints: {
            auth:          ['oauth2'],
            rateLimits:    { default: '100/10s', bulk: '10/min' },
            pageSize:      { default: 100, max: 1000 },
            bulkEndpoints: true,
            webhooks:      true,
        },
    },

    specs: {
        openapi:  './specs/openapi.yaml',
        asyncapi: './specs/asyncapi.yaml',
        fenestra: '../../specs/fenestra/examples/0.1.0/hubspot.fenestra.yaml',
    },

    extensions: {
        webhooks:          require('./extensions/webhooks'),          // Tier 3 bundles
        ContactSync:       require('./extensions/contact-sync'),
        UIExtensionBridge: require('./extensions/ui-extension-bridge'),
    },

    artifacts: { /* see Artifacts section above */ },
};
```

### Decisions

- **Capabilities are descriptive, not generative.** Declaring `objects.Contact.operations: ['list']` doesn't *create* a `listContacts` method; it documents that the API class has one (via `implementedBy.apiClass`). The framework can verify the binding but doesn't synthesise the implementation.
- **`backedBy` and `implementedBy` are loose pointers.** Validation is a developer-experience nicety (does the spec ref resolve? does the named extension exist? does the named method exist on the API class? does the named artifact exist?) — not a runtime gate.
- **The Capability Declaration is JSON-Schema-validatable.** The shape lives in a `frigg-capabilities.schema.json` (`$schema` of draft 2020-12), drafted to mirror the conventions of Fenestra's modular schemas: `$defs`, `patternProperties: '^x-'`, strict `additionalProperties: false`.
- **Capability *types* (`objects`, `actions`, `ui`, `sync`, `constraints`, ...) are an enumerated-but-extensible set.** The schema enumerates known types; vendors and platforms add custom types via `x-` keys per JSON Schema 2020-12 conventions (matching Fenestra's pattern).

### Authoring

Written by API module authors. The declaration is the contract a module exposes to integration developers and AI agents that build integrations on top.

---

## Comparison

| Concern | Core Plugins | Application Extensions | Integration Extensions | Artifacts |
|---------|--------------|------------------------|------------------------|-----------|
| **Required?** | Yes (with defaults) | No | No | Per artifact: `base` (yes) or `optional` |
| **Scope** | The whole runtime | The whole app | One integration | One capability or marketplace listing |
| **Runs where?** | Inside Frigg | Inside Frigg | Inside Frigg | Outside Frigg (target platform) |
| **Declared on** | `appDefinition.provider`, factory config | `appDefinition.extensions` (array) | `IntegrationBase.Definition.extensions` (object) | `apiModule.Definition.artifacts` (object) |
| **Lifecycle** | Boot (factory resolution) | Build (schema) + boot (bootstrap) + request (routes) | Definition merge + handler binding | Author → generate → deploy → runtime |
| **Auth on routes** | N/A | Admin by default | Integration's own auth model | N/A (Frigg is backend, not host) |
| **Contributes** | Adapters / factories | Prisma models, encrypted fields, admin routes, bootstrap | Routes, events, queues, workers — bound to integration handlers | Scaffold pointers, vendor templates, capability ↔ extension wiring |
| **Authored by** | Frigg core, provider maintainers | App developer, core team, community | API module author, integration developer | API module author (scaffold) + integration developer (generated code) |
| **Example** | `@friggframework/provider-netlify` | `@friggframework/extension-db-credentials` | `hubspot.extensions.webhooks` | `hubspot.artifacts['hubspot-project']` |

---

## Shape mismatches in current code (and how this ADR resolves them)

### Mismatch 1 — Array vs object

- The Tier 2 loader on `claude/frigg-netlify-exploration-aY2Bh` expects an **array**: `appDefinition.extensions = [ext1, ext2]`.
- The Tier 3 prototypes assign an **object**: `this.extensions = { hubspotWebhooks: {...} }`.

**Resolution**: keep both. They model different things. The array form is for *cross-cutting framework additions* where ordering matters and identity is intrinsic to the extension. The object form is for *integration-scoped bindings* where the same extension may be bound multiple times under different local names. Tier 2 stays an array, Tier 3 stays an object.

### Mismatch 2 — `this.extensions` (constructor) vs `Definition.extensions` (static)

- Tier 3 prototypes set `this.extensions` in the constructor so they can `.bind(this)` handlers.
- Every other piece of integration metadata lives on `static Definition`.

**Resolution**: move Tier 3 to `static Definition.extensions` and have the framework do the binding at instantiation. Handlers are referenced by *method name string*, not bound function. The framework resolves them against the integration instance at runtime. Landed in [#590](https://github.com/friggframework/frigg/pull/590) via `IntegrationBase._mergeExtensions()` called from `initialize()`.

### Mismatch 3 — Vocabulary collision

- "Extension" today refers to both Tier 2 (app-level) and Tier 3 (integration-level).
- "Plugin" today refers to provider plugins, serverless-plugin, module-plugin.
- "Artifact" has been used loosely for both partner-side-deployables and build outputs.

**Resolution**: this ADR names all four concepts explicitly. Documentation, errors, and APIs should use the qualified names: **Core Plugin**, **Application Extension**, **Integration Extension**, **Artifact**. Bare "extension" is acceptable only when context makes the tier unambiguous. "Artifact" in this ADR means specifically the partner-side-deployable defined above, not build output or CI artifacts.

---

## Implementation phases

### Phase 1 — Land Tier 2 (Application Extensions)
- Merge the `packages/core/extensions/` system from `claude/frigg-netlify-exploration-aY2Bh` into `next`.
- Ship `@friggframework/extension-db-credentials` as the reference implementation.
- Add `appDefinition.extensions` to the App Definition schema (`packages/schemas`).
- CLI: extend `frigg build` to invoke schema composition.

### Phase 2 — Formalize Tier 3 (Integration Extensions) — in flight via [#590](https://github.com/friggframework/frigg/pull/590)

Daniel Klotz's [PR #590](https://github.com/friggframework/frigg/pull/590) lands the framework half: extension contract + helpers (`extension.js`), `_mergeExtensions` + `findIntegrationByPortalId` on `IntegrationBase`, route claiming/mounting in `integration-defined-routers.js`, instantiation hooks in `loadRouterFromObject` and `createQueueWorker`, plus 69 unit tests and the [`EXTENSIONS.md`](https://github.com/friggframework/frigg/blob/next/packages/core/integrations/EXTENSIONS.md) quickstart. See **Framework load mechanism** under Tier 3 for the runtime seams and **Deferred from the initial implementation** for what's explicitly Phase-2.

Items in this phase:
- ~~Add `Definition.extensions` to `IntegrationBase` definition schema.~~ Done in #590.
- ~~Implement definition merge: routes/events from each binding are added to the integration's effective definition.~~ Done in #590 (routes at boot; events per-instance). Workers Phase 2.
- ~~Implement string-name handler binding at instantiation.~~ Done in #590.
- Migrate the existing `this.extensions` prototypes in `frigg-2.0-prototyping` et al. to the new form. (These are LeftHook-owned downstream repos — coordinate.)
- Ship `@friggframework/api-module-hubspot`'s `extensions.webhooks` as the reference (separate PR in api-module-library).
- Rename/relocate `findIntegrationByPortalId` per the **Core / API module boundary** worked example (Open Question 14).

### Phase 3 — Documentation
- Author guide: "Writing an Application Extension"
- Author guide: "Writing an Integration Extension"
- Decision tree: "Which tier should my plugin be?"
- Update [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md) to cross-link Core Plugins to this ADR.

### Phase 4 — Deprecate and consolidate
- Remove the constructor-time `this.extensions = {...}` pattern.
- Audit any code referring to "plugin" or "extension" without qualification and rename to the tier-specific term.

### Phase 5 — Formalize the Capability Declaration
- Author `packages/schemas/frigg-capabilities.schema.json` (JSON Schema draft 2020-12; mirrors Fenestra conventions — `$defs`, `patternProperties: '^x-'`, strict `additionalProperties: false`).
- Add `capabilities` and `specs` blocks to the API module Definition schema in `packages/schemas`.
- Reference impl: enrich `packages/v1-ready/salesforce/defaultConfig.json` (or `definition.js`) in `api-module-library` as the first live capability declaration.
- CLI: extend `frigg validate` to validate capability declarations and verify cross-refs (`implementedBy.apiClass` resolves to real methods, `implementedBy.extension` exists in `extensions`, `implementedBy.artifact` exists in `artifacts`).

### Phase 6 — Land Artifacts tooling
- Add `apiModule.Definition.artifacts` to the schema.
- Reference impl: HubSpot module ships an `artifacts['hubspot-project']` entry with `scaffold.cli: 'hs project add'` and a starter template under `packages/api-module-hubspot/artifacts/hubspot-project-template/`.
- CLI: `frigg artifact list` (enumerate declared artifacts for a module), `frigg artifact scaffold <name>` (invoke the vendor CLI or copy the template into the consuming repo), `frigg doctor` (verify required artifacts are generated and required vendor CLIs are installed).

### Phase 7 — Extend the Tier 3 contract beyond `{ routes, events, queues, workers }`
- Add `schedules: [{ rate, event }]` (crons / EventBridge schedules) — unblocks reusable scheduled-sync extensions.
- Add User Actions support so extensions can ship pre-built `USER_ACTION` events (e.g. "resync all contacts") that `loadUserActions()` enumerates.
- Resolve the merge-vs-own question for config options and dynamic options before adding them.

---

## Open questions

1. **Tier 3 handler binding by string** introduces a small runtime cost (lookup per event) and removes editor "go-to-definition" on the handler reference. Is the trade-off worth it vs. supporting an alternative `handlers: (integration) => ({ WEBHOOK_EVENT: integration.handleWebhookEvent })` factory form?
2. **Can a Tier 3 Integration Extension *also* contribute a Prisma model?** Today's prototype shape (`{ routes, events, queues, workers }`) doesn't include schema. If we want, e.g., a generic "webhook log" extension shared across integrations, does it become a Tier 2 Application Extension, or do we extend the Tier 3 contract?
3. **Provider plugins as npm packages vs. in-repo adapters** — settled by [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md) (npm packages). Confirm this ADR's Tier 1 description aligns.
4. **Versioning** — extensions declare `name` but not `version`. Should both tiers gain a `frigg: { minVersion: '...' }` block for compatibility checks at load time?
5. **Capability binding validation.** Should `frigg validate` actively verify that `capabilities.*.implementedBy.apiClass = ['fooMethod']` corresponds to a real method on the `API` class, that `extension` names exist in `extensions`, and that `artifact` names exist in `artifacts`? Or is this dev-time lint only?
6. **Vendor CLI as a first-class concept.** Artifacts may rely on vendor CLIs (`hs`, `slack-cli`, `sf`, `gh`). Should `scaffold.cli` stay a freeform string, or should we standardise a `requiredCLIs` block at the module level so `frigg doctor` can verify installations and version-pin them?
7. **Capability *types* — open or closed set?** Today's draft enumerates `objects | actions | ui | sync | constraints | ...`. Should the set be closed (defined in the schema, vendor extensions via `x-`), or open (any key allowed)? Closed keeps tooling tractable; open accommodates platforms we haven't seen yet.
8. **Where does `defaultConfig.json` end and the Capability Declaration begin?** Today's `defaultConfig.json` carries identity metadata (name, label, productUrl, categories). Should `capabilities` live in the same file with a richer `$schema` pointer, or in a separate `capabilities.json` so the existing file stays unchanged? The API class and extensions obviously stay in `definition.js`; only the JSON-serialisable parts of the capability declaration are in play.
9. **Per-class merged-event cache.** `_mergeExtensions` re-runs every instantiation (every HTTP request, every queue worker run). Pure function of `static Definition.extensions` — cacheable per class at first call. Should land before any extension ships at webhook-firehose volume.
10. **Worker-side consumption of `getExtensionWorkers`.** Helper is exported but the worker walker is a Phase-2 TODO. Today extension events ride the default per-integration queue worker via `this.events`. Should worker-side consumption land paired with cron/schedule support in the contract, or earlier?
11. **Declarative `route.middleware: []` seam.** Extensions own their signature verification but there's no declared place to put it. Should we add `middleware: [...]` to the route shape, or keep auth/verification embedded in the handler?
12. **`IntegrationBase` dependency injection.** Pre-existing TODO on the base class; extensions now inherit it. Repositories are factory'd inline; `findIntegrationByPortalId` continues the `require()`-inside-method pattern. Worth a separate ADR before extension authors hit the same wall.
13. **Extending the Tier 3 contract.** Beyond `{ routes, events, queues, workers }`, which primitives belong in v1.1? Crons/schedules and user actions are highest-leverage; config options and dynamic options need more discussion (additive across extensions, or integration-owned?).
14. **Core / API module boundary as a contributor guideline.** The `findIntegrationByPortalId` → `findIntegrationByEntityExternalId` worked example illustrates the rule: core exposes platform-neutral primitives, API modules wrap them in platform vocabulary. Encode as a written guideline, or trust to code review?

---

## References

### Code (on `claude/frigg-netlify-exploration-aY2Bh`)
- `packages/core/extensions/extension-loader.js` — Tier 2 loader and validator
- `packages/core/extensions/route-mounter.js` — Tier 2 admin-route mounting
- `packages/core/extensions/bootstrap-runner.js` — Tier 2 bootstrap lifecycle
- `packages/core/extensions/schema-composer.js` — Tier 2 Prisma schema merge
- `packages/core/extensions/initialize-app.js` — Tier 2 boot orchestration
- `packages/extensions/db-credentials/` — Tier 2 reference extension
- `packages/core/integrations/integration-router.js` — Tier 2 consumer site

### Code (downstream prototypes for Tier 3)
- `lefthookhq/frigg-2.0-prototyping/backend/src/integrations/HubSpotIntegration.js`
- `stack-global--frigg-2.0/backend/src/integrations/HubSpotIntegration.js`
- `vartopia--frigg-2.0/backend/src/integrations/HubSpotIntegration.js`

### Framework implementation (in flight)
- [PR #590](https://github.com/friggframework/frigg/pull/590) — Tier 3 framework implementation by Daniel Klotz. Adds `packages/core/integrations/extension.js` (contract + `validateExtensionBinding`, `getExtensionRoutes`, `getExtensionWorkers` helpers), `IntegrationBase._mergeExtensions()` invoked from `initialize()`, route claiming + mounting in `packages/core/handlers/routers/integration-defined-routers.js`, `IntegrationBase.findIntegrationByPortalId()` reverse-lookup helper, instantiation hooks in `loadRouterFromObject` and `createQueueWorker`, plus 69 unit tests and a [`packages/core/integrations/EXTENSIONS.md`](https://github.com/friggframework/frigg/blob/next/packages/core/integrations/EXTENSIONS.md) quickstart.

### Commits
- [`69acce55`](https://github.com/friggframework/frigg/commit/69acce55) — `feat(core): add extension system for DB-backed OAuth credentials` (Tier 2 design rationale)
- [`ccb50103`](https://github.com/friggframework/frigg/commit/ccb50103) — `feat(extensions): add @friggframework/extension-db-credentials package` (Tier 2 reference impl)
- [`4f9d12a1`](https://github.com/friggframework/frigg/commit/4f9d12a1) — `feat(schemas,devtools): add extensions to app definition schema and validation`

### Specifications referenced for the Capability Declaration
- [OpenAPI](https://spec.openapis.org/oas/latest.html) — REST API surface
- [AsyncAPI](https://www.asyncapi.com/) — events and webhooks
- [Arazzo](https://spec.openapis.org/arazzo/latest.html) — composite workflows
- [Fenestra](https://github.com/friggframework/api-module-library/tree/claude/fenestra-spec-draft-Q367t/specs/fenestra) — UI extension ecosystems (Frigg-authored draft on branch `claude/fenestra-spec-draft-Q367t` in `friggframework/api-module-library`, OAI submission target)

### Related ADRs
- [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md) — Tier 1 (Core Plugins) — provider plugin system
- [ADR-GLOBAL-ENTITIES](./ADR-GLOBAL-ENTITIES.md) — entity ownership patterns (orthogonal)
