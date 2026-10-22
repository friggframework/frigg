# defineIntegration: design note

ADR-054's stable, event-driven path (target file (a)) built on Stack B's integration runtime (ADR-063, #693–#700).
The same decisions are recorded as an amendment in ADR-054 (#669).

## 1. One runtime, two front doors

Both front doors compile to one target: an `IntegrationBase` subclass with a static `Definition` and an instance
`events` map. Everything downstream reads only that target: the devtools builders, the defined-routes and webhook
routers, the queue worker, the ADR-055 tick (`RunTriggerTick`, one tick, per-installation due decisions), the run
(`IntegrationBase#onTriggerRun` with `RunTrigger`), `integration-types` and the management API.

| | Code (`defineIntegration`, this folder) | Document (ADR-063, `definitions/`) |
|---|---|---|
| Entry | `defineIntegration({...})` | `fromDefinitionDocument(...)`, `definitionDocumentHost(...)`, `embedDefinitionDocument(Cls, ...)` |
| `Definition.modules` | from `modules: { key: use(module) }` | from the document's `modules` |
| Webhooks | contract-2 extension, compiled to a contract-1 `Definition.extensions` binding | capability manifest `webhook` block, `Definition.webhooks` |
| Recurring work | `Definition.triggers` (ADR-055) | `triggersFor()` / `Definition.instanceTriggers` (ADR-055) |
| Handlers | functions `(payload, ctx)` | workflow steps (interpreter), `code` steps |

Neither is a serialisation of the other. They compose: `embedDefinitionDocument(DealAlerts, { definition })` gives a
`defineIntegration` class a document's workflows, and both kinds of trigger come out of one `triggersFor` list
(`tests/front-doors.test.js`).

Base branch: Stack B's tip (`claude/shared-conversation-8hgmbr-stack-9-module-methods`). Its compile target was
suitable as is; the only changes to Stack B code are additive (`webhookRequestFacts` exported, `static visible`
honoured by `integration-types`, the document-door names below as aliases).

## 2. Names

| Collision | Resolution |
|---|---|
| `defineIntegrationClass` beside `defineIntegration` | `defineIntegration` is the code front door. The document door is named for documents: `fromDefinitionDocument` (was `defineIntegrationClass`), `definitionDocumentHost` (was `defineSharedIntegrationClass`), `embedDefinitionDocument` (was `extendIntegrationClass`). The old names are aliases until Stack B merges. |
| "Definition" means three things | `Definition` is only the static on the class (the compile target). The ADR-063 JSON is an *integration document* (its schema becomes `integration-document.v0.1.schema.json`). `config.definition` is the installation's *document pin*. |
| workflow `trigger` vs ADR-055 `triggers` | One registry: `Definition.triggers`. `defineIntegration`'s `triggers` is that key (functions wrapped to get `ctx`); a contract-2 extension's `triggers` merge as `<moduleKey>.<name>` (dotted names are reserved for them). A document's `workflows[].trigger` is a workflow's start condition, not a registry; its `schedule` kind compiles into the same list through `triggersFor`. |
| Webhook facts in contract 2 and in capability manifests | Declared once, by the module. Verification is an Api method (`verifyWebhookSignature(input)`, with #699's input `{ headers, body, query, rawBody, method, url }`); contract 2 may name it (`verify: 'verifyWebhookSignature'`) as a manifest's `webhook.verify` does. Emitted names, account resolution and the subscription set live in the contract-2 extension; a manifest's `webhook`/`events` blocks should be generated from it (follow-up), not written beside it. `use()` options (`subscribe`, `hydrate`) reference those facts and never restate them. |

## 3. API (as built)

```js
defineIntegration({ name, version, display, usage, modules: { <key>: use(module, { <ext>: opts }) },
                    config, on, triggers, actions, visible, webhooks?, routes? })   // -> IntegrationBase subclass
defineApp({ name, integrations, ...appDefinition })                                 // -> { Definition }
use(module, extensionOptions?)                                                      // core's, not the module's
defineExtension(bundle)                                                             // optional; a plain object works
reconcileAppSubscriptions({ integrations, listInstallations?, dryRun? })            // app-scope subscription engine
```

- Handlers are `(payload, ctx)`, called without `this`. `ctx = { modules, config, log, telemetry, commands,
  integration }`, frozen. `ctx.modules.<key>` is the installation's Api for that binding. `ctx.config` is the stored
  config with the form defaults. `ctx.integration` is a read-only record (`id, name, status, userId, entities,
  version`) — ADR-054 open question 6, lean taken. `commands` is created on first use.
- Unknown keys, an `on` key no bound extension emits, method-name handlers, bad `use()` options, trigger problems,
  name collisions and a contract or core-range mismatch all throw when the class is defined.
- **Module keys cannot name an `IntegrationBase` member** (`config`, `events`, `send`, `id`, …). `_appendModules`
  attaches each module to the instance as `this[key]`, so such a key would overwrite the member. Inside
  `ctx.modules` any name is fine; the instance is the constraint. (ADR-054 said any identifier works.)
- `config` entries are JSON Schema fragments (`required: true` and `ui` are lifted) or **module fields**:
  `module.fields.<name>(opts)` returns `{ module, schema, required, ui, options(api, { config }) }`. Fields are a
  module export, not an extension key, because a module bound without an extension (Slack in (a)) offers them too.
- `actions` become `USER_ACTION` events (`DATA_ACTION`), run as `run(input, ctx)`.
- `visible(context)` becomes `static visible`; `integration-types` honours it when a caller passes a context.

## 4. Extension contract 2 (the stable minimum)

A contract-2 extension enabled with `use()` compiles to a contract-1 binding under `<moduleKey>-<extKey>`, so devtools
gives it its function (`deal-alerts__crmwebhooks`, no Prisma layer unless `useDatabase`), the router mounts its
routes under `/api/<integration>-integration/crm-webhooks`, and the queue worker runs its events:

1. **Receipt** (`CRM__WEBHOOKS__RECEIVED`, no database): `handshake` (answered synchronously), `verify` (401 with a
   logged reason), `receive` splits the delivery into `{ externalId, body }` items, one `RESOLVE` message each.
2. **Resolve** (`CRM__WEBHOOKS__RESOLVE`, worker, dry): `resolve: { module }` looks up the installations of this
   integration type connected to the account (the entity reverse lookup, filtered by type) and queues one
   `DISPATCH` per installation. It fans out instead of throwing on two matches, as Stack B's app-level webhooks do.
3. **Dispatch** (`CRM__WEBHOOKS__DISPATCH`, worker, hydrated): `normalize(batch, { api, options, config, env, log })`
   turns the body into `{ name, payload }` events (the HubSpot module hydrates here, with the installation's
   credential); each runs `on['crm.<name>']`, else the extension's default handler, else it is acked and counted
   (`frigg.extension.event_unhandled`). `CRM__WEBHOOKS__DEAL_CHANGED` etc. exist for replays.
4. **Subscriptions, app scope**: `reconcileAppSubscriptions` takes the union of `desired(options)` over every class
   that binds the extension (per ENABLED installation when an option is a function of config), lists what the
   provider has, creates what is missing and removes what no binding needs.
5. **Options**: `use()` options are checked against the extension's `options` schema when the class is defined;
   function values are resolved with the installation's config and checked again.

Not in this PR (checklist on the PR): extension `scripts` and `lifecycle` hooks (§5 dispatcher), the deploy
post-step and daily `frigg.subscriptions.reconcile` trigger that invoke the reconcile engine, ADR-027 `env` scoping
in devtools and `frigg validate`, `instance`-scope subscriptions (experimental), the Slack module promotion, and
generating capability-manifest webhook blocks from contract 2.

## 5. Open questions

1. **App-scope reconcile has no installation.** The ADR-055 tick decides per installation, so a daily app-wide job
   needs an app-level trigger kind (no `integrationId`) or lives only in the deploy post-step and an admin script.
2. **Pruning shared provider subscriptions.** HubSpot subscriptions belong to the developer app. Two stages (or two
   apps) sharing one developer app would remove each other's subscriptions. Prune only when the app owns the
   developer app, or default `remove` off per stage?
3. **Where verification runs.** Contract 2 verifies at receipt (no database, app-scope secret from env). Stack B
   verifies manifest webhooks in the worker (raw body carried in the message, #699). One place for both doors? Lean:
   receipt when the secret is app-scope, the worker when it is per installation.
4. **Event names.** The HubSpot manifest names provider topics (`deal.propertyChange`); contract 2 emits normalized
   names (`deal.changed`, payload `{ deal, changes }`). Lean: manifest event keys become the contract-2 names, with
   the provider topic in `match`.
5. **Base trigger ctx.** `IntegrationBase#onTriggerRun` passes `{ modules: <module instances>, config, log,
   integration: this }` to function handlers on classic classes; `defineIntegration` gives its handlers the ADR-054
   ctx. Align the base to ADR-054 (`modules` -> Api) before Stack B merges?
