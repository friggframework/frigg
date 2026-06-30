# ADR-010: Reporting as an Admin Operation

**Status**: Proposed
**Date**: 2026-06-30
**Deciders**: Daniel Klotz, Sean Matthews

## Context

Two adjacent capabilities have been built independently:

- **Admin Script Runner** (ADR-005, accepted): adopters and core register operations via
  `adminScripts: []` in the app definition; each extends `AdminScriptBase` (mirroring
  `IntegrationBase`); a `ScriptRunner` executes them sync or async over SQS, with a dedicated
  admin API key, a separate `ScriptExecutionRepository`, and EventBridge scheduling.
- **Reporting API** (PR #607, on `next`): a read-only `/api/v2/reports/integrations` endpoint.
  It is a self-contained silo — its own router, its own repository triad, its own API key — that
  reuses **none** of the script-runner primitives. It exposes exactly one hardcoded report;
  adding another requires editing and republishing `@friggframework/core`.

These are the same shape of problem — *a deployment-wide admin operation that reads/derives data,
runs sync or scheduled, and is gated by an admin key* — solved twice. A report is just a script
whose output is the payload. Left as-is, every new report is a core release, and adopters cannot
ship their own reports against an off-the-shelf core.

Separately, the `Process` model (`packages/core/integrations/repositories/`) is **user- and
integration-scoped**. Admin operations are **cross-integration and deployment-wide**; their records
must never surface in an end-user-scoped query.

### Scope boundary (what this ADR is *not* about)

"Migration" names three unrelated things; none are admin operations under this ADR:

1. **Project-scaffold migration** — `create-frigg-app` → `frigg init` (ADR-004, CLI, build-time).
2. **Prisma/db schema migration** — `handlers/workers/db-migration.js` (deploy-time infra).
3. **Integration *data* version migration** — `devtools` `Migrator` (per-integration record
   upgrades). This *could* later run as an admin operation, but is out of scope here.

## Decision

**Treat reporting as an admin operation — a sibling of admin scripts — on shared primitives.**

1. **One registry, two sources.** Reports register via `reports: []` in the app definition,
   exactly like `adminScripts`. **Core ships built-in reports; adopters define their own.** Both
   are discovered, listed, and executed through the same runner. PR #607's integrations report
   becomes the first built-in report definition, not a bespoke endpoint.

2. **`ReportBase` mirrors `AdminScriptBase`.** A report is a definition (`name`, `version`,
   `description`, optional `inputSchema`/`outputSchema`, optional `schedule`) with an `execute`
   method receiving the same admin helper (`AdminFriggCommands`) and returning a structured
   payload. Reports reuse the runner, admin API key, sync/async execution, and scheduling defined
   in ADR-005 rather than reintroducing them.

3. **Shared admin execution store, isolated from end users.** Admin operation records (script and
   report executions) persist in their **own table/namespace** — extending ADR-005's
   `ScriptExecutionRepository` rather than the integration-scoped `Process` model. Admin records
   are a distinct type, not a row in a user's process list. Whether implemented as a separate table
   or a discriminated (`scope: 'admin'`) partition, the repository layer **must guarantee that a
   user-context query can never return an admin record**, and vice versa. This isolation is the
   reason admin operations are not folded into `Process`.

4. **Adopter reports run on stock core.** Because the runner and registry live in core and reports
   are adopter-registered definitions, an adopter ships a report from *their* repository against a
   published `@friggframework/core` — no fork, no core release per report.

### Conceivable use cases

- **Core built-in:** integrations by status/type (#607); OAuth token-health; per-type error rates.
- **Adopter, "data we have today":** connected accounts active in the last 30/60/90 days, derived
  from integration `createdAt` + credential-refresh timestamps — a few lines in one report
  definition, run async so a deployment-wide scan never blocks a request.
- **Adopter, product analytics:** apples-to-apples usage across integration types (records synced,
  webhooks received, workflows invoked) so a Frigg adopter can compare how each of their
  integrations is performing.
- **Adopter, operations:** a scheduled per-tenant operational export pushed to an external admin
  dashboard, gated by the admin key — no direct database access to each instance.

## Consequences

### Positive
- One mental model and one set of primitives for all admin operations; new reports are config, not
  a core release.
- Adopters extend reporting without forking core; ad-hoc admin queries become durable, versioned
  report definitions instead of throwaway scripts.
- Async + scheduling come for free, addressing the cost of deployment-wide scans.
- Admin/user isolation is explicit and enforced at the repository boundary.

### Negative
- #607's standalone reporting router/repository must be refactored onto the runner (one-time cost;
  its repository logic is largely reusable as the first report definition).
- A second persistence concern (admin execution store vs. integration `Process`) to keep distinct.

### Neutral
- The dedicated reporting API key collapses into the admin API key (ADR-005); one admin auth model.
- Reporting moves from "a feature in core" to "a capability adopters populate."

## Alternatives Considered

- **Keep reporting as its own subsystem (status quo).** Rejected: duplicates the runner, auth, and
  (eventually) job/scheduling machinery already accepted in ADR-005, and locks every report behind
  a core release.
- **Fold reporting into the per-user integration router.** Rejected: mixes a user-scoped auth model
  with deployment-wide admin reads and reintroduces the bleed-over risk decision #3 prevents.
- **Reuse the integration `Process` model for admin records.** Rejected for isolation: that model is
  user/integration-scoped; admin operations are cross-integration and must not be reachable from
  user context.

## Related
- [ADR-005: Admin Script Runner Service](./005-admin-script-runner.md)
- [ADR-004: Migration Tool Design](./004-migration-tool-design.md)
- Reporting API (PR #607): `packages/core/reporting/`
- Integration `Process` model: `packages/core/integrations/repositories/`
