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
| `capabilities/*.capabilities.json` | Mock manifests (HubSpot, Quo, and the apps the examples use) |
| `examples/*.definition.json` | Example definitions; `examples/records/` has Quo ↔ HubSpot database records |
| `expressions.js` | `$.ref`, `{{template \| filter}}` and conditions. No eval. |
| `steps.js`, `interpreter.js`, `transforms.js` | The step catalogue and the interpreter |
| `validate.js` | Structure + cross-references against the manifests (steps, templates, views, settings, `$.install`) |
| `manifests.js` | `validateManifest`: the manifests themselves (kinds, option lists, account fields) |
| `compile.js` | Definition + installation → events, webhook routes, schedules, user actions |
| `runtime.js` | Ports (Api calls, link store), `runWorkflow`, `runQuery`, `renderSurface`, `runLifecycle`, `resolveOptions`, `installContext` |
| `versioning.js` | `diff`, `checkBump`, `planUpgrade` |
| `data-defined-integration.js` | `defineIntegrationClass`: the IntegrationBase subclass that runs it all |

## The pieces of a definition

- **modules** — module keys used everywhere else (`quo`, `hubspot`), each naming a capability manifest.
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

`$.install` is the same everywhere a definition runs: integration settings, `webhookUrl`, `integrationId`,
`runtime.installed`, and `accounts.<module key>.<field>` — values about the connected account that the module's
manifest declares under `account` (`$.install.accounts.quickbooks.realmId`). Nothing undeclared is exposed.

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

`tests/schemas.test.js` runs every example and manifest through the JSON Schemas with `ajv` (installed at the
monorepo root by `@friggframework/schemas`). It fails, rather than skips, if `ajv` is missing.

## Not in v0.1

- The sync engine (backfill pages, ongoing deltas, two-way master rules) — specified by the schema, to be executed by
  the existing `SYNC_PAGE` pattern. `runSync` throws until then.
- `delay` / wait steps, approvals that pause a run, and per-tenant rate limits.
- Publishing endpoints and the `IntegrationDefinitionVersion` / `WorkflowRun` Prisma models (proposed in `schema/records.md`).
- The host renderers (the HubSpot app extension and Quo panel that draw `renderSurface` output).
- Registering `compiled.schedules` as recurring schedules (Frigg's scheduler commands are one-time jobs), and mounting
  `compiled.routes` (`GET /ui/<surface>`). Both compile today; nothing serves them yet.
- Rebuilding `link:` / `idx:` rows after an identity change; `planUpgrade` reports it as `relink` / `reindex`.
