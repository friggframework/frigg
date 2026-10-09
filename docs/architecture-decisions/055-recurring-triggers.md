# ADR-055: Recurring Triggers

**Status**: Proposed
**Date**: 2026-10-03
**Deciders**: Sean Matthews

> **Proposed.** Recurring triggers are part of the stable one-file path that ships in 2.0.1
> ([ADR-054](./054-one-file-integrations.md), *Decisions so far*). This ADR records the
> mechanism for review. Per ADR-043 (open PR #646) it stays a draft PR until accepted.

## Context

Integrations need work that repeats: poll a system that has no webhooks, run a delta sync,
renew or reconcile webhook subscriptions, and refresh a cache. Frigg documents a `CRON` event
type, but it does not implement one.

| Finding | Evidence (`next`, 747a479f) |
|---|---|
| `CLAUDE.md` and `docs/guides/INTEGRATION-PATTERNS.md:355,719` show `{ type: 'CRON', schedule: 'rate(15 minutes)' }` in `this.events`. | — |
| Core has only `LIFE_CYCLE_EVENT` and `USER_ACTION`. Nothing reads `CRON` or `schedule`. | `integrations/integration-base.js:40-43` |
| `this.events` is set in the constructor, so devtools cannot see it at build time. | `devtools/.../integration-builder.js` reads only `Definition` |
| Core schedules only one-time `at(...)` jobs to SQS. They are deleted after they run. | `infrastructure/scheduler/eventbridge-scheduler-adapter.js:45-77` |
| Admin scripts have recurring `cron(...)` schedules. They are created at runtime, one per script, and target a Lambda. | `admin-scripts/src/adapters/aws-scheduler-adapter.js:89` |
| The scheduler is provisioned only with `scheduler.enable` or `webhooks: true`. | `devtools/.../scheduler-builder.js:29-44` |
| ADR-032 leaves EventBridge jobs to `onDelete` because the framework cannot list them. | ADR-032 Decision table |

Production apps work around the gap with a one-time job that schedules the next one. If a run
fails before it re-schedules, the chain is lost. Apps then add a repair process, which runs to
about 280 lines in one production app, with DST and conflict handling. The two-way sync sketch
in ADR-054 needs about 60 lines for this even without repair.

## Decision

Add **recurring triggers**. They are declared statically on the integration `Definition` (or
contributed by an extension). Devtools provisions one schedule per integration. At each tick
the framework fans out to the ENABLED instances that are due. No per-instance schedule exists.

### 1. Declaration

```js
defineIntegration({
    // ...
    modules: { crm: use(hubspot), erp: use(erp) },
    triggers: {
        pollErp: {
            every: (config) => config.pollEvery,   // '5m' | '15m' | '1h' | ..., or a constant
            tick: '5m',                            // optional: provisioned granularity (default: see §2)
            when: (config) => config.direction !== 'crm->erp',  // optional instance filter
            overlap: 'skip',                       // 'skip' (default) | 'allow'
            handler: async (payload, { modules: { erp, crm }, config, log }) => {
                /* poll erp, write to crm */
            },
            // or, with @friggframework/core/experimental, the paged form (ADR-054 §6):
            // pages: { from: 'erp', object: 'contact', since: 'watermark' },
            // handler: (records, ctx) => push(records, 'erp', 'crm', ctx),
        },
        dailyDigest: {
            at: 'cron(0 8 * * ? *)', timezone: 'America/New_York',   // calendar trigger
            handler: sendDigest,                   // (payload, ctx) => {}
        },
    },
    actions: { SYNC_NOW: { title: 'Sync now', trigger: 'pollErp' } },   // run once, on demand
});
```

- Handlers follow ADR-054: `(payload, ctx)`, no `this`, module APIs under `ctx.modules` by
  the keys the author chose. The trigger `payload` is `{ trigger, scheduledFor }`; a paged
  run receives the page of records instead.
- For a classic `IntegrationBase` subclass without `defineIntegration`, the same object goes
  on `static Definition.triggers`, and `handler` may also be a method name, called with the
  instance as `this` as other subclass handlers are today.
- An extension contributes triggers under the name `{moduleKey}.{name}` (for example
  `crm.reconcile`). Framework-owned triggers use the reserved `frigg.` prefix, for example
  the built-in daily `frigg.subscriptions.reconcile` that ADR-054 uses for `app`-scope
  webhook subscriptions.
- `type: 'CRON'` in `this.events` stays unsupported. This ADR supersedes the `type: 'CRON'`
  examples in `CLAUDE.md` and `docs/guides/INTEGRATION-PATTERNS.md`; those docs are
  rewritten to `triggers` when the implementation lands (ADR-054 phasing, item 8), not in
  this PR, so the docs never describe something that does not run.

### 2. Provisioning (devtools)

- One function per integration that has triggers: `{integration}Triggers`, with the Prisma layer.
  It has one serverless `schedule` event per distinct tick, plus one for each `at` trigger.
  The `at` triggers use `method: scheduler` and a `timezone`.
- The tick for `every` triggers is `tick` when it is set. Otherwise it is the smallest constant
  `every` value. For an `every` given as a function, the default is 5 minutes. An instance
  cadence is rounded up to a whole number of ticks. The minimum is 1 minute, and the maximum
  `every` is 24 hours (longer cadences use `at`).
- The stack resources are static. They change only when the `Definition` changes, so they live
  in CloudFormation and are removed with the stack.

### 3. Runtime

**Tick** (the `{integration}Triggers` function):

1. Page through `findIntegrations({ type: name, status: 'ENABLED' })`, 500 rows at a time.
   This needs a paged repository read.
2. For each instance and trigger, resolve `config`, then `when`, then the cadence
   `n = every / tick`.
3. The instance is **due** when `floor(now / tick) mod n == hash(integrationId) mod n`. The
   check is stateless and deterministic, and it spreads instances evenly across the cadence.
   Calendar `at` triggers are due for every ENABLED instance that passes `when`.
4. Send `{ event: 'FRIGG_TRIGGER_RUN', data: { integrationId, trigger, scheduledFor } }` to the
   integration queue with `batchSend`. `DelaySeconds` adds jitter within the tick (at most
   `min(tick, 900 s)`), which needs a small `QueuerUtil` change.
5. If the tick nears its deadline (`core/invocation-deadline.js`), it enqueues a continuation
   tick with the page cursor and stops.

**Run** (the existing queue worker; it hydrates by `integrationId` as it does now):

1. Discard the run when the instance is not ENABLED. The worker already discards for DISABLED,
   ERROR, and IN_DELETION.
2. With `overlap: 'skip'`: if a Process record for `(integrationId, trigger)` is not terminal and
   its heartbeat is newer than `2 × tick`, count `trigger.skipped` and ack. Otherwise create
   the Process record (`process-commands`), run the handler, and mark the record complete or
   failed.
3. A `RateLimitError` defers as ADR-049 says. Other errors follow the worker's retry and DLQ
   path (`delivery.isLastAttempt` writes the Process failure).
4. Telemetry counts `trigger.run`, `trigger.skipped`, and `trigger.failed`, and records the lag
   `now - scheduledFor`.

**Missed ticks are not replayed.** A trigger is a "check now" signal, not a delivery of data.
Handlers use a watermark (the ADR-054 page runner stores one, while experimental), so the next run picks up
everything since the last successful run.

**On demand.** An action with `trigger: 'pollErp'` enqueues the same `FRIGG_TRIGGER_RUN`
message right away. The built-in admin script `frigg.run-trigger` does the same for operators,
and `frigg trigger run <integration> <trigger> [--id]` does it locally.

**Local.** `frigg start` runs the tick function on an interval when the app declares triggers,
using the mock scheduler provider (`SCHEDULER_PROVIDER=mock`). `frigg trigger tick` runs one
tick by hand.

### 4. Lifecycle

There is no per-instance infrastructure, so create, enable, disable, delete, and config change
need no trigger work:

- A disabled or deleted instance is no longer due.
- A config change takes effect at the next tick.
- Nothing is left to clean up in ADR-032.

## Consequences

### Positive

- The documented "ongoing sync every 15 minutes" works with one declaration. The
  self-rescheduling chain and its repair process go away.
- No schedule drift is possible: the only persistent artifacts are stack resources.
- Load is spread across the cadence by instance id, instead of every instance firing on the
  minute.
- The same tick can drive ADR-047's orchestrator ("scheduler tick" in its topology) and the
  ADR-054 subscription reconcile.

### Negative

- The tick reads every ENABLED instance of the integration on each tick. For 10,000 instances
  with a 5-minute tick, that is 20 pages of 500 each time, plus one SQS message for each due
  run. This is cheap, but it is not free, and it is a DB read even when nothing is due.
- Per-instance cadence is limited to multiples of the tick. Arbitrary per-instance calendar
  times are not supported (an `at` trigger is the same for all instances).
- The `overlap: 'skip'` check relies on Process heartbeats. A handler that never updates its
  Process record for longer than `2 × tick` can overlap with the next run.

### Neutral

- `createSchedulerCommands` stays the API for one-time jobs (subscription renewals, delayed
  work).
- Admin-script schedules (ADR-005) stay separate. They are created at runtime for one script.
  Triggers are build-time declarations that run for each instance.

## Alternatives Considered

1. **One EventBridge Scheduler recurring schedule per instance.** This gives exact cadence and
   timezone per instance with no fan-out function. It was rejected:
   - Every create, enable, disable, config change, and delete becomes a runtime AWS call with
     IAM to match.
   - Schedules drift from instance state (a schedule left for a deleted integration, or no
     schedule for an enabled one).
   - ADR-032 cannot list them.
   - The default quota is per account and region.
   - Local development needs a separate path.
2. **Self-rescheduling one-time jobs (today's workaround).** Rejected: one failed run loses the
   chain.
3. **SQS delay loops.** Rejected: the maximum delay is 15 minutes, a lost message loses the
   chain, and the loop has the same re-arm problem as alternative 2.
4. **Implement `type: 'CRON'` in `this.events` as documented.** Rejected: constructor state is
   not visible at build time, so devtools cannot provision it without instantiating the class.
5. **One app-wide tick for all integrations.** Rejected for now: it couples the IAM and failure
   domains of all integrations. A tick for each integration matches the existing
   queue-per-integration layout.

## Related

- [ADR-054](./054-one-file-integrations.md): one-file integrations. It uses `triggers` for
  polling and for the daily `frigg.subscriptions.reconcile`, and defines the handler and
  `ctx` shape triggers use.
- [ADR-005](./005-admin-script-runner.md): admin-script schedules (separate mechanism).
- [ADR-020](./020-capabilities.md): the `cron` surface. A trigger can declare a capability with
  `surface: 'cron'`.
- ADR-032 ([open PR #641](https://github.com/friggframework/frigg/pull/641)): no per-instance
  schedules to purge.
- ADR-044 ([open PR #648](https://github.com/friggframework/frigg/pull/648)): `trigger: 'delta'`
  in the sync extension binding compiles to a recurring trigger.
- ADR-047 ([open PR #648](https://github.com/friggframework/frigg/pull/648)): the scheduler tick.
- ADR-049 ([open PR #655](https://github.com/friggframework/frigg/pull/655)): runs defer on
  `RateLimitError`.
- ADR-051 ([open PR #666](https://github.com/friggframework/frigg/pull/666)): `triggers` joins
  the validated integration-definition schema.
- Supersedes the `type: 'CRON'` examples in `docs/guides/INTEGRATION-PATTERNS.md` and
  `CLAUDE.md` (corrected when the implementation lands).

## Open Questions

1. Does osls support `schedule: { method: 'scheduler', timezone }` for `at` triggers, or does
   devtools emit `AWS::Scheduler::Schedule` resources directly?
2. Should a failed run move the integration to `ERROR` after N failures in a row, or only write
   messages?
3. Is the Process heartbeat lease good enough for `overlap: 'skip'`, or does it need a
   conditional-update lease row?

## Size

About 480 LOC:

- core: tick and due check ~150, run and overlap ~100, paged `findIntegrations` ~40, actions
  `trigger:` ~20, `QueuerUtil` delay ~15
- devtools: trigger builder ~120
- CLI and local: ~60

Tests are about 1.2 times the code.
