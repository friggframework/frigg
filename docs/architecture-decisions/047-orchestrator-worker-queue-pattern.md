# ADR-047: Orchestrator/Worker Queue Pattern

**Status**: Proposed
**Date**: 2026-09-16
**Deciders**: Sean Matthews, Daniel Klotz

## Context

Frigg's long-running work — initial syncs, paginated fan-out, multi-step provisioning — is driven by
queue workers that enqueue their own next step. A worker fetches page 1, then enqueues a message to
fetch page 2, onto the same queue it is consuming.

**AWS Lambda's recursive loop detection treats that as a runaway loop and terminates the chain at
16 invocations.** In April 2026 this stopped CRM initial sync at roughly 800 contacts. By 13 May,
**51 Zoho ↔ Quo integrations were stalled at 750 contacts fetched**, and integration `ORJjpYNBDW`
(967 contacts) had been stuck since 13 April. The diagnosis was exact: *the same queue worker is
sending AND processing events to/from the same queue.*

Two ways out. Ask AWS to disable recursion detection — which works, and which Daniel correctly
flagged as dangerous, because it also disables detection of *real* runaway loops. Or stop
self-publishing, which removes the condition rather than the alarm.

### The design already exists

This ADR is not proposing a new mechanism. It ratifies one that was designed in May 2026 and never
formalised.

| When | Where | What |
|---|---|---|
| **Mar 2022** | email, *"Replacing step functions with XState"* | David Khourshid (XState author, Stately) opens the thread — *"features we're planning for XState to improve the server-side/workflow story."* First call 28 Mar with David and Gavin Bauman |
| **Jan 2023** | same thread | Sean describes the Frigg `process` model — state, context, parent/child processes, Lambda timeout-aware pause/resume — and asks about formalising it on XState. David replies that **"restoration" in XState v5**, letting an actor save and resume in-progress internal state, is *"going to be crucial for serverless workflows, for the timeout reasons you mentioned"*. Second call 6 Jan 2023 |
| Nov 2023 | `#dev_articles`, `#devtools-general` | XState docs and Trigger.dev posted 69 minutes apart on the same morning — *"interesting ideas all around for the process/state machine stuff"*, already a second look |
| Jan 2024 | `#dev_articles` | Step Functions `TestState` article parked against *"future iterations I want to do around state machines and process management"* |
| Sep 2024 | `freshbooks--frigg` PR #123 | Admin router plus queuer and services — the lineage that became `SyncProcess` |
| Apr 2026 | `#lefthook-integration-framework-frigg` | *"the only way around this that makes sense to me is to have a queue that is JUST an orchestration queue that then state-machine manages and fires off a new message to a processing queue … a pattern I've considered before"* |
| May 13 2026 | same thread | Step Functions proposed and rejected; **ADR explicitly requested** |
| **May 14 2026** | Slack, 17:38 | **Daniel's spec** — `orchestrator-mechanism.html`: the AWS implementation plan. EventBridge Scheduler topology, concrete Zoho/Quo naming, message contracts, code skeletons, CloudFormation, `BaseCRMIntegration` migration, testing, rollout, observability, acceptance criteria |
| **May 14 2026** | Slack, 19:57 — *"I see your spec and raise you one"* | **Sean's spec** — the same ten sections plus the architectural layer: provider-agnostic intent, the `reduce` contract, three durability tiers, provider mapping, invariants, and the XState analysis |
| Jun 2026 | PR #608 review | *"handlers being somewhat agnostic as to their callers, and queues being something defined separately"* |

The May 14 document is the source for everything below. What follows is its contract, recorded as a
decision.

### What core has, and what it lacks

`packages/core` has `core/Worker.js`, `queues/queuer-util.js`, and — inherited from the Crossbeam
lineage — process repositories across four backends with use cases for
create/get/update-state/update-metrics, atomic dot-path mutations, and `findActiveProcesses`.

It has no orchestrator, no outbox, and no state machine.
[ADR-044 §9](./044-sync-module-revitalization.md) requires all three and cannot supply them, because
this is not a sync concern — provisioning, migration, and bulk admin operations have the same shape.

## Decision

Adopt the orchestrator/worker mechanism as specified on 2026-05-14: a **stateless reducer** driven
by a scheduler tick and worker completion events, writing state and an outbox atomically, with
**three durability tiers** so mass stays proportional to complexity.

### 1. The contract

```
reduce(machine, state, event) → (state', actions[])
```

- **Stateless.** The orchestrator loads the machine and the state per message; nothing is retained
  in process memory between invocations.
- **Pure-ish.** The same `(machine, state, event)` yields the same `(state', actions)`. Duplicate
  events apply idempotently.
- **Atomic write.** State and outbox commit together. A crash mid-cycle either keeps the old state
  with no dispatches, or commits the new state and dispatches together. A separate publisher drains
  the outbox at-least-once.
- **Ordered per instance.** The inbound queue serialises events with group key = instance ID.
  Different instances run in parallel; a single instance sees its events in order.
- **Correlation.** Every emitted event carries the instance ID it belongs to. Workers do not address
  "the orchestrator", they address "this run".

### 2. The topology

```
  ⏱ scheduler tick ─┐
                    ▼
   inbound queue ─► ORCHESTRATOR λ ─► process state + outbox   (atomic)
   (group FIFO,     stateless             │
    key=instanceId)  reducer              ▼
        ▲                            worker queue (standard, fan-out)
        │                                 │
        │                                 ▼
        └──── completion events ──── PROCESSOR λ  (writes one record)
```

The orchestrator never publishes to the queue it consumes. Recursion detection stays **enabled and
is never triggered** — the fix is structural, not an account-level override.

The worker queue is deliberately *standard* (fan-out, parallel); only the inbound event queue is
group-FIFO. Worker queue technology stays infra-specific — FIFO versus standard, priority, batch
size — chosen per workload without affecting the orchestrator.

### 3. Three durability tiers

Most events do not need a tracked machine instance. The reducer shape is identical across tiers;
only the weight of persisted state changes.

| Tier | State persisted | For |
|---|---|---|
| **1 — Fire-and-forget** | none; outbox-only write | single-hop request → worker → done. No fan-in, no chaining |
| **2 — Minimal counter** | a tiny row, e.g. `{ expected: 50, received: 12 }` | fan-out/fan-in, scatter-gather, batch completion. Ephemeral once the join is satisfied |
| **3 — Full state machine** | machine definition + versioned instance row | long-running multi-step workflows, nested/chained sub-workflows, replayable inspectable history |

This mirrors the storage-tier philosophy in [ADR-044 §2](./044-sync-module-revitalization.md) on a
different axis — that one grades *record* state, this one grades *workflow* state. Both exist to
keep persistence proportional to need rather than assumed.

### 4. Invariants the implementation must preserve

- **Group FIFO ordering per instance ID.** Two events for one instance never process concurrently;
  events for different instances always can.
- **Atomic state + outbox**, drained at-least-once by a separate publisher.
- **Idempotent reduction.** Either deduplicate on event ID before reducing, or make every transition
  idempotent against current state.
- **Hard retry cap, then DLQ.** Because the inbound queue is group-FIFO, *a poison message blocks
  the entire instance*. After N attempts, route to DLQ so the rest of the group can drain. This is a
  direct consequence of choosing ordering and must not be discovered in production.
- **Failure is just an event type.** Worker failures emit a state-change event exactly as successes
  do. Compensation, retries, and timeouts are transitions, not out-of-band machinery.

### 5. Provider-agnostic by construction

The mechanism depends on three primitives. Swapping providers changes neither the reducer nor the
contract.

| Provider | Group-ordered queue | Durable state store | Dispatch |
|---|---|---|---|
| AWS | SQS FIFO, `MessageGroupId = instanceId` | DynamoDB or Aurora, conditional write | SQS / EventBridge / SNS |
| GCP | Pub/Sub, ordering key = instanceId | Firestore or Spanner | Pub/Sub / Cloud Tasks |
| Kafka | topic partitioned by instanceId | Postgres, `SELECT … FOR UPDATE` or version column | outbound topic per worker pool |
| Self-hosted | RabbitMQ consistent-hash exchange, or NATS JetStream subject hashing | Postgres outbox + CDC | any broker the workers consume |
| In-process (tests) | in-memory queue keyed by instance ID | in-memory map | direct function call |

This is the property that decided against the managed alternatives, and it is a standing Frigg
principle rather than a preference.

### 6. XState for Tier 3 only

The reducer is shape-identical to XState v5's `transition(machine, state, event) → next`. Adopt it
for Tier 3; do not use it for Tiers 1 and 2, where wrapping an integer counter in a machine is mass
for its own sake.

| Orchestrator concept | XState | Note |
|---|---|---|
| `reduce(machine, state, event)` | `transition(machine, state, event)` | Pure function. **No actor runtime needed** |
| machine definition | `createMachine({ … })` | Serialisable config, versionable |
| persisted instance state | `{ value, context }` | Snapshot; rehydrate on next event |
| `actions[]` for outbox | `next.actions` | Action descriptors → outbox rows |
| nested / chained workflow | `invoke` / `spawn` | Parent waits on child's done event |
| fan-in barrier | parallel region with final children | Native via `onDone` |
| timeout | `after: { 5000: … }` | **Must be compiled out** — see below |

**The decisive reason is Stately Studio**, whose visual editor round-trips with code. For an
integrations agency that is a client deliverable: the workflow diagram a client reviews and signs
off *is* the runtime. That is a commercial argument, not a developer-convenience one.

Worth recording that the dependency is not speculative. In January 2023 Frigg's `process` model —
state, context, parent/child processes, Lambda timeout-aware pause and resume — was described to
David Khourshid directly, and his answer was that XState v5's **"restoration"**, letting an actor
save and resume in-progress internal state, was being built because it is *"crucial for serverless
workflows, for the timeout reasons you mentioned."* The feature this decision leans on was designed
with this use case in the room. The relationship dates to March 2022 and has been dormant rather
than closed.

**Four frictions to handle deliberately:**

1. **Skip the actor runtime.** XState v5 pushes `createActor(machine).start()` — a long-lived
   in-memory object. Use `transition()` directly, or an actor only as a short-lived hydration shell
   (start, send one event, snapshot, stop).
2. **Version migration is ours.** XState does not help when a machine definition changes for an
   in-flight instance. Store the machine version with each instance, lock instances to the version
   they started under, and ship explicit migrations for state values and context shape.
3. **`after` / delayed transitions must be externalised.** XState's internal timer does not exist
   when the orchestrator is not running. Compile `after: 5000` into "enqueue a delayed event on the
   inbound queue" via EventBridge Scheduler, SQS delay, or the provider equivalent.
4. **Do not push Tiers 1 and 2 into machines.** If a workflow has no multiple discrete states, it
   does not need one.

### 7. Handlers agnostic to callers; queues declared separately

Per the PR #608 review: a handler declares what it does, not who invokes it or over which transport.
Queues are declared as their own objects and bound to handlers. This borrows the `queues` /
`workers` vocabulary of the [ADR-018](./018-integration-extensions.md) Integration Extension bundle
— `{ name, routes, events, queues, workers, useDatabase? }` — but the orchestrator ships as a **Core
Extension** (§8), whose contract today is only `{ name, type, hooks, routes?, capabilities? }`
([ADR-017](./017-core-extensions.md)). **Extending the Core Extension contract with `queues` and
`workers` is therefore a prerequisite of this ADR**, and is called out as such rather than assumed.
A `dispatch` property on the handler couples handler to transport and is rejected for that reason.

### 8. Where it lives

`packages/core/orchestrator/` — `state-machine.js`, `controller-handler.js`, `processor-handler.js`,
`scheduler-commands.js`, per the May 14 file plan — surfaced as a **Core Extension**
([ADR-017](./017-core-extensions.md)), since it is app-wide infrastructure rather than one
integration's concern. Sync ([ADR-044](./044-sync-module-revitalization.md)) is the first consumer;
provisioning, migrations, and admin script runs ([ADR-005](./005-admin-script-runner.md)) follow.

## Consequences

### Positive

- Removes the production failure at its root. The recursion detector stays enabled and never fires,
  so genuine runaway loops remain detectable — Daniel's objection to the workaround is satisfied
  rather than traded away.
- Gives ADR-044 §9 its execution substrate, generically rather than sync-specific.
- Orchestrator logic is unit-testable as a pure function, with no queues, providers, or cloud.
- Long-running work becomes inspectable: an instance row with a declared state answers "where is
  this and what happens next" without reading logs.
- Stately Studio turns workflow design into a reviewable client artefact — a differentiator for
  integration work, not just internal tooling.
- Retires three divergent in-house orchestrators (Quo, Crossbeam, FreshBooks).

### Negative

- **Group-FIFO ordering makes a poison message an instance-wide outage** until the retry cap routes
  it to DLQ. This is inherent to the ordering guarantee, not an implementation bug, and the DLQ path
  must be built and alarmed from day one rather than added after the first incident.
- The transactional outbox is the hardest part to get right and the easiest to approximate badly.
  "Write state, then publish" is not the same thing and will lose dispatches on crash.
- More infrastructure per workflow: two queues, a state store, a scheduler rule, a DLQ.
- Added latency per step versus a self-queue hop. Batching work per transition is the mitigation.
- Idempotency becomes a hard requirement on every worker. Existing workers were written without it
  and must be audited, not assumed.
- XState version migration for in-flight instances is unsolved by the library and becomes our
  maintenance burden the moment a machine definition changes.

### Neutral

- Overlaps conceptually with Step Functions and Temporal and will invite "why not just use X"
  perpetually. The answer is recorded below and should be linked rather than relitigated.
- Process telemetry aligns naturally with
  [ADR-011](./011-integration-telemetry-and-usage-tracking.md).

## Alternatives Considered

**AWS Step Functions.** Proposed by Daniel in May 2026 and purpose-built for this. Rejected: it
breaks the cloud-provider-agnostic principle. Azure Durable Functions and the GCP equivalent are the
same trade in different clothes — each forks the execution model per deploy target.

**Temporal.** Genuinely the right tool for durable workflow execution, considered alongside Step
Functions. Rejected: a heavyweight operational dependency — a cluster to run or a vendor to pay —
for adopters whose apps otherwise need only a queue and a database. Worth revisiting as an optional
plugin-backed execution engine, never the default.

**Trigger.dev.** Evaluated November 2023 and at least once before. Same objection as Temporal, plus
a hosted dependency in the critical path.

**Disable AWS recursion detection.** The stopgap applied to Quo. Rejected as the solution: it
silences the alarm rather than removing the condition, must be requested per account, and also
disables detection of real runaway loops — a plausible failure mode in exactly this code.
Acceptable short-term for existing deployments with heavy self-queueing, which is how it was used.

**Keep self-queueing, cap fan-out below the threshold.** Cheapest option. Rejected: it caps dataset
size at roughly 16 hops, which is what already broke at 750 contacts. Arithmetic, not architecture.

**XState everywhere, including Tiers 1 and 2.** Rejected in the source spec: a machine around an
integer counter is ceremony without benefit, and the three-tier model exists precisely to keep mass
proportional to complexity.

## Related

- **Source designs**, both Slack, 2026-05-14, `#lefthook-integration-framework-frigg`:
  - Daniel Klotz, 17:38 — `orchestrator-mechanism.html` (`F0B41JYC2UC`, 2,375 lines). The AWS
    implementation plan: topology, message contracts, code skeletons, CloudFormation, migration,
    testing, rollout, observability, acceptance criteria
  - Sean Matthews, 19:57 — `orchestrator-mechanism` (`F0B40F7HN4R`, 3,629 lines). The same plan
    generalised: `reduce` contract, durability tiers, provider mapping, invariants, XState analysis
    and simulation. **§1–§6 of this ADR derive from it**
- **Prior art conversation**: Front thread *"Replacing step functions with XState"* with David
  Khourshid (Stately), Mar 2022 – Jan 2023
- [ADR-044: Sync Module Revitalization](./044-sync-module-revitalization.md) — §9 requires this
  substrate; its §2 storage tiers parallel the durability tiers here
- [ADR-017: Core Extensions](./017-core-extensions.md) — where the orchestrator ships
- [ADR-018: Integration Extensions](./018-integration-extensions.md) — the bundle shape queues bind
  through
- [ADR-005: Admin Script Runner Service](./005-admin-script-runner.md) — a second natural consumer
- [ADR-011: Integration Telemetry, Eventing & Feature-Usage Tracking](./011-integration-telemetry-and-usage-tracking.md) — process
  metrics surface
- [ADR-013: Integration Version Migrations](./013-integration-version-migrations.md) — precedent for
  the machine-version migration problem; in-flight machine versioning is called out in [#647](https://github.com/friggframework/frigg/issues/647)
