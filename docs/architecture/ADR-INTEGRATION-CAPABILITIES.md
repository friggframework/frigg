# Architecture Decision Record: Integration-Level Capability Declaration

**Status**: Proposed
**Date**: 2026-05-25
**Author**: Sean Matthews

## Context

[ADR-EXTENSIONS](./ADR-EXTENSIONS.md) introduced a Capability Declaration on the API module's Definition — a structured `capabilities` block answering "what can I do with this API module?" Each capability points at a spec (OpenAPI, AsyncAPI, Arazzo, Fenestra) and binds to one of three implementation mechanisms: the API class, a Tier 3 Integration Extension, or an Artifact.

That ADR scopes capabilities to the **API module**. It does not address the layer above: **the integration class itself**. An integration is the *composer* that bundles one or more API modules, optional Tier 3 extensions, and optional Artifacts into a usable surface. From an integration developer's perspective, "what does this integration do?" cannot be answered by enumerating API module capabilities alone — the integration also adds:

- Cross-module workflows (sync flows that touch multiple APIs)
- Per-tenant configuration (settings, mapping, preferences)
- Lifecycle behavior beyond Frigg defaults
- Vendor-side reactions (webhook handlers, app-uninstall hooks)
- User-facing actions surfaced through the standard `USER_ACTION` event machinery

Today, none of this is declared. The integration's `static Definition` carries `name`, `version`, `modules`, `routes`, `webhooks`, and `display` — but the *meaning* of the integration is implicit in its code. An agent (or a new developer) cannot enumerate what an integration does without reading every method on the class and every entry in `this.events`.

This gap is concrete enough to have already produced bugs. A recent design conversation surfaced the `PipedriveIntegration` definition declaring eight routes; on review, only one was actually needed as a vendor-facing route (an app-uninstall webhook from Pipedrive), one was a per-tenant config option that should have ridden Frigg's existing `getConfigOptions()` + `PATCH /options` surface instead of being a separate route, and the remaining six were exploratory dead code. The integration's `static Definition` gave no way to express the intent of each route, so the wrong shapes accumulated without anyone noticing.

This ADR proposes an **integration-level Capability Declaration** that mirrors the API module pattern from [ADR-EXTENSIONS](./ADR-EXTENSIONS.md), extended with the dimensions specific to integrations:

- A **primitive taxonomy** describing the kinds of things integrations bundle (data syncs, workflows, user actions, lifecycle hooks, webhook handlers, fenestra UI, AI inference, API proxies, MCP tool exposure, config options, cron jobs)
- A **surface field** describing where each capability is exposed (default `/api/...`, vendor-webhook, vendor-frontend, admin, internal) and therefore which auth model applies
- **Inheritance semantics** so capabilities declared on a base class (`IntegrationBase`, `BaseCRMIntegration`, etc.) bubble up to concrete subclasses without redeclaration, with explicit `override` for specialization
- **Pointer discipline** — every capability declares *what exists* and *where to read live*, never *what the code does*. The integration code remains the only source of truth for behavior

The downstream goal is to enable agent-driven integration work — capability discovery, change planning, refactor scoping, validation — to operate on the Definition rather than on free-text descriptions or full code reads. The ontology and harness ADRs (see [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) and [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md)) build on this declaration; the eval ADR ([ADR-EVALS](./ADR-EVALS.md)) measures whether it actually moves the needle on agent task accuracy.

## Decision

Add a `capabilities` array to `IntegrationBase.Definition` (and to subclass Definitions). Each entry declares:

- **`name`** — stable identifier for the capability, dot-namespaced by scope (`crm.initialContactSync`, `pipedrive.appUninstall`)
- **`primitive`** — taxonomy slot (see [Primitive taxonomy](#primitive-taxonomy))
- **`description`** — required short prose; one or two sentences of intent, not behavior. Answers "why does this capability exist as its own thing?"
- **`backedBy`** — optional pointer to a formal spec (OpenAPI / AsyncAPI / Arazzo / Fenestra / custom). Same vocabulary as ADR-EXTENSIONS.
- **`implementedBy`** — required binding to the code that fulfills the capability. Includes a **`surface`** field, plus references to events, handlers, routes, modules, extensions, and artifacts (pointers, not duplications)
- **`prd`** — optional pointer to a longer product-rationale document
- **`inherits` / `override`** — optional, for child-class capabilities that specialize an inherited one

Capabilities are resolved by walking the prototype chain. `Frigg.resolveCapabilities(IntegrationClass)` returns the union of inherited and own capabilities, with `override` blocks applied. No instantiation required — the declaration is fully static.

The schema is JSON-Schema-validatable, mirroring the conventions ADR-EXTENSIONS established for the API module declaration: `$defs`, `patternProperties: '^x-'`, strict `additionalProperties: false`.

---

## Capability shape

```js
// On IntegrationBase.Definition or any subclass Definition
capabilities: [
  {
    name: 'crm.initialContactSync',
    primitive: 'dataSync',
    description: 'On first install, performs a reverse-chronological mass sync of all CRM persons into Quo contacts. Fans out pages concurrently via SQS for throughput.',
    prd: '@friggframework/docs/prd/crm-initial-sync.md',          // optional

    backedBy: {
      spec: 'arazzo',
      ref: '@friggframework/specs/crm/initial-contact-sync.arazzo.yaml',
    },

    implementedBy: {
      via: 'extension',                                            // see "implementedBy.via" below
      surface: 'default',                                          // see "Surface" section
      requires: [                                                  // methods the concrete class must implement
        'fetchPersonPage',
        'transformPersonToQuo',
        'fetchPersonsByIds',
      ],
      events: [
        'INITIAL_SYNC',
        'PROCESS_PERSON_PAGE',
        'PROCESS_PERSON_BATCH',
        'COMPLETE_SYNC',
      ],
      handlers: [
        'fetchPersonPageHandler',
        'batchHandler',
        'completeSyncHandler',
      ],
      modules: [],                                                 // references into Definition.modules; empty when extension-driven
      extensions: ['BaseCRMSyncOrchestrator'],                     // Tier 3 extensions this capability composes
      artifacts: [],                                               // Artifacts this capability depends on; usually empty
    },
  },
]
```

### `implementedBy.via`

Three values, matching the implementation mechanisms from ADR-EXTENSIONS:

| Value | Meaning |
|---|---|
| `api-class` | Atomic operation on an API module's API class. The capability is fulfilled by direct calls to module methods. |
| `extension` | Frigg primitive composition — a Tier 3 Integration Extension provides the orchestration; the integration supplies required hook methods (e.g. `fetchPersonPage`). |
| `artifact` | Capability depends on Artifact code that runs outside Frigg (HubSpot Project UI extension, Slack App manifest, Salesforce managed package). The Definition's `implementedBy.artifacts` lists the required artifacts. |

Multiple values can be combined — a capability that uses an Artifact for its UI but a Tier 3 extension for its backend is `via: ['artifact', 'extension']` with both lists populated.

### `implementedBy.surface`

Where the capability is exposed, and therefore which auth model applies. The capability does **not** declare *who* can call it — anyone with valid credentials for the surface can. Surface describes the route shape and auth, not the consumer.

| Value | Auth model | Route shape | When to use |
|---|---|---|---|
| `default` | Bearer token → `req.user` populated (`loadUser` + `requireLoggedInUser` middleware) | `/api/...` Frigg-mounted, no vendor prefix | Anything an authenticated Frigg user should be able to invoke. Default choice. Reachable by any caller with a valid Bearer token — adopter frontend, adopter backend, CLI, agent, vendor extension that can carry one, browser extension. |
| `vendor-webhook` | Vendor signature (HMAC, etc.), no user context. Integration resolved from payload (e.g. by external entity id). | `/api/<integration-name>-integration/webhooks[/...]` — mounted automatically by the framework | Vendor *initiates* the call (push events Frigg receives). The vendor can't present a Bearer token because there's no user session on their side. |
| `vendor-frontend` | Vendor-side identity (signed panel request, vendor JWT) | Vendor-namespaced subpath under the integration mount | Fallback for when a vendor UI literally can't carry a Frigg Bearer token (sandboxed panel, etc.). Not the default — only declared when the default surface is genuinely unreachable. |
| `admin` | `x-frigg-admin-api-key` (`requireAdmin` middleware) | `requireAdmin`-gated route | System operations not on behalf of any user. Rare for integrations to declare new ones. |
| `internal` | None (in-process) | No HTTP | Queue workers, schedulers, lifecycle hooks, internal use cases. |

**A vendor calling Frigg is not by itself a reason to leave the default surface.** Most vendors that can call Frigg at all can carry a Bearer token; their integration belongs on `default`. `vendor-frontend` is for the specific case where the vendor's UI runs in a context (sandboxed panel, embedded iframe with hard-coded backend URL) that prevents Bearer-token use. See [Surface selection rule](#surface-selection-rule) below.

### Pointer discipline

`backedBy.ref` and the `requires`, `events`, `handlers`, `routes`, `modules`, `extensions`, `artifacts` fields under `implementedBy` are **pointers**. They tell an agent *what exists and where to read it*. They never describe *what the code does*. Behavior remains the property of the code itself; the Definition guarantees presence and location, not correctness.

This is the discipline that prevents drift. A capability declaration cannot become stale relative to its implementation, because it never claims any fact about the implementation beyond "this method exists" and "this event is wired here." Both are statically checkable. The `description` and `prd` fields document *intent*, not behavior — they describe why the capability exists as a unit, not what the handler returns.

---

## Surface selection rule

For new capabilities, prefer existing Frigg default-surface primitives before declaring new routes:

| Need | Default-surface primitive |
|---|---|
| Per-tenant configuration (settings, preferences, mapping) | `getConfigOptions()` returns a JSON Schema; the adopter UI calls `PATCH /api/v2/integrations/:id` (or v1 equivalent) to update. **Do not declare a new route for a setting.** |
| User-invoked action | A `USER_ACTION`-typed entry in `this.events` (declared either inline or via a Tier 3 extension's events). `loadUserActions()` enumerates them; `GET_USER_ACTIONS` / `GET_USER_ACTION_OPTIONS` lifecycle events expose them through Frigg's default `/api/...` surface. **Do not declare a new route for a user action.** |
| Integration CRUD (create, update, delete, list) | Use the existing `/api/v2/integrations/*` surface ([ADR-006](../architecture-decisions/006-integration-router-v2.md)). |
| Credential/entity reauthorization | Use `/api/credentials/:id/reauthorize` ([ADR-006](../architecture-decisions/006-integration-router-v2.md)). |
| API proxy (MCP / tool-calling) | Use `/api/entities/:id/proxy` ([ADR-006](../architecture-decisions/006-integration-router-v2.md)). |

A new `default`-surface route is declared only when no existing primitive fits.

Vendor-namespaced surfaces (`vendor-webhook`, `vendor-frontend`) are reserved for:
- **`vendor-webhook`** — the external system pushes events Frigg didn't initiate, and the external system can't present a user token because there's no user session on its side
- **`vendor-frontend`** — a vendor UI literally cannot carry a Frigg Bearer token (sandboxed panel, hard-coded backend URL from a vendor manifest, embedded iframe in a context where the adopter's auth can't be propagated)

The smell to watch for: a capability declared `surface: vendor-frontend` (or with a vendor-prefixed path inside an otherwise-default mount) where the consumer *could* have used `default` if the route shape had been chosen differently. See [Worked example: PipedriveIntegration](#worked-example-pipedriveintegration) for a concrete case.

---

## Primitive taxonomy

The `primitive` field classifies what *kind* of thing the capability is. Initial set:

| Primitive | What it is | Typical `implementedBy.via` | Typical `surface` |
|---|---|---|---|
| `lifecycleHook` | Reaction to a framework lifecycle event (`ON_CREATE`, `ON_UPDATE`, `ON_DELETE`, etc.) | `extension` (when inherited) or `artifact` (when override) | `internal` |
| `dataSync` | Ongoing or one-shot data flow between systems, in any direction(s), with any cadence | `extension` (composes a sync orchestrator) | `internal` (orchestrator) + `vendor-webhook` (when webhook-driven) |
| `workflow` | Multi-step chained operation with gates / pauses / state transitions | `extension` or `artifact` | `default` (when user-triggered) or `internal` (when event-triggered) |
| `userAction` | Synchronous user-triggered action surfaced through the `USER_ACTION` event machinery (`loadUserActions`, etc.) | `extension` or `api-class` | `default` |
| `configOption` | Per-tenant configuration field exposed via `getConfigOptions()` + `PATCH /options` | `extension` (default machinery) | `default` |
| `cron` | Scheduled job (EventBridge schedule or equivalent) | `extension` | `internal` |
| `webhookHandler` | Inbound vendor webhook receiver | `extension` (validation + dispatch) + `api-class` (the actual handler logic) | `vendor-webhook` |
| `fenestraComponent` | In-app UI component (panel, sidebar, iframe) backed by a [Fenestra](https://github.com/friggframework/api-module-library/tree/claude/fenestra-spec-draft-Q367t/specs/fenestra) spec | `artifact` (the vendor-side UI) + `extension` (the Frigg-side bridge) | `default` (when an adopter UI calls Frigg) or `vendor-frontend` (when the vendor's panel calls Frigg directly) |
| `aiInference` | LLM-mediated reasoning step embedded in integration flow | `extension` or `artifact` | `internal` (when invoked from a workflow) or `default` (when user-triggered) |
| `apiProxy` | Pass-through to an external API for tool-calling / MCP / agent use | `api-class` | `default` (via `/api/entities/:id/proxy`) |
| `mcpTool` | Capability exposed as an MCP tool for agent consumption | `extension` (MCP server bridge) | `default` |

The set is **enumerated but extensible**. Vendor-specific primitives are added via `x-` keys per JSON Schema 2020-12 conventions, matching the Fenestra and ADR-EXTENSIONS pattern.

---

## Inheritance and resolution

Capabilities declared on a base class apply to every subclass without redeclaration. `IntegrationBase.Definition.capabilities` declares the foundational set (the lifecycle hooks the constructor wires up); `BaseCRMIntegration.Definition.capabilities` adds the CRM sync set; `PipedriveIntegration.Definition.capabilities` only declares what's *new or overridden*.

Resolution walks the prototype chain. A helper exposed on the framework returns the merged view:

```js
const { resolveCapabilities } = require('@friggframework/core');

const capabilities = resolveCapabilities(PipedriveIntegration);
// Returns: [ ...IntegrationBase capabilities,
//            ...BaseCRMIntegration capabilities,
//            ...PipedriveIntegration capabilities (with override blocks applied) ]
```

### Override semantics

A subclass can specialize an inherited capability without redeclaring its full shape:

```js
// PipedriveIntegration.Definition.capabilities
{
  inherits: 'crm.initialContactSync',
  override: {
    description: 'Pipedrive variant — Persons only (no Leads), uses cursor pagination from /v1/persons.',
    // any other fields here override the inherited value; unspecified fields inherit unchanged
  },
}
```

When the resolver encounters an `inherits` entry, it locates the matching capability up the chain, applies the `override` block as a shallow merge, and emits the result. The original (inherited) capability is replaced in the output — there are not two entries with the same name.

### Required methods (`implementedBy.requires`)

When a capability is implemented by a Tier 3 extension that requires specific methods on the concrete class (e.g. `fetchPersonPage` on a `BaseCRMIntegration` subclass), the inherited capability lists those in `requires`. A static check — `Frigg.validateCapabilityImplementation(IntegrationClass)` — verifies that every required method is defined on the concrete class. This is a development-time lint, not a runtime gate.

The check answers: *"Does PipedriveIntegration fully implement the capabilities its base class promises?"* — by reflecting on the class statically, no instantiation needed.

---

## Relationship to ADR-EXTENSIONS

This ADR sits one level above [ADR-EXTENSIONS](./ADR-EXTENSIONS.md). Their capabilities work together:

| Layer | ADR | Capabilities answer |
|---|---|---|
| API module | [ADR-EXTENSIONS](./ADR-EXTENSIONS.md) | What can I do with **this API module**? (objects, actions, ui, sync, constraints) |
| Integration | **This ADR** | What does **this integration** assemble from API-module capabilities + Tier 3 extensions + Artifacts? |

An integration-level capability composes one or more of:

- API-module capabilities (declared on each module's `Definition.capabilities` per ADR-EXTENSIONS) — pointed at via `implementedBy.modules: [...]`
- Tier 3 Integration Extensions (declared in `IntegrationBase.Definition.extensions` per ADR-EXTENSIONS) — pointed at via `implementedBy.extensions: [...]`
- Artifacts (declared on the API module's `Definition.artifacts` per ADR-EXTENSIONS) — pointed at via `implementedBy.artifacts: [...]`

The integration's `implementedBy` fields are *cross-references* into the module-level and extension-level declarations. Resolving an integration-level capability fully means walking those cross-references — `Frigg.resolveCapability(IntegrationClass, capabilityName)` returns the integration-level capability with all referenced module capabilities, extensions, and artifacts inlined.

This composition is what lets an agent answer "what does this integration do?" without crawling the code. It walks the integration's `capabilities`, resolves each `implementedBy` cross-reference, and emits a structured tree: integration → capabilities → (module capabilities + extension bindings + artifact references) → specs.

---

## Worked example: PipedriveIntegration

The current `PipedriveIntegration.Definition` (in `lefthookhq/quo--frigg`) declares eight routes inline:

```js
// CURRENT (illustrative)
static Definition = {
    name: 'pipedrive',
    version: '1.0.0',
    // ...
    routes: [
        { path: '/pipedrive/deals',         method: 'GET',    event: 'LIST_PIPEDRIVE_DEALS' },
        { path: '/pipedrive/persons',       method: 'GET',    event: 'LIST_PIPEDRIVE_PERSONS' },
        { path: '/pipedrive/organizations', method: 'GET',    event: 'LIST_PIPEDRIVE_ORGANIZATIONS' },
        { path: '/pipedrive/activities',    method: 'GET',    event: 'LIST_PIPEDRIVE_ACTIVITIES' },
        { path: '/uninstall',               method: 'DELETE', event: 'PIPEDRIVE_APP_UNINSTALL' },
        { path: '/pipedrive/settings',      method: 'GET',    event: 'GET_PIPEDRIVE_SETTINGS' },
        { path: '/pipedrive/settings',      method: 'PUT',    event: 'UPDATE_PIPEDRIVE_SETTINGS' },
        { path: '/admin/run-script',        method: 'POST',   event: 'RUN_PIPEDRIVE_ADMIN_SCRIPT' },
    ],
};
```

On review (see the May 24–25, 2026 thread in `#dev-feed`):
- The four `list*` routes are exploratory dead code — should be deleted
- The two `/pipedrive/settings` routes manage a single per-tenant preference (`callActivityDestination: 'deal' | 'lead' | 'all'`) — this is a `configOption`, and should ride `getConfigOptions()` + `PATCH /api/v2/integrations/:id`, not its own route
- The `/admin/run-script` route is a `userAction` — should ride the `USER_ACTION` event registry + `loadUserActions()`, not be a separate `/admin/...` path
- The `/uninstall` route is genuinely vendor-namespaced — Pipedrive notifies Frigg via this endpoint when a user uninstalls the app on their side. `vendor-webhook` surface, kept as-is.

Plus the four BaseCRMIntegration capabilities inherited from the base class (initial sync, ongoing sync, SMS logging, call logging) plus the lifecycle hooks inherited from `IntegrationBase`.

The new shape:

```js
// PROPOSED — only declares own (non-inherited) capabilities
static Definition = {
    name: 'pipedrive',
    version: '1.0.0',
    supportedVersions: ['1.0.0'],
    hasUserConfig: true,

    display: {
        label: 'Pipedrive',
        description: 'Pipeline management platform integration with Quo API',
        category: 'CRM & Sales',
    },

    modules: {
        pipedrive: { definition: pipedrive.Definition },
        quo:       { definition: { ...quo.Definition, getName: () => 'quo-pipedrive', moduleName: 'quo-pipedrive' } },
    },

    capabilities: [
        {
            name: 'pipedrive.callActivityDestination',
            primitive: 'configOption',
            description: 'Per-tenant preference for where to log call/SMS activity — to a Deal, a Lead, or all matching contact records. Returned in getConfigOptions(); updated via the default PATCH /api/v2/integrations/:id surface.',
            backedBy: null,
            implementedBy: {
                via: 'extension',
                surface: 'default',
                schema: 'getConfigOptions',                      // returns the JSON Schema fragment for this option
                modules: ['pipedrive'],
            },
        },
        {
            name: 'pipedrive.appUninstall',
            primitive: 'webhookHandler',
            description: 'Pipedrive notifies Frigg when a user uninstalls the Pipedrive app on their side. Frigg marks the integration as DISABLED in response.',
            backedBy: {
                spec: 'asyncapi',
                ref: 'pipedrive://specs/webhooks.asyncapi.yaml#/channels/app-uninstall',
            },
            implementedBy: {
                via: 'artifact',
                surface: 'vendor-webhook',
                routes: ['POST /api/pipedrive-integration/webhooks/uninstall'],
                events: ['PIPEDRIVE_APP_UNINSTALL'],
                handlers: ['onAppUninstall'],
                modules: ['pipedrive'],
            },
        },
    ],

    // Routes block remains as wiring — but is now derived/projected by the resolver,
    // not the source of truth. (See "routes after capabilities" in Open questions.)
    webhooks: { enabled: true },
};
```

**Inherited from `BaseCRMIntegration.Definition.capabilities` (resolved automatically, not redeclared here):**
- `crm.initialContactSync` — reverse-chronological mass sync, fan-out via SQS
- `crm.ongoingContactSync` — webhook-driven + poll fallback
- `crm.outboundSmsLogging` — log Quo SMS events to Pipedrive activities
- `crm.outboundCallLogging` — log Quo call events to Pipedrive activities
- `crm.processStateTracking` — Process model for long-running operations

**Inherited from `IntegrationBase.Definition.capabilities`:**
- `core.lifecycle.onCreate`, `core.lifecycle.onUpdate`, `core.lifecycle.onDelete`
- `core.configOptions` (the `getConfigOptions` / `refreshConfigOptions` machinery)
- `core.userActions` (the `loadUserActions` / `getActionOptions` / `refreshActionOptions` machinery)
- `core.webhookReceived` (the default `onWebhookReceived` queue-then-200 behavior)
- `core.testAuth`, `core.statusManagement`, `core.messageManagement`

**`resolveCapabilities(PipedriveIntegration)` returns 13 capabilities** — 5 from `BaseCRMIntegration`, 6 from `IntegrationBase`, 2 own. Eight routes in the current Definition compress to two real capabilities on PipedriveIntegration itself, plus inherited surface.

---

## Consequences

### Positive

- **Integrations describe themselves**. An agent or developer can answer "what does this integration do?" by reading `resolveCapabilities(IntegrationClass)` — no code crawl required.
- **Inheritance is explicit**. Base-class contributions are visible in the resolved view; subclass specializations are localized to `override` blocks.
- **Surface decisions are explicit**. The `surface` field forces the author to choose between default and vendor-namespaced routes consciously, with the rule articulated in the schema's documentation. The Pipedrive settings smell becomes catchable in review.
- **Drift is structurally bounded**. Capabilities point at code by name (events, handlers, modules, extensions, artifacts) but never describe code behavior. A static validator (`validateCapabilityImplementation`) can verify presence of every referenced symbol.
- **Agent eval has a target**. The capability declaration is the structured surface agent reasoning operates on; [ADR-EVALS](./ADR-EVALS.md) measures whether having it improves task accuracy.
- **Aligns with the API-module capability declaration**. Same `backedBy` / `implementedBy` vocabulary as [ADR-EXTENSIONS](./ADR-EXTENSIONS.md); the two layers compose via `implementedBy.modules`, `implementedBy.extensions`, `implementedBy.artifacts` cross-references.

### Negative

- **Migration cost on existing integrations**. Every Frigg integration in adopter repos eventually gains a `capabilities` array. The first pass (`PipedriveIntegration` as the canary) is the long pole; subsequent migrations follow the pattern. None of the existing fields (`routes`, `webhooks`, `display`, `modules`) need to change to opt in — `capabilities` is purely additive at first.
- **Authoring discipline**. Authors must learn the primitive taxonomy and the surface selection rule. Mitigated by lint feedback and by the `frigg-create-integration` skill in the dev toolkit producing the right shape from the start.
- **Schema becomes load-bearing**. Today's `packages/schemas/integration-definition.schema.json` has zero consumers (see the schema-audit findings during the design conversation). This ADR changes that — `frigg validate` should enforce the schema, capability resolution depends on it, and IDE tooling reads it.

### Neutral

- `Definition.routes` does not go away. Capabilities reference routes; the routes array remains the source of wiring truth. (See [Open question: routes after capabilities](#open-questions).)
- `Definition.modules` does not change shape. Capabilities reference module keys via `implementedBy.modules`.
- The legacy thin `capabilities` block on the API module schema (`auth`, `webhooks`, `realtime`, `sync` booleans) — see the integration-definition.schema.json audit — is deprecated and replaced by the structured array. No code consumed the old shape, so this is a documentation-only break.

---

## Alternatives considered

### Alternative 1 — Treat the integration as just another API module

Reuse the API-module capability shape from ADR-EXTENSIONS directly on the integration class, with the same `objects / actions / ui / sync / constraints` top-level keys.

**Rejected.** The API-module shape describes an API's surface (what endpoints exist, what objects they manipulate, what constraints apply). An integration's surface is different — it composes API surfaces with workflows, lifecycle behavior, configuration, and Frigg-side primitives. Forcing the integration into the API-module shape would either bloat the API-module shape with integration concerns or distort the integration's natural taxonomy.

The two shapes share `backedBy` / `implementedBy` vocabulary and compose via cross-references, which is the right relationship.

### Alternative 2 — Generate capabilities from code analysis

Treat the integration class itself as the source of truth — derive capabilities by inspecting `this.events`, the methods, the routes, the inherited base classes — rather than asking the author to declare them.

**Rejected.** Static derivation can identify shapes (this is a `USER_ACTION` event, this is a route) but not *intent* (is this a `userAction` capability, or part of a larger `workflow`? is the setting a `configOption` or a `userAction`?). The Pipedrive case is exactly the failure mode — six exploratory routes would have been derived as capabilities, drowning the two real ones.

A code analyzer can lint a Definition against its capability declarations (e.g. "this route is unreferenced by any capability — is it dead?") but cannot substitute for the author's declaration of intent.

### Alternative 3 — Per-repo ontology manifests instead of in-Definition declarations

Store capability data in a separate `ontology.yaml` per integration repo, à la the L3 layer proposed in [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md).

**Rejected.** The integration Definition is already the canonical artifact. A parallel manifest creates two sources of truth that drift independently. The L3 ontology layer is for *vendor and domain context* (what is Pipedrive as a platform, what's its API surface state, what gotchas matter) — not for "what does this integration do," which is the Definition's job.

---

## Implementation phases

This ADR is the schema and resolver. Tooling that consumes it is covered in the companion ADRs.

### Phase 1 — Schema and resolver

- Author `packages/schemas/integration-capabilities.schema.json` (JSON Schema draft 2020-12; same conventions as the API-module capability schema from ADR-EXTENSIONS Phase 5).
- Extend `packages/schemas/schemas/integration-definition.schema.json`: add the structured `capabilities` array; mark the legacy thin `capabilities` block (`auth`, `webhooks`, `realtime`, `sync`) as deprecated.
- Implement `resolveCapabilities(IntegrationClass)` in `packages/core/integrations/` — walks prototype chain, applies override blocks, returns merged capability list.
- Implement `validateCapabilityImplementation(IntegrationClass)` — static check that every `requires` method and every referenced symbol exists on the class.

### Phase 2 — `IntegrationBase` and `BaseCRMIntegration` declarations

- Add `IntegrationBase.Definition.capabilities` declaring the foundational set (lifecycle hooks, config options machinery, user actions machinery, webhook receipt, status / messages / auth-testing).
- Add `BaseCRMIntegration.Definition.capabilities` declaring the CRM-specific set (initial sync, ongoing sync, outbound logging, process state tracking).

### Phase 3 — Canary migration

- Migrate `PipedriveIntegration` in `lefthookhq/quo--frigg` to the new shape per the worked example above.
- Remove the dead exploratory routes per the May 25 thread resolution.
- Move `callActivityDestination` from a dedicated route into `getConfigOptions()`.
- Move `/admin/run-script` into the `USER_ACTION` event registry.

### Phase 4 — `frigg validate` extension

- Extend the existing CLI to validate integration-level capability declarations, verify cross-references (`implementedBy.modules` keys exist in `Definition.modules`; `implementedBy.extensions` keys exist; `implementedBy.artifacts` resolve via the API module's declared artifacts), and confirm the `requires` static check.

### Phase 5 — Rolling migration

- Migrate remaining integrations across `lefthookhq/quo--frigg`, `lefthookhq/aes--frigg`, `lefthookhq/faulkners-nursery--frigg`, `lefthookhq/frontify--frigg`, `lefthookhq/clyde--frigg`. Each integration gains a `capabilities` array; legacy fields stay until the integration's next refactor.

### Phase 6 — Companion ADRs

- [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) lands the L1–L4 model and the in-house compiler that injects ontology context into agent sessions.
- [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) lands the SessionStart hook that calls `resolveCapabilities()` + the ontology compiler and surfaces both to subagents.
- [ADR-EVALS](./ADR-EVALS.md) lands the eval rig and the canonical run that proves the design improves agent task accuracy.

---

## Open questions

1. **Routes after capabilities.** Today's `Definition.routes` array is the wiring source of truth; capabilities reference routes by path. Should `Definition.routes` eventually be *derived* from the resolved capabilities (the framework projects routes out of the capability list at boot), or stay as an explicit declaration that capabilities cross-reference? Derivation is cleaner but couples route generation to capability completeness; explicit declaration is what every Definition looks like today. Lean: keep explicit during the rollout, revisit in v1.1 once the migration is complete.

2. **`backedBy: null` for Frigg-internal patterns.** Some capabilities (`core.testAuth`, `crm.processStateTracking`) are Frigg conventions without a vendor spec. The current shape allows `backedBy: null`. Should `backedBy` instead require a `{ kind: 'custom', ref: '...' }` pointing at a Frigg-authored markdown doc? More verbose but uniform.

3. **Multi-`via`.** A `fenestraComponent` capability typically has `via: ['artifact', 'extension']` (vendor-side UI + Frigg-side bridge). Should multi-`via` capabilities split into sibling capabilities (one for the artifact, one for the extension) instead? More entries, sharper boundaries; or fewer entries, mixed concerns per entry. Lean: allow multi-`via` and keep the entry whole.

4. **Capability-set boundaries via `relatesTo`.** Some capabilities depend on others (the `pipedrive.callActivityDestination` setting governs how `crm.outboundCallLogging` routes activities). Should the schema include `relatesTo: ['capability.name']` for the dependency graph, or is the relationship implicit in the description text? Lean: implicit at v1, add `relatesTo` if cross-capability invariants become a real concern.

5. **Capability `version`.** Capability identities (`crm.initialContactSync`) are namespaced and stable, but semantics evolve. Should each capability carry a `version` (semver) so consumers can detect breaking changes (e.g. a renamed `requires` method)? Mirrors the API module's `version` field. Lean: yes, optional, defaults to the integration's `Definition.version`.

6. **Vendor extension to the primitive set.** Custom primitives via `x-` keys (JSON Schema 2020-12 convention, matching Fenestra and ADR-EXTENSIONS) are allowed. Should we publish guidelines for when to invent a custom primitive versus stretching an existing one? Lean: a short note in the schema's `description`, no separate doc.

7. **Override depth.** `override` blocks shallow-merge today. Should they deep-merge (`override.implementedBy.handlers` adds to inherited handlers rather than replacing)? Deep merge surprises authors who expect "this field, exactly"; shallow merge requires re-declaration of unchanged sibling fields. Lean: shallow with explicit semantics in the schema.

---

## References

### Related ADRs

- [ADR-EXTENSIONS](./ADR-EXTENSIONS.md) — Plugins, Extensions, and Artifacts. Establishes the three-tier plugin taxonomy, the Artifact category, and the API-module-level capability declaration that this ADR extends to the integration level.
- [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) — L1–L4 ontology model. The harness reads integration capabilities (this ADR) plus L1–L3 ontology layers and compiles both into agent context.
- [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) — SessionStart hook, capability resolver invocation, ontology compiler integration.
- [ADR-EVALS](./ADR-EVALS.md) — Eval methodology, framework eval, adopter SDK. Measures whether this ADR's declaration improves agent task accuracy.
- [ADR-006: Integration Router v2](../architecture-decisions/006-integration-router-v2.md) — The `/api/v2/...` route surface that `surface: default` capabilities ride on, including the auth lanes (Bearer-token + admin-key).
- [ADR-GLOBAL-ENTITIES](./ADR-GLOBAL-ENTITIES.md) — Entity ownership patterns (orthogonal but referenced in some capability bindings).

### Code

- `packages/core/integrations/integration-base.js` — `IntegrationBase`, the prototype chain's root. Will gain `static Definition.capabilities` per Phase 2.
- `packages/core/integrations/extension.js` — Tier 3 extension contract from [PR #590](https://github.com/friggframework/frigg/pull/590). Integration-level capabilities cross-reference extensions declared here.
- `packages/core/handlers/routers/middleware/loadUser.js`, `requireLoggedInUser.js`, `requireAdmin.js` — The auth lanes that define what each `surface` value means.
- `packages/schemas/schemas/integration-definition.schema.json` — Existing integration-definition schema. The structured `capabilities` array lands here; the legacy thin block is deprecated.

### Specifications referenced by `backedBy`

- [OpenAPI](https://spec.openapis.org/oas/latest.html) — REST endpoints (atomic operations on an API module)
- [AsyncAPI](https://www.asyncapi.com/) — events / webhooks
- [Arazzo](https://spec.openapis.org/arazzo/latest.html) — composite workflows (multi-step sync flows, lifecycle chains)
- [Fenestra](https://github.com/friggframework/api-module-library/tree/claude/fenestra-spec-draft-Q367t/specs/fenestra) — UI extension ecosystems (in-flight Frigg-authored draft)

### Conversation references

- The May 24–25, 2026 `#dev-feed` thread that surfaced the Pipedrive routes audit and the surface-selection rule (`/pipedrive/settings` as `configOption` not new route; `/uninstall` as the only genuine vendor surface).
- The May 22–25, 2026 design conversation on `claude/frigg-integration-overhaul-57VHW` that produced this ADR set.
