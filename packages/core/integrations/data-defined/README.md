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
| `validate.js` | Structure + cross-references against the manifests |
| `compile.js` | Definition + installation → events, webhook routes, schedules, user actions |
| `runtime.js` | Ports (Api calls, link store), `runWorkflow`, `runQuery`, `renderSurface`, `runLifecycle` |
| `versioning.js` | `diff`, `checkBump`, `planUpgrade` |
| `data-defined-integration.js` | `defineIntegrationClass`: the IntegrationBase subclass that runs it all |

## The pieces of a definition

- **modules** — module keys used everywhere else (`quo`, `hubspot`), each naming a capability manifest.
- **settings** — integration-level choices (`fromNumber`); workflows can declare their own.
- **syncs** — records kept as copies on both sides: identity keys, field mapping (with transforms and master rules),
  backfill and ongoing mode. A sync maintains the link + identity index every workflow uses (`links.find`).
- **workflows** — trigger (`webhook`, `schedule`, `userAction`, `syncRecord`) + steps. Default on or off.
- **queries** — read-only steps that return data, used by UI surfaces.
- **ui** — a surface in a host app (`hubspot` `crm.record.sidebar`): a query for data and a view tree from a fixed
  component set. A generic renderer deployed once per host draws it; changing the card is a publish, not a deploy.
- **templates** — message bodies. **lifecycle** — steps run on install / uninstall (webhook subscriptions).

## Steps (v0.1)

Built-ins: `links.find`, `links.upsert`, `map`, `template`, `set`, `stop`, `foreach` (≤1000), `branch`, `code`.
Everything else is `<moduleKey>.<object>.<verb>`, a capability the module's manifest declares and maps to one Api
method. There is no http, script or eval step. `code` calls a named, versioned function shipped in reviewed code
(`@scope/pkg#fn@1.2.0`) for logic that does not fit steps. Per step: `when` (skip), `onError`
(`fail` → the queue retries the run, `continue`, `stop`).

## Versioning

Published versions are immutable and each installation pins one. `checkBump` refuses a release whose declared semver
bump is smaller than its changes (patch: steps/templates/view/mapping; minor: additive; major: removed workflow,
required setting, identity change, new module). `planUpgrade` lists what a person must supply first and what the
runtime does (enable/disable workflows, rebuild links, re-run install steps). Queued messages carry the version
they were routed under and finish on it.

## Running the tests

```bash
npx jest --config '{}' --rootDir packages/core/integrations/data-defined tests
```

## Not in v0.1

- The sync engine (backfill pages, ongoing deltas, two-way master rules) — specified by the schema, executed by the
  existing `SYNC_PAGE` pattern in v0.2. `runSync` throws until then.
- `delay` / wait steps, approvals that pause a run, and per-tenant rate limits.
- Publishing endpoints and the `IntegrationDefinitionVersion` / `WorkflowRun` Prisma models (proposed in `schema/records.md`).
- The host renderers (the HubSpot app extension and Quo panel that draw `renderSurface` output).
