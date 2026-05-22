# Architecture Decision Record: Plugins and Extensions

**Status**: Proposed
**Date**: 2026-05-22
**Author**: Sean Matthews

## Context

As Frigg has grown, multiple unrelated mechanisms have all been informally called "plugins" or "extensions":

- The **provider plugin** system that lets the same app deploy to AWS, Netlify, Vercel, etc. (see [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md)).
- An emerging **app-level extensions** array on the App Definition that adds Prisma models, encrypted fields, admin routes, and bootstrap hooks (prototyped in branch [`claude/frigg-netlify-exploration-aY2Bh`](https://github.com/friggframework/frigg/tree/claude/frigg-netlify-exploration-aY2Bh/packages/core/extensions), exemplified by [`@friggframework/extension-db-credentials`](https://github.com/friggframework/frigg/tree/claude/frigg-netlify-exploration-aY2Bh/packages/extensions/db-credentials)).
- An **integration-level `this.extensions` map** appearing on `IntegrationBase` subclasses that bundles a handler library (e.g. `extensions.hubspotWebhooks`) with named event handlers (seen in `stack-global--frigg-2.0`, `frigg-2.0-prototyping`, `vartopia--frigg-2.0` — see [Prior Art](#prior-art)).

These three things solve different problems, run at different lifecycle stages, are authored by different roles, and have different shapes — but they share a vocabulary, which makes them easy to confuse and hard to document.

This ADR establishes a **three-tier taxonomy** for what's pluggable in Frigg, names each tier, defines its contract and lifecycle, and aligns existing prototypes to the model.

## Decision

Frigg recognizes three distinct categories of pluggable code. Each has its own name, its own contract, and its own authoring role.

| Tier | Name | Authored by | Required? | Lives on |
|------|------|-------------|-----------|----------|
| 1 | **Core Plugins** | Frigg core / provider package authors | Required (with defaults) | The runtime / app construction |
| 2 | **Application Extensions** | App developer | Optional | `appDefinition.extensions` |
| 3 | **Integration Extensions** | API module author / community | Optional | `IntegrationBase.Definition.extensions` |

The rest of this ADR defines each tier and resolves the shape mismatches in the current prototypes.

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
    routes: [
        { path: '/hubspot/webhooks', method: 'POST', event: 'WEBHOOK_EVENT' },
    ],
    events: {
        WEBHOOK_EVENT: { /* event definition, queueing, etc. */ },
    },
    queues: [ /* queue definitions */ ],
    workers: [ /* worker definitions */ ],
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

---

## Comparison

| Concern | Core Plugins | Application Extensions | Integration Extensions |
|---------|--------------|------------------------|------------------------|
| **Required?** | Yes (with defaults) | No | No |
| **Scope** | The whole runtime | The whole app | One integration |
| **Declared on** | `appDefinition.provider`, factory config | `appDefinition.extensions` (array) | `IntegrationBase.Definition.extensions` (object) |
| **Lifecycle** | Boot (factory resolution) | Build (schema) + boot (bootstrap) + request (routes) | Definition merge + handler binding |
| **Auth on routes** | N/A | Admin by default | Integration's own auth model |
| **Contributes** | Adapters / factories | Prisma models, encrypted fields, admin routes, bootstrap | Routes, events, queues, workers — bound to integration handlers |
| **Authored by** | Frigg core, provider maintainers | App developer, core team, community | API module author, integration developer |
| **Example** | `@friggframework/provider-netlify` | `@friggframework/extension-db-credentials` | `hubspot.extensions.webhooks` |

---

## Shape mismatches in current code (and how this ADR resolves them)

### Mismatch 1 — Array vs object

- The Tier 2 loader on `claude/frigg-netlify-exploration-aY2Bh` expects an **array**: `appDefinition.extensions = [ext1, ext2]`.
- The Tier 3 prototypes assign an **object**: `this.extensions = { hubspotWebhooks: {...} }`.

**Resolution**: keep both. They model different things. The array form is for *cross-cutting framework additions* where ordering matters and identity is intrinsic to the extension. The object form is for *integration-scoped bindings* where the same extension may be bound multiple times under different local names. Tier 2 stays an array, Tier 3 stays an object.

### Mismatch 2 — `this.extensions` (constructor) vs `Definition.extensions` (static)

- Tier 3 prototypes set `this.extensions` in the constructor so they can `.bind(this)` handlers.
- Every other piece of integration metadata lives on `static Definition`.

**Resolution**: move Tier 3 to `static Definition.extensions` and have the framework do the binding at instantiation. Handlers are referenced by *method name string*, not bound function. The framework resolves them against the integration instance at runtime.

### Mismatch 3 — Vocabulary collision

- "Extension" today refers to both Tier 2 (app-level) and Tier 3 (integration-level).
- "Plugin" today refers to provider plugins, serverless-plugin, module-plugin.

**Resolution**: this ADR names all three tiers explicitly. Documentation, errors, and APIs should use the qualified names: **Core Plugin**, **Application Extension**, **Integration Extension**. Bare "extension" is acceptable only when context makes the tier unambiguous.

---

## Implementation phases

### Phase 1 — Land Tier 2 (Application Extensions)
- Merge the `packages/core/extensions/` system from `claude/frigg-netlify-exploration-aY2Bh` into `next`.
- Ship `@friggframework/extension-db-credentials` as the reference implementation.
- Add `appDefinition.extensions` to the App Definition schema (`packages/schemas`).
- CLI: extend `frigg build` to invoke schema composition.

### Phase 2 — Formalize Tier 3 (Integration Extensions)
- Add `Definition.extensions` to `IntegrationBase` definition schema.
- Implement definition merge: routes/events/queues/workers from each binding are added to the integration's effective definition.
- Implement string-name handler binding at instantiation.
- Migrate the existing `this.extensions` prototypes in `frigg-2.0-prototyping` et al. to the new form. (These are LeftHook-owned downstream repos — coordinate.)
- Ship `@friggframework/api-module-hubspot`'s `extensions.webhooks` as the reference.

### Phase 3 — Documentation
- Author guide: "Writing an Application Extension"
- Author guide: "Writing an Integration Extension"
- Decision tree: "Which tier should my plugin be?"
- Update [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md) to cross-link Core Plugins to this ADR.

### Phase 4 — Deprecate and consolidate
- Remove the constructor-time `this.extensions = {...}` pattern.
- Audit any code referring to "plugin" or "extension" without qualification and rename to the tier-specific term.

---

## Open questions

1. **Tier 3 handler binding by string** introduces a small runtime cost (lookup per event) and removes editor "go-to-definition" on the handler reference. Is the trade-off worth it vs. supporting an alternative `handlers: (integration) => ({ WEBHOOK_EVENT: integration.handleWebhookEvent })` factory form?
2. **Can a Tier 3 Integration Extension *also* contribute a Prisma model?** Today's prototype shape (`{ routes, events, queues, workers }`) doesn't include schema. If we want, e.g., a generic "webhook log" extension shared across integrations, does it become a Tier 2 Application Extension, or do we extend the Tier 3 contract?
3. **Provider plugins as npm packages vs. in-repo adapters** — settled by [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md) (npm packages). Confirm this ADR's Tier 1 description aligns.
4. **Versioning** — extensions declare `name` but not `version`. Should both tiers gain a `frigg: { minVersion: '...' }` block for compatibility checks at load time?

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

### Commits
- [`69acce55`](https://github.com/friggframework/frigg/commit/69acce55) — `feat(core): add extension system for DB-backed OAuth credentials` (Tier 2 design rationale)
- [`ccb50103`](https://github.com/friggframework/frigg/commit/ccb50103) — `feat(extensions): add @friggframework/extension-db-credentials package` (Tier 2 reference impl)
- [`4f9d12a1`](https://github.com/friggframework/frigg/commit/4f9d12a1) — `feat(schemas,devtools): add extensions to app definition schema and validation`

### Related ADRs
- [ADR-MULTI-PROVIDER-SUPPORT](./ADR-MULTI-PROVIDER-SUPPORT.md) — Tier 1 (Core Plugins) — provider plugin system
- [ADR-GLOBAL-ENTITIES](./ADR-GLOBAL-ENTITIES.md) — entity ownership patterns (orthogonal)
