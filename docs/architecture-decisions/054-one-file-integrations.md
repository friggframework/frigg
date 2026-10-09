# ADR-054: One-File Integrations via Module Extensions

**Status**: Proposed
**Date**: 2026-10-03
**Deciders**: Sean Matthews

> **Proposed: the API shape needs the maintainer's review.** The scope and the
> stable/experimental split are decided (see *Decisions so far*); the exact
> names and shapes of `defineIntegration`, `use`, contract 2 and `ctx` are what
> this PR asks to be reviewed. Per ADR-043 (open PR #646) it stays a draft PR
> until accepted.

## Context

The 2.0 promise is "a production-grade integration, deployed and managed, in a single file."
The intended shape is an app definition that imports one or two API modules, composes them
into an integration with configuration (field mappings, triggers, a schedule), and exports it.
The modules' extensions supply the plumbing: webhook receivers, signature checks, subscription
register/renew/teardown, queue work, event handlers, recurring polls, pagination, rate-limit
policy, auth, config forms, and admin scripts.

### What `next` has today (747a479f)

| Piece | State on `next` | Evidence |
|---|---|---|
| Extension binding | `Definition.extensions` with `{ name, routes, events, queues, workers, useDatabase }`. Routes are mounted under the binding key. Events merge into `this.events`, and a duplicate event name throws. | `core/integrations/extension.js`, `integration-base.js:743` (`_mergeExtensions`), ADR-018 |
| Extension infrastructure | One Lambda per binding that has routes, with the Prisma layer only when `useDatabase` is set | `devtools/.../integration-builder.js:386-431` |
| Extension queues and workers | Reserved ("Phase 2"). `getExtensionWorkers` has no caller. Extension events use the integration queue. | `handlers/workers/integration-defined-workers.js:4-10` |
| Module-shipped extension | One: `hubspot.extensions.webhooks`. It verifies the v3 signature, enqueues a RESOLVE hop, looks up portalId to integration, and re-enqueues `HUBSPOT_WEBHOOK`. It does not register subscriptions. | `api-module-library/packages/v1-ready/hubspot/extensions/webhooks/*` |
| Subscription API | HubSpot v3 list/create/delete is on a branch. Subscriptions are scoped per developer app, not per portal. | api-module-library `feat/hubspot-webhook-subscriptions` |
| Event types | Only `LIFE_CYCLE_EVENT` and `USER_ACTION`. `CRON` appears in `CLAUDE.md` and `docs/guides/INTEGRATION-PATTERNS.md:355` but nothing reads it. | `integration-base.js:40-43` |
| Scheduling | One-time `at(...)` jobs to SQS (`createSchedulerCommands`). Recurring `cron(...)` schedules exist only for admin scripts. | `infrastructure/scheduler/eventbridge-scheduler-adapter.js:45`; `admin-scripts/src/adapters/aws-scheduler-adapter.js:89` |
| Extension lifecycle | None. An extension cannot act on create, enable, config change, or delete. | `_mergeExtensions` merges events only |
| Config forms | Imperative `getConfigOptions()`. `validateConfig()` reads `jsonSchema.required`. | `integration-base.js:349,500` |
| Pagination | No module-level contract. Most v1-ready modules have no pagination helper and none has an async iterator. | api-module-library `next` |
| Rate limits | ADR-049 (proposed) adds `static rateLimit` and `RateLimitError` defer. Policies for three modules are on a branch. | PR #655, #656, api-module-library `feat/rate-limit-policies` |

A prior analysis wrote the same two-way contact sync twice. On `next` it needs about 570 lines
in the integration file plus about 270 lines in other files (a copied ProcessManager, admin
scripts, a local module). About 410 of the 570 lines are plumbing. The biggest blocks of
plumbing are page fan-out (ADR-044/047), the webhook subscription lifecycle (no ADR), and a
self-rescheduling cron (documented, not implemented).

### The problem

1. **Extensions are routes and events only.** The contract has no seat for the lifecycle
   (register on enable, renew, reconcile, tear down), for recurring work, for config fields,
   for scripts, or for verification (ADR-018 open questions 3 and 4).
2. **Binding is by hand and global.** Each integration writes `extensions: { key: { extension,
   handlers: { HUBSPOT_WEBHOOK: 'method' } } }`, and event names share one map. Two modules that
   both ship a `WEBHOOK` event cannot be bound together.
3. **The integration class is imperative.** Config, user actions, and events are set in a
   constructor and a few methods. Devtools cannot see constructor events, so a `CRON` event
   declared there can never be provisioned.
4. **Recurring triggers do not exist.** The workaround (a one-time job that re-schedules
   itself) loses the schedule when one run fails and does not re-arm itself.

## Decision

Make the one-file integration true with four additive changes. The existing
`IntegrationBase` subclass and `Definition.extensions` keep working unchanged.

1. **Composition helpers in core**: `defineIntegration`, `defineApp`, `use`.
2. **Extension contract 2**: an API module extension may also declare verification, tenant
   resolution, emitted events, a subscription lifecycle, triggers, config fields, env, scripts,
   and lifecycle hooks.
3. **Module-carried binding and namespacing**: extensions are enabled on a module binding
   (`use(hubspot, { webhooks: {...} })`). The module key namespaces everything.
4. **Recurring triggers**: a separate decision, [ADR-055](./055-recurring-triggers.md).

The target files are in [Appendix A](#appendix-a-target-files): (a) a HubSpot-deal to Slack
alert in about 70 lines, and (b) a two-way contact sync in about 115 lines.

### Decisions so far (maintainer, 2026-10-03)

1. **The event-driven one-file path ships STABLE in 2.0.1:** `defineIntegration`,
   `defineApp` and `use`; extension contract 2; the lifecycle hooks (§5); recurring
   triggers ([ADR-055](./055-recurring-triggers.md)); `app`-scope subscriptions; the HubSpot
   webhooks extension on contract 2; the Slack module promoted to v1-ready; and the docs.
   Target file (a) runs on stable APIs only.
2. **The sync pieces ship under `@friggframework/core/experimental`** until two production
   apps use them: the `objects` descriptor and derived `pages()`, the resumable page runner
   with its watermark, `ctx.each` / `ctx.skip` / `ctx.links`, and `instance`-scope
   subscriptions. They can change in a core minor while experimental. Target file (b) uses
   them.
3. **Handlers are `ctx`-only.** A handler is `(payload, ctx)`. It is called without a `this`
   binding; there is one way to reach the APIs, the config and the framework.
4. **Module keys are the integration author's, not core's.** The APIs of bound modules live
   under `ctx.modules`, keyed by the names the author chose in `modules: {...}` (for example
   `crm`, `chat`). Those names never become top-level `ctx` keys and are never part of
   core's interface. Core's own `ctx` keys are a fixed set (§1).

### 1. Composition: `defineIntegration`, `defineApp`, `use`

```js
const { defineApp, defineIntegration, use } = require('@friggframework/core');

const DealAlerts = defineIntegration({
    name, version, display, usage,                // as Definition today
    modules: { crm: use(hubspot, { webhooks: { subscribe: [...] } }), chat: use(slack) },
    config:   { channel: slack.fields.channel({ required: true }), minAmount: { type: 'number' } },
    on: {
        'crm.deal.changed': async ({ deal }, { modules: { crm, chat }, config, log }) => {
            /* business logic */
        },
    },
    triggers: { pollErp: { every: '15m', handler: pollErp } },  // ADR-055
    actions:  { SEND_TEST: { title, run } },
});
module.exports = defineApp({
    name,
    integrations: [DealAlerts],
    database: { postgres: { enable: true } },
    encryption: { fieldLevelEncryptionMethod: 'kms' },
});
```

- **`defineIntegration` returns an `IntegrationBase` subclass with a static `Definition`.** All
  builders, routers, workers, and the management API read `Definition` today, so the
  output needs no new infrastructure path. Shared logic is plain functions in the same
  file (target (b)'s `push`), not methods: handlers have no `this`.
- **`use(module, extensionOptions?)`** returns `{ module, extensions: { [extKey]: options } }`.
  The plain form `modules: { erp }` (the module export) and the current form
  `{ definition: erp.Definition }` both stay valid. `use` is a core function, so a module does
  not have to implement it.
- **`on`** maps namespaced events to handlers. **`actions`** become `USER_ACTION` events.
  **`config`** compiles to `getConfigOptions()` (`jsonSchema` and `uiSchema`), so
  `validateConfig()` and `NEEDS_CONFIG` work as they do now.
- **Handler signature**: `handler(payload, ctx)`, with no `this`. `ctx` is built once per
  dispatch and has a fixed set of keys that core owns:

  ```js
  ctx = {
      modules: { crm: hubspotApi, chat: slackApi },  // keys chosen by the author in `modules`
      config,      // the instance config, resolved and validated
      log,         // ADR-048 logger, bound to the integration and the dispatch
      telemetry,   // ADR-011 counters and spans
      commands,    // createFriggCommands() for this integration
      integration, // the running integration: id, status, user/org, entity ids
  }
  ```

  The keys inside `ctx.modules` are the author's; nothing else in `ctx` is. A module key can
  be any identifier (`crm`, `erp`, `crmA`), including one that matches a core key, because
  it never shares a namespace with them. While the sync pieces are experimental,
  `@friggframework/core/experimental` adds four more core-owned keys: `each`, `skip`,
  `links` and, for a paged run, `page`. Delivery metadata (attempt count, last attempt)
  stays inside the worker and is not on `ctx`.
- **Where integrations are driven from.** `actions` are run through the Management API
  (`POST /api/v2/integrations/:id/actions/:actionId`, [ADR-053](https://github.com/friggframework/frigg/pull/668)), and
  `config` options load through `GET /api/v2/integrations/:id/config/options`. Extension
  receiver routes stay in the adopter's `/api/{integration}-integration/*` namespace, which
  ADR-053 leaves out of the versioned Management API.
- **`defineApp`** returns `{ Definition }`. It applies ADR-051 defaults and validation, and
  appends the admin scripts that module extensions contribute.
- Merged events are computed once per class (this closes ADR-018 open question 1).

### 2. Extension contract 2

An API module exports extensions under `extensions.{key}`, as ADR-019 says. Contract 2 adds
fields. Each one is optional, and contract-1 bundles (the current shape) stay valid.

```js
// @friggframework/api-module-hubspot/extensions/webhooks/index.js
module.exports = defineExtension({
    name: 'hubspot-webhooks',
    contract: 2,
    requires: { core: '>=2.0.1 <3' },
    useDatabase: false,
    env: ['HUBSPOT_CLIENT_SECRET', 'HUBSPOT_APP_ID', 'HUBSPOT_DEVELOPER_API_KEY'],
    options: {                                   // JSON Schema for use(hubspot, { webhooks: <options> })
        type: 'object',
        properties: { subscribe: { type: 'array', items: { type: 'string' } },
                      hydrate: { oneOf: [{ type: 'boolean' }, { type: 'array' }] } },
        required: ['subscribe'],
    },
    routes: [{ path: '/webhooks', method: 'POST', receive: 'receive' }],
    verify: verifyHubSpotSignature,              // (req) => { valid, reason }   -> 401 when invalid
    handshake: null,                             // (req) => response | null (Slack url_verification, Graph validationToken)
    receive: (req) => req.body.map((e) => ({ externalId: e.portalId, body: e })),
    resolve: { module: 'hubspot' },              // externalId -> integrationId, in the worker (DB)
    emits: {                                     // integration-facing names, prefixed by the module key
        'deal.created': {}, 'deal.changed': {}, 'deal.deleted': {},
        'contact.created': {}, 'contact.changed': {}, 'contact.deleted': {},
    },
    normalize: async (batch, ctx) => [/* { name: 'deal.changed', payload: { deal, changes } } */],
    subscriptions: {
        scope: 'app',                            // 'app' | 'instance'
        desired: (options) => options.subscribe, // union over all installed bindings when scope is 'app'
        list: (api, env) => api.listWebhookSubscriptions(env),
        create: (api, env, sub) => api.createWebhookSubscription({ ...env, ...parse(sub) }),
        remove: (api, env, sub) => api.deleteWebhookSubscription({ ...env, subscriptionId: sub.id }),
        // for scope 'instance': register(ctx) -> { id, expiresAt, secret? }, renew(ctx, sub), renewBefore: '1d'
    },
    triggers: {},                                // ADR-055, same shape as Definition.triggers
    fields: {},                                  // config field factories (see §4)
    scripts: [ReconcileSubscriptions, ReplayWebhook],  // AdminScriptBase subclasses
    lifecycle: { onEnable, onConfigChange, onDisable, onDelete },  // optional custom hooks
    events: {},                                  // contract-1 escape hatch, unchanged
});
```

| Field | Who acts on it | Behavior |
|---|---|---|
| `routes[].receive` + `verify` + `handshake` | core router | Runs the handshake, then verification. Returns 401 with a logged reason when verification fails. Calls `receive`, enqueues one RESOLVE message for each item, and returns 200. No DB connection. This replaces the hand-written RESOLVE hop in the HubSpot extension today. |
| `resolve` | core worker | `findIntegrationByEntityExternalId(externalId, module)`. Ambiguous matches throw, as they do now. For `scope: 'instance'`, the route carries `{integrationId}` instead. |
| `normalize` + `emits` | core worker | Turns the raw batch into named events, then dispatches `{moduleKey}.{name}` to the integration's `on` map. An emitted event with no handler is acked and counted, not an error. |
| `subscriptions` | core lifecycle + ADR-055 | `app` scope (stable): reconciled on deploy (`frigg deploy` post-step), by the module script, and by the daily built-in trigger `frigg.subscriptions.reconcile`. The desired set is the union over every integration that enables the extension. `instance` scope (experimental): `register` on enable, `remove` on disable or delete, `renew` through `createSchedulerCommands` before `expiresAt`, and the daily reconcile trigger repairs anything missed. The state (`id`, `expiresAt`, `secret`) is stored in `IntegrationMapping` under the reserved key `__frigg:sub:{binding}`. That model is already encrypted, so no schema migration is needed. |
| `triggers` | ADR-055 | Merged with `Definition.triggers` under the name `{moduleKey}.{trigger}`. |
| `fields` | `defineIntegration` | Field factories that return a JSON Schema fragment plus an options loader, `(api, config) => [{ const, title }]`, which `refreshConfigOptions` calls. |
| `scripts` | `defineApp` + admin-script builder | Registered as `{integration}.{moduleKey}.{script}` and run with `requireIntegrationInstance` where they declare it. |
| `env` | devtools (ADR-027) | Added to the scoped environment of the functions that need it. A missing value fails `frigg validate`. |
| `lifecycle` | core lifecycle dispatcher | Runs on status transitions, not inside `onCreate`/`onUpdate`, so a subclass that skips `super` cannot skip it (see §5). |
| `requires.core` / `contract` | core at boot | A version mismatch throws when the class is defined, with the module name and the range. |

**What stays out of an extension.** Provider facts that the module's `Api` describes stay on the
module: `static rateLimit` (ADR-049) and the `objects` descriptor (§6). An extension does not
choose runtime behavior such as wait budgets, concurrency, or retry caps. Those belong to the
entry point and the framework.

### 3. Binding and namespacing rules

1. **Module key = namespace.** For `modules: { crm: use(hubspot, { webhooks }) }` the derived
   binding key is `crm-webhooks`.
   - Route: `/api/{integration}-integration/crm-webhooks{path}`
   - Function: `{integration}__crmwebhooks`
   - Integration-facing events: `crm.deal.changed`
   - Internal queue events: `CRM__WEBHOOKS__DEAL_CHANGED`
   - Triggers: `crm.reconcile`
   - Scripts: `{integration}.crm.reconcile-subscriptions`
2. **No global event names for contract-2 extensions.** Contract 2 never adds bare names to
   `this.events`, so two modules that both emit `contact.changed` can be bound together. The
   contract-1 duplicate-name check (ADR-018) still applies to contract-1 bundles.
3. **The same module can be bound twice** (`crmA`, `crmB`), because every name derives from the
   module key.
4. **Handler resolution** for an event the integration consumes: the `on` map, then the
   extension's default handler, then ack and count as `unhandled`. Handlers in `on`,
   `actions` and `triggers` are functions; method-name strings are not accepted by
   `defineIntegration`. On a classic `IntegrationBase` subclass, constructor `this.events`
   still wins and logs a warning, as it does now.
5. **Unknown keys fail when the class is defined:** an `on` key that no bound extension emits,
   a `use()` option that fails the extension's `options` schema, or a trigger name collision.
6. **`Definition.extensions` (contract 1) and module-carried extensions can be used together.**
   An explicit binding with the same derived key throws.

### 4. Config composition

Three layers, from lowest precedence to highest:

| Layer | Set by | When | Example |
|---|---|---|---|
| Extension defaults | module author | at publish | `hydrate: false` |
| Binding options | app developer, `use(module, {...})` | at deploy, static | `subscribe: ['deal.creation']` |
| Instance config | end user, the `config` form | for each installed integration | `channel`, `pollEvery` |

- A binding option may be a function of instance config: `subscribe: (config) => [...]`. It is
  resolved for each instance, and for `app` scope subscriptions it is resolved over all ENABLED
  instances during reconcile.
- An extension may add fields to the end-user form only through `fields`, and only where the
  integration places them in `config`. No field appears in a form unless the integration
  author put it there.
- A config change fires `onConfigChange`. Subscription and trigger state reconciles when the
  resolved options change.

### 5. Lifecycle dispatcher

Today `ON_CREATE`, `ON_UPDATE`, and `ON_DELETE` run the integration's handler, and only that
handler. Contract 2 adds hooks driven by status transitions, run by the use cases
(`create-integration`, `update-integration`, `delete-integration`, `persistStatus`):

| Transition | Framework runs, in binding order |
|---|---|
| status becomes `ENABLED` (create or update) | `subscriptions.register` (instance scope), trigger state init, `lifecycle.onEnable` |
| resolved options change while `ENABLED` | subscription reconcile, `lifecycle.onConfigChange` |
| `DISABLED` / `ERROR` | `lifecycle.onDisable`. Subscriptions are kept, and triggers skip the instance. |
| delete (after the integration's `ON_DELETE`, before ADR-032 purge) | `subscriptions.remove`, scheduled renewals deleted, `lifecycle.onDelete` |

A failed hook writes an integration message and moves the integration to `ERROR` on enable. On
delete, a failed hook is logged and does not block the delete, as #615 does now.

### 6. Pagination and objects (module side, descriptive)

A module may declare record access as data, not code:

```js
// api-module-hubspot/definition.js
objects: {
    contact: {
        list:  { method: 'listContacts', page: { type: 'cursor', in: 'after', out: 'paging.next.after' },
                 since: { filter: 'lastmodifieddate' }, max: 100 },
        get: 'getContactById', batchGet: 'batchGetContactsById',
        update: 'updateContact', upsertBy: { method: 'batchUpsertContacts', idProperty: true },
        archive: 'archiveContact', id: 'id', modifiedAt: 'properties.lastmodifieddate',
    },
},
```

Core derives `api.objects.contact.pages({ since, cursor })` (an async iterator), `get`,
`update`, `upsertBy`, and `archive` from the descriptor. A module can supply its own `pages`
function when the API is irregular. This descriptor is the `implementedBy` target of the
ADR-045 traits (`read.pageMax`, `delta.modifiedSince`). It is also the module contract that
ADR-044's `getSyncObjectPage` will consume in 2.1, so modules write it once.

`static rateLimit` stays exactly as ADR-049 defines it, with one amendment: **the policy is
descriptive only.** It states provider facts (windows, scope, parsers, `classify`). It never
holds runtime choices such as in-process wait caps, which the entry point sets
(`runWithInvocationDeadline`). An integration cannot override provider facts. Pacing shares are
an ADR-049 phase-2 question.

### 7. Versioning

- An extension versions with the module that exports it (ADR-019 open question 2, accepted).
  A breaking change to an extension's options, emitted events, or routes is a major version of
  the module.
- `contract` is an integer for the shape of the extension contract. Core supports contracts 1
  and 2. `requires.core` is checked when the class is defined, and the module also declares
  `@friggframework/core` as a `peerDependency` with the same range.
- `defineExtension()` (core) validates the bundle and types the default handlers (ADR-019 open
  question 4).

### 8. What devtools provisions

Devtools reads only the static `Definition`, which `defineIntegration` produces, so each
declaration maps to a resource at build time:

| Declaration | Provisioned |
|---|---|
| extension `routes` | One Lambda per binding (as now). Prisma layer only with `useDatabase`. |
| `emits` / `on` / `actions` | Nothing new: integration queue + queue worker (as now) |
| `env` | Scoped function env (ADR-027). Validated by `frigg validate` (ADR-051). |
| `subscriptions` (`instance` scope with renewal) | Scheduler builder enabled (today it is enabled only by `webhooks: true`) |
| `subscriptions` (`app` scope) | A deploy post-step that runs the reconcile script. Needs the admin-script functions. |
| `triggers` | See ADR-055: a tick function with `schedule` events for each integration |
| `scripts` | Admin-script router and executor (existing builder) |
| extension `queues` / `workers` | **Not in 2.0.1.** Still reserved, and delivered with ADR-047 in 2.1 |

## Consequences

### Positive

- The two target files are about 70 and about 115 lines, with no other app files. The prior
  sketch on `next` needs about 840 lines across files.
- Webhook verification, tenant resolution, subscription upkeep, and module scripts are written
  once per provider instead of once per app.
- Everything is additive. Existing subclasses, `Definition.extensions`, and `webhooks: true`
  behave as before.
- Devtools gains no new integration path, because the output is a normal `Definition`.
- The framework can now tear down declared subscriptions and renewals. This removes the
  "framework cannot list them" row of ADR-032 for anything declared.

### Negative

- Contract 2 is a larger public surface for module authors to learn and to keep stable.
- Handlers cannot use `this`. Authors used to `IntegrationBase` methods move shared logic
  into plain functions that take `ctx`; classic subclasses keep working but are a second
  style for the docs to explain.
- `app`-scope subscriptions depend on developer-app secrets (`HUBSPOT_DEVELOPER_API_KEY`) in the
  deployed environment.
- An emitted event with no handler is acked silently, apart from the count. A typo in an `on`
  key is caught at definition time, but a provider event the author forgot is not.

### Neutral

- `type: 'CRON'` in `this.events`, as `INTEGRATION-PATTERNS.md` documents, is not implemented.
  The docs change to `triggers` (ADR-055) when the implementation lands.
- The 2.0.1 page runner and `ctx.links` are interim. ADR-044's `extensions.sync` replaces them
  in 2.1 behind the same `objects` descriptor.

## Alternatives Considered

1. **Subclassing only (status quo plus more base-class hooks).** Each new concern adds a
   method to `IntegrationBase` that integrations override. This was rejected: devtools cannot
   see constructor state, and an override that forgets `super` silently drops framework work.
   The lifecycle bug class that #615 fixed comes from this pattern.
2. **Integration Templates (ADR-023) as the one-file story.** Copying a 600-line template in is
   one file to start with but not one file to own. A template is the complement: after this
   ADR, a template is a `defineIntegration` file plus its mapping.
3. **A separate `@friggframework/integration-extensions/webhooks` with provider adapters.**
   This was rejected for the first cut: the signature scheme, tenant id, and subscription API
   are provider vocabulary (ADR-019 rule of thumb). A shared generic receiver can come later
   behind the same contract.
4. **Ship extension queues and workers (Phase 2) now.** Not needed. Contract-2 events ride the
   integration queue. Dedicated queues come with ADR-047's FIFO inbound queue, where the topology
   is decided once.
5. **Per-instance EventBridge schedules for triggers.** See ADR-055.
6. **Module APIs as top-level `ctx` keys** (`{ crm, chat, config, log }`, the first sketch).
   Rejected: author-chosen names would share a namespace with core's keys, so a module
   called `config` or `log` would collide, and every new core key would be a breaking
   change for some integration. `ctx.modules` keeps the two namespaces apart.
7. **`this`-bound handlers alongside `ctx`.** Rejected: two ways to reach the same thing,
   and `this` invites state on the instance between dispatches.

## Gap Analysis and Phasing

Sizes are rough, in production LOC plus tests (tests are about 1.2 times the code).

### 2.0.1 stable: makes (a) true

| # | Item | Where | Size | Depends on |
|---|---|---|---|---|
| 1 | `defineIntegration` / `defineApp` / `use`, `config` to form, `on`/`actions`, `ctx`, per-class merge cache | core | ~300 | — |
| 2 | Contract 2: `defineExtension`, `options` schema, `verify`/`handshake`/`receive`/`resolve` route seam, `emits`/`normalize` with namespacing, version check | core | ~350 | 1 |
| 3 | Lifecycle dispatcher (§5) in the create, update, delete, and status use cases | core | ~150 | 2 |
| 4 | Subscription lifecycle, `app` scope (reconcile engine, deploy post-step, script) | core + devtools | ~200 | 2, 3, 7 |
| 5 | HubSpot webhooks extension on contract 2 (emits, hydrate, app-scope subscriptions from `feat/hubspot-webhook-subscriptions`, `fields.dealStages`, `rateLimit` from `feat/rate-limit-policies`) | api-module-library | ~250 | 2, 4 |
| 6 | Slack module promoted from `needs-updating` to v1-ready: OAuth bot, `fields.channel`, `rateLimit` | api-module-library | ~350 | 2 |
| 7 | Extension `scripts` and `env` wiring (admin-script registration, ADR-027 scoping, `frigg validate`) | devtools + core | ~120 | 1 |
| 8 | Docs: one-file quickstart, EXTENSIONS.md contract 2, `frigg-extensions` and `bootstrap-frigg-integration` skills, fix the CRON docs (`CLAUDE.md`, `INTEGRATION-PATTERNS.md`), example app | docs | ~700 lines of prose | 1-7, 9 |
| 9 | Recurring triggers (ADR-055) | core + devtools | ~480 | 1 |

Subtotal: about 2,200 LOC of code, plus tests and docs.

### 2.0.1 experimental (`@friggframework/core/experimental`): makes (b) credible

| # | Item | Where | Size | Depends on |
|---|---|---|---|---|
| 10 | `objects` descriptor and derived `pages()` iterator. Descriptors for HubSpot contact/deal and one polled module. | core + library | ~150 + ~60 per module | 1 |
| 11 | Resumable page runner (`pages:` on triggers and actions): checkpoint, continue before the deadline (`core/invocation-deadline.js`), watermark, a Process record per run | core | ~220 | 9, 10 |
| 12 | `ctx.each` / `ctx.skip` (per-record errors, messages, telemetry, `RateLimitError` passthrough) and `ctx.links` (two-way links plus last-written hash over `IntegrationMapping`) | core | ~180 | 1 |
| 13 | Subscription lifecycle, `instance` scope (register, renew through the scheduler, repair through the daily trigger). Needed for modules with expiring channels. Not needed for HubSpot. | core | ~150 | 4, 9 |
| — | ADR-049 phases 1-2 (#656, #657), already in flight | core | — | — |

Subtotal: about 1,250 LOC.

**Order:** 1, 2, 7, 3, 9, 4, 5, 6, 8 (a is true). Then 10, 12, 11, 13 (b is credible). Trigger
item 9 comes before item 4 because the daily reconcile trigger is the safety net for
subscriptions.

**Release note.** 2.0.1 is the first stable 2.x release. Everything above is additive.
Items 1-9 ship stable. Items 10-13 ship under `@friggframework/core/experimental` until two
production apps use them, so their shapes do not freeze early. The experimental entry point
exports a `defineIntegration` that accepts the sync options (`pages`) and adds the
experimental `ctx` keys; promotion moves them into the stable `defineIntegration` in a core
minor.

### 2.1

- ADR-044 `@friggframework/extension-sync`, which replaces items 11 and 12 behind the same
  `objects` descriptor and the same `config`.
- ADR-047 orchestrator/worker, with extension `queues`/`workers` (Phase 2 of ADR-018).
- ADR-045 trait negotiation and ADR-046 canonical packages, which replace hand-written `map`.
- ADR-020 capability graph composed from `defineIntegration`.
- ADR-023 templates emitted as `defineIntegration` files.
- ADR-049 phase 2+ pacing.

## Related

The register adds a cross-reference line to each amended ADR that is on `next` (015, 018,
019, 023), as ADR-048 did for ADR-011. ADR-032 and ADR-049 are still open PRs, so their
amendments are listed here only.

- **Amends [ADR-015](./015-extensions-taxonomy.md)** (the types/tiers from #592): API Module
  Extensions and Integration Extensions share one runtime contract. The type is now about who
  writes the extension, not about how it works. Answers open question 3: `webhooks: true` stays
  as the per-account shortcut.
- **Amends [ADR-018](./018-integration-extensions.md):** adds contract 2 and module-carried
  binding. Closes open questions 1 (merge cache), 3 (verify seam), and 4 (schedules as
  `triggers`, user actions as `actions`). Open question 2 (workers) stays deferred to ADR-047.
- **Amends and partly supersedes [ADR-019](./019-api-module-extensions.md):** the extension shape
  in its Decision is replaced by contract 2. Accepts its versioning lean. Closes open question 4.
- **Amends [ADR-023](./023-integration-templates.md):** a template is a `defineIntegration` file.
  The `workflows.js`/`user-actions.js` split is dropped.
- **Amends ADR-049 §1** ([open PR #655](https://github.com/friggframework/frigg/pull/655)):
  `static rateLimit` is descriptive only. It sits on the module, not on an extension.
- **Amends ADR-032** ([open PR #641](https://github.com/friggframework/frigg/pull/641)): the
  framework tears down declared subscriptions and renewals.
- **Uses [ADR-020](./020-capabilities.md), [ADR-027](./027-ssm-parameter-offload-and-env-scoping.md),
  ADR-045 ([open PR #648](https://github.com/friggframework/frigg/pull/648)), and ADR-051
  ([open PR #666](https://github.com/friggframework/frigg/pull/666)).** New `Definition` keys
  (`on`, `actions`, `config`, `triggers`, module-carried extension options) go into
  `integration-definition.schema.json` and `frigg validate`. The sample app definitions use
  only keys in ADR-051's `app-definition.schema.json` (`name`, `integrations`,
  `database.postgres.enable`, `encryption.fieldLevelEncryptionMethod`).
- **Uses ADR-053** ([PR #668](https://github.com/friggframework/frigg/pull/668)): actions and
  config options are reached through `/api/v2/integrations/*`.
- **Prepares for ADR-044 and ADR-047** ([open PR #648](https://github.com/friggframework/frigg/pull/648)).
- **[ADR-055](./055-recurring-triggers.md):** recurring triggers.
- **Superseded docs:** the `type: 'CRON'` examples in `CLAUDE.md` and
  `docs/guides/INTEGRATION-PATTERNS.md`. They are corrected when the implementation lands,
  not in this PR.

## Open Questions

1. *(Decided: yes, `ctx` only, with module APIs under `ctx.modules`.)*
2. `app`-scope reconcile on deploy: is it a deploy post-step (it needs network access to the
   provider from CI) or a first-boot job in the stack? Lean: a script run by the post-step, and
   the daily trigger as the fallback.
3. Should `normalize` be allowed to drop events (dedupe by provider event id)? It needs a
   store, so the lean is no for 2.0.1, and handlers must be idempotent.
4. Do module `fields` loaders run with the end user's credential (yes) and under a short cache?
5. Is a separate `defineIntegration` export from `@friggframework/core/experimental` the right
   opt-in for the sync pieces, or should the stable `defineIntegration` accept them behind an
   `experimental: true` flag?
6. What exactly is `ctx.integration`: a read-only record (id, status, user/org, entity ids), or
   an object with methods such as `setStatus` and `addMessage` that today live on the
   `IntegrationBase` instance?

## Appendix A: Target Files

The register keeps everything in the ADR's own Markdown file (there is no assets directory
convention), so both target files are inlined here. Each is the whole `backend/index.js` of
an app and ends with a list of what each imported module and extension contributes.

### (a) HubSpot deal stage to Slack, stable APIs only

```js
// =====================================================================================
// (a) ONE-WAY, EVENT-DRIVEN: a HubSpot deal enters a chosen stage -> post to Slack.
// This is the WHOLE app: backend/index.js. Target DX for 2.0.1 (see ADR-054).
// App code: ~70 lines. Nothing else in the repo but package.json and infrastructure.js.
// =====================================================================================
const { defineApp, defineIntegration, use } = require('@friggframework/core');
const hubspot = require('@friggframework/api-module-hubspot');
const slack = require('@friggframework/api-module-slack');

const DealAlerts = defineIntegration({
    name: 'deal-alerts',
    version: '1.0.0',
    display: {
        label: 'Deal alerts in Slack',
        description: 'Posts to a Slack channel when a HubSpot deal reaches a chosen stage.',
        category: 'Notifications',
    },

    // The module key (crm, chat) is the namespace for everything a module's extensions
    // contribute: routes (/api/deal-alerts-integration/crm-webhooks/...), events
    // ('crm.deal.changed'), config fields, and admin scripts.
    modules: {
        crm: use(hubspot, {
            webhooks: {
                subscribe: ['deal.creation', 'deal.propertyChange:dealstage'],
                hydrate: ['dealname', 'amount', 'dealstage', 'pipeline', 'hubspot_owner_id'],
            },
        }),
        chat: use(slack),
    },

    // Per-install form shown to the end user. Module fields load their options from
    // the connected account (Slack channels, HubSpot pipelines and stages).
    config: {
        channel: slack.fields.channel({ title: 'Post to channel', required: true }),
        stages: hubspot.fields.dealStages({
            title: 'Alert when a deal enters',
            multiple: true,
            default: ['closedwon'],
        }),
        minAmount: { type: 'number', title: 'Only deals worth at least', default: 0 },
        mentionOwner: { type: 'boolean', title: 'Mention the deal owner', default: true },
    },

    // Handlers take (payload, ctx). ctx.modules holds the APIs under the keys chosen
    // above (crm, chat); every other ctx key is core's and fixed.
    on: {
        // Emitted by hubspot.extensions.webhooks after it verified the v3 signature,
        // resolved portalId -> this integration, and batch-read the deal (hydrate).
        async 'crm.deal.changed'({ deal, changes }, { modules: { crm, chat }, config, log }) {
            const stage = changes.dealstage?.to ?? deal.properties.dealstage;
            if (!config.stages.includes(stage)) return;
            if (Number(deal.properties.amount ?? 0) < config.minAmount) return;

            let mention = '';
            if (config.mentionOwner && deal.properties.hubspot_owner_id) {
                const owner = await crm.getOwnerById(deal.properties.hubspot_owner_id);
                const user = owner?.email && (await chat.lookupUserByEmail(owner.email).catch(() => null));
                if (user?.user?.id) mention = ` <@${user.user.id}>`;
            }

            await chat.postMessage({
                channel: config.channel,
                text: `Deal *${deal.properties.dealname}* moved to ${stage}${mention}`,
                blocks: [
                    { type: 'section', text: { type: 'mrkdwn',
                        text: `*${deal.properties.dealname}*  ${stage}\nAmount: ${deal.properties.amount ?? 'n/a'}${mention}` } },
                    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in HubSpot' },
                        url: crm.urls.record('deal', deal.id) }] },
                ],
            });
            log.info({ dealId: deal.id, stage }, 'deal alert posted');
        },
    },

    actions: {
        SEND_TEST_ALERT: {
            title: 'Send a test message',
            async run(_input, { modules: { chat }, config }) {
                await chat.postMessage({ channel: config.channel, text: 'Deal alerts are connected.' });
                return { ok: true };
            },
        },
    },
});

module.exports = defineApp({
    name: 'deal-alerts',
    integrations: [DealAlerts],
    database: { postgres: { enable: true } },
    encryption: { fieldLevelEncryptionMethod: 'kms' },
});

// =====================================================================================
// WHAT EACH IMPORT CONTRIBUTES (none of it is written in this file)
//
// @friggframework/core
//   defineIntegration -> an IntegrationBase subclass with a static Definition, so every
//     existing builder, router, worker and the management API work unchanged.
//   on/actions -> this.events (LIFE_CYCLE_EVENT / USER_ACTION), handler(payload, ctx),
//     ctx = { modules: { crm, chat }, config, log, telemetry, commands, integration }.
//     No `this`. The keys inside ctx.modules are this file's; the rest are core's.
//   config -> getConfigOptions() jsonSchema/uiSchema + validateConfig() (NEEDS_CONFIG).
//   Queue worker, DLQ, retries, delivery.isLastAttempt, structured logs, telemetry,
//   usage counters, encryption, token refresh: already on next.
//
// @friggframework/api-module-hubspot
//   Definition: OAuth2, scopes, entity identity (portalId = externalId).
//   Api: getOwnerById, batch reads, urls.record(); static rateLimit (ADR-049, descriptive).
//   fields.dealStages: config field with options loaded from the connected portal.
//   extensions.webhooks (contract 2):
//     route POST /webhooks, useDatabase: false, verify: HubSpot v3 HMAC + 5 min skew
//     resolve: portalId -> integration (the RESOLVE hop the extension does by hand today)
//     subscriptions: scope 'app' (HubSpot v3 subscriptions are per developer app);
//       desired set = union of every installed binding's `subscribe`; reconciled by the
//       framework on deploy and by a daily trigger; teardown when no binding needs it.
//     emits: deal.created | deal.changed {deal, changes} | deal.deleted (+ contact.*, company.*)
//     hydrate: batch-reads the object with the listed properties before dispatch.
//     env: HUBSPOT_CLIENT_SECRET, HUBSPOT_APP_ID, HUBSPOT_DEVELOPER_API_KEY (ADR-027 scoping).
//     scripts: hubspot.reconcile-subscriptions, hubspot.replay-webhook (admin scripts).
//
// @friggframework/api-module-slack
//   Definition: OAuth2 bot install, team_id = externalId.
//   Api: postMessage, lookupUserByEmail; static rateLimit (tiered, per-method).
//   fields.channel: config field with options from conversations.list.
//   (extensions.events — Slack Events API receiver with url_verification handshake — is
//    available but not enabled here, so no route is deployed for it.)
//
// Provisioned by devtools from the Definition (no infrastructure code in the app):
//   deal-alerts (HTTP catch-all), deal-alerts__crmwebhooks (receiver, no Prisma layer),
//   deal-alerts QueueWorker + queue + DLQ, the daily frigg.subscriptions.reconcile trigger (ADR-055), and the
//   admin-script functions for the module-shipped scripts.
// =====================================================================================
```

### (b) Two-way contact sync, HubSpot webhooks plus a polled ERP, with experimental sync pieces

```js
// =====================================================================================
// (b) TWO-WAY CONTACT SYNC: HubSpot pushes (webhooks), "erp" is polled on a schedule.
// This is the WHOLE app: backend/index.js. Target DX for 2.0.1 (see ADR-054, ADR-055).
// App code: ~115 lines (comments excluded), of which ~70 are mapping and business rules.
// `@friggframework/api-module-erp` stands for any library module that declares an
// `objects.contact` descriptor with since-paging (no webhooks).
// The sync pieces (objects/pages(), the page runner, ctx.each/skip/links) are
// experimental in 2.0.1, so this file takes defineIntegration from the experimental
// entry point. Triggers, use() and defineApp are stable.
// =====================================================================================
const { defineApp, use } = require('@friggframework/core');
const { defineIntegration } = require('@friggframework/core/experimental');
const hubspot = require('@friggframework/api-module-hubspot');
const erp = require('@friggframework/api-module-erp');

// ---- mapping: the part that has to exist ------------------------------------- [B]
const map = {
    crm: {
        toCanonical: (c) => ({
            firstName: c.properties.firstname, lastName: c.properties.lastname,
            email: c.properties.email?.toLowerCase(), phone: normPhone(c.properties.phone),
            company: c.properties.company, updatedAt: c.properties.lastmodifieddate,
        }),
        fromCanonical: (x) => ({ properties: {
            firstname: x.firstName, lastname: x.lastName, email: x.email,
            phone: x.phone, company: x.company } }),
    },
    erp: {
        toCanonical: (p) => ({
            firstName: p.given_name, lastName: p.family_name, email: p.email?.toLowerCase(),
            phone: normPhone(p.phone_numbers?.[0]?.value), company: p.org_name,
            updatedAt: p.modified_at,
        }),
        fromCanonical: (x) => ({
            given_name: x.firstName, family_name: x.lastName, email: x.email,
            phone_numbers: x.phone ? [{ type: 'work', value: x.phone }] : [], org_name: x.company }),
    },
};
const normPhone = (p) => (p ? p.replace(/[^\d+]/g, '') : undefined);

// ---- one write path for both directions -------------------------------------- [B]+[P]
// `from` and `to` are this file's module keys ('crm', 'erp'), so ctx.modules[from] is that API.
// ctx.links  : two-way id links + last-written hash over IntegrationMapping (echo guard)
// ctx.each   : per-record try/catch, telemetry, integration messages; rethrows RateLimitError
async function push(records, from, to, ctx) {
    const { config, links, modules } = ctx;
    await ctx.each(records, async (rec) => {
        const canonical = map[from].toCanonical(rec);
        if (!canonical[config.matchOn]) return ctx.skip(rec, `no ${config.matchOn}`);
        if (await links.isEcho(from, rec.id, canonical)) return ctx.skip(rec, 'echo');

        const link = await links.get(from, rec.id);
        if (link && config.conflict === 'crm-wins' && from === 'erp') {
            const theirs = await modules.crm.objects.contact.get(link.id);
            if (new Date(theirs.properties.lastmodifieddate) > new Date(canonical.updatedAt)) {
                return ctx.skip(rec, 'crm wins');
            }
        }

        const body = map[to].fromCanonical(canonical);
        const target = link
            ? await modules[to].objects.contact.update(link.id, body)
            : await modules[to].objects.contact.upsertBy(config.matchOn, canonical[config.matchOn], body);
        await links.set({ from, id: rec.id }, { to, id: target.id }, canonical);
    });
    ctx.telemetry.count('records.synced', records.length, { from, to });
}

const directionAllows = (config, from) =>
    config.direction === 'both' || config.direction.startsWith(`${from}->`);

const ContactSync = defineIntegration({
    name: 'contact-sync',
    version: '1.0.0',
    display: { label: 'Contact Sync', description: 'Two-way contact sync between HubSpot and the ERP.' },
    usage: { canonical: ['records.synced'] },

    modules: {
        crm: use(hubspot, {
            webhooks: {
                subscribe: ['contact.creation', 'contact.propertyChange', 'contact.deletion'],
                hydrate: true,                          // batch-read with objects.contact.properties
            },
        }),
        erp: use(erp),                              // objects.contact: pages({ since }), get, update, upsertBy
    },

    config: {
        direction: { type: 'string', title: 'Direction', enum: ['both', 'crm->erp', 'erp->crm'],
            default: 'both', required: true },
        matchOn: { type: 'string', title: 'Match contacts on', enum: ['email', 'phone'], default: 'email' },
        conflict: { type: 'string', title: 'When both changed', enum: ['newest-wins', 'crm-wins'],
            default: 'newest-wins' },
        pollEvery: { type: 'string', title: 'Check the ERP every', enum: ['5m', '15m', '60m'], default: '15m' },
        onDelete: { type: 'string', title: 'When a HubSpot contact is deleted',
            enum: ['ignore', 'archive-in-erp'], default: 'ignore' },
    },

    // ADR-055 recurring trigger. One deploy-time schedule per integration; the framework
    // enqueues one run per ENABLED instance whose cadence is due (spread by instance id).
    // `pages` makes the run resumable: the framework iterates erp.objects.contact.pages
    // ({ since: watermark }), calls the handler per page, checkpoints the cursor, re-enqueues
    // itself before the Lambda deadline, and advances the watermark only on completion.
    triggers: {
        pollErp: {
            every: (config) => config.pollEvery,
            when: (config) => directionAllows(config, 'erp'),
            overlap: 'skip',
            pages: { from: 'erp', object: 'contact', since: 'watermark' },
            handler: (records, ctx) => push(records, 'erp', 'crm', ctx),
        },
    },

    on: {
        async 'crm.contact.changed'({ contact }, ctx) {
            if (directionAllows(ctx.config, 'crm')) await push([contact], 'crm', 'erp', ctx);
        },
        async 'crm.contact.created'({ contact }, ctx) {
            if (directionAllows(ctx.config, 'crm')) await push([contact], 'crm', 'erp', ctx);
        },
        async 'crm.contact.deleted'({ id }, ctx) {
            if (ctx.config.onDelete !== 'archive-in-erp') return;
            const link = await ctx.links.get('crm', id);
            if (link) await ctx.modules.erp.objects.contact.archive(link.id);
        },
    },

    actions: {
        // Same resumable page runner as the trigger, from the beginning, both sides.
        INITIAL_SYNC: {
            title: 'Initial sync',
            pages: (config) => [
                directionAllows(config, 'crm') && { from: 'crm', object: 'contact' },
                directionAllows(config, 'erp') && { from: 'erp', object: 'contact' },
            ].filter(Boolean),
            handler: (records, ctx) => push(records, ctx.page.from, ctx.page.from === 'crm' ? 'erp' : 'crm', ctx),
        },
        SYNC_NOW: { title: 'Check the ERP now', trigger: 'pollErp' },
    },
});

module.exports = defineApp({
    name: 'contact-sync',
    integrations: [ContactSync],
    database: { postgres: { enable: true } },
    encryption: { fieldLevelEncryptionMethod: 'kms' },
});

// =====================================================================================
// WHAT IS NOT IN THIS FILE, AND WHO OWNS IT
//   core (2.0.1, stable): defineIntegration/defineApp/use, recurring triggers (ADR-055)
//     with a Process record per run, app-scope webhook subscription lifecycle, generic
//     admin scripts (run trigger now, list stuck runs, reconcile subscriptions),
//     RateLimitError defer (ADR-049 phases 1-2).
//   core (2.0.1, @friggframework/core/experimental): objects descriptor + pages(),
//     resumable page runner + watermark state (a Process record for INITIAL_SYNC),
//     ctx.each/skip, ctx.links (echo guard + id links over IntegrationMapping).
//   hubspot module: webhooks extension (verify, resolve, app-scope subscriptions, emits
//     contact.*), objects.contact descriptor (cursor paging, properties, batch read,
//     upsertBy via idProperty), rateLimit policy, fields.
//   erp module: objects.contact descriptor (since paging), rateLimit policy.
//   2.1 (ADR-044/047): replaces `push` + ctx.links + the page runner with
//     extensions.sync (canonical models ADR-046, conflict policy, tiers, fan-out/fan-in,
//     orchestrator). This file then shrinks to mapping + config (~80 lines).
//
// Versus SKETCH A on next today: ~570 lines in-file + ~270 outside -> ~115, zero outside.
// =====================================================================================
```
