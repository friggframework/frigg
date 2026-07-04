# ADR-013: Integration Version Migrations

**Status**: Proposed
**Date**: 2026-07-04
**Deciders**: Sean Matthews, Daniel Klotz

## Context

"Migration" means three unrelated things in Frigg. This ADR covers exactly one:

| Type | What it changes | Home |
|---|---|---|
| **Project-scaffold migration** | An app's project structure (`create-frigg-app` → `frigg init`) | ADR-004 |
| **Database schema migration** | The persistence schema itself (Prisma) | ADR-012 |
| **Integration version migration** | Persisted integration records/config/mappings across integration versions | **this ADR** |

When an integration type ships a new **version** whose config shape, entity mapping, or behavior
differs from a prior one, the already-persisted integration **records** for that type must be
transformed from the old version to the new — distinct from evolving the database schema (ADR-012)
and from upgrading an app's scaffold (ADR-004). Example: a CRM integration moves `config.foo` →
`config.settings.foo` and re-maps stored `IntegrationMapping` entries at v1 → v2.

A working implementation exists in devtools and this ADR frames + relocates the concept:
- `packages/devtools/migrations` — `MigrationManager` (a static registry of migrator classes keyed
  by integration type), `Migrator extends Delegate` with `migrate({ fromVersion, toVersion })`, and
  `Options` (`fromVersion`, `toVersion`, `generalFunctions`, `perIntegrationFunctions`).
- A migrator validates the target against `Config.supportedVersions`, runs general functions, then
  iterates records where `config.type === name`. Per-type migrators exist (e.g. HubSpot, Salesforce).

Gaps with the current form:
- **No persisted run state** — no execution record, no resumability, no history (unlike the admin
  runner and ADR-012's S3 status).
- **Legacy layering** — built on `IntegrationManager` / `Delegate`, not the current hexagonal
  use-case/repository patterns, and it lives in `devtools` rather than core.
- **No shared versioning contract** — `supportedVersions` is ad hoc; there is no defined model for
  how integration versions are declared, compared, or gated.

## Decision

Recognize integration version migration as a **distinct, first-class concept**: transform persisted
integration records/config/mappings from a source integration version to a target version, per
integration type, **idempotently and resumably**.

1. **Run it as an admin operation on the ADR-010 / ADR-005 runner.** It is a data operation over
   records, so it belongs on the shared admin-operation substrate — persisted execution record,
   sync/async, admin auth, and the isolated admin execution store — rather than the bespoke
   `Delegate` path. This gives it the history, resumability, and timeout-aware chunking the current
   version lacks, and it inherits the same isolation guarantees (ADR-010 Decision 3).
2. **A migrator is a declared definition**, keyed by `(integrationType, fromVersion, toVersion)`,
   registered like a report/script rather than a static devtools array — so core built-ins and
   adopter-defined migrators coexist.
3. **Mapping-aware.** Migrations may re-map `IntegrationMapping`, not just `config`; the contract
   must make stored mappings first-class inputs/outputs.
4. **Relocate to core** over time, off `Delegate`, onto use-case/repository patterns.

```js
// today (devtools, Delegate-based)
const migrator = await MigrationManager.getMigrator({ integrationType: 'hubspot', fromVersion, toVersion });
await migrator.migrate({ fromVersion, toVersion });

// proposed: a declared migrator run through the admin-operation runner (illustrative)
class HubSpotV1toV2Migration extends MigrationBase {
  static Definition = { integrationType: 'hubspot', fromVersion: '1.0.0', toVersion: '2.0.0', runModes: ['recorded'] };
  async execute(frigg, params) {
    for await (const rec of frigg.integrations.ofType('hubspot', { version: '1.0.0' })) {
      await frigg.integrations.update(rec.id, remap(rec));   // config + IntegrationMapping
    }
  }
}
```

### Explicitly deferred: the versioning model

This ADR establishes the migration **concept and execution home**. It deliberately does **not**
define how integration versions themselves are declared, compared, gated, or made
backward/forward-compatible (`supportedVersions` semantics, semver policy, when a migration is
*required* vs *optional*, compatibility windows). That **integration versioning contract** is a
separate ADR, to be authored independently; this ADR keys off whatever that contract defines.

### Future iterations
- Dry-run / plan mode (reuse the ADR-010 run-mode machinery).
- Down / rollback migrations (the current `Migrator` is effectively up-only).
- Batch + fleet execution across per-tenant instances.
- Coupling to deploy (auto-detect records on an unsupported version and prompt/queue a migration).

## Consequences

### Positive
- Integration version migration gains persistence, resumability, history, and admin isolation by
  running on the shared runner instead of a one-off path.
- Core built-in and adopter-defined migrators coexist via the same registration model as reports/
  scripts.
- Consolidates a legacy `Delegate` mechanism onto current hexagonal patterns.

### Negative
- Requires porting the existing devtools migrator to core + the runner (migration work itself).
- Depends on the forthcoming versioning ADR for its version contract; partial until that lands.

### Neutral
- Moves the concept from `devtools` into the core admin-operation surface.

## Alternatives Considered
- **Keep the devtools `Delegate` migrator as-is.** Rejected: no run state/history/resumability, and
  it diverges from current architecture.
- **Fold it into database schema migration (ADR-012).** Rejected: schema migration changes the
  store; this transforms records within an unchanged schema — different lifecycle and trigger.
- **Define versioning here.** Rejected: versioning is a substantial concern of its own; kept to a
  dedicated ADR so this one stays about the migration concept.

## Related
- [ADR-004: Migration Tool Design (project scaffold)](./004-migration-tool-design.md)
- [ADR-012: Database Schema Migrations](./012-database-schema-migrations.md)
- [ADR-010: Reporting as an Admin Operation](./010-reporting-as-admin-operation.md) (shared runner + isolation)
- [ADR-005: Admin Script Runner Service](./005-admin-script-runner.md)
- Integration Versioning ADR — *to be authored separately* (defines the version contract this keys off).
- Implementation: `packages/devtools/migrations/` (`MigrationManager`, `Migrator`, `Options`).
