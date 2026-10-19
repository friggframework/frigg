# Data-defined integrations (v0.1)

ADR-063, implemented to the point where a definition can be validated, compiled into Frigg events, executed, rendered
and versioned. An integration becomes a **document** (what it connects, what it syncs, which workflows and UI it has)
run by **one** runtime class, instead of a hand-written class per integration.

```
definition (JSON, immutable per version)  ─┐
capability manifests (one per API module) ─┼─ validate ─ compile ─▶ this.events  (same shape as hand-written)
installation (Integration.config)         ─┘                          │
                                                event arrives ─▶ runWorkflow ─▶ steps ─▶ Api methods
```

## Layout

| Path | What |
|---|---|
| `schema/integration-definition.v0.1.schema.json` | The definition format (JSON Schema 2020-12) |
| `schema/capability-manifest.v0.1.schema.json` | What an API module declares it can do |
| `schema/installation.v0.1.schema.json` | `Integration.config` for a data-defined installation |
| `schema/records.md` | Database records: definition versions, installation, mappings, workflow runs |
| `capabilities/*.capabilities.json` | Mock manifests (HubSpot, Phone, and the apps the examples use) |
| `examples/*.definition.json` | Example definitions; `examples/records/` has Phone ↔ HubSpot database records |
| `expressions.js` | `$.ref`, `{{template \| filter}}` and conditions. No eval. |
| `steps.js`, `interpreter.js`, `transforms.js` | The step catalogue and the interpreter |
| `validate.js` | Structure + cross-references against the manifests (steps, templates, views, settings, `$.install`) |
| `manifests.js` | `validateManifest`: the manifests themselves (kinds, option lists, account fields) |
| `compile.js` | Definition + installation → events, webhook routes, schedules, user actions |
| `runtime.js` | Ports (Api calls, link store), `runWorkflow`, `runQuery`, `renderSurface`, `runLifecycle`, `resolveOptions`, `installContext` |
| `versioning.js` | `diff`, `checkBump`, `planUpgrade` |
| `data-defined-integration.js` | `defineIntegrationClass`: the IntegrationBase subclass that runs it all |
| `use-cases/definition-use-cases.js` | Publish, deprecate, catalogue, history, upgrade plan; `createDefinitionCatalog()` (the store the runtime reads) |
| `repositories/` | `IntegrationDefinitionVersion` and `WorkflowRun` rows (MongoDB, PostgreSQL, DocumentDB) |
| `router.js` | The publish, catalogue, upgrade and run-history routes |

## The pieces of a definition

- **modules** — module keys used everywhere else (`phone`, `hubspot`), each naming a capability manifest.
- **settings** — integration-level choices (`fromNumber`); workflows can declare their own. An option setting draws
  its choices from a module's option list, and may pass it inputs read from earlier choices
  (`{ "source": "asana.project", "with": { "workspaceGid": "$.settings.workspace" } }`); `resolveOptions` fills the
  dropdown and returns nothing until those inputs are chosen.
- **syncs** — records kept as copies on both sides: identity keys, field mapping (with transforms and master rules),
  backfill and ongoing mode. A sync maintains the link + identity index every workflow uses (`links.find`).
  A definition can have no workflows at all (`pipedrive-hubspot` is sync only).
- **links** — link sets: records on two modules known to be the same thing, with no sync behind them (a Calendly
  invitee and the Salesforce Lead it booked as). Same storage and identity index as a sync, addressed as
  `links.find { link: "people", ... }`.
- **workflows** — trigger (`webhook`, `schedule`, `userAction`, `syncRecord`) + steps. Default on or off.
- **queries** — read-only steps that return data, used by UI surfaces.
- **ui** — a surface in a host app (`hubspot` `crm.record.sidebar`): a query for data and a view tree from a fixed
  component set. A generic renderer deployed once per host draws it; changing the card is a publish, not a deploy.
- **templates** — message bodies. **lifecycle** — steps run on install / uninstall (webhook subscriptions). Each
  `onInstall` step with an `id` keeps its result as `$.install.runtime.installed.<id>`, which is how `onUninstall`
  deletes exactly what install created.

## How it plugs into Frigg

- **Hydration**: Frigg's use cases call `initialize()` on every hydrated integration; the class loads its pinned
  definition there.
- **Webhooks**: install steps register `$.install.webhookUrls.<key>` (the URL names the module). The manifest's
  `webhook` block (`webhooks.js`) splits batches and reads each event's topic, id and account; `verify` must return
  true; handshakes are answered at receipt. App-level webhooks (`webhook.scope: "app"`, one URL per provider app)
  are fanned out to the installations connected to each account.
- **Routes**: Frigg's existing authenticated ones. `GET/POST /api/integrations/:id/config/options[/refresh]` is the
  generated configure form (dependent dropdowns on refresh); `POST /api/integrations/:id/actions/:event` runs a
  button workflow (`WF_*`), a backfill, or renders a UI surface (`UI_*`, body `{ record }`).

`$.install` is the same everywhere a definition runs: integration settings, `webhookUrl`, `integrationId`,
`runtime.installed`, and `accounts.<module key>.<field>` — values about the connected account that the module's
manifest declares under `account` (`$.install.accounts.quickbooks.realmId`). Nothing undeclared is exposed.

## Publishing, installing, upgrading

Definitions live in the `IntegrationDefinitionVersion` table (Prisma models in both schemas, PostgreSQL migration
`20261018000000_add_data_defined_integrations`), and runs in `WorkflowRun`. Point the class at the store:

```js
const { defineSharedIntegrationClass, createDefinitionCatalog } = require('@friggframework/core/integrations/data-defined');
// A database store is read asynchronously, so it goes with the shared class (one class, every definition).
const DataDefined = defineSharedIntegrationClass({ definitions: createDefinitionCatalog(), manifests, modules });
```

| Route | Auth | |
|---|---|---|
| `POST /admin/integrations/definitions` `{ document, notes?, publish?, strict? }` | admin key | Validate (both layers) and publish, or save a draft with `publish: false` |
| `GET /admin/integrations/definitions/:id` | admin key | Version history |
| `POST /admin/integrations/definitions/:id/versions/:v/deprecate` | admin key | Stop new installs of a version |
| `GET /api/data-defined/definitions` | user | What can be installed |
| `POST /api/integrations` with `config: { type, definition: { id } }` | user | Install; pins the latest published version and its checksum |
| `GET` / `POST /api/integrations/:id/upgrade` `{ to? }` | user | Plan / apply an upgrade (409 with the plan while something is needed) |
| `GET /api/integrations/:id/runs` | user | Run history, newest first |

Published versions cannot change. Publishing a document that is identical to a published one returns that row. A
different document at the same version is refused. So is a version that is not newer than the latest, and so is a
semver bump smaller than the changes. Publishing goes through a conditional write, so two concurrent publishes of one
version cannot both win. With `memoryDefinitions()` (definitions bundled in the app) the admin routes answer 501.

## Steps (v0.1)

Built-ins: `links.find`, `links.upsert`, `map`, `merge`, `template`, `set`, `stop`, `foreach` (≤1000), `branch`, `code`.

- `map` rows read a `source` field or write a fixed `value` (`{ "target": "Line[0].DetailType", "value": "SalesItemLineDetail" }`).
- `merge` deep-merges objects (later wins, lists replaced).
- `foreach` takes `where` (skip items, checked before the cap) and `collect` (the step's result becomes one value per
  item, which may read that iteration's steps); `do` is optional when `collect` is set. A digest is
  `collect` + `{{steps.lines | join: '\n'}}`, not a string grown with `set`.
- Template filters include arithmetic as named, total functions: `plus`, `minus`, `times`, `divided_by`, `round`,
  `abs`, `number`, `to_cents` / `from_cents`, `to_minor_units` / `from_minor_units` (currency-aware: JPY has no minor
  unit, KWD three), `from_unix` / `to_unix`, and `join`, `size`, `first`. Bad input gives blank, never a throw. A
  string that is exactly one tag keeps the value's type, so `"{{item.Amount | to_cents}}"` is the number 2000.
Everything else is `<moduleKey>.<object>.<verb>`, a capability the module's manifest declares and maps to one Api
method. There is no http, script or eval step. `code` calls a named, versioned function shipped in reviewed code
(`@scope/pkg#fn@1.2.0`) for logic that does not fit steps. Per step: `when` (skip), `onError`
(`fail` → the queue retries the run, `continue`, `stop`).

## Versioning

Published versions are immutable and each installation pins one. `checkBump` refuses a release whose declared semver
bump is smaller than its changes (patch: steps/templates/view/mapping; minor: additive, including a new link set or
changed option-list inputs; major: removed workflow or link set, required setting, identity change, new module). `planUpgrade` lists what a person must supply first and what the
runtime does (enable/disable workflows, rebuild links, re-run install steps). Queued messages carry the version
they were routed under and finish on it.

## Running the tests

```bash
npx jest --config '{}' --rootDir packages/core/integrations/data-defined tests
```

`tests/persistence.test.js` runs the repositories and the publish rules against real databases. Each leg runs only
when its URL is set. Point them at a migrated PostgreSQL database and a MongoDB replica set with the schema pushed:

```bash
DATA_DEFINED_POSTGRES_URL=postgresql://… DATA_DEFINED_MONGO_URL=mongodb://… npx jest … tests
```

## Validating

Validation is two layers, and a document is valid only when both pass (`schema-check.js`):

1. **JSON Schema** (`schema/*.schema.json`): the published shape.
2. **References** (`validate.js`, `manifests.js`): what a schema cannot see — steps name declared capabilities,
   `$.steps.x` is an earlier step, view paths exist, option inputs are declared, `$.install` paths resolve.

```bash
npm run validate:definitions --workspace @friggframework/core          # bundled manifests + examples
node packages/core/integrations/data-defined/scripts/validate.js my.definition.json --strict
node packages/core/integrations/data-defined/scripts/validate.js --manifests ./capabilities --json defs/
```

Exit codes: `0` valid, `1` invalid (or a warning with `--strict`), `2` could not run (unreadable JSON, missing file,
unknown option, `ajv` not installed). Manifests are checked first and an invalid manifest fails the run, because a
definition is only as trustworthy as the manifests it is checked against.

`ajv` comes from the monorepo root (`@friggframework/schemas` depends on it); core's runtime stays dependency-free and
loads it only for validation. `tests/schemas.test.js` runs both layers over every example and manifest and drives the
CLI as a child process; it fails, rather than skips, if `ajv` is missing. Core's `npm test`, and so CI's
`npm run test:all`, runs it on every change.

## Not in v0.1

- The sync engine (backfill pages, ongoing deltas, two-way master rules) — specified by the schema, to be executed by
  the existing `SYNC_PAGE` pattern. `runSync` throws until then.
- `delay` / wait steps, approvals that pause a run, and per-tenant rate limits.
- The host renderers (the HubSpot app extension and Phone panel that draw `renderSurface` output).
- Registering `compiled.schedules` as recurring schedules (Frigg's scheduler commands are one-time jobs). They compile
  today; nothing creates them yet.
- Rebuilding `link:` / `idx:` rows after an identity change; `planUpgrade` reports it as `relink` / `reindex`.
