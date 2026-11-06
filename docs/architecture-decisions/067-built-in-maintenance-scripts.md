# ADR-067: Built-in Maintenance Scripts

**Status**: Proposed
**Date**: 2026-11-04
**Deciders**: Daniel Klotz, Sean Matthews

## Context

ADR-005 gives adopters an admin script runner with database access through commands, an admin
API key, execution records, and EventBridge scheduling. Its README says that integration health
checks and OAuth token refresh are typical uses, and also: "You write these — none ship built-in."

So every adopter writes the same scripts again. A production Frigg app now carries its own copies
of:

- a **health check** that calls `testAuth` on every integration,
- a **token refresher** that keeps refresh tokens alive before the provider expires them,
- a **recovery sweep** that re-tests `ERROR` integrations and re-enables the healthy ones,
- a **Lambda version pruner**, because every deploy adds a version and the account has a code
  storage quota.

Each copy has the same defects to find and fix one at a time. One adopter's recovery sweep
re-enabled integrations whose setup had never finished, because `ERROR` meant both "auth failed"
and "setup failed" (ADR-066 now separates these).

Without a scheduled health check, an integration's real state is known only when something
happens to touch its credential. In one incident, a webhook migration refreshed the token of every
install of a provider. Many installs went to `ERROR` on the same day, all of them accounts with no
active plan. They had been dead for weeks. The status counts showed a sudden negative trend that
was weeks old, and it took a manual investigation to explain.

ADR-010 already solved the same problem for reports: core ships built-in reports, and an app opts
in. This ADR does the same for maintenance scripts.

## Decision

`@friggframework/admin-scripts` ships a small set of **built-in maintenance scripts**
(`source: 'BUILTIN'`). An app opts in to each one by name. Registration and scheduling stay two
separate steps, as ADR-005 requires.

### 1. Opt-in by name

```javascript
const Definition = {
    name: 'my-app',
    integrations: [HubSpotIntegration, SalesforceIntegration],
    adminScripts: [MyHealingScript],

    admin: {
        enableScheduling: true,
        includeBuiltinReports: true,
        builtinScripts: [
            'integration-health-check',
            'oauth-token-keepalive',
            'errored-integration-recovery',
            'lambda-version-pruning',
        ],
    },
};
```

- Reports are read-only, so `includeBuiltinReports` is a boolean. Maintenance scripts write, so
  each one is opted in by name. A new built-in in a later core release is never active until an
  app lists it.
- `bootstrap.js` registers the listed scripts next to the app's own `adminScripts`. An unknown
  name fails app definition validation (ADR-051) at deploy time, not at run time.
- **Registered does not mean scheduled.** An admin activates a recurring run with
  `PUT /admin/scripts/:name/schedule`, as for any other script (ADR-005).

### 2. The first four scripts

| Script | What it does | Writes |
|---|---|---|
| `integration-health-check` | For each `ENABLED` or `ERROR` integration, runs `testAuth` on every module (a refresh happens if needed), then reconciles status and reason (ADR-066). | `status`, `statusReason` |
| `oauth-token-keepalive` | Refreshes the credentials that have had no refresh in `maxIdleDays` (input, default 30), so a provider does not expire an unused refresh token. Uses the single-flight refresh path (ADR-031, ADR-042). | `Credential.data` |
| `errored-integration-recovery` | Re-tests `ERROR` integrations whose reason is recoverable without the user (`PAYMENT_REQUIRED`, `UNCLASSIFIED`). Sets `ENABLED` only when every module passes. Never touches `CONFIG_INCOMPLETE` or `CREDENTIAL_REVOKED`. | `status`, `statusReason` |
| `lambda-version-pruning` | Deletes the published versions of this app's functions, except the newest `keep` (input, default 3) and any version an alias points to. | Lambda versions |

`integration-health-check` and `errored-integration-recovery` overlap: the health check already
re-tests `ERROR` rows. The recovery script exists for apps that want a frequent, narrow pass over
`ERROR` rows without a full fleet check. See Open Question 1.

### 3. One contract for every built-in

Every built-in script must:

- **Accept `dryRun`** and, in a dry run, return the same summary with no writes.
- **Be idempotent.** A second run with no change in the world writes nothing.
- **Bound its work.** Process integrations in pages through `queueScriptBatch`, with a
  per-module concurrency limit, so a fleet-wide run does not hit provider rate limits or the
  Lambda timeout.
- **Return a summary** with counts per outcome (for example `{ checked, healthy, flippedToError:
  { PAYMENT_REQUIRED: 12 }, recovered, skipped }`). The summary is stored on the execution record.
- **Emit telemetry** (ADR-011) with the script name and the outcome as tags.
- **Filter by input.** Accept `integrationTypes` and `integrationIds` so an admin can run a
  script on one provider or one integration.

### 4. Extra permissions only when opted in

`lambda-version-pruning` needs `lambda:ListVersionsByFunction`, `lambda:ListAliases` and
`lambda:DeleteFunction` on the app's own function ARNs. `AdminScriptBuilder` adds this IAM
statement only when the app lists the script. The other three scripts use only the database
commands and outbound HTTP that the admin worker already has.

## Consequences

### Positive

- An app turns on a fleet health check with one line and one schedule, instead of a new script.
- Dead integrations are found by a schedule, not by the next incident that refreshes their
  tokens. The status counts follow reality day by day.
- Fixes to these scripts reach every adopter with a core upgrade.
- The scripts consume ADR-066 reasons, so recovery cannot re-enable an integration that was
  never set up.

### Negative

- More code in `@friggframework/admin-scripts` that core must maintain and test against both
  databases.
- A fleet-wide health check sends one or more provider calls per integration per run. Adopters
  must pick a schedule that fits their providers' rate limits.
- `lambda-version-pruning` is an infrastructure script inside a data-oriented runner. If more
  infrastructure scripts appear, they may belong in a Core Extension (ADR-017) instead.

### Neutral

- App-defined scripts keep working with no change. An app can keep its own version of a
  built-in, under a different name.
- The four names are reserved. An app script with the same name fails validation.

## Alternatives Considered

1. **Leave it to adopters** (the current state). Every app repeats the same scripts and the same
   defects.
2. **Ship them as Core Extensions** (ADR-017). Extensions do not yet have a runtime, and these
   scripts need what the admin runner already provides: commands, admin auth, execution records,
   batching and scheduling. A Core Extension can wrap them later.
3. **Opt in with one boolean**, like `includeBuiltinReports`. Rejected because these scripts
   write. A core upgrade must not activate a new writing script without the app's consent.
4. **Declare a schedule in code.** ADR-005 decided against code-defined schedules: nothing runs
   unless an admin activates it. This ADR keeps that rule.
5. **Run health checks inside the integration's own cron** (`ONGOING_SYNC`). This couples a
   fleet-wide concern to each integration class, and the integration scheduler is one-shot only.

## Open Questions

1. Merge `errored-integration-recovery` into `integration-health-check` with a `statuses` input?
   One script is less to maintain. Two scripts let an app schedule the narrow pass more often.
2. Should a built-in script's `Definition` carry a `suggestedSchedule` that the Management UI
   pre-fills? It would never activate by itself.
3. Do we need a fifth script now, for example webhook subscription renewal? Proposal: no. Renewal
   is provider-specific and belongs to API Module Extensions (ADR-019).

## Related

- [ADR-005](./005-admin-script-runner.md): admin script runner and scheduling
- [ADR-010](./010-reporting-as-admin-operation.md): built-in reports, the model for this ADR
- [ADR-011](./011-integration-telemetry-and-usage-tracking.md): telemetry
- [ADR-017](./017-core-extensions.md): Core Extensions
- [ADR-031](./031-concurrent-oauth-credential-refresh.md), [ADR-042](./042-in-process-single-flight-token-refresh.md): token refresh
- [ADR-051](./051-app-definition-validation.md): app definition validation
- [ADR-066](./066-integration-status-reason.md): status reason
