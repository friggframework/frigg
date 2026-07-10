# ADR-010: Reporting as an Admin Operation

**Status**: Accepted
**Date**: 2026-07-03
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

   ```js
   // app definition — same shape as adminScripts
   const Definition = {
     name: 'my-app',
     integrations: [HubSpotIntegration, SalesforceIntegration],
     reports: [ConnectedAccountsActivity, RevenueByType],  // adopter-defined
     admin: { includeBuiltinReports: true },               // + core built-ins (integrations, usage-comparison, ...)
   };
   ```

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

   ```js
   // admin execution store — separate from the integration-scoped Process repo
   class AdminExecutionRepository {                 // every row is scope:'admin'
     async create({ kind, name, params }) { /* writes scope:'admin' only */ }
     async findById(id) { /* ... */ }
     async listByName(name, { from, to }) { /* snapshot series */ }
   }
   // hard guard, enforced at the repository boundary:
   //   ProcessRepository.find({ userId })  → scope:'user' rows only
   //   AdminExecutionRepository.*          → scope:'admin' rows only
   // neither can ever return the other's rows.
   ```

4. **Adopter reports run on stock core.** Because the runner and registry live in core and reports
   are adopter-registered definitions, an adopter ships a report from *their* repository against a
   published `@friggframework/core` — no fork, no core release per report.

5. **Structural generics exist today; feature-based usage tracking is the gap.** Core already
   exposes cross-integration generics every report can read now: status, type, version,
   module/entity count, error count, mapped-record count, created/updated timestamps, and
   credential-refresh timestamps (a usable "active" proxy). What core does **not** yet have is
   **feature-level usage tracking** — comparable counters such as records synced, webhooks received,
   or workflows invoked, accumulated per integration over time. So the comparison report's
   *structural* columns work on existing generics immediately; its *usage* columns require a generic
   usage-counter contract (emit + persist per-feature counts) and are follow-up scope. This is the
   "can do with data today vs. needs more data" split.

### Conceivable use cases

- **Core built-in:** integrations by status/type (#607); OAuth token-health; per-type error rates;
  **cross-integration usage comparison** — apples-to-apples counts (records synced, webhooks
  received, workflows invoked) per integration type, so any adopter can see how each of their
  integrations performs relative to the others. This is generically valuable to every adopter and
  therefore ships in core, not as an adopter definition. Its structural columns (status, counts,
  timestamps) run on today's generics; the usage columns depend on the feature-usage tracking in
  Decision 5.
- **Adopter, "data we have today":** connected accounts active in the last 30/60/90 days, derived
  from integration `createdAt` + credential-refresh timestamps — a few lines in one report
  definition, run async so a deployment-wide scan never blocks a request.
- **Adopter, operations:** a scheduled per-tenant operational export pushed to an external admin
  dashboard, gated by the admin key — no direct database access to each instance.

## Run Modes & Persistence

A report definition is *standing* (registered, runnable on demand). Each invocation picks a **run
mode**, and persistence follows from the mode:

| Mode | Persists | Use it for |
|---|---|---|
| **live** | nothing — compute and return inline | cheap, always-fresh queries (what #607 does today) |
| **recorded** | an execution record (input + results + logs) in the admin store | audit trail, async polling, expensive/large reports |
| **snapshot** | a recorded run retained as a point-in-time data point in a series | trends over time (30/60/90-day actives, growth) |

`live` keeps #607's behavior as a first-class mode; `recorded` and `snapshot` are what unlock
history and time-windowed metrics. A snapshot is just a recorded run tagged with a series name +
`capturedAt`; listing a series returns the trend. All three run through the **one** runner and the
isolated admin execution store from Decision 3.

**Definition** (mirrors `AdminScriptBase`; illustrative):

```js
class ConnectedAccountsActivity extends ReportBase {
  static Definition = {
    name: 'connected-accounts-activity',
    version: '1.0.0',
    description: 'Connected accounts active in the last N days, by integration type',
    runModes: ['snapshot', 'recorded', 'live'],     // allowed modes; first is the default
    inputSchema: { type: 'object', properties: {
      windowDays: { type: 'integer', enum: [30, 60, 90], default: 30 } } },
    output: { format: 'json' },                      // 'csv' | 'pdf' | 'zip' → artifact storage
    schedule: { enabled: true, cron: 'cron(0 6 * * ? *)', mode: 'snapshot' },
  };

  async execute(frigg, params) {
    const since = daysAgo(params.windowDays ?? 30);
    const byType = await frigg.report.activeIntegrationsSince(since); // generic counters (Decision 5)
    return { windowDays: params.windowDays ?? 30, byType };
  }
}
```

**Invocation** — one runner; the mode selects the persistence path:

```
POST /api/v2/reports/:name/run  { "mode":"live",     "params":{...} } → 200 inline result, nothing stored
POST /api/v2/reports/:name/run  { "mode":"recorded", "params":{...} } → 202 { executionId }; poll GET /reports/executions/:id
GET  /api/v2/reports/:name/snapshots?from=&to=                        → [ { capturedAt, summary, artifactUrl? } ]  // trend series
```

**Artifact storage** for non-JSON / large output (object storage + signed URL, never public):

```js
const exec = await adminExecutions.create({ scope: 'admin', kind: 'report', name, params, state: 'RUNNING' });
const result = await reportRunner.execute(definition, params);

if (definition.output.format === 'json') {
  await adminExecutions.complete(exec.id, { results: result });           // small payload inline in the record
} else {
  const ref = await artifactStore.put(                                     // large/binary → object storage
    `reports/${exec.id}/${name}-${stamp}.${ext}`, result.file, contentType);
  await adminExecutions.complete(exec.id, { summary: result.summary, artifact: ref });
}
// download later, time-limited, no public exposure:
const url = await artifactStore.signedUrl(exec.artifact, { expiresIn: 3600 });
```

### Derived from FreshBooks-frigg

The FreshBooks-frigg repo already runs this pattern (its `ReportRunner` + `AdminProcess` + S3).
Worth lifting, but adapt to ADR-005's hexagonal layering rather than copying its Mongoose /
direct-`aws-sdk` form:

- **Lambda-timeout-aware long runs.** Its runner checks `context.getRemainingTimeInMillis()` against
  a per-step `timeoutLimit` and **re-queues itself to resume at the next step**, chunking a job that
  exceeds the Lambda ceiling across invocations. This is the answer to "a deployment-wide scan is too
  expensive per request" — the scan runs as a `recorded`/`snapshot` job, not in the request path.
  ```js
  if (context.getRemainingTimeInMillis() < nextStep.timeoutLimit) {
    await queue.requeue({ executionId: exec.id, resumeAt: nextStep.name }); // same SQS worker resumes
    return;
  }
  ```
- **Artifact lifecycle.** `storeReportFile` (key `reports/{id}/{name}-{ts}.{ext}`, content-type per a
  `fileType` of csv/json/pdf/zip) + `generateSignedUrl` (1-hour expiry) + `getPreviousReports`
  (prior runs, newest first). That last one *is* the snapshot-series listing.
- **Parameterization for a generated UI.** Each definition carries `options: { jsonSchema, uiSchema,
  data }` and an admin UI renders the form from it. Reuse ADR-005's `inputSchema` for the same effect.
- **Multi-step / fan-out.** Handlers emit `actions.sendMessage` to a parent/child process — useful
  when a report aggregates sub-reports. Optional; only where composition is needed.

**Do not copy:** FreshBooks stores admin processes in the same datastore space as app data. Per
Decision 3, keep the admin execution store isolated from the user/integration-scoped `Process`.

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
