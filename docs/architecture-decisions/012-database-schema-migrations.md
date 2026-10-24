# ADR-012: Database Schema Migrations

**Status**: Proposed
**Date**: 2026-07-04
**Deciders**: Sean Matthews, Daniel Klotz

## Context

"Migration" means three unrelated things in Frigg. This ADR covers exactly one; the taxonomy is
stated once so the three stop being conflated:

| Type | What it changes | Home |
|---|---|---|
| **Project-scaffold migration** | An app's project structure (`create-frigg-app` → `frigg init`) | ADR-004 (CLI, build-time) |
| **Database schema migration** | The persistence schema itself (Prisma) | **this ADR** |
| **Integration version migration** | Persisted integration records/config across integration versions | ADR-013 |

Frigg persists to PostgreSQL / MongoDB / DocumentDB via Prisma, and that schema must evolve — every
new core model (e.g. `Process`, and the admin-execution and usage stores proposed in ADR-010 /
ADR-011) is a schema change. Two constraints make this non-trivial: the database is **not publicly
reachable** (Lambdas run in a VPC; the DB sits in private subnets), and migrations must run from
**CI/CD** without opening that access. Schema migration must also work when the app's own tables/
records **do not yet exist** — it is the thing that creates them — so it cannot depend on
application data (e.g. a `User` table) to track its own state.

A working implementation already exists and this ADR ratifies + frames it:
- `handlers/workers/db-migration.js` — a Lambda that runs Prisma migrations from inside the VPC via
  the shared `prisma-runner` (consistent with `frigg db:setup`).
- `handlers/routers/db-migration.js` — trigger + status HTTP endpoints for CI/CD.
- Use cases `RunDatabaseMigration`, `CheckDatabaseState`, `TriggerDatabaseMigration`,
  `GetMigrationStatus`.
- `MigrationStatusRepositoryS3` — status tracked in **S3**, deliberately with no table dependency.
- Stage selects the command (`migrate dev` vs `migrate deploy`); `DB_TYPE` selects the engine;
  errors and connection strings are sanitized before logging.

## Decision

Treat database schema migration as a **first-class, VPC-internal, Prisma-based capability owned by
core**, invoked out-of-band from deployment — **not** as an admin operation on the reporting/script
runner (ADR-010) and **not** the same thing as integration version migration (ADR-013).

1. **Runs where the DB lives.** A dedicated Lambda executes `prisma migrate` inside the VPC;
   CI/CD triggers it (direct invoke or SQS) and polls status. No public DB exposure.
2. **State in object storage, not the app DB.** Status lives in S3 (`MigrationStatusRepositoryS3`)
   so the mechanism has no chicken-and-egg dependency on the very tables it may be creating.
3. **Multi-engine.** `DB_TYPE` selects PostgreSQL / MongoDB / DocumentDB; the command differs by
   stage (`dev` vs `deploy`). *(Open: for schemaless engines "migration" is largely index/collection
   setup + data backfill — the per-engine semantics need to be spelled out.)*
4. **Credential-safe by construction.** Connection strings, keys, and tokens are scrubbed from all
   logs and error responses.
5. **Separate lifecycle.** Schema migration is a deploy-time infrastructure concern; it must not be
   folded into the admin-operation runner or the integration-version migrator.

```bash
# CI/CD triggers the in-VPC migrator; no public DB access
aws lambda invoke --function-name my-app-production-dbMigrate --region us-east-1 response.json
# → { statusCode: 200, body: { success: true, dbType: 'postgresql', stage: 'production', migrationCommand: 'deploy' } }
```

```js
// worker wiring (today): use case + S3 status repo + injected prisma-runner
const migrationStatusRepository = new MigrationStatusRepositoryS3(bucketName);
const runMigration = new RunDatabaseMigrationUseCase({ prismaRunner, migrationStatusRepository });
```

### Future iterations
- **Pre-traffic gating** — hold new deploys/traffic until the target schema is confirmed applied.
- **History & observability** — surface migration runs/status through the ADR-010 reporting layer
  (read-only), without coupling the *execution* path to it.
- **Plan / dry-run** and a **rollback** strategy (Prisma has limited down-migration support).
- **Per-engine semantics** for Mongo/DocumentDB (index/collection setup, data backfills).
- **Fleet coordination** — sequencing schema migrations across many per-tenant instances.

## Consequences

### Positive
- Migrations run securely inside the VPC, driven by CI/CD, with no public DB access.
- S3-based status avoids a bootstrap dependency on application tables.
- One consistent, multi-engine, credential-safe path shared with `frigg db:setup`.

### Negative
- An extra Lambda + S3 bucket + trigger/status surface to operate.
- Prisma's weak down-migration story pushes rollback into "future iterations."
- Schemaless engines need bespoke "migration" semantics.

### Neutral
- Establishes S3 (not the app DB) as the migration-state store of record.
- Ratifies existing code as the standard rather than introducing new mechanism.

## Alternatives Considered
- **Migrate on app cold-start / bootstrap.** Rejected: cold-start cost and concurrency races across
  Lambdas; unsafe for production traffic.
- **Manual `prisma migrate` against the DB.** Rejected: the DB isn't publicly reachable, and manual
  runs aren't auditable or CI/CD-friendly.
- **Run schema migration through the admin-operation runner (ADR-010).** Rejected: that runner
  assumes the schema/records already exist; schema migration must run before them and cannot depend
  on app tables for its own state.

## Related
- [ADR-004: Migration Tool Design (project scaffold)](./004-migration-tool-design.md)
- [ADR-013: Integration Version Migrations](./013-integration-version-migrations.md)
- [ADR-010: Reporting as an Admin Operation](./010-reporting-as-admin-operation.md) (history surfacing, read-only)
- Implementation: `packages/core/handlers/{workers,routers}/db-migration.js`,
  `packages/core/database/use-cases/*migration*`, `.../repositories/migration-status-repository-s3.js`
