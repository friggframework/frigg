# ADR-063: Integration Definitions as Data

**Status**: Proposed. Direction set; v0.1 implemented in `packages/core/integrations/data-defined/` (see Implementation)
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

- **A multi-listing product.** One product will carry many pair integrations (Klaviyo ⇄ HubSpot, Shopify → NetSuite, …). Each must appear in **both** sides' marketplace storefronts, so the runtime cannot be split per storefront. A code-per-integration runtime grows its stack with every listing.
- **Per-workspace custom integrations.** A customer-specific variant is today either a fork of a class or arbitrary user code. Arbitrary user code needs process isolation to be safe.
- **Agent authoring.** A document that validates against a JSON Schema is far easier for an agent to produce, diff and check than a class. "Checks still compile" becomes literal: schema validation, reference resolution and a Test Bench run.
- **Reasoning.** Integration-as-code is easier for a person to reason about: you can read it, step through it and grep it. Any data form has to keep that property, or it loses.

### Terms: "Definition" means three things

The word is already overloaded, and this ADR adds a third use. Where it matters, the text says which one it means.

| Term | What it is | Where it lives |
|---|---|---|
| `static Definition` | The metadata literal on a code integration or API module class (`name`, `modules`, `routes`, ...). Unchanged by this ADR | In the class |
| The definition document | The JSON document this ADR introduces: one integration, as data. It is what the schema validates and what an installation runs | Authored as a file; published to the store; pinned by an installation (the `definitionVersion` below, `config.definition` in the implementation) |
| `IntegrationDefinitionVersion` | The persisted row that holds one published version of a document, immutable once published | The definition store |

**Naming collision, and the planned rename.** `@friggframework/schemas` already ships `integration-definition.schema.json`, which validates `static Definition`. The document needs a distinct name and `$id` so the two schemas are never confused. The planned name is **integration document**, with `integration-document.v0.1.schema.json`. Only the name is decided here; the code rename is a separate task. Until it lands, this ADR says "definition" for the document where it reads naturally, and the sketch and the schema package in §2 and §3 use the planned name.

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

**Mappings and transforms: one vocabulary is the goal.** [ADR-057](./057-canonical-schema.md) keeps a module's meaning of an object in `extensions.mapping` and pair-specific rules in the integration, and refers to transforms by name (`joinName`, for example). A definition's mappings should use ADR-057's module mappings and canonical rules wherever a canonical schema exists. A pair-specific mapping row a definition carries itself must draw its transforms from the same named vocabulary, so that one operation has one name. Two registries that spell the same operation differently would make a mapping unportable between the two forms. If an implementation keeps its own mapping rows or transform names for now, its implementation notes must record the departure and what closes it.

**No general-purpose expression language.** Arguments are literals, references (`$.trigger.body.email`, `$.steps.fetch.result.id`) or calls to named transforms. Conditions are a small, total, side-effect-free predicate set (`eq`, `in`, `exists`, `and`, `or`, `not`). The day a definition needs a loop or arbitrary arithmetic is the day it should become a code step. Without this rule the format turns into a programming language with worse tooling than JavaScript.

### 2. Shape (sketch, not final)

```jsonc
{
  "$schema": "https://schemas.friggframework.org/integration-document/v0.1.json",   // planned name (Terms)
  "name": "klaviyo-hubspot",
  "version": "1.2.0",
  "display": { "label": "Klaviyo for HubSpot", "category": "Marketing" },
  "modules": {
    "klaviyo": { "module": "klaviyo@^2" },
    "hubspot": { "module": "hubspot@^3", "instance": "hubspot-klaviyo" }   // named instance: not decided (see Related, ADR-059)
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

1. **Authored as files** in git, or produced by an agent or a visual editor and committed. That keeps them diffable, reviewable and blameable, and keeps integration-as-code's main reasoning property.
2. **Compiled** by a `frigg integration check` step: JSON Schema validation (`@friggframework/schemas`, one `integration-document.v0.1.schema.json` and a validator helper, following the existing conventions and the planned name in Terms), reference resolution against the app's registered modules / step types / transforms, mapping validation (ADR-057's `validateCanonicalMapping`), and a Test Bench run against recorded fixtures. A definition that fails any check is not publishable.
3. **Published** to a definition store as an **immutable** `(name, version, contentHash)` row. Publishing is the only write. A version is never edited in place.
4. **Pinned.** Every integration record stores the `definitionVersion` it was created with. Upgrading a running integration is an explicit migration, the same problem ADR-030 already frames. Data makes Path D of that ADR ("version as a routing dimension outside the class") almost free, because the version is just a key into the store.

A code-defined app can also ship data definitions **in the bundle** (as files loaded at cold start) without a store. That is the zero-infrastructure first step, and it changes nothing about deployment.

### 4. Runtime shape

- **One class, many types.** `DataDefinedIntegration` resolves `(name, definitionVersion)` from the integration record (or from the route) and caches the parsed definition by content hash for the life of the process.
- **Routes keep their paths.** The existing `/api/${name}-integration/*` contract is preserved. A generic router resolves `name` from the path segment at request time instead of mounting one router per class at cold start.
- **Constant infrastructure.** Data-defined integrations share one HTTP function, one webhook function and a small, fixed set of worker queues. Messages carry `{ integrationType, definitionVersion, event }`. The stack's resource count stops growing with the number of integrations, which removes the CloudFormation ceiling for a product that lists many pairs, without nested stacks or sharding.
- **Noisy neighbours are the price of sharing.** One integration's backfill must not starve another's webhooks. The runtime therefore needs per-type concurrency keys or hashing onto N queues, with separate queues for interactive and bulk work. This is the main *new* operational problem this ADR creates.

### 5. Why this is safe for per-workspace customization

Because a definition can only compose allow-listed, versioned code, a workspace-specific definition is configuration, not user code. It can run in the shared runtime without the process isolation that arbitrary customer code would require. It cannot reach a module the app didn't register, call a transform that doesn't exist, or loop. Credentials, encryption and module auth are untouched: they stay in the API module and the framework.

**"Workspace" is not yet an ADR-056 concept.** The ownership model for workspace-specific definitions is a follow-up, and this ADR does not design it. The intent is to build on [ADR-056](./056-app-profiles-tenancy-entity-scopes.md) rather than invent a second tenancy model:
- *Owner.* A definition is owned the way an entity is: by its owner `userId` plus the owning `organizationId` (ADR-056 Decision §3), not by a free-standing workspace id. Until then, an implementation may treat the authenticated user as the workspace.
- *Who sees it.* Visibility uses ADR-056's `Definition.visible(context)` (Decision §4), applied where integration options are listed, and it is not authorisation.
- *Which entities a binding may use.* A definition's module binding takes ADR-056's binding scope (`organization` or `global`, Decision §3) like a code integration's.

### 6. Explicitly not decided here

- The step-type vocabulary beyond the sketch, and how it relates to `BaseCRMIntegration`-style sync helpers.
- The definition store's storage (Prisma model in the existing database vs a separate registry service).
- Whether code integrations can be lowered to data. Probably not in general; possibly for the subset that only uses object routes plus mapping.
- How a visual editor round-trips with hand-edited files.

## Implementation (v0.1)

The decision above was written before any code existed. v0.1 is a working implementation in
`packages/core/integrations/data-defined/`, with 128 tests (the persistence suite runs against real PostgreSQL and
MongoDB). It runs 16 example definitions (a phone-to-CRM definition is the
reference: seven workflows, one two-way sync, two UI surfaces) against fake API modules, and checks 21 capability
manifests. This section records how it works, where it changed the sketch above, and what it does not do yet. File
references are relative to that directory.

v0.1 is the version to iterate on for about a month before anything becomes v0.2. The gaps the examples exposed were
therefore closed inside v0.1 rather than deferred (§20).

### 7. Three layers, stored separately

An integration splits into three things that change at different rates. Mixing them is what makes "edit an
integration" dangerous today, because a class holds all three.

| Layer | What it holds | Where | Changes when |
|---|---|---|---|
| **Definition** | What the integration *can* do: modules, settings, syncs, workflows, queries, UI, templates, lifecycle | `IntegrationDefinitionVersion` (new table), one immutable row per published version | A version is published, then never again |
| **Installation** | What one customer turned on and chose, plus the version they pin | `Integration.config` (existing column, new shape) | The customer configures, or an upgrade moves the pin |
| **State** | What has happened | `IntegrationMapping` (existing) and `WorkflowRun` (new) | Every event |

The two new tables are real Prisma models in both schemas (`prisma-postgresql/schema.prisma`,
`prisma-mongodb/schema.prisma`), with the PostgreSQL migration `20261018000000_add_data_defined_integrations`.
`WorkflowRun` rows are deleted with their `Integration`. `schema/records.md` explains the fields. Worked rows,
generated by running the code rather than written by hand, are in `examples/records/`.

The repositories (`repositories/`) store rows only: one class each for MongoDB, PostgreSQL and DocumentDB, behind a
factory that reads `DB_TYPE`. The rules live in `use-cases/definition-use-cases.js`. `PublishDefinitionVersion`
validates both layers (§11). Republishing an identical document is a no-op, and a different document at a published
version is refused (`IMMUTABLE`). It also refuses a version that is not newer than the latest published one
(`NOT_NEWER`) and a bump smaller than the changes (`BUMP_TOO_SMALL`). A draft is rewritten only while it is still a
draft: `updateIfStatus` is a conditional write the database checks. Two concurrent publishes of one version therefore
cannot both win. A loser with the same checksum gets the winner's row, and one with a different checksum gets
`CONFLICT`. `createDefinitionCatalog()` is the store the runtime reads. It serves only published, deprecated or
retired rows, never a draft, and caches them by `id@version`. It verifies a pinned checksum on every read
(`CHECKSUM_MISMATCH`).

- **`IntegrationDefinitionVersion`**: `definitionId`, `version` (semver), `schemaVersion`, `status`
  (`DRAFT` → `PUBLISHED` → `DEPRECATED` → `RETIRED`), `document` (the definition verbatim), `checksum`
  (`sha256:` of canonical JSON with sorted keys, `canonical.js`), `changeLevel` and `previousVersion`. Unique on
  `(definitionId, version)`. Only a `DRAFT` may be edited. Publishing runs `validate` and `checkBump` and freezes the
  row. A `DEPRECATED` version keeps running for its pins but cannot be newly installed. A version is `RETIRED` only
  when no installation pins it and no queued message names it.
- **`Integration.config`**:
  ```jsonc
  {
    "definition": { "id": "phone-crm", "version": "1.4.0", "checksum": "sha256:…" },   // the pin
    "settings":  { "fromNumber": "+15125550100" },
    "syncs":     { "contacts": { "enabled": true, "mapping": [ /* optional full override */ ] } },
    "workflows": { "missed-call-task": { "enabled": true, "settings": { "owner": "81273645" } } },
    "ui":        { "phone-card": { "enabled": true } },
    "runtime":   { "installed": { "hook": { "id": "WHk2c9" } } }                        // written by the runtime only
  }
  ```
  An absent `enabled` means "use the definition's `default`". The existing `Integration.version` column mirrors the
  pin so it can be indexed. `runtime.installed` holds each `onInstall` step's result by step id (§15).
- **`IntegrationMapping`** holds three kinds of row, distinguished by key prefix:
  - `link:<set>:<module>:<id>`: "this record on this side is linked to these ids on the other side". `<set>` is a
    sync id or a link set id (§8).
  - `idx:<set>:<key>:<normalised value>`: the identity index, for example `idx:contacts:phone:+15125550142`.
  - `evt:<definition>:<workflow>:<eventId>`: the dedupe claim, written insert-only.

  The mapping repository already exists, so no new table is needed for state.
- **`WorkflowRun`** (new) holds one row per run. Its fields are `definition {id, version}`, `workflowId`, `trigger`,
  `status` (`completed | stopped | filtered | duplicate | failed`), `reason`, `error`, `retryable` and a step trace.
  This is the "step-level traces from day one" that the Negative consequences below demand.
  Every run is written after it finishes. A failed write is logged and never fails the run, because the run's effects
  have already happened.

### 8. The definition document

JSON Schema: `schema/integration-definition.v0.1.schema.json`. Top-level keys:

| Key | Holds |
|---|---|
| `id`, `version`, `schemaVersion`, `display` | Identity |
| `modules` | `{ <key>: { module: "hubspot", version: "^3" } }`. The key is how steps refer to the module |
| `settings` | Integration-level settings: `type`, `label`, `required`, `default`, `options`. An option setting names a module's option list (`hubspot.owner`), or `{ source, with }` when the list takes inputs read from earlier choices: `{ "source": "asana.project", "with": { "workspaceGid": "$.settings.workspace" } }` |
| `syncs[]` | `id`, `source`/`target` (`module.object`), `direction` (`one_way | two_way`), `identity.match[]` (`{key, source, target, transform}`), `mapping[]` (rows read a `source` or write a fixed `value`), `backfill`, `ongoing` (`webhook | poll | none`), `default`. A definition may be syncs only, with no workflows |
| `links[]` | Link sets: `id`, `between` (two `module.object` on different modules), `identity.match[]` (`{key, transform}`). Records known to be the same thing with no sync behind them, such as a Calendly invitee and the Salesforce Lead it booked as |
| `workflows[]` | `id`, `label`, `description`, `default` (`on | off`), `trigger`, per-workflow `settings`, `steps[]` |
| `queries[]` | Named read-only step lists that feed UI surfaces |
| `ui[]` | `id`, `host` (module key), `placement`, `query`, `view` (a component tree), `default` |
| `templates` | Named text templates |
| `lifecycle` | `onInstall` and `onUninstall` step lists, for example creating and deleting a provider webhook subscription |

The reference document (phone to CRM) and more are in `examples/`. Example ids in this ADR are generic; the files keep their own names.

**Mappings: where v0.1 departs from ADR-057.** The `syncs[].mapping` rows above (a `source` or a fixed `value`, plus a `transform`) belong to the definition. They are not [ADR-057](./057-canonical-schema.md) module mappings (`extensions.mapping`) or `canonical.rules`, and the transforms they name (`trim`, `to_e164_phone`, `split_full_name`, `to_iso_date`, ... in §10) have their own names, where ADR-057 names its transforms differently (`joinName`, for example). ADR-057 is still an open PR (#676). §1 states the goal: one transform vocabulary, and module mappings used wherever a module ships one. Closing the gap means reading ADR-057's module mappings when they exist and reconciling the transform names so one operation has one name. Until then the schema's transform list is pinned to the runtime's (§11), which keeps this form consistent with itself, not with ADR-057.

### 9. Capability manifests: how a definition reaches code without containing any

The allow-list in §1 needs something to list. In v0.1 each API module ships a **capability manifest** next to its
code (`schema/capability-manifest.v0.1.schema.json`; mocks for HubSpot and a phone module in `capabilities/`):

- **`objects`**: fields, with type, read-only flag and an ontology tag (`person.email`, `person.phone`). The validator
  checks mapping rows and identity keys against them.
- **`events`**: each topic the module can deliver, with `record` (where the record sits in the payload; a phone module uses
  `data.object`), `idPath` (the provider's event id, used for dedupe) and an example payload.
- **`capabilities`**: `<object>.<verb>` → `{ kind: read | write, method, input }`. `method` names a method on the
  module's existing `Api` class. A step `hubspot.task.create` therefore resolves to `HubSpotApi.createTask(args)`, and
  nothing else is reachable.
- **`options`**: the lists a settings dropdown can draw from, such as owners or phone numbers: a read capability,
  `label` and `value` expressions over `$.item`, and `inputs` when the capability needs arguments (Asana projects need
  a workspace).
- **`account`**: values about the connected account that the module persists after auth (`apiPropertiesToPersist`),
  such as QuickBooks' `realmId` or a Zendesk subdomain. Definitions read them as `$.install.accounts.<key>.<field>`;
  nothing undeclared is exposed.
- **`ui`**: the placements this host offers, such as HubSpot's `crm.record.sidebar` and a phone module's `conversation.sidebar`.
- **`webhook`**: how a POST from this provider becomes module events (`webhooks.js`), written with the same template
  expressions definitions use, over `body`, `headers` (lower-case), `query`, `item` and `parent`:
  ```jsonc
  "webhook": { "scope": "app",                          // or "installation": a URL per installation
               "batch": "body",                         // the array of events; [outer, inner] for two levels (QuickBooks)
               "topic": "{{item.subscriptionType}}",    // a list tries each until one is non-empty (Slack)
               "eventId": "{{item.eventId}}", "account": "{{item.portalId}}",
               "verify": "verifyWebhookSignature",      // the module's Api method; required to return true
               "handshake": { "when": "…", "body": { "challenge": "$.body.challenge" } },
               "unwrap": "payload" }                    // a form field holding the JSON body (Slack interactivity)
  ```
  Each event names the provider's topic (`"match": "orders/create"`, default: the event key) and may add a condition
  (`"when"`): a phone module reports a missed call as `call.completed` with status `missed`, so `call.missed` is that subset. An
  event's example `payload` (with `headers` when the topic is in one) is an exact delivery, and validation requires it
  to route to its own event through the same code a live webhook uses.

The manifest is the module author's promise of what is safe to call. Adding a capability is a module release, which
is code that gets reviewed. Using it from a definition is a publish. This is the line between the two authoring forms.

Because definitions are checked against manifests, a broken manifest would let a broken definition through, so
manifests are validated too (`manifests.js` `validateManifest`): capability kinds, option lists that call a read
capability and declare its required arguments as inputs, option labels that are one reference or a template, enum
fields with values, and event `record` paths that exist in the example payload. Writing it found three real faults
in the mocks: HubSpot's owner label rendered `$.item.firstName` literally, a Shopify capability had a kind the schema
does not allow, and a HubSpot enum listed no values.

### 10. Steps and expressions (as built)

A step is `{ id?, use, with?, when?, onError? }` (`steps.js`). `use` is either a built-in or
`<moduleKey>.<object>.<verb>`. There is no `http`, `eval` or `script` step.

| Built-in | Does |
|---|---|
| `links.find` / `links.upsert` | Read and write the link and identity rows above, by `sync` or by `link` (a link set), normalising keys with that set's identity transform |
| `map` | Apply a sync's mapping, or the installation's override of it, or inline rows (`transforms.js`: `trim`, `lowercase`, `to_e164_phone`, `split_full_name`, `to_iso_date`, `map_values`, `units_to_cents`, `from_unix_seconds`, …). A row reads `source` or writes a fixed `value` |
| `merge` | Deep-merge objects into one: later wins, lists are replaced, inputs are untouched |
| `template` | Render a named or inline template |
| `set` | Write into `$.vars` |
| `stop` | End the run as `stopped`, a normal outcome and not an error |
| `foreach` | Nested steps per item, `max` defaults to 100, hard cap `FOREACH_HARD_CAP` = 1000. `where` skips items (checked before the cap, so `max` bounds the work done); `collect` makes the step's result a list of one value per item, which may read that iteration's steps |
| `branch` | First case whose `when` holds, else `else` |
| `code` | Call a registered, versioned code step: `"pkg#fn@1.2.0"`. This is the only way custom code runs |

`onError` is `fail` (the default: the run fails and the queue retries), `continue` or `stop`.

**Expressions** (`expressions.js`) take three forms:
- a reference, `$.event.data.object.from`, which keeps its type;
- a template, `"Call · {{record.duration | minutes}}m"`. A filter argument may itself be a path. A string that is
  exactly one tag keeps the value's type, so `"{{item.Amount | to_cents}}"` is a number and `"{{steps.ids}}"` a list.
  Filters are named, total functions (bad input gives blank, never a throw):
  - text and dates: `upper`, `lower`, `truncate`, `default`, `date`, `json`, `minutes`, `seconds`;
  - lists: `join`, `size`, `first`;
  - arithmetic: `plus`, `minus`, `times`, `divided_by` (by zero is blank), `round`, `abs`, `number`;
  - money: `to_cents` / `from_cents`, and `to_minor_units` / `from_minor_units` with a currency argument, because JPY
    has no minor unit and KWD has three. Rounding is half-up in decimal, so 19.995 is 2000 cents, not the 1999 that
    `19.995 * 100` gives in binary floating point;
  - time: `from_unix` / `to_unix`.
- a condition, `"$.steps.contact == null && $.record.direction in ['incoming']"`.

Conditions are tokenised and parsed by a small recursive-descent parser. Nothing is passed to `eval` or `Function`.
The roots a path may start from are fixed: `event`, `record`, `steps`, `settings`, `install`, `vars`, `item`,
`index`, `data`, `row` and `now`.

**Where this departs from §1:**
- §1 said "the day a definition needs a loop, it should become a code step". The stale-contacts workflow needed one,
  so v0.1 has `foreach`, but bounded. It cannot recurse or exceed 1000 items, so the "total, side-effect-free"
  property holds in practice.
- The condition language is slightly richer than `eq/in/exists/and/or/not`: it also has comparisons, `contains` and
  `!`. It has no arithmetic and no calls.
- Arithmetic exists, but only as named filters. Converting cents or unix time is the most common reason the examples
  reached for a `code` step, and a code step for `amount / 100` costs a reviewed release. A filter is total and
  side-effect free, which keeps §1's property; an expression language would not.

Treat all three as the ceiling, not a first step.

### 11. Validation is the compile step

`validate(def, manifests)` (`validate.js`) returns `{ valid, errors[], warnings[] }`, and every error carries a
`path`. Beyond JSON Schema, it resolves every reference a schema cannot see:

- Ids are unique across all kinds, link sets included.
- Every module key has a manifest.
- A setting's `options` source exists, its required inputs are supplied, it reads no undeclared input, and inputs
  read only `$.settings` at the same level (a workflow setting may also read `$.install`), never the setting itself
  and never in a loop.
- Sync fields exist on both objects, identity keys are declared, and a write never targets a read-only field. Every
  mapping row has a source or a fixed value, never both.
- A link set joins two existing objects on different modules.
- Every capability step exists, required arguments are present and undeclared ones are refused.
- `$.steps.x` only refers to an *earlier* step, `$.settings.y` to a declared setting, and `$.item` appears only
  inside `foreach`.
- `links.*` names exactly one sync or link set; its keys are identity keys of that set, and `from` / `ids` name
  modules the set joins. Templates exist, and `code` refs are well formed. `foreach` has `do`, `collect` or both, and
  `max` is 1 to 1000.
- Every template tag, anywhere (step arguments, named templates, views), uses a known filter. A named template that
  no step renders is a warning.
- `$.install` paths exist: an integration setting, `accounts.<module key>.<field>` the manifest declares, or
  `runtime.installed.<onInstall step id>`, which install steps themselves cannot read.
- Uninstall undoes install: an `onInstall` step with no `id`, or whose kept result `onUninstall` never reads, is a
  warning (`--strict` makes it fail), because it is usually a webhook nobody deletes.
- A webhook trigger's topic is in the manifest's `events`, and a cron has five fields.
- A `userAction` with `from` names a real UI surface, and a `syncRecord` trigger names a real sync.
- A UI placement is offered by the host, its query exists, components are in the fixed set, and every `Button`
  targets a `userAction` workflow. A view reads only `$.data` (and only keys its query returns), `$.record` and
  `$.install`; `$.item` only inside a `List` row and `$.row` only inside a `Table` column. A typo there would render
  blank, so it is an error here instead.

An invalid definition cannot be published. This is the "checks still compile" property from Context, made literal.

Validation is two layers, run together by `schema-check.js`: the JSON Schemas (the published contract) and the
reference checks above (what the runtime enforces). A document is valid only when both pass. They run in three
places:
- `scripts/validate.js` (`npm run validate:definitions` in core): any definitions and manifests, exit `0` valid, `1`
  invalid, `2` could not run; `--strict` fails on warnings and `--json` is for pipelines. It is what a publish step
  calls before writing an `IntegrationDefinitionVersion` row.
- `tests/schemas.test.js`, in CI on every change: every bundled example and manifest, plus the CLI driven as a child
  process, and the schema's transform list pinned to the runtime's so the two cannot drift.
- Anything that copies definitions elsewhere refuses to write invalid output; a product's definitions page
  sync is one.

`ajv` is already a dependency of `@friggframework/schemas`; core's runtime stays dependency-free and loads it only
for validation.

### 12. Compiling an installation into ordinary Frigg events

`compile(def, installation)` (`compile.js`) is pure. It turns a definition plus *one installation's choices* into
exactly what a hand-written integration builds in its constructor: a `this.events` map. It also returns the routing
tables the runtime needs:

| Definition item | Compiled event | Frigg type |
|---|---|---|
| sync `contacts`, backfill on user action | `SYNC_CONTACTS_BACKFILL` | `USER_ACTION` |
| sync page worker | `SYNC_CONTACTS_PAGE` | `QUEUE` |
| sync ongoing (webhook or poll) | `SYNC_CONTACTS_ONGOING` | `WEBHOOK` or `CRON` |
| workflow `log-call` | `WF_LOG_CALL` | `WEBHOOK`, `CRON`, `USER_ACTION` or `QUEUE`, from its trigger |
| query `recent-activity` | `Q_RECENT_ACTIVITY` | `ROUTE` |
| UI surface `phone-card` | `UI_PHONE_CARD`, rendered by `POST /api/integrations/:id/actions/UI_PHONE_CARD` | `ROUTE` |

The other outputs are `webhooks` (module → topic → event names; a pattern may end in `.*`), `schedules` and
`userActions`.

**Both authoring forms compile to the same two things.** A code-defined integration builds `static Definition` and `this.events` in its class. A definition compiles to the same pair: the `Definition` the host reads for routes, queues and schedules, and the `this.events` map the dispatcher reads. Everything downstream (dispatcher, queue worker, scheduler, mapping repository) therefore cannot tell the forms apart.

**Where this should meet the one-file and trigger ADRs.** Three facts the compiled output depends on are described again here and should come from the module or the framework instead:
- *Recurring work* is [ADR-055](./055-recurring-triggers.md)'s `Definition.triggers`, which ADR-055 governs for both forms. A later section (§15a, recurring schedules) will follow ADR-055.
- *Module webhook facts* (how a delivery is verified, answered, split into events and attributed to an account) come from [ADR-054](./054-one-file-integrations.md) extension contract 2: `verify`, `handshake`, `receive`, `resolve`, and `emits` / `normalize`. The manifest's `webhook` block (§9) is v0.1's own description of the same facts. When contract 2 exists, the manifest should be derived from it, not kept as a second description of one module.
- *Sync object access* (list, get, upsert, ids and modified-at paths) comes from ADR-054 §6's `objects` descriptor, and the `sync` blocks in §15b are the same kind of fact. They should be derived from `objects` when it exists.

ADR-054 and ADR-055 are Proposed. This section records the intent, and does not depend on either being built.

**Only enabled items are compiled.** A workflow the customer has off has no event, no route and no schedule. It
does not exist at runtime, so "disabled but still firing" cannot happen.

### 13. Two deployment shapes

`data-defined-integration.js` produces an `IntegrationBase` subclass in one of two ways:

| | Shape A: `defineIntegrationClass({ id, … })` | Shape B: `defineSharedIntegrationClass({ name: 'data-defined', … })` |
|---|---|---|
| Classes | One per definition id; name and modules come from the definition | One for every definition |
| `static Definition.modules` | That definition's modules | Every API module the app has installed |
| Which definition an installation runs | The id is fixed; the version comes from the pin | `config.definition.{id, version}` |
| New version | Publish only, no deploy | Publish only, no deploy |
| New integration | A new class, so a deploy and three more functions plus a queue | A row, no deploy |
| Fits | A product team with a handful of integrations | A product that lists many integrations, where definitions accumulate without bound |

Shape B is what actually makes §4's "constant infrastructure" true. Shape A still grows the stack per definition
id, just not per version.

### 14. Runtime: how an event loads and runs

**Cold start (unchanged).** `loadAppDefinition()` registers the generated classes like any others. No definition is
read at cold start.

**Hydrating an installation.** Every Frigg use case that touches an integration (create, update, delete, the queue
worker, user actions, config options) constructs the class from its record and calls `initialize()` first. The
data-defined class loads its definition there, so every real entry point hydrates through the same path. A dry
instance with no record (an app-level webhook before its installation is known) has no pin and loads nothing.
`loadDefinition()` does five things:
1. Reads the pin from `config.definition`. With no pin, it fails loudly: "This installation does not name a
   definition".
2. Fetches `definitions.get(id, version)`. Versions are immutable, so the result can be cached by
   `id@version` (or by checksum) for the life of the process.
3. Runs `compile(def, config)`.
4. Builds the **ports** (`runtime.js` `makePorts`):
   - `call(moduleKey, capability, args)` looks the capability up in the manifest and calls the connected module's `api[method](args)`, so credentials, token refresh and encryption stay exactly where they are today. The shared class registers modules by module name, so a definition key that differs (`crm: { module: 'hubspot' }`) is mapped to it.
   - `links.find` and `links.upsert` sit over `getMapping` and `upsertMapping`.
   - `dedupe.claim` sits over `createMapping`, which is insert-only and throws `MappingAlreadyExistsError` when the row exists; `dedupe.release` sits over `deleteMapping`.
   - `runCode` calls registered code steps.
5. Replaces the previously compiled events in `this.events` with the compiled map, every handler being
   `dispatch(ref, payload)`, then calls `registerEventHandlers()`. Replace, not merge: a workflow switched off since
   the last compile loses its event immediately.

From there, the existing dispatcher, queue worker, scheduler and mapping repository do what they already do.

**A webhook arrives.** A provider's POST carries no Frigg vocabulary: nothing says which module sent it or which
event it is. Install steps register a per-module URL, `$.install.webhookUrls.<key>`, which names the module, and the
module's manifest says how to read the rest (§9, `webhook` block). For example a phone module's `call.completed`:

```
POST /api/data-defined-integration/webhooks/<integrationId>?module=phone
  → webhook function (no database): a handshake (Slack url_verification, Asana X-Hook-Secret) is answered here;
    anything else is queued as { integrationId, body, headers, query }       ── the unchanged Frigg path
  → queue worker: hydrate the record → initialize() → loadDefinition()
  → onWebhook({ data })
      module   = ?module, else the one manifest that recognises the body
      verify   = manifest.webhook.verify → the module's Api method; anything but true drops the delivery (fail closed)
      events   = eventsIn(manifest, delivery): split a batch, read each event's topic, id and account, keep the
                 manifest events whose `match` (and `when`) fit → [{ topic: 'call.completed', eventId: 'EVc0a1', … }]
      for each event, each enabled workflow listening for it:
        queueWebhook({ event: 'WF_LOG_CALL', body: event, eventId, definitionVersion: '1.4.0' })   ← one message per workflow
  → queue worker, per message: dispatch(ref, msg)
      runWorkflow():
        record   = manifest.events['call.completed'].record  → body.data.object
        filter   = trigger.filter evaluated → 'filtered' (nothing claimed, nothing written)
        claim    = createMapping('evt:phone-crm:log-call:<provider event id>') → false ⇒ 'duplicate'
        steps    = links.find(phone) → template('call-note') → hubspot.engagement.createCall
        result   = WorkflowRun { status, trace[{id, use, at, status, ms, error?}] }
        failed   → release the claim, throw → the queue retries (the DLQ after max receives)
```

Fanning out one message per workflow is deliberate. One workflow's failure or retry cannot re-run, or block, the
others that listened for the same event.

**An app-level webhook** (one URL for every account: HubSpot, Stripe Connect, GitHub Apps, QuickBooks, Slack, Linear,
Notion) is registered once on the provider's app as `…/webhooks?module=hubspot`, with no integration id. The worker
runs it on a dry instance, reads each event's account (`webhook.account`, e.g. HubSpot's `portalId`), finds the
installations of this class connected to that account (`listIntegrationsByEntityExternalId`, then each record's
type, because one portal can also be used by integrations of other types and the worker would hydrate those as
their own class), and queues the delivery once per installation. Each installation then keeps only the events
whose account is its own.

**Delivery guarantees, stated plainly:**
- An event runs **at most once per workflow when it succeeds**, because of the claim.
- If a run fails, it releases the claim so the retry actually runs. This was a bug in the first cut, which left the
  claim behind so every retry read as "duplicate". It is now pinned by a test.
- Within a retried run, steps are **at-least-once**. If step 3 wrote to HubSpot and step 4 failed, the retry writes
  step 3 again. Idempotent capabilities (upserts, `links.find` before create) are the v0.1 answer.
- Per-step checkpointing comes after v0.1.

**A schedule fires.** `CRON` → `WF_STALE_CONTACTS`, with no event id, so there is no claim. Steps such as
`hubspot.contact.search` followed by `foreach` run in the same interpreter.

**A user clicks a button** in a UI surface. `USER_ACTION` → `WF_TEXT_FROM_CARD`, with the surface's record as
`$.record`.

**Running an installation uses Frigg's existing, authenticated routes.** None is unauthenticated:

| Route (all authenticated, all hydrate via `GetIntegrationInstance`) | Event | Data-defined handling |
|---|---|---|
| `GET /api/integrations/:id/config/options` | `GET_CONFIG_OPTIONS` | The configure form, generated from the definition (`config-form.js`); its data is the `Integration.config` shape, so what the UI PATCHes back is the config |
| `POST …/config/options/refresh` | `REFRESH_CONFIG_OPTIONS` | The same form re-filled from the values chosen so far: dependent dropdowns (`resolveOptions`) |
| `PATCH /api/integrations/:id` | `onUpdate` → `validateConfig` | NEEDS_CONFIG from the definition's required settings, checked without calling any API |
| `GET …/actions`, `POST …/actions/:id/options` | `GET_USER_ACTIONS`, `GET_USER_ACTION_OPTIONS` | Button workflows and backfills; a button's inputs are its options form |
| `POST …/actions/:id` | any registered event | Runs a button workflow (`WF_*`), a backfill (`SYNC_*_BACKFILL`) or renders a UI surface (`UI_*`, body `{ record }`) |

Data-defined apps add a few routes of their own (`router.js`, mounted by `createIntegrationRouter` only when a
registered class is data-defined). These are the only new routes, and every one is authenticated:

| Route | Who | What |
|---|---|---|
| `GET /api/data-defined/definitions` | signed-in user | The install catalogue: the latest published version of each definition |
| `GET /api/integrations/:id/upgrade?to=` | signed-in user, own installation | The upgrade plan (`planUpgrade`); changes nothing |
| `POST /api/integrations/:id/upgrade` `{ to? }` | signed-in user, own installation | Applies the plan: uninstall steps of the old version, then install steps of the new one if it asks for a reinstall, then the new config and a reload. Answers 409 with the plan when a person must supply something first |
| `GET /api/integrations/:id/runs` | signed-in user, own installation | `WorkflowRun` history, newest first (`workflowId`, `status`, `before`, `limit`) |
| `POST /api/admin/data-defined/definitions` `{ document, notes?, publish?, strict? }` | `x-frigg-admin-api-key` | Validate and publish (or save a draft). 201 created, 200 for an identical republish, 400 invalid, 409 refused |
| `GET /api/admin/data-defined/definitions/:id` | admin key | Every version, without documents |
| `POST /api/admin/data-defined/definitions/:id/versions/:version/deprecate` | admin key | `PUBLISHED` → `DEPRECATED` |

Installing needs no new route. `POST /api/integrations` with `config.definition: { id }` pins the latest published
version, and its checksum, in `onCreate`. An app that bundles its definitions (`memoryDefinitions`) has no store to
publish to, so the admin routes answer 501.

A host renderer (the HubSpot card) therefore calls Frigg through an authenticated path. Proving the host request is
genuine (HubSpot signs its UI-extension requests) is the renderer's job, not Frigg core's.

### 15. Lifecycle

| Moment | What runs | Code |
|---|---|---|
| **Install** | The customer connects both modules (the existing auth flow), picks settings, and the record is created with the pin to the latest `PUBLISHED` version. `onCreate` loads the definition and runs `lifecycle.onInstall`, for example `phone.webhook.create` pointed at this installation's webhook URL. Every install step with an `id` has its result saved to `config.runtime.installed.<id>` with `patchConfig` | `onCreate` |
| **Configure** | The customer toggles workflows, changes settings or overrides a mapping. `onUpdate` merges config, then recompiles: enabling a workflow adds its event, routes and schedule, and disabling removes them. No deploy, and no other installation is affected | `onUpdate` |
| **Update** (new version) | Nothing happens to running installations. Each stays on its pin until it is moved, as in §17 | `planUpgrade` |
| **Uninstall** | `onDelete` runs `lifecycle.onUninstall`, which reads what install created (`phone.webhook.delete` with `$.install.runtime.installed.hook.id`; a `foreach` over several webhook ids for Shopify), then the framework removes the record | `onDelete` |

`$.install` is built by one function, `installContext`, everywhere a definition runs: workflows, queries, UI
surfaces, lifecycle steps and option lists. It holds the integration settings with their defaults, `webhookUrl`,
`integrationId`, `accounts` and `runtime.installed`. The first cut built it four ways, and the query and UI versions
had no `runtime`, so a query reading an install result silently got nothing.

### 16. UI surfaces

A UI extension is a `query` plus a `view`. The view is a tree of a **fixed component set**: `Stack`, `Heading`,
`Text`, `KeyValue`, `List`, `Table`, `Badge`, `Button`, `Empty` and `Divider`. It holds no HTML and no script.

- `renderSurface` (`runtime.js`) runs the query and then `resolveView`, which substitutes expressions and expands
  lists. It returns a **resolved tree**: plain JSON with data already in it.
- Each host gets **one generic renderer, deployed once**. For example, there is one HubSpot UI-extension card that
  calls `POST /api/integrations/:id/actions/UI_<SURFACE>` (authenticated) for whatever installation it sits in and draws the tree. New surfaces and new
  integrations need no new host deployment.
- A `Button` can only point at a `userAction` workflow (checked by `validate`). A surface can therefore read data
  and trigger declared workflows, and nothing else.

The renderers themselves are not in v0.1.

### 17. Versioning (answers ADR-030 for data-defined integrations)

`versioning.js` computes the change level from the two documents, so nobody has to remember the rules.

| Level | Changes |
|---|---|
| **patch** | Steps, templates, view and query bodies, default mapping rows, labels and help text, a setting's default |
| **minor** | Additive: a new workflow (with its `default`), a new optional setting, a new sync or link set, a new or moved UI surface, a changed trigger topic, filter or schedule, a removed setting, changed lifecycle steps, changed option-list inputs |
| **major** | Anything an installation may rely on goes away or changes meaning: a removed workflow, sync or link set, a new module, a replaced module, a new required setting with no default, a setting whose type or option list changed or that became required, changed identity keys (sync or link set), a link set joining different objects, a changed sync direction, a changed trigger source |

- **`checkBump(from, to)`** refuses a publish whose declared semver bump is smaller than the computed level. Shipping
  an identity change as 1.5.0 is an error, not a review comment.
- **`planUpgrade(installation, from, to)`** returns three things for one installation:
  - `needs`: what a human must supply, such as a value for the new required setting or a connection to the new module;
  - `actions`: what the runtime will do, such as re-running `onInstall` because lifecycle changed, or rebuilding
    links because identity changed. A link set has no backfill to rebuild from, so a changed link-set identity is a
    `reindex` action that says plainly that links by id still resolve and lookups by the new keys miss until each
    pair is linked again;
  - the new `config`.

  An upgrade with unmet `needs` cannot be applied. Patches and minors with no needs can be applied in bulk.
- **Draining.** Every queued message carries `definitionVersion`. `dispatch` runs a message on the version it was
  queued under, not on the installation's new pin. In-flight work therefore finishes on the definition that started
  it, and is never re-interpreted halfway.
- **Rollback** means moving the pin back. Both versions are still published rows, so this is a config write, not a
  redeploy. A rollback across an identity change still needs the links rebuilt, and `planUpgrade` says so in the
  reverse direction too.

This is ADR-030's Path D, "version as a routing dimension outside the class", for the cost of one column.

**ADR-030's serverless concerns, answered for data-defined integrations.** ADR-030 itself stays undecided for
code-defined classes; this is the answer only where the class is the shared interpreter.

| ADR-030 concern | Data-defined answer (v0.1) |
|---|---|
| Lambda module-scope caching | Nothing version-specific is read at module scope. The definition is fetched when an installation is hydrated for an event and cached by `id@version`, so one warm Lambda serves several versions at once and a publish needs no deploy |
| In-flight SQS jobs | Every message carries `definitionVersion`, and `dispatch` runs it on that version: ADR-030's "dispatch by the payload's declared version" |
| EventBridge Scheduler entries | The rule: a scheduled run carries no version and runs on the installation's current pin, because a schedule belongs to the installation, not to the version that created it. `compile` produces each installation's `schedules`, so an upgrade that changes a cron yields a different list. **Registering that list is not built in v0.1** (§19), so this row is the contract for when it is |
| Signed webhook URLs | URLs are per installation, not per version, so an upgrade re-registers nothing. Only a change to `lifecycle.onInstall` re-runs install, and `planUpgrade` lists that as a `reinstall` action |
| Rollback | Moving the pin back is a config write (ADR-030's Path C behaviour). An identity change still needs links rebuilt in both directions, and `planUpgrade` says so |
| Global routing / edge | Unchanged: routing is by installation id, and the version is resolved at the origin from the record |
| Encryption schema | Unchanged: credentials stay in the module's entity and credential rows. A definition never holds a secret, and `$.install.accounts` exposes only fields a manifest declares |

**Relation to [ADR-013](./013-integration-version-migrations.md).** ADR-013 transforms persisted records between
versions; it explicitly deferred the version model to ADR-030. For data-defined integrations the version model is
the above, and the record migrations ADR-013 describes reduce to two things: `planUpgrade` rewrites
`Integration.config` (settings dropped or added, workflows enabled or offered, the pin moved), and an identity change
rebuilds `link:` / `idx:` rows. v0.1 performs the first and reports the second as `relink` / `reindex` actions; it
does not rebuild the rows itself.

### 18. Hosting

A hosted multi-tenant deployment runs on AWS, one sub-account per tenant, using **Shape B**. Each
tenant's stack is constant-size: one HTTP function, one webhook function, one queue worker and one queue for every
data-defined integration. Netlify was considered for the HTTP side and rejected as the primary host for this case. [ADR-028](./028-multi-provider-support.md) (multi-provider support) is the route to a Netlify provider where that is wanted:
- function time and size limits;
- no native queue;
- no per-tenant isolation boundary to match "one sub-account per tenant".

The noisy-neighbour work in §4 still applies inside a tenant: per-installation concurrency keys, and interactive
work kept apart from bulk work.

### 19. Not in v0.1

| Missing | Why it matters | Plan |
|---|---|---|
| **Sync engine**: backfill pages, ongoing deltas, two-way master and conflict rules | `SYNC_*` events compile, but `runSync` throws "not implemented in v0.1" | Reuse the existing `SYNC_PAGE` and `Process` patterns from `BaseCRMIntegration` |
| `delay`, approvals, per-module rate limits | Common in workflows; each needs durable state between steps | With step checkpointing |
| Rebuilding links after an identity change | `planUpgrade` reports `relink` / `reindex`; nothing performs it | With the sync engine, which owns backfill |
| Registering `compiled.schedules` | Schedule-triggered workflows and polling syncs compile to `CRON` events, but nothing creates the recurring schedule. Frigg's scheduler commands schedule one-time jobs, so recurring per-installation schedules need either an EventBridge schedule group per installation or one app-level tick that fans out | A design decision of its own |
| Host renderers (HubSpot card, Quo panel) | `renderSurface` returns trees that nothing draws yet | Per host |
| Real manifests | `capabilities/*.json` are mocks written to match the Api classes | Generated from, or checked against, each module's `Api` |

Their order is decided by a month of iteration on v0.1, not fixed here.

**Rate limits belong to the runtime's ports, under ADR-049.** The "per-module rate limits" item is not a definition feature. [ADR-049](./049-rate-limit-awareness.md) puts the budget in the ports: the Requester waits in process for a short wait, and pacing is its §6. A module's `static rateLimit` is descriptive only (provider facts such as windows and scope, ADR-054 §6), so a definition never states a budget. A wait too long for the Requester throws `RateLimitError`, and the queue worker defers the message to `retryAt` (frigg#657) instead of failing it and letting the queue retry. A definition run must therefore let that error through unchanged, so that §14's "a failed run releases its claim and the queue retries" is not what happens to it. The "token bucket per module and installation" in the table above is ADR-049's pacing, built there and not here.

### 20. Gaps the examples exposed, closed in v0.1

Writing 14 more examples against the first cut found seven places the format was thin. Each was closed inside v0.1:

| Gap | Was | Now |
|---|---|---|
| Links needed a sync | Two Calendly syncs that never run existed only to store links | `links[]` link sets (§8); `links.*` take `{ link }` |
| No fixed values, no merge | A `default` transform on a field that does not exist | Mapping rows with `value`; a `merge` step |
| `foreach` could not collect | Digests grew a string with `set` on every item | `collect` and `where`; `join` and `size` filters |
| Templates and views unchecked | A wrong filter or `$.data` key rendered blank at runtime | Validated statically (§11), plus unused-template warnings |
| Option lists took no inputs | Asana projects and Linear states made a required argument optional | `options: { source, with }`; `resolveOptions`; manifest `inputs` |
| No arithmetic | Code steps for cents and unix time | Named, total filters (§10); currency-aware minor units |
| No sync-only example | Every example had workflows | `pipedrive-hubspot`: one two-way sync, no workflows |

Closing them found more, each fixed and pinned by a test:
- **Install results.** `onCreate` saved only `steps.hook.id`, under a hard-coded `subscriptions.phone`. Every other
  install step's result was lost, so the Pipedrive-to-phone example, both Shopify examples and zendesk-jira would have uninstalled
  against ids nobody stored. Now `runtime.installed.<step id>` (§15).
- **Account values.** Four examples read `$.install.runtime.realmId`-style values nothing wrote. They come from the
  connected account, so manifests declare `account` fields (§9).
- **`$.install` differed by entry point** (§15).
- **Rounding.** `round: 2` turned 1.005 into 1, and `to_cents` turned 19.995 into 1999, both from binary floating
  point. Rounding is now in decimal.
- **Manifests**: three faults found by `validateManifest` (§9), and drifted JSON Schemas (transform list, required
  `source`, string-only `options`) caught by running them (§11).

Each new check was mutation-tested: 24 mutations, one per rule (a link set read as a sync, `collect` or `where`
ignored, a check switched off, currency ignored, binary rounding, install results not saved, accounts exposing every
Api property, a failed run keeping its claim, …), and every one makes the suite fail.

**Code map.** `expressions.js`, `transforms.js` and `steps.js` define the vocabulary. `interpreter.js` runs a step
list and produces the trace. `validate.js`, `manifests.js` and `compile.js` are the compile side. `runtime.js` holds
the ports, `runWorkflow`, `runQuery`, `renderSurface`, `runLifecycle`, `resolveOptions` and `installContext`.
`versioning.js` and `canonical.js` handle publishing. `data-defined-integration.js` is the bridge to
`IntegrationBase`. The schemas are in `schema/` and the tests in `tests/`. Run the tests from that directory with
`jest --config '{}' --rootDir . tests`.

## Where this leads: Frigg in other runtimes

The bigger consequence is not "fewer CloudFormation resources". **Once an integration is a portable document, the runtime is the only thing that must exist per environment.** Today Frigg's portability is limited by being Node-on-Lambda-with-SQS. A data definition is indifferent to all three. This section maps that space; choosing runtime targets is a follow-up ADR.

### What the runtime depends on today

| Port | Today | Already abstracted? |
|---|---|---|
| HTTP host | express app (`createApp`) wrapped by `serverless-http` per Lambda | **Mostly.** The express app is independent of Lambda, so `app.listen()` is a small step |
| Queue | SQS (`queues/queuer-util.js` uses `@aws-sdk/client-sqs` directly; local dev uses LocalStack) | **Not on `next`; being added.** PR #686 introduces `QueueProvider` and `QueueClientInterface` ([ADR-028](./028-multi-provider-support.md)) with SQS as the default adapter. In-process and Postgres adapters do not exist yet |
| Scheduler | EventBridge Scheduler, with `SCHEDULER_PROVIDER=mock` | **Yes**, a port with two adapters |
| Encryption | KMS or AES via `Cryptor` | **Yes** |
| Database | Prisma, MongoDB or PostgreSQL | **Yes**, for those two |
| Infrastructure | osls / CloudFormation generation | Serverless-only by design |

### Architecture: serverless vs packaged

A **packaged** runtime is one long-lived process (or a few) running the same express app, an in-process or database-backed queue, cron in place of EventBridge, and AES in place of KMS. Its queue port is the one PR #686 adds (`QueueClientInterface`), plus two adapters that do not exist yet: in-process and Postgres-backed (`SKIP LOCKED`). Nothing in a data definition knows which one it runs on. Code-defined integrations would work too. Data definitions matter more here because a packaged runtime cannot redeploy per integration change either.

### Where: cloud, edge, local, home server, Raspberry Pi

| Target | Fits | Constraints to design for |
|---|---|---|
| AWS Lambda (today) | Everything | Resource ceiling (solved above), cold starts |
| Container (ECS, Fly, Kubernetes) | Packaged runtime as-is | Needs the queue port |
| Edge (Cloudflare Workers, Lambda@Edge) | **Webhook ingress, signature validation, light single-call steps** | CPU-time limits, no long jobs, database access over HTTP or driver adapters, partial Node API support. Edge should *receive and route*, not backfill: hand heavy work to a regional queue |
| Local / home server / Raspberry Pi | Packaged runtime, SQLite or Postgres, in-process queue | OAuth redirects and inbound webhooks need public HTTPS, so a tunnel or a relay (a natural hosted service). SQLite would be a third Prisma target. Small memory favours a lean runtime |

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

- **Infrastructure stops scaling with integration count** for data-defined integrations; a product that lists many pairs fits in one stack.
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
- [ADR-023](./023-integration-templates.md): a template may ship as a definition document (see its Amendment (ADR-063))
- [ADR-021](./021-ontology.md): agent context for authoring definitions (not a field vocabulary)
- [ADR-027](./027-ssm-parameter-offload-and-env-scoping.md): per-function environment, relevant once many integrations share functions
- [ADR-013](./013-integration-version-migrations.md): record migrations between versions; §17 says what they reduce to here
- [ADR-030](./030-integration-versioning.md): versioning, which the definition store makes concrete (§17 answers its serverless concerns for data-defined integrations)
- [ADR-057](./057-canonical-schema.md) (PR #676): data-only mappings this format reuses
- [ADR-059](./059-app-level-entity-registry.md), open question 1: named registry entries are the closest existing proposal for more than one instance of a module in an app. The `modules.*.instance` key in the sketch depends on how that is resolved and is not decided here
- [ADR-056](./056-app-profiles-tenancy-entity-scopes.md): owner, `organizationId`, `visible(context)` and binding scope for workspace-specific definitions (follow-up, §5)
- [ADR-028](./028-multi-provider-support.md): provider plugins and the queue provider that the portability section builds on
- Follow-up: an ADR on runtime targets and the queue port
