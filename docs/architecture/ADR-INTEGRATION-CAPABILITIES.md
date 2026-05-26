# Architecture Decision Record: Integration-Level Capability Declaration

**Status**: Proposed (revised 2026-05-25 after adversarial review — see [Revision history](#revision-history))
**Date**: 2026-05-25
**Author**: Sean Matthews

## Context

[ADR-EXTENSIONS](./ADR-EXTENSIONS.md) introduced a Capability Declaration on the API module's Definition — a structured `capabilities` block answering "what can I do with this API module?" Each capability points at a spec (OpenAPI, AsyncAPI, Arazzo, Fenestra) and binds to one of three implementation mechanisms: the API class, a Tier 3 Integration Extension, or an Artifact.

That ADR scopes capabilities to the **API module**. It does not address the layer above: **the integration class itself**. An integration is the *composer* that bundles one or more API modules, optional Tier 3 extensions, and optional Artifacts into a usable surface. From an integration developer's perspective, "what does this integration do?" cannot be answered by enumerating API module capabilities alone — the integration also adds:

- Cross-module workflows (sync flows that touch multiple APIs)
- Per-tenant configuration (settings, mapping, preferences) routed through existing Frigg defaults
- Lifecycle behavior beyond Frigg defaults
- Vendor-side reactions (webhook handlers, app-uninstall hooks)
- User-facing actions surfaced through the standard `USER_ACTION` event machinery

Today, none of this is declared. The integration's `static Definition` carries `name`, `version`, `modules`, `routes`, `webhooks`, and `display` — but the *meaning* of the integration is implicit in its code. An agent (or a new developer) cannot enumerate what an integration does without reading every method on the class and every entry the constructor wires into `this.events`.

This gap has already produced bugs. The May 24–25, 2026 `#dev-feed` thread surfaced a `PipedriveIntegration` definition declaring four routes (`/uninstall`, `GET /settings`, `PUT /settings`, `POST /admin/run-script`); on review, only `/uninstall` is a genuine route that needs to exist. The `/settings` pair manages a per-tenant preference (`callActivityDestination: 'deal' | 'lead' | 'all'`) and should ride Frigg's existing `getConfigOptions()` + `PATCH /api/integrations/:integrationId` surface — the adopter's frontend already uses that pattern for similar settings. The `/admin/run-script` route is a user-invoked action and should ride the `USER_ACTION` event registry plus the framework's existing `/api/integrations/:id/actions/...` surface. The integration's `static Definition` gave no way to express the intent of each route, so the wrong shapes accumulated without anyone catching it before the routes shipped.

This ADR proposes an **integration-level Capability Declaration** that mirrors the API module pattern from [ADR-EXTENSIONS](./ADR-EXTENSIONS.md), extended with:

- A **primitive taxonomy** describing the kinds of things integrations bundle (data syncs, workflows, user actions, lifecycle hooks, webhook handlers, fenestra UI, AI inference, API proxies, MCP tool exposure, config options, cron jobs)
- A **two-dimension exposure model** — `surface` (where the endpoint is mounted and how the path is shaped) and `auth` (which credential carrier the surface accepts) — replacing the earlier single `consumedBy` framing
- **Inheritance semantics** so capabilities declared on a base class bubble up to concrete subclasses without redeclaration, with explicit `override` for specialization
- **Pointer discipline** — every capability declares *what exists* and *where to read live*, never *what the code does*. The integration code remains the only source of truth for behavior; descriptions are constrained to *purpose*, not behavior

The downstream goal is to enable agent-driven integration work — capability discovery, change planning, refactor scoping, validation — to operate on the Definition rather than on free-text descriptions or full code reads. The ontology and harness ADRs (see [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) and [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md)) build on this declaration; the eval ADR ([ADR-EVALS](./ADR-EVALS.md)) measures whether it actually moves the needle on agent task accuracy, with explicit falsification criteria.

## Decision

Add a `capabilities` array to `IntegrationBase.Definition` (and to subclass Definitions). Each entry declares:

- **`name`** — stable identifier for the capability, dot-namespaced by scope (`crm.initialContactSync`, `pipedrive.appUninstall`)
- **`primitive`** — taxonomy slot (see [Primitive taxonomy](#primitive-taxonomy))
- **`description`** — required, single sentence. **Captures purpose, not behavior**: *why this capability exists as its own unit, what scope it claims relative to siblings*. Behavior is the property of the code; the Definition never claims facts about behavior that could drift
- **`backedBy`** — optional pointer to a formal spec (OpenAPI / AsyncAPI / Arazzo / Fenestra / custom). Same vocabulary as ADR-EXTENSIONS
- **`implementedBy`** — required binding to the code that fulfills the capability. Includes **`surface`** and **`auth`** fields, plus references to events, handlers, routes, modules, and extension binding keys
- **`prd`** — optional pointer to a longer product-rationale document for design context that doesn't fit in `description`
- **`inherits` / `override`** — optional, for child-class capabilities that specialize an inherited one

Capabilities are resolved by walking the prototype chain. `Frigg.resolveCapabilities(IntegrationClass)` returns the union of inherited and own capabilities, with `override` blocks applied. No instantiation required — the declaration is fully static *if* event registries are also moved to a static surface (see [Static check viability](#static-check-viability)).

The schema is JSON-Schema-validatable, mirroring the conventions ADR-EXTENSIONS established for the API module declaration: `$defs`, `patternProperties: '^x-'`, strict `additionalProperties: false`.

---

## Capability shape

```js
// On IntegrationBase.Definition or any subclass Definition
capabilities: [
  {
    name: 'crm.initialContactSync',
    primitive: 'dataSync',
    description: 'One-shot bulk sync run when an integration is first installed; distinct from the ongoing webhook/poll loop.',
    prd: '@friggframework/docs/prd/crm-initial-sync.md',          // optional

    backedBy: {
      spec: 'arazzo',
      ref: '@friggframework/specs/crm/initial-contact-sync.arazzo.yaml',
    },

    implementedBy: {
      via: 'extension',                                            // see "implementedBy.via" below
      surface: 'internal',                                         // where mounted / path shape
      auth: 'none',                                                // credential carrier accepted
      requires: [                                                  // methods the concrete class must implement
        'fetchPersonPage',
        'transformPersonToDestination',
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
      extensions: ['crmSyncOrchestrator'],                         // BINDING KEYS from Definition.extensions, not class names
      artifacts: [],                                               // Artifact identifiers; usually empty
    },
  },
]
```

### `implementedBy.via`

Three values, matching the implementation mechanisms from ADR-EXTENSIONS:

| Value | Meaning |
|---|---|
| `api-class` | Capability is fulfilled by direct calls to module API class methods, or by integration-class methods invoked from a route/event handler. The handler runs Frigg-side, in-process. |
| `extension` | Frigg primitive composition — a Tier 3 Integration Extension provides the orchestration; the integration supplies required hook methods (e.g. `fetchPersonPage`). |
| `artifact` | Capability depends on Artifact code that runs *outside* Frigg (HubSpot Project UI extension, Slack App manifest, Salesforce managed package). The Definition's `implementedBy.artifacts` lists the required artifacts. |

The default is **a single value**, not a multi-set. A capability that has both an Artifact (the vendor-side UI) and a Frigg-side backend handler is typically split into two sibling capabilities — one `via: 'artifact'` (declaring the Artifact dependency), one `via: 'api-class'` or `via: 'extension'` (declaring the Frigg-side handler). Multi-`via` is documented as an open question (see [Open question 4](#open-questions)) rather than the default pattern, because mixing concerns per entry weakens the discriminator the consumer relies on.

### `implementedBy.surface`

Where the capability is exposed in terms of the route mount point and path shape. **`surface` does not encode auth** — that's `auth`'s job.

| Value | Route shape | When to use |
|---|---|---|
| `default` | `/api/...` Frigg-mounted, no vendor prefix | Anything reachable by any caller that can present a recognized user credential. Default choice. |
| `vendor-webhook` | `/api/<integration-name>-integration/webhooks[/...]` — mounted via the framework's webhook router (`packages/core/handlers/routers/integration-webhook-routers.js`); only emitted when `Definition.webhooks.enabled === true` | Vendor *initiates* the call (push events Frigg receives). The vendor never present a user credential because there's no user session on their side. |
| `vendor-namespaced` | Vendor-prefixed subpath mounted via `integration-defined-routers.js` (`/api/<integration-name>-integration/<vendor-path>`) | Cases where a vendor-side caller needs a stable, vendor-specific endpoint outside the default `/api/...` shape but isn't a webhook (rare; today the only verified example is `/uninstall` on Pipedrive, which arguably belongs under `vendor-webhook` if the webhook router is extended to host it) |
| `admin` | Mounted with admin-auth (today: inline `x-frigg-admin-api-key` check; PR #590 introduces no middleware for it) | System operations not on behalf of any user. Rare for integrations to declare new ones. |
| `internal` | No HTTP — invoked in-process via the framework's event dispatcher, queue workers, or schedulers | Queue handlers, sync orchestrators, lifecycle hooks. The vast majority of inherited `BaseCRM*` and `IntegrationBase` capabilities. |
| `mcp` | Exposed via an MCP server transport (not HTTP-routed) | Capabilities that exist for agent / tool-calling consumption via the Model Context Protocol; the route concept doesn't apply. See [Open question 5](#open-questions). |

The earlier draft of this ADR included `vendor-frontend` as a separate `surface` value. The adversarial review rejected it: real vendor SDKs (HubSpot UI Extensions via `hubspot.fetch`, Salesforce Lightning via fetch with named credentials, Slack Block Kit modals) routinely carry tokens, so "the vendor's UI can't carry a Bearer token" is narrower than the framing implied. Capabilities that *do* fit that narrow case are expressed by combining `surface: vendor-namespaced` (or `surface: default` when the path is fine) with `auth: vendor-jwt` — the credential carrier is the load-bearing distinction, not the location.

### `implementedBy.auth`

The credential carrier the surface accepts. Frigg's current authenticator (`packages/core/user/user/use-cases/authenticate-user.js:49-99`) supports four user-context credential carriers plus admin and vendor variants:

| Value | What the caller presents | Where it lives in code |
|---|---|---|
| `bearer` | Frigg-native Bearer token from `Authorization: Bearer <token>` | `authenticate-user.js:87-96` |
| `adopter-jwt` | Adopter's own JWT, presented as `Authorization: Bearer <jwt>` and distinguished by 3-dot format | `authenticate-user.js:70-84` |
| `shared-secret` | `x-frigg-api-key` + `x-frigg-appuserid`/`x-frigg-apporgid` header pair — server-to-server | `authenticate-user.js:56-67` |
| `admin-key` | `x-frigg-admin-api-key` matching `ADMIN_API_KEY` env var | `packages/core/handlers/routers/db-migration.js:64-70` |
| `vendor-signature` | HMAC or similar signature in vendor-specific header; validation handled inside the integration's handler, not by framework middleware | Per-integration (e.g. inside the `WEBHOOK_RECEIVED` handler) |
| `vendor-jwt` | Vendor-issued JWT for vendor-side callers (e.g. a vendor's UI panel calling Frigg) | Not currently implemented in framework; integration-handler responsibility today |
| `none` | No HTTP at all (in-process); or, for `surface: vendor-webhook`, no auth at the framework layer because validation happens in the integration handler | N/A |

`surface` and `auth` are partially independent. The cross-product isn't fully populated — some pairings make no sense (`surface: internal` always has `auth: none`; `surface: admin` requires `auth: admin-key`) — but the schema allows declaring both, and the framework validates the pairing at boot.

A capability that's reachable via *multiple* credential carriers (the common case for `surface: default` — Bearer, adopter JWT, and shared-secret all hit the same `/api/integrations/...` endpoints) lists them: `auth: ['bearer', 'adopter-jwt', 'shared-secret']`. The framework's authenticator already accepts all three on the same route; the capability declaration just makes this explicit.

### Pointer discipline

`backedBy.ref` and the `requires`, `events`, `handlers`, `routes`, `modules`, `extensions` (by binding key), `artifacts` fields under `implementedBy` are **pointers**. They tell an agent *what exists and where to read it*. They never describe *what the code does*. Behavior remains the property of the code itself; the Definition guarantees presence and location, not correctness.

This is the discipline that prevents drift. A capability declaration cannot become stale relative to its implementation, because it never claims any fact about the implementation beyond "this method exists" and "this event is wired here." Both are statically checkable (subject to [Static check viability](#static-check-viability) below). The `description` and `prd` fields are constrained to *intent* — why this capability exists, what scope it claims — not behavior. Authors who write behavior-shaped descriptions are violating the discipline, and code review should catch it.

---

## Surface selection rule

For new capabilities, prefer existing Frigg default-surface primitives before declaring new routes:

| Need | Default-surface primitive | Endpoint today |
|---|---|---|
| Per-tenant configuration (settings, preferences, mapping) | `getConfigOptions()` returns a JSON Schema; the adopter UI calls `PATCH /api/integrations/:integrationId` to update | `GET /api/integrations/:integrationId/config/options` (`integration-router.js:327`); `POST /api/integrations/:integrationId/config/options/refresh` (`:340`); `PATCH /api/integrations/:integrationId` (`:300`) |
| User-invoked action | A `USER_ACTION`-typed entry in the integration's events; `loadUserActions()` enumerates, framework exposes invocation | `GET /api/integrations/:id/actions` (`integration-router.js:357`); `GET /api/integrations/:id/actions/:actionId/options`; `POST /api/integrations/:id/actions/:actionId` |
| Integration CRUD | The existing integration router | `GET /api/integrations`, `POST /api/integrations`, `PATCH /api/integrations/:id`, `DELETE /api/integrations/:id` |
| Credential / entity reauthorization | The existing entity / credential routers | `GET /api/entities/...`, `POST /api/entities/...` |
| API proxy (MCP / tool-calling) | The proxy endpoint introduced in [ADR-006](../architecture-decisions/006-integration-router-v2.md) (status: proposed; not yet implemented in current code) | `POST /api/entities/:id/proxy` (per ADR-006 design; verify implementation before relying on) |

A new `default`-surface route is declared only when no existing primitive fits.

[ADR-006](../architecture-decisions/006-integration-router-v2.md) describes a `/api/v2/...` restructure of the above; it is currently marked Accepted but the implementation in the repo as of this writing still uses v1 paths. This ADR's references use v1 paths to match the actual current code surface; the rule transfers cleanly to v2 paths once that lands.

Vendor-namespaced surfaces (`vendor-webhook`, `vendor-namespaced`) are reserved for:
- **`vendor-webhook`** — the external system pushes events Frigg didn't initiate, and signature validation (not user credentials) gates entry. Mounted by the framework's webhook router under `/api/<integration-name>-integration/webhooks[/...]` when `Definition.webhooks.enabled === true`
- **`vendor-namespaced`** — vendor-side caller needs a stable endpoint outside the default `/api/...` shape, *not* a webhook (the Pipedrive `/uninstall` route is the closest current example, and even that should probably move under the webhook router)

The smell to watch for: a capability declared `vendor-namespaced` (or with a vendor-prefixed path under an otherwise-default mount) where the consumer *could* have used a `default` surface if the route shape had been chosen differently. The Pipedrive `/settings` smell from the May 25 thread is exactly this — the consumer is an adopter frontend (which carries a Bearer token), and the existing `getConfigOptions()` machinery already handles the use case.

---

## Primitive taxonomy

The `primitive` field classifies what *kind* of thing the capability is. Initial set:

| Primitive | What it is | Typical `via` | Typical `surface` |
|---|---|---|---|
| `lifecycleHook` | Reaction to a framework lifecycle event (`ON_CREATE`, `ON_UPDATE`, `ON_DELETE`, etc.) | `extension` (when inherited) or `api-class` (when overridden) | `internal` |
| `dataSync` | Ongoing or one-shot data flow between systems, in any direction(s), with any cadence | `extension` (composes a sync orchestrator) | `internal` (orchestrator) — webhook ingress is a separate sibling capability typed `webhookHandler` |
| `workflow` | Multi-step chained operation with gates / pauses / state transitions | `extension` or `api-class` | `default` (when user-triggered) or `internal` (when event-triggered) |
| `userAction` | Synchronous user-triggered action surfaced through the `USER_ACTION` event machinery + `loadUserActions()` | `extension` or `api-class` | `default` |
| `configOption` | Per-tenant configuration field exposed via `getConfigOptions()` + `PATCH /api/integrations/:id` | `api-class` (the `getConfigOptions` override) | `default` |
| `cron` | Scheduled job (EventBridge schedule or equivalent) | `extension` | `internal` |
| `webhookHandler` | Inbound vendor webhook receiver | `extension` (validation + dispatch) + `api-class` (the actual handler method, as a sibling capability if Frigg-side logic is substantial) | `vendor-webhook` |
| `fenestraComponent` | In-app UI component (panel, sidebar, iframe) backed by a [Fenestra](https://github.com/friggframework/api-module-library/tree/claude/fenestra-spec-draft-Q367t/specs/fenestra) spec | `artifact` (the vendor-side UI) — and a sibling `webhookHandler` or `api-class` capability for the Frigg-side bridge | `default` or `vendor-namespaced` depending on how the vendor's UI is wired |
| `aiInference` | LLM-mediated reasoning step embedded in integration flow | `extension` or `api-class` | `internal` (when invoked from a workflow) or `default` (when user-triggered) |
| `apiProxy` | Pass-through to an external API for tool-calling / MCP / agent use | `api-class` | `default` (via the proxy endpoint, once landed per ADR-006) |
| `mcpTool` | Capability exposed as an MCP tool for agent consumption via the Model Context Protocol | `extension` (MCP server bridge) | `mcp` |

The set is **enumerated but extensible**. Vendor-specific primitives are added via `x-` keys per JSON Schema 2020-12 conventions, matching the Fenestra and ADR-EXTENSIONS pattern.

---

## Inheritance and resolution

Capabilities declared on a base class apply to every subclass without redeclaration. `IntegrationBase.Definition.capabilities` declares the foundational set (the lifecycle hooks the constructor wires up); adopter base classes (e.g. a `BaseCRMIntegration` for a CRM-aggregator project, or a `BaseOutboundIntegration` for a one-way push project) declare their domain capabilities in their own repos; concrete integration classes only declare what's *new or overridden*.

Resolution walks the prototype chain. A helper exposed on the framework returns the merged view:

```js
const { resolveCapabilities } = require('@friggframework/core');

const capabilities = resolveCapabilities(PipedriveIntegration);
// Returns: [ ...IntegrationBase capabilities,
//            ...BaseCRMIntegration capabilities (declared in an adopter project),
//            ...PipedriveIntegration own capabilities (with override blocks applied) ]
```

### Resolution order and conflicts

Resolution walks the JS prototype chain from `IntegrationBase` upward through every class in the chain. Within a single class's `capabilities` array, declarations are processed in order. Across classes, **last-applied (closest to the concrete class) wins** for any name collision — matching JS's natural property-shadowing semantics.

If two siblings in a real-world inheritance situation (rare in Frigg today, but possible with mixins) declare the same capability `name` without an explicit `inherits`/`override` block, the resolver **throws at boot** with both source classes named. This matches the fail-loud convention PR #590 established for extension-route conflicts.

### Override semantics

A subclass can specialize an inherited capability without redeclaring its full shape:

```js
// PipedriveIntegration.Definition.capabilities
{
  inherits: 'crm.initialContactSync',
  override: {
    description: 'Pipedrive variant of crm.initialContactSync — same scope, cursor pagination instead of offset.',
    // any other fields here override the inherited value; unspecified fields inherit unchanged
  },
}
```

The `override` block is **shallow-merged** with the inherited capability — fields named in `override` replace the inherited value; fields not named are inherited unchanged. Arrays do not concatenate; an `override.implementedBy.handlers: ['newHandler']` replaces the inherited handler list entirely. This matches the principle "declare exactly what you mean to change."

For the case where a subclass wants to **add** to an inherited array (e.g. append a handler), the schema supports a sibling `extend` shape:

```js
{
  inherits: 'crm.initialContactSync',
  extend: {
    'implementedBy.handlers': ['pipedriveSpecificFinalizer'],   // append, don't replace
  },
}
```

`override` and `extend` may both be present in the same entry. `override` runs first (replacing whole fields), then `extend` (appending to arrays). See [Open question 7](#open-questions).

### Removal

A subclass that wants to **disinherit** a base-class capability (rare, but real when an adopter's domain genuinely doesn't apply — e.g. a CRM that has no SMS surface) declares:

```js
{
  inherits: 'crm.outboundSmsLogging',
  disinherit: true,
}
```

The resolver drops the inherited capability from the result.

### Required methods (`implementedBy.requires`)

When a capability is implemented by a Tier 3 extension that requires specific methods on the concrete class (e.g. `fetchPersonPage` on a `BaseCRMIntegration` subclass), the inherited capability lists those in `requires`. A static check — `Frigg.validateCapabilityImplementation(IntegrationClass)` — verifies that every required method is defined on the concrete class. See [Static check viability](#static-check-viability) for what "static" means here.

The check answers: *"Does PipedriveIntegration fully implement the capabilities its base class promises?"*

### Adopter override of framework-declared capabilities

Adopter-owned base classes (`BaseCRMIntegration`, `BaseOutboundIntegration`) and concrete integrations can override `IntegrationBase`-declared capabilities the same way subclasses override their immediate parent — via `inherits` + `override`. There is no special "framework-declared capabilities are locked" semantic in v1; if an adopter genuinely disagrees with how Frigg framed a capability, they can override it. The taxonomy in `primitive` is **not** overridable by `override` — changing the primitive of an inherited capability requires re-declaring it under a new name (see [Open question 7](#open-questions)).

---

## Static check viability

The ADR claims `validateCapabilityImplementation(IntegrationClass)` is statically checkable — no instantiation required. This is true for `requires`, `handlers`, `modules`, `routes` (which live on `static Definition.routes`), and `artifacts` (which live on the API module's `static Definition.artifacts`).

It is **not** true for `events` today, because `this.events` is wired inside `IntegrationBase`'s constructor (and subclasses' constructors via `this.events = { ...this.events, NEW_EVENT: ... }`). There is no static surface listing the events an integration declares.

This ADR proposes a paired convention: integration classes that participate in capability declarations also declare:

```js
class PipedriveIntegration extends BaseCRMIntegration {
    static EventDefinitions = {
        PIPEDRIVE_APP_UNINSTALL: {
            type: 'USER_ACTION',          // or 'LIFE_CYCLE_EVENT', etc.
            handler: 'onAppUninstall',    // method name, not bound function — same convention as PR #590
        },
        // ...
    };

    constructor(params) {
        super(params);
        this.events = {
            ...this.events,
            ...this.constructor.copyEventsFromStatic(),   // helper from IntegrationBase
        };
    }
}
```

The helper copies the static event registry into `this.events`, binding handler-name strings to live methods. Adopters keep authoring events the same way; the static surface is just an additional artifact that linting and capability resolution can read.

This is a non-trivial framework convention change. It's flagged as [Open question 1](#open-questions) — sign-off required. Without it, `validateCapabilityImplementation` falls back to dynamic verification (instantiate the class, inspect `this.events`), which the ADR explicitly claimed to avoid.

If `static EventDefinitions` is rejected, the fallback is: the lint requires class instantiation but uses a dry-instance pattern (no params, no async init) similar to the one PR #590 introduced for queue workers (`createQueueWorker`'s dry-instance branch). It's no longer "purely static" but it remains "no I/O, no DB, no network."

---

## Relationship to ADR-EXTENSIONS

This ADR sits one level above [ADR-EXTENSIONS](./ADR-EXTENSIONS.md). Their capabilities work together:

| Layer | ADR | Capabilities answer |
|---|---|---|
| API module | [ADR-EXTENSIONS](./ADR-EXTENSIONS.md) | What can I do with **this API module**? (objects, actions, ui, sync, constraints) |
| Integration | **This ADR** | What does **this integration** assemble from API-module capabilities + Tier 3 extensions + Artifacts? |

An integration-level capability composes one or more of:

- API-module capabilities (declared on each module's `Definition.capabilities` per ADR-EXTENSIONS) — pointed at via `implementedBy.modules: [...]` (module reference keys from `Definition.modules`)
- Tier 3 Integration Extensions (declared on `Definition.extensions` as an object keyed by local binding name per ADR-EXTENSIONS) — pointed at via `implementedBy.extensions: [...]` (binding keys, not class names or extension `name` fields)
- Artifacts (declared on the API module's `Definition.artifacts` per ADR-EXTENSIONS) — pointed at via `implementedBy.artifacts: [...]`

The integration's `implementedBy` fields are *cross-references* into the module-level and extension-level declarations. `Frigg.resolveCapability(IntegrationClass, capabilityName)` follows those cross-references, dereferences each binding key to its extension's `name`, and returns the integration-level capability with the referenced module capabilities, extensions, and artifacts available for inlining.

This composition is what lets an agent answer "what does this integration do?" without crawling the code. It walks the integration's `capabilities`, resolves each `implementedBy` cross-reference, and emits a structured tree: integration → capabilities → (module capabilities + extension bindings + artifact references) → specs.

---

## Worked example: PipedriveIntegration

A real `PipedriveIntegration.Definition` from an adopter project (`backend/src/integrations/PipedriveIntegration.js`) declares four routes:

```js
// CURRENT
static Definition = {
    name: 'pipedrive',
    version: '1.0.0',
    // ...
    routes: [
        { path: '/uninstall',           method: 'DELETE', event: 'PIPEDRIVE_APP_UNINSTALL' },
        { path: '/pipedrive/settings',  method: 'GET',    event: 'GET_PIPEDRIVE_SETTINGS' },
        { path: '/pipedrive/settings',  method: 'PUT',    event: 'UPDATE_PIPEDRIVE_SETTINGS' },
        { path: '/admin/run-script',    method: 'POST',   event: 'RUN_PIPEDRIVE_ADMIN_SCRIPT' },
    ],
};
```

Per the May 24–25 thread in `#dev-feed`:
- The two `/pipedrive/settings` routes manage a single per-tenant preference (`callActivityDestination`). This is a **configOption** that should ride `getConfigOptions()` + `PATCH /api/integrations/:integrationId`. The routes should not exist.
- The `/admin/run-script` route is a **userAction**. It should ride the `USER_ACTION` event registry + the framework's existing `/api/integrations/:id/actions/...` surface. The route should not exist. (Note: the event also needs its `type` changed to `USER_ACTION` for `loadUserActions()` to enumerate it.)
- The `/uninstall` route is the **only own-surface route that survives the cleanup**. Pipedrive notifies Frigg when a user uninstalls the app on their side; signature validation handled inside the handler.

The new shape:

```js
static Definition = {
    name: 'pipedrive',
    version: '1.0.0',
    supportedVersions: ['1.0.0'],
    hasUserConfig: true,

    display: {
        label: 'Pipedrive',
        description: 'Pipeline management platform integration with destination system',
        category: 'CRM & Sales',
    },

    modules: {
        pipedrive: { definition: pipedrive.Definition },
        destination: { definition: { ...destination.Definition, getName: () => 'destination-pipedrive', moduleName: 'destination-pipedrive' } },
    },

    // Only the uninstall route survives. The other three are folded into
    // default-surface primitives below.
    routes: [
        { path: '/uninstall', method: 'DELETE', event: 'PIPEDRIVE_APP_UNINSTALL' },
    ],

    webhooks: { enabled: true },

    // Three own capabilities — only one of which has its own route.
    capabilities: [
        {
            name: 'pipedrive.callActivityDestination',
            primitive: 'configOption',
            description: 'Per-tenant preference for where to log call/SMS activity to Pipedrive.',
            backedBy: null,
            implementedBy: {
                via: 'api-class',
                surface: 'default',
                auth: ['bearer', 'adopter-jwt', 'shared-secret'],
                // No routes — rides the default getConfigOptions() / PATCH /api/integrations/:id surface.
                modules: ['pipedrive'],
                // The schema fragment for this option is returned by the integration's getConfigOptions().
            },
        },
        {
            name: 'pipedrive.adminScript',
            primitive: 'userAction',
            description: 'Privileged operations runner — exposed only to authenticated callers via the standard user-actions registry.',
            backedBy: null,
            implementedBy: {
                via: 'api-class',
                surface: 'default',
                auth: ['bearer', 'adopter-jwt', 'shared-secret'],
                // No routes — rides the default /api/integrations/:id/actions/:actionId surface.
                events: ['RUN_PIPEDRIVE_ADMIN_SCRIPT'],
                handlers: ['runAdminScriptHandler'],
                // The event MUST be typed USER_ACTION in static EventDefinitions for loadUserActions() to pick it up.
            },
        },
        {
            name: 'pipedrive.appUninstall',
            primitive: 'webhookHandler',
            description: 'Vendor-initiated notification that the user uninstalled Pipedrive on their side.',
            backedBy: {
                spec: 'asyncapi',
                ref: 'pipedrive://specs/webhooks.asyncapi.yaml#/channels/app-uninstall',
            },
            implementedBy: {
                via: 'api-class',
                surface: 'vendor-webhook',
                auth: 'vendor-signature',
                routes: ['DELETE /api/pipedrive-integration/uninstall'],
                events: ['PIPEDRIVE_APP_UNINSTALL'],
                handlers: ['onAppUninstall'],
                modules: ['pipedrive'],
            },
        },
    ],
};
```

**Inherited from `BaseCRMIntegration.Definition.capabilities`** (declared in the adopter project's base class, not this file, and resolved automatically):
- `crm.initialContactSync` — `surface: internal`, `auth: none`
- `crm.ongoingContactSync` — `surface: internal` + a sibling `webhookHandler` capability for the inbound path
- `crm.outboundSmsLogging`, `crm.outboundCallLogging` — `surface: internal`, invoked from destination-system activity events
- `crm.processStateTracking` — `surface: internal`

**Inherited from `IntegrationBase.Definition.capabilities`** (declared in the framework):
- `core.lifecycle.onCreate`, `core.lifecycle.onUpdate`, `core.lifecycle.onDelete` — `surface: internal`
- `core.configOptions` (the `getConfigOptions` / `refreshConfigOptions` machinery) — `surface: default`
- `core.userActions` (the `loadUserActions` / `getActionOptions` / `refreshActionOptions` machinery) — `surface: default`
- `core.webhookReceived` (the default `onWebhookReceived` queue-then-200 behavior) — `surface: vendor-webhook`
- `core.testAuth`, `core.statusManagement`, `core.messageManagement` — `surface: internal`

`resolveCapabilities(PipedriveIntegration)` returns **14 capabilities** — 5 from `BaseCRMIntegration` (adopter-side), 6 from `IntegrationBase` (framework-side), 3 own. **Four routes in the current Definition compress to one route** on PipedriveIntegration after the migration, with the other two own-capabilities reusing default surfaces the framework already provides.

---

## Consequences

### Positive

- **Integrations describe themselves**. An agent or developer can answer "what does this integration do?" by reading `resolveCapabilities(IntegrationClass)` — no code crawl required.
- **The surface-vs-auth split makes the smell catchable**. The Pipedrive `/settings` shape would have been blocked in code review: a `configOption` capability declared with a new route, when `surface: default` is supposed to ride the existing `getConfigOptions()` machinery, would have flagged immediately.
- **Inheritance is explicit**. Base-class contributions are visible in the resolved view; subclass specializations are localized to `override` / `extend` / `disinherit` blocks.
- **Drift is structurally bounded** for pointers. The `description` field discipline (purpose, not behavior) is the soft spot; code review enforces it, and CI lint can flag descriptions containing behavior-shaped language.
- **Agent eval has a target**. The capability declaration is the structured surface agent reasoning operates on; [ADR-EVALS](./ADR-EVALS.md) measures whether having it improves task accuracy with explicit falsification criteria.
- **Aligns with the API-module capability declaration**. Same `backedBy` / `implementedBy` vocabulary as [ADR-EXTENSIONS](./ADR-EXTENSIONS.md); the two layers compose via `implementedBy.modules`, `implementedBy.extensions` (binding keys), `implementedBy.artifacts` cross-references.

### Negative

- **Migration is multi-repo, multi-PR**. Phase 2 (framework `IntegrationBase`) lands in `friggframework/frigg`. Phase 2.5 (adopter base classes) lands in adopter repos, owned by adopter teams on adopter release cadences. Concrete integration migrations (Phase 5) cannot start until both Phase 2 and Phase 2.5 of the relevant base have landed.
- **Version-skew risk**. If an adopter picks up a schema bump (transitive via devtools) without the matching `@friggframework/core` resolver, a Definition with a `capabilities` array could hit a missing-resolver path. Mitigation: `resolveCapabilities` is feature-detected (soft no-op when not present); `validateCapabilityImplementation` is opt-in via CLI, **not** wired into `initialize()`.
- **Authoring discipline**. Authors must learn the primitive taxonomy, the `surface` / `auth` split, and the description-is-purpose rule. Mitigated by lint feedback and by the `frigg-create-integration` skill producing the right shape from the start.
- **Schema becomes load-bearing**. Today's `packages/schemas/integration-definition.schema.json` has zero consumers (per the schema audit during this design conversation). This ADR changes that — `frigg validate` enforces the schema, capability resolution depends on it, CI on at least one adopter repo runs the lint before Phase 5 can begin.
- **PR #590 dependency**. Phase 2 of this ADR depends on the extension-binding shape from PR #590 being merged and stable for at least one prerelease cycle. If #590 changes its binding shape, this ADR's `implementedBy.extensions` references would be invalidated.
- **`static EventDefinitions` is a framework convention change**. Requires sign-off; without it, the lint is no-instantiation-but-dry-instance, not purely static.

### Neutral

- `Definition.routes` does not go away. Capabilities reference routes; the routes array remains the source of wiring truth. (See [Open question 4](#open-questions).)
- `Definition.modules` does not change shape. Capabilities reference module reference keys via `implementedBy.modules`.
- The legacy thin `capabilities` block on the integration-definition schema (`auth`, `webhooks`, `realtime`, `sync` booleans) — see the integration-definition.schema.json audit — is deprecated and replaced by the structured array. No code consumed the old shape, so this is a documentation-only break.

---

## Alternatives considered

### Alternative 1 — Treat the integration as just another API module

Reuse the API-module capability shape from ADR-EXTENSIONS directly on the integration class, with the same `objects / actions / ui / sync / constraints` top-level keys.

**Rejected.** The API-module shape describes an API's surface (what endpoints exist, what objects they manipulate, what constraints apply). An integration's surface is different — it composes API surfaces with workflows, lifecycle behavior, configuration, and Frigg-side primitives. Forcing the integration into the API-module shape would either bloat the API-module shape with integration concerns or distort the integration's natural taxonomy.

The two shapes share `backedBy` / `implementedBy` vocabulary and compose via cross-references, which is the right relationship.

### Alternative 2 — Generate capabilities from code analysis

Treat the integration class itself as the source of truth — derive capabilities by inspecting `this.events`, the methods, the routes, the inherited base classes — rather than asking the author to declare them.

**Rejected.** Static derivation can identify shapes (this is a `USER_ACTION` event, this is a route) but not *intent* (is this a `userAction` capability, or part of a larger `workflow`? is the setting a `configOption` or a `userAction`?). The Pipedrive case is exactly the failure mode — the four current routes would have been derived as four capabilities, when really only one is a genuine own-capability and the other three should have been folded into default-surface primitives.

A code analyzer can lint a Definition against its capability declarations (e.g. "this route is unreferenced by any capability — is it dead?") but cannot substitute for the author's declaration of intent.

### Alternative 3 — Per-repo ontology manifests instead of in-Definition declarations

Store capability data in a separate `ontology.yaml` per integration repo, à la the L3 layer proposed in [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md).

**Rejected.** The integration Definition is already the canonical artifact. A parallel manifest creates two sources of truth that drift independently. The L3 ontology layer is for *vendor and domain context* (what is Pipedrive as a platform, what's its API surface state, what gotchas matter) — not for "what does this integration do," which is the Definition's job.

### Alternative 4 — Single `consumedBy` field instead of `surface` + `auth`

The earlier draft of this ADR collapsed surface and auth into a single `consumedBy` enum (`user | admin | vendor-webhook | vendor-frontend | internal`).

**Rejected.** The May 25 design conversation surfaced that surface (route shape) and auth (credential carrier) are partially independent. A single `default`-surface route can accept any of Bearer, adopter-JWT, or shared-secret credentials. The "vendor-frontend" framing also collapsed under scrutiny — most vendor SDKs carry tokens, so "the vendor's UI can't authenticate" is narrower than the framing implied. Splitting into two dimensions surfaces the right discriminator (credential carrier) explicitly.

---

## Implementation phases

This ADR is the schema and resolver. Tooling that consumes it is covered in the companion ADRs.

### Phase 1 — Schema and resolver (framework, friggframework/frigg)

- Author `packages/schemas/integration-capabilities.schema.json` (JSON Schema draft 2020-12; same conventions as the API-module capability schema from ADR-EXTENSIONS Phase 5).
- Extend `packages/schemas/schemas/integration-definition.schema.json`: add the structured `capabilities` array; mark the legacy thin `capabilities` block (`auth`, `webhooks`, `realtime`, `sync`) as deprecated.
- Implement `resolveCapabilities(IntegrationClass)` in `packages/core/integrations/` — walks prototype chain, applies override / extend / disinherit blocks, returns merged capability list. Feature-detected (callers tolerate its absence on older `@friggframework/core` versions).
- Implement `validateCapabilityImplementation(IntegrationClass)` as a CLI / lint entry point — explicitly *not* wired into `initialize()` so a Definition with `capabilities` declared against an older resolver doesn't throw at boot.

### Phase 2 — IntegrationBase declaration (framework, friggframework/frigg)

- Add `IntegrationBase.Definition.capabilities` declaring the foundational set (lifecycle hooks, config options machinery, user actions machinery, webhook receipt, status / messages / auth-testing).
- Resolve the [`static EventDefinitions` open question](#open-questions). If approved, introduce the convention on `IntegrationBase` (it can copy its own defaultEvents from a static surface, demonstrating the pattern). If rejected, ship `validateCapabilityImplementation` with the dry-instance fallback.

**Gate**: PR #590 merged and stable for ≥1 prerelease cycle before this phase ships.

### Phase 2.5 — Adopter base classes (adopter repos, not friggframework/frigg)

This phase is owned by adopter teams in their own repos:
- The adopter's `backend/src/base/BaseCRMIntegration.js` (or domain-equivalent base class) gains `static Definition.capabilities` for the relevant domain set (e.g. for a CRM-aggregator: initial sync, ongoing sync, outbound logging, process state tracking).
- One-way push adopters gain their own `BaseOutboundIntegration.Definition.capabilities` equivalent.
- Other adopter base classes follow the same pattern.

These are not framework deliverables. The framework provides the schema, resolver, and lint; adopter teams declare their own domain capabilities using them.

### Phase 3 — Canary migration (Pipedrive)

- Migrate a real `PipedriveIntegration` in a canary adopter project to the new shape per the worked example above.
- Move `callActivityDestination` from a dedicated route into `getConfigOptions()`.
- Move `/admin/run-script` into the `USER_ACTION` event registry (event type change + capability declaration).
- Delete the routes that no longer have backing capabilities.

**Gate**: Phase 2 (framework) and Phase 2.5 (the canary adopter's base classes) both landed.

### Phase 4 — `frigg validate` extension + CI enforcement

- Extend the existing CLI to validate integration-level capability declarations, verify cross-references (`implementedBy.modules` keys exist in `Definition.modules`; `implementedBy.extensions` keys exist in `Definition.extensions`; `implementedBy.artifacts` resolve via the API module's declared artifacts), and confirm the `requires` static check.
- CI on the canary adopter repo runs `frigg validate` on PR. Other adopter repos opt in.

**Gate**: Phase 5 cannot start until this is running on at least one adopter repo.

### Phase 5 — Rolling migration

- Migrate remaining integrations across participating adopter projects. Each integration gains a `capabilities` array; legacy fields stay until the integration's next refactor.

**Gate**: Eval falsification criteria from [ADR-EVALS](./ADR-EVALS.md) not yet failed. If the capability-only condition shows <8pp lift at Sonnet OR Haiku scores <70% on all-three-enabled, Phase 5 is paused and the design is revisited.

### Phase 6 — Companion ADRs

- [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) lands the L1–L4 model and the in-house compiler that injects ontology context into agent sessions.
- [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) lands the SessionStart hook that calls `resolveCapabilities()` + the ontology compiler and surfaces both to subagents.
- [ADR-EVALS](./ADR-EVALS.md) lands the Node-based eval rig (promptfoo + custom provider + fixture integrations), the eight-condition matrix, the falsification criteria gating Phase 5, and the canonical run that proves the design improves agent task accuracy.

---

## Open questions

1. **`static EventDefinitions` convention.** Should `IntegrationBase` and integration authors declare events on a static surface that constructors copy into `this.events`? Makes the lint truly static. Costs: a framework convention change, mild migration cost on existing integrations. **Decision needed before Phase 2 ships.**

2. **`backedBy: null` vs absent.** Some capabilities (`core.testAuth`, `crm.processStateTracking`) are Frigg conventions without a vendor spec. Should `backedBy` be required as `{ kind: 'custom', ref: '...' }` pointing at a Frigg-authored markdown doc, or accept `null` / absent? Lean: require pointer (uniform), accept `kind: 'custom'` with markdown ref.

3. **Routes after capabilities.** Today's `Definition.routes` array is wiring source of truth; capabilities reference routes by path string. Should `Definition.routes` eventually be *derived* from the resolved capabilities (the framework projects routes out of the capability list at boot), or stay as an explicit declaration that capabilities cross-reference? Derivation is cleaner but couples route generation to capability completeness. Lean: keep explicit during the rollout; revisit in v1.1 once migration is complete and a `frigg lint` rule can catch dead routes / unreferenced capabilities.

4. **Multi-`via`.** Capabilities like `fenestraComponent` arguably need both an Artifact (the vendor UI) and a Frigg-side backend. Current ADR position: split into sibling capabilities. Should the schema allow `via: ['artifact', 'extension']` on a single capability instead? Lean: keep single-`via` in v1; revisit if the split proves awkward in practice.

5. **MCP transport.** The `mcp` surface bypasses HTTP entirely. The schema should describe how MCP tool registration relates to the capability's `implementedBy` — does an `mcp` surface have `routes`? Probably not — it has `mcpTools: [...]` listing the registered tool names. Resolve before any `mcpTool`-primitive capability ships.

6. **Description discipline as a CI lint.** "Purpose, not behavior" is a code-review convention. Should `frigg validate` lint the description field for behavior-shaped language (verbs like *performs, syncs, fetches, computes*) and warn? Reasonable v1 addition; doesn't have to ship before Phase 5.

7. **Override depth and primitive immutability.** `override` is shallow-merge today; `extend` appends to arrays. Should an `override` block be allowed to change `primitive`? Currently disallowed — changing primitive requires re-declaring under a new name. Confirm before Phase 5 to lock the semantic.

8. **Capability `version`.** Capability identities (`crm.initialContactSync`) are namespaced and stable, but semantics evolve. Optional `version` field (semver) per capability, defaulting to the integration's `Definition.version`. Lean: add in v1, optional.

9. **Adopter override of framework-declared capabilities.** Open by default in v1 (adopter can `inherits` + `override` any framework capability). Should some framework capabilities be marked `locked: true` so adopters can't override them (e.g. core authentication-test capability)? Defer to a follow-up ADR if a concrete case surfaces.

10. **`vendor-namespaced` consolidation.** Today distinct from `vendor-webhook`. Pipedrive's `/uninstall` is the only verified example, and it could arguably move under `vendor-webhook` if the framework webhook router is extended to host non-`/webhooks/*` paths. Consolidate before Phase 5 if no second example surfaces.

---

## Revision history

**2026-05-25 (original draft)** — initial proposal with `consumedBy` single-dimension framing, eight-route Pipedrive worked example, `vendor-frontend` as a separate surface value.

**2026-05-25 (revised — this version)** — after four adversarial reviews (architectural coherence, Frigg API alignment, agent-eval value, migration & drift), revised to:
- Replace single `consumedBy` with `surface` + `auth` (credential carrier as the load-bearing discriminator).
- Drop `vendor-frontend` from the `surface` enum; introduce `vendor-namespaced` as the residual category, and call out in [Open question 10](#open-questions) that it may consolidate with `vendor-webhook`.
- Fix all `/api/v2/...` references to the actual v1 paths in current code; flag ADR-006 as aspirational.
- Replace references to `loadUser` / `requireLoggedInUser` / `requireAdmin` middleware (which live on a different branch) with the actual inline `authenticateUser.execute()` pattern from `packages/core/user/use-cases/authenticate-user.js`.
- Rebuild the Pipedrive worked example from the actual current four-route state. Only `/uninstall` survives as a route; `/settings` (×2) and `/admin/run-script` fold into default-surface primitives.
- Split Phase 2 into Phase 2 (framework-only) and Phase 2.5 (adopter base classes in adopter repos).
- Add the `static EventDefinitions` convention proposal to address the static-check viability gap.
- Pin `implementedBy.extensions` cross-references to binding keys (the only locally-unique identifier in `Definition.extensions`), not class names.
- Constrain `description` to purpose-not-behavior; rewrite every example description accordingly.
- Add `extend` and `disinherit` to inheritance semantics.
- Gate Phase 2 on PR #590 merged and stable; gate Phase 5 on eval falsification criteria not yet failed.
- Add Open Questions 5, 6, 9, 10.

---

## References

### Related ADRs

- [ADR-EXTENSIONS](./ADR-EXTENSIONS.md) — Plugins, Extensions, and Artifacts. Establishes the three-tier plugin taxonomy, the Artifact category, and the API-module-level capability declaration that this ADR extends to the integration level.
- [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) — L1–L4 ontology model. The harness reads integration capabilities (this ADR) plus L1–L3 ontology layers and compiles both into agent context.
- [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) — SessionStart hook, capability resolver invocation, ontology compiler integration.
- [ADR-EVALS](./ADR-EVALS.md) — Eval methodology, framework eval, adopter SDK. Measures whether this ADR's declaration improves agent task accuracy. Defines the falsification criteria that gate Phase 5.
- [ADR-006: Integration Router v2](../architecture-decisions/006-integration-router-v2.md) — A proposed v2 API surface restructure. Currently marked Accepted; implementation in the present checkout still uses v1 paths. This ADR's worked examples use v1 paths to match shipping reality.
- [ADR-GLOBAL-ENTITIES](./ADR-GLOBAL-ENTITIES.md) — Entity ownership patterns (orthogonal but referenced in some capability bindings).

### Code

- `packages/core/integrations/integration-base.js` — `IntegrationBase`, the prototype chain's root. Will gain `static Definition.capabilities` per Phase 2.
- `packages/core/integrations/integration-router.js:73-689` — The actual integration router. Lines 264, 281, 302 use inline `authenticateUser.execute(req)` for user-context auth; lines 327, 340, 357, 411 expose the config-options and user-actions surfaces this ADR's `surface: default` capabilities ride.
- `packages/core/user/use-cases/authenticate-user.js:49-99` — The actual authenticator. Lines 56-67 (shared secret), 70-84 (adopter JWT), 87-96 (Frigg Bearer) — the three user-context credential carriers the `auth` field enumerates.
- `packages/core/handlers/routers/integration-webhook-routers.js:18-54` — Framework's webhook router. Mounts `/api/<integration-name>-integration/webhooks[/:integrationId]` when `Definition.webhooks.enabled === true`. No middleware — signature validation is the integration's responsibility inside the handler.
- `packages/core/handlers/routers/integration-defined-routers.js` — Mounts integration-declared routes from `Definition.routes`. PR #590 extends this for Tier 3 extension routes.
- `packages/core/handlers/routers/db-migration.js:64-70` — The only current `x-frigg-admin-api-key` consumer in the framework; example of `auth: 'admin-key'`.
- `packages/core/integrations/extension.js` — Tier 3 extension contract from [PR #590](https://github.com/friggframework/frigg/pull/590). Integration-level capabilities cross-reference extensions declared here.
- `packages/schemas/schemas/integration-definition.schema.json` — Existing integration-definition schema. The structured `capabilities` array lands here; the legacy thin block is deprecated.

### Specifications referenced by `backedBy`

- [OpenAPI](https://spec.openapis.org/oas/latest.html) — REST endpoints (atomic operations on an API module)
- [AsyncAPI](https://www.asyncapi.com/) — events / webhooks
- [Arazzo](https://spec.openapis.org/arazzo/latest.html) — composite workflows (multi-step sync flows, lifecycle chains)
- [Fenestra](https://github.com/friggframework/api-module-library/tree/claude/fenestra-spec-draft-Q367t/specs/fenestra) — UI extension ecosystems (in-flight Frigg-authored draft)

### Conversation references

- The May 24–25, 2026 `#dev-feed` thread that surfaced the Pipedrive routes audit and the surface-selection rule.
- The May 22–25, 2026 design conversation on `claude/frigg-integration-overhaul-57VHW` that produced this ADR set, including the four adversarial reviews summarized in [Revision history](#revision-history).
