# ADR-044: Sync Module Revitalization

**Status**: Proposed
**Date**: 2026-09-16
**Deciders**: Sean Matthews

## Context

Frigg ships a record-synchronization engine at `packages/core/syncs/` — 1,552 lines across
`sync.js`, `manager.js`, and four repository implementations (Mongo, Postgres, DocumentDB, plus a
factory and interface). It implements a canonical-object model with match hashing, data hashing,
create/update reconciliation, and a precedence rule for bidirectional merges.

It has never been used. Meanwhile five separate codebases have each built their own sync, and
between them they have built — independently, incompatibly — most of a complete sync platform.
One of them solved the single biggest performance problem in the engine and the fix was never
carried back.

### The engine that exists

`Sync` (`sync.js`, 113 LOC) declares a canonical object per entity type:

```js
static Config = {
  name:     'Sync',  // stable id; returned by getName(), used in logs and sync-record scoping
  keys:     [],  // canonical field list; order matters, feeds the data hash
  matchOn:  [],  // identity fields; combined and hashed to match records across systems
  moduleMap:        { ModuleName: { firstName: (obj) => obj.name[0] } },
  reverseModuleMap: { ModuleName: (data) => ({ /* provider shape */ }) },
}
```

Two hashes do the work. `matchHash` (from `matchOn`) answers *"are these the same record?"* across
systems. `getHashData()` (from `keys`) answers *"has this record changed?"*.

`SyncManager` (`manager.js`, 489 LOC) consumes them. `sync()` is the incremental path: data hash
differs and both identifiers are present → update the secondary; hash matches → no-op; one
identifier only → create. `initialSync()` reconciles both sides in bulk, and already carries a
conflict rule, stated in its own comment:

> *the Primary Module takes precedence unless the field is an empty string or null*

implemented via `dataKeyIsReplaceable()`. Flags exist for `isUnidirectionalSync`,
`useFirstMatchingDuplicate`, `ignoreEmptyMatchValues`, and `omitEmptyStringsFromData`.

**The engine was designed for bidirectional sync.** That intent survives in the code but has never
been exercised, and the single hardcoded precedence rule is the only conflict policy available.

### The evidence that it is dormant

1. **Not exported.** `SyncManager` and `Sync` do not appear in `packages/core/index.js`.
2. **No consumers.** Repository-wide, `SyncManager` appears in two files: its own definition and
   `packages/core/types/syncs/index.d.ts`.
3. **No tests.** There is no test file anywhere under a sync path.
4. **Dead code that cannot run.** `sync.js:74`:

   ```js
   isModuleInMap(moduleName) {
     return this.constructor.Config.moduleMap[name];  // `name` is never bound
   }
   ```

   `name` is not a parameter, local, or module-scope binding. Any call throws `ReferenceError`.
5. **Incomplete constructor.** `SyncManager`'s constructor never assigns `primaryModule` or
   `secondaryModule`, which its methods dereference throughout.

### What five codebases built instead

| Codebase | Approach | LOC |
|---|---|---|
| `faulkners-nursery--frigg` | Bespoke `InvoiceSyncUseCase` / `CustomerSyncUseCase`, Aspire → QBO | ~2,950 |
| `fastspring--integration-service` | `LHSyncManager` (core's ancestor) + `CompanySync`/`ContactSync`/`InteractiveQuoteSync` | ~763 |
| `freshbooks--frigg` | `SyncManager.ts` + `SyncProcess` discriminators + `SyncedObject` model + queue workers | ~1,115 |
| `quo--frigg` | `SyncOrchestrator` composing `ProcessManager` + `QueueManager` | ~271 + services |
| `crossbeam--integration-service` | `LHSyncManager` + `GeneralUtil.diff()` hash-join + 13 `Process` discriminators | ~434 + utils |

Each solved a different part of the same problem. None of it is shared.

**Faulkner — structural rendering and relationship resolution.** `classifyInvoiceBilling()` sorts an
opportunity's billing schedule to decide whether an invoice is a deposit, an intermediate draw, or
the final draw. Each classification produces a *different line-item shape*: deposit is one line,
final is two (contract total, then a negative "Less: Customer Deposit Applied"), regular is N.
`ensureBillingContactMapping()` and `getCustomerSync()` resolve the parent customer by hand before
writing the child invoice. 129 QBO references sit inside the sync layer, in methods named
`buildQBOInvoice()` and `formatQBODate()`.

**FastSpring — relationships, and four ways to get them wrong.** `syncedCompany` is a canonical key
populated by `getAndSyncRelatedDealInfo()`, an abstract method whose doc comment prescribes the
ordering by hand: *retrieve the Deal → retrieve the Company → sync the Company → retrieve related
Contacts → sync those Contacts*. The defects: (1) no dependency ordering in the engine, so every
integration writes its own orchestrator; (2) provider vocabulary leaks into the canonical model —
`obj.syncedCompany.AccountId` is a Salesforce field name in a platform-neutral object, contradicting
the separation ADR-021 records as a locked constraint; (3) the relationship sits in `keys` and so
feeds the change hash, meaning an edit to a company's website marks every one of its contacts dirty;
(4) the maps rot — `reverseModuleMap.hubspot` returns `{FirstName, LastName, AccountId}`, Salesforce's
names and Salesforce's foreign key, copy-pasted, with `// Need to verify that keys are correct`
comments still in place.

**FreshBooks — lifecycle, resumption, and tombstones.** A `SyncedObject` model persists
`entity_1`/`entity_2`, `object_id_1`/`object_id_2`, type on each side, the hash — and
`userManuallyDeleted`. When FreshBooks answers an update with `Other Income not found.`, the record
is tombstoned so later runs never recreate what a user deliberately deleted:

```ts
const shouldUpdateIncome =
  syncedObject && syncedObject.hash !== income.hash &&
  syncedObject.userManuallyDeleted !== true;
```

Sync runs are `Process` discriminators (`SyncProcess`, `SyncIncome`, `SyncExpenses`) with a two-tier
state machine — `ParentProcessStatus` of `INITIALIZING`/`RETRIEVING_DATA`/`COMPLETED`, and
`ChildProcessStatus` adding `AWAITING_START` and `NOT_INCLUDED` — driving paginated, resumable runs
via `hasMoreRecordsToSync`. Errors are classified: `HaltError` stops the run, and
`authentication no longer valid` surfaces to the user.

**Quo — trigger modes, watermarks, fan-out, and cancellation.** `SyncOrchestrator` names three
patterns explicitly: `startInitialSync` (full, reverse-chronological, fan-out by page),
`startOngoingSync` (delta via `modifiedSince`, ascending), and `handleWebhook` (real-time). Delta
uses a persisted watermark (`getLastSyncTime`, `lastSyncedTimestamp`), batch sizes come from
`CRMConfig.syncConfig`, and `hasActiveSyncs`/`cancelActiveSyncs` guard against overlapping runs.
`QueueManager.fanOutPages()` turns a total into queued page fetches; `ProcessManager` tracks state
(`FETCHING_TOTAL` → `PROCESSING_BATCHES` → `COMPLETED`) and metrics.

**Crossbeam — the hash-join that was never carried back.** `GeneralUtil.diff()` reconciles two
in-memory arrays in a single pass:

```js
static diff(a = [], b = [], diffUniqueKey = '_diffKey', arrayType = 'object') {
    const aMap = new Map();
    const aInB = [], bInA = [], bUniques = [];
    for (let i = a.length; i > 0; i--) {
        const record = a[i - 1];
        aMap.set(record[diffUniqueKey], record);        // string-mode branch elided
    }
    for (let j = b.length; j > 0; j--) {
        const record = b[j - 1];
        const aRecord = aMap.get(record[diffUniqueKey]);
        if (aRecord) {
            bInA.push(record);
            aInB.push(aRecord);
            aMap.delete(record[diffUniqueKey]);
        } else {
            bUniques.push(record);
        }
    }
    return { aUniques: Array.from(aMap.values()), aInB, bInA, bUniques };
}
```

Build a `Map` from `a`, one pass over `b` with O(1) lookups, deleting matches as it goes so the
map's residue *is* `aUniques` with no second pass. **O(n+m)**, and it returns the complete four-way
partition, including both sides of the intersection as parallel arrays — exactly what field-level
comparison needs.

It operates on **plain arrays and objects, deliberately not Mongoose documents**, which is what
makes it viable at scale. In `HubSpotIntegrationManager` it is wrapped in
`performance.mark('diff-start')` / `performance.measure('Diff Timing', …)` — it was explicitly
instrumented as the hot path — and feeds batches of **750,000 records** into HubSpot bulk import.
It is called from three integration managers (HubSpot, RollWorks, Salesloft).

**It is never called from the sync path.** `LHSyncManager` sits in the same repository, doing the
same job, and does not use it.

### The gap this reveals

Two findings, and the second is the more damaging.

**Execution strategy.** Core's `initialSync()` calls `getAllSyncObjects()` on both modules and holds
both full result sets in memory simultaneously. Quo and FreshBooks *both* independently rejected
that and built paged, queue-driven, process-backed execution instead.

**Reconciliation complexity.** Core matches records by nested scan:

```js
const primaryIntersection   = primaryArr.filter(e1 => secondaryArr.some(e2 => e1.equals(e2)));
const secondaryIntersection = secondaryArr.filter(e1 => primaryIntersection.some(e2 => e1.equals(e2)));
const secondaryCreate       = primaryArr.filter(e1 => !secondaryArr.some(e2 => e1.equals(e2)));
const primaryCreate         = secondaryArr.filter(e1 => !primaryArr.some(e2 => e1.equals(e2)));
```

Four O(n·m) passes — and then, *inside* the loop over `primaryIntersection`, a fifth:

```js
for (const primaryObj of primaryIntersection) {
    const secondaryObj = secondaryIntersection.find(e1 => e1.equals(primaryObj));
    ...
    const createdObj = await this.createSyncDBObject([primaryObj, secondaryObj], [...]);
```

So roughly **5·n·m `equals()` calls**, plus one awaited database write per record, serialized. At
10,000 records a side that is 5×10⁸ comparisons; at a million it is 5×10¹². The same repository's
`diff()` does it in ~2×10⁶ operations with a batched write.

Revitalization is therefore not export-plus-tests. **The engine's core reconciliation loop is
quadratic and its execution model is unbounded in memory** — and the three codebases that ran sync
in production at volume each proved it by not using it.

One further consequence: `diff()` returns `bUniques` — records present in the destination but
absent from the source. **Core has no concept of this set at all**, which is why deletion detection
is missing from the engine and FreshBooks had to approach it from the opposite direction with
`userManuallyDeleted`.

### The state machine Frigg 2.0 inherited, and the half it didn't

Crossbeam's `Process` base model is schemaless where it matters:

```js
_schema.add({
    user:        { type: ObjectId, ref: 'User', require: true },
    integration: { type: ObjectId, ref: 'Integration', require: true },
    state:   { },  // "State is the current state object of the process. States would be the set of possible states"
    context: { },  // "Storage for context details as needed"
    childProcesses: [{ type: ObjectId, ref: 'Process' }],
    parentProcess:   { type: ObjectId, ref: 'Process' },
    results: { },  // "results as needed"
});
```

The *graph* was modelled; the *states* were not.

All 13 process types (`HubSpotSyncProcess`, `RollWorksReportSyncProcess`, …) are **empty
discriminators** — they add no fields and declare no states. So each one invents state strings at
runtime with nothing validating them: `IN_PROGRESS` (18 uses), `AWAITING_START` (14), `INITIALIZING`
(13), alongside one-off values like `AWAITING_SALESLOFT_ACCOUNTS` and
`ERROR_RETRIEVING_SALESLOFT_ACCOUNTS`. FreshBooks repeated the pattern — its `SyncProcess`
discriminators are also empty schemas, with status enums declared in a separate interface file that
the schema does not enforce.

Frigg 2.0 **did** inherit this lineage, and improved the persistence substantially.
`packages/core/integrations/` now has process repositories across four backends with tests, use
cases for create/get/update-state/update-metrics, atomic dot-path mutations validated against
`^(context|results)(\.[a-zA-Z_][a-zA-Z0-9_]*)+$`, counter/set/push operations with `keepLast`
capping, and `findActiveProcesses` — which is Quo's `hasActiveSyncs` generalized.

What it did not inherit is a **state machine**. `update-process-state.js` documents one in a
docstring:

> `INITIALIZING → FETCHING_TOTAL → QUEUING_PAGES → PROCESSING_BATCHES → COMPLETING → COMPLETED`
> *(CRM Sync Example)*

— but `newState` is an unvalidated string, and the states are labelled an *example*. The storage
was cleaned up; the ad hoc state management was carried forward intact.

### Where a sync engine belongs

ADR-015 lists "sync engine" as a canonical example of an **Integration Extension**, and ADR-018's
own context paragraph opens with it. ADR-016 draws the same line: extensions add functionality on
top of the framework. The code, however, sits unexported in core. The taxonomy and the tree
disagree, which is part of why the module has no consumption path.

## Decision

Revitalize the sync module as a **capability set**: canonical primitives in core, execution and
workflow as an Integration Extension, with relationships, conflict policy, and lifecycle as
declarative configuration rather than per-integration code.

### 1. Split primitives from engine

- **`packages/core/syncs/`** keeps `Sync`, `SyncManager`, and the repositories, and **exports them
  from `packages/core/index.js`**.
- **`@friggframework/extension-sync`** ships the Integration Extension bundle —
  `{ name: 'sync', routes, events, queues, workers, useDatabase: false }` per ADR-018 — providing
  trigger modes, page fan-out, process state, and failure handling. The bundle default is
  `useDatabase: false` so the webhook-trigger receiver (§9) verifies, enqueues and returns without
  a DB connection, per ADR-018: *"A webhook receiver verifying a signature and enqueueing should not
  pay for a DB connection."* Queue workers that touch sync records set it per binding.

The extension declares its capability per [ADR-020](./020-capabilities.md), so the sync surface is
discoverable rather than implied:

```js
// @friggframework/extension-sync
capabilities: {
    'sync.records.reconcile': {
        surface: 'sync',
        spec: { kind: 'json-schema', ref: './specs/sync-config.schema.json' },
        implementedBy: { kind: 'extension', ref: 'extensions.sync' },
        dependsOn: [
            { module: 'aspire', capability: 'accounting.invoice.list' },
            { module: 'qbo',    capability: 'accounting.invoice.upsert' },
        ],
    },
},
```

**Where configuration lives.** Two containers, because the two kinds of setting have different
scope. A `ContactSync` reused across three integrations needs one canonical shape but three
different direction/precedence answers, so they cannot share a home.

| Keys | Container | Scope |
|---|---|---|
| `name`, `keys`, `matchOn`, `moduleMap`, `reverseModuleMap`, `collections`, `relationships`, `skew` | `class XSync { static Config }` | per canonical object |
| `direction`, `precedence`, `trigger`, `watermark`, `fanOut`, `sortDesc`, `syncObjects`, `tier`, `onSourceDelete`, `onDownstreamDelete` | the extension binding, `Definition.extensions.sync.config` | per integration, per module pair |

```js
static Definition = {
    name: 'aspire-qbo',
    modules: { aspire: { definition: aspire.Definition }, qbo: { definition: qbo.Definition } },
    extensions: {
        sync: {
            extension: require('@friggframework/extension-sync'),
            handlers: { SYNC_TICK: 'onSyncTick' },
            config: {
                syncObjects: [InvoiceSync, CustomerSync],
                direction:   'push',
                trigger:     'delta',
                precedence:  { strategy: 'module', master: 'aspire', fallback: 'fillEmpty' },
                onSourceDelete: 'archive',
            },
        },
    },
};
```

Every fragment in §§6–8 below is an excerpt of one of these two containers.

### 2. Statefulness is a negotiated tier, not an assumption

In a distributed system the systems of record should own state. The ideal sync is **stateless
passthrough**: read a change, write it, store nothing, and let both endpoints handle identity and
idempotency. Every byte the engine persists is a replica that can drift, a migration to write, and
a privacy surface to defend.

Core's engine currently assumes the opposite. A sync record is written for every matched pair,
unconditionally, whether or not anything needs it. That assumption should be inverted: **store the
minimum the two systems cannot supply between them**, and derive that minimum rather than assume it.

| Tier | Stored per record | Required when | Enables |
|---|---|---|---|
| **0 — Stateless** | nothing | destination accepts idempotent upsert on a key we control; source supplies change events or a delta filter | push, webhook, delta |
| **1 — Identity** | `{sourceId, destId}` | destination cannot upsert by external key, so create-vs-update must be decided by us | + create/update correctness |
| **2 — Identity + hash** | `+ dataHash` | source cannot say what changed, so unchanged records would otherwise be rewritten every run | + change suppression |
| **3 — Shadow + provenance** | `+ canonical field values, per-field provenance` | bidirectional or hub mode — detecting *which side* changed requires knowing the last agreed value | + conflict resolution |

Tier 0 is genuinely reachable today. HubSpot upserts on a unique property via `idProperty`;
Salesforce upserts on an External ID field; Stripe honours idempotency keys. Against such a
destination, with a delta-capable source, a sync needs no database at all — and the engine is still
carrying its weight, because the canonical model (§6), the rendering split, the relationship
resolution (§7), and the trigger lifecycle (§9) are all still doing work. **Sync objects are
valuable without sync records.**

Tier is **derived, not configured**: the engine negotiates it from what the two modules declare
they can do, then raises it to whatever the requested `direction` and `precedence` demand — `hub`
forces Tier 3 regardless of endpoint capability. An explicit override is permitted and logged, in
both directions: forcing Tier 0 on an unsuitable pair is a footgun, and forcing Tier 3 for
auditability is a legitimate choice.

The blocker is that **API modules declare nothing about their data capabilities today** — a module
`Definition` carries `API`, `getName`, `moduleName`, `modelName`, `requiredAuthMethods`, and
`env`, and stops there. Nothing says whether listing supports `modifiedSince`, whether writes are idempotent, or
whether IDs are stable. Without that, tier cannot be derived and this section is unimplementable.
That declaration layer is deliberately **not** specified here — see [ADR-045](./045-capability-traits.md),
which defines it generically. Until it lands, tier is configured explicitly and defaults to Tier 2,
today's de facto behaviour.

### 3. Module-side contract

`SyncManager`'s four implicit dependencies become a documented, typed interface, extended for paged
execution:

| Member | Purpose |
|---|---|
| `getSyncObjectPage({ cursor, limit, modifiedSince, sortDesc })` | Paged extraction — replaces `getAllSyncObjects()` |
| `batchCreateSyncObjects(objs, manager)` | Create in this system |
| `batchUpdateSyncObjects(objs, manager)` | Update in this system |
| `getSyncObjectCount({ modifiedSince })` | Optional; enables fan-out |
| `entity.id` | Identity for sync-record scoping |

`getAllSyncObjects()` remains as a default implementation over `getSyncObjectPage()` for small
datasets, but the engine no longer assumes it.

### 4. Reconciliation is a hash join, not a nested scan

Adopt `crossbeam--integration-service`'s `GeneralUtil.diff()` as the engine's matching primitive,
promoted to `packages/core/syncs/reconcile.js` and generalized. It replaces all five nested scans in
`initialSync()`.

```
reconcile(a, b, { key = (o) => o.matchHash })
  → { aUniques, aInB, bInA, bUniques }
```

Three changes from the crossbeam original:

1. **`key` becomes a function, not a property name.** The original's `diffUniqueKey` string already
   handles the simple case — `matchHash` is a real field on a constructed sync object. A function
   generalises to composite and derived keys, and to reconciling raw provider payloads that carry no
   precomputed hash at all. The `diffUniqueKey` string and the `arrayType: 'object' | 'string'`
   switch both collapse into one accessor. Crossbeam's own author left a `TODO` in
   `flattenCachedRecords` noting exactly this: *"`id` is intentionally a function, which is likely
   what we need to pass in as an argument."*
2. **Duplicate-key policy is explicit.** The original iterates `a` backwards, so on a duplicate key
   the *earliest* array element silently wins — first-match-wins, arrived at by accident rather than
   by decision. The engine already has `useFirstMatchingDuplicate`; the primitive honours it
   explicitly in both settings and counts collisions rather than swallowing them.
3. **Plain arrays and objects only — enforced.** `reconcile()` takes **raw record arrays plus a key
   accessor**, never hydrated `Sync` instances: the accessor computes the match key on the fly, so
   the volume path never constructs an object per record. The default `(o) => o.matchHash` is a
   convenience for already-constructed sync objects on small datasets only. The original's
   performance depends on operating on POJOs rather than ODM documents; that is a load-bearing
   constraint, not an implementation detail. Hydrating a million records into ODM documents to diff
   them defeats the entire primitive.

**The four-way partition maps exactly onto sync semantics**, which is why this is the right shape:

| Partition | Meaning | Action |
|---|---|---|
| `aUniques` | in source, not in destination | create |
| `aInB` / `bInA` | matched pairs, as parallel arrays | compare fields, apply precedence (§8) |
| `bUniques` | in destination, not in source | **delete / archive / tombstone** |

`bUniques` is the set core has no concept of today. Deletion detection falls out of the primitive
for free, and `onSourceDelete: 'tombstone' | 'archive' | 'ignore'` becomes configurable rather than
absent. FreshBooks' `userManuallyDeleted` addresses the mirror-image case — deleted *downstream* —
and both are needed.

Batched writes replace the per-record `await createSyncDBObject()` currently inside the match loop.

### 5. Fix the constructor gap

`primaryModule` and `secondaryModule` become explicit, validated constructor parameters.

### 6. Canonical objects hold facts; modules render them

The line-item problem is not a mapping problem. `DetailType`, `SalesItemLineDetail` and `ItemRef`
are QuickBooks vocabulary, and `resolveDefaultItemRef()` is a QuickBooks *catalog lookup*. The
`"Less: Customer Deposit Applied"` line exists nowhere in Aspire — netting a deposit is a
QuickBooks accounting convention. **The line items are destination rendering, not source data.**

So the canonical model holds economic facts:

```js
class InvoiceSync extends Sync {
  static Config = {
    name: 'InvoiceSync',
    keys: [
      'number', 'date', 'dueDate', 'currency', 'memo',
      'classification',   // regular | deposit | intermediate | final — source-derived
      'amount', 'contractTotal', 'depositAmount',
      'lines',            // economic lines: { ref, description, amount }
    ],
    matchOn: ['number'],
    collections: { lines: { sortBy: 'ref' } },
  };
}
```

`classification` is legitimately canonical — it derives from Aspire's `InvoiceType` and billing
`SortOrder`, which is source truth, and every destination needs to know "this is the final draw
against a schedule." Only the writing-down differs.

`reverseModuleMap` gains two further arguments:

```js
reverseModuleMap: {
  qbo: (data, refs, ctx) => ({
    CustomerRef: { value: refs.customer },
    DocNumber:   data.number,
    Line: renderQboLines(data, ctx),
  }),
}

function renderQboLines(data, ctx) {
  switch (data.classification) {
    case 'deposit': return [qboLine(data.memo || 'Customer Deposit', data.amount, ctx.items.deposit)];
    case 'final':   return [
      qboLine('Contract Total', data.contractTotal, ctx.items.services),
      qboLine('Less: Customer Deposit Applied', -data.depositAmount, ctx.items.deposit),
    ];
    default:        return data.lines.map(l => qboLine(l.description, l.amount, ctx.items.services));
  }
}
```

- **`refs`** — engine-resolved relationship identifiers for the destination being written (§7).
- **`ctx`** — destination resolution context: item refs, income accounts, tax codes, payment terms.
  Produced by the destination module's `getRenderContext({ entityId })` and cached per run, shape
  `{ items, accounts, taxCodes, terms }`. (`qboLine(description, amount, itemRef)` above is a
  module-local helper building one `SalesItemLineDetail`.) This is what `resolveDefaultItemRef()` is
  doing today inside a class that should not know QuickBooks exists.

Consequences: Xero can render the same canonical invoice as a *prepayment* — a different mechanism
— without touching the canonical model or the Aspire side. The change hash covers economics only,
so renaming an Item in QuickBooks no longer marks every invoice dirty.

**Collection ordering is load-bearing.** `hashJSON` is `md5(JSON.stringify(...))`, so array order is
significant. `collections: { lines: { sortBy: 'ref' } }` is required, not decorative — without it,
a source returning rows in a different order reports every record dirty forever.

### 7. Relationships: preserve always, sync optionally

Two distinct needs, conflated in `fastspring`. *Preserve* — write the correct foreign key into the
destination. *Sync* — bring the parent across as a consequence of syncing the child.

```js
relationships: {
  customer: {
    syncObject:   'CustomerSync',
    cardinality:  'one',                       // 'one' | 'many'
    required:     true,
    from:         (data) => data.customerRef,  // locate parent from child's canonical data
    cascade:      'ifMissing',                 // 'never' | 'ifMissing' | 'always'
    onUnresolved: 'defer',                     // 'defer' | 'skip' | 'fail'
  },
}
```

| `cascade` | Behaviour |
|---|---|
| `never` | Preserve only. Look up the parent's sync record; if absent, apply `onUnresolved`. Correct when another process owns the parent. |
| `ifMissing` | No sync record → sync that one parent on demand, then reference. This is `ensureBillingContactMapping()`, hand-rolled. |
| `always` | Reconcile the parent first every time. Its own hash makes it a no-op when unchanged, so the cost is a lookup and the gain is freshness. |

`onUnresolved` makes the failure mode explicit rather than accidental: `defer` re-queues with
bounded retries then dead-letters; `skip` drops with a counted telemetry event; `fail` raises.
Faulkner's current behaviour is an unnamed blend of skip-and-continue, which is why a missing
billing contact silently yields an invoice with no `BillEmail`.

Three engine mechanics follow:

- **Topological ordering.** Sync objects are sorted by declared relationships; parents reconcile
  first. No per-integration orchestrator.
- **Two-phase writes for cycles.** Company → primaryContact → company cannot be topologically
  ordered. A relationship marked `deferred: true` is written in a second pass: create both records
  without the back-reference, then patch.
- **`relationshipHash`, separate from the data hash.** Computed from parents' `matchHash` values
  only, never their field data. A parent's phone number changing leaves children untouched; a
  genuine re-parent updates them. This works only because `relationships` sits outside `keys`.

### 8. Direction and conflict policy

The engine was built for bidirectional sync with one hardcoded rule. That rule becomes one named
policy among several, and direction becomes explicit:

```js
direction: 'push',   // 'push' | 'pull' | 'bidirectional' | 'hub'

precedence: {
  strategy: 'module',                  // 'module' | 'field' | 'recency' | 'custom'
  master:   'aspire',
  fields:   { phone: 'hubspot', email: 'salesforce' },   // strategy: 'field'
  fallback: 'fillEmpty',               // non-master wins only where master is null/''
  resolve:  (candidates, ctx) => winner,                  // strategy: 'custom'
}
```

- **`module`** — a master system wins. With `fallback: 'fillEmpty'` this reproduces today's
  behaviour exactly (`dataKeyIsReplaceable`), now as a named choice rather than the only option.
- **`field`** — per-field mastership. Salesforce owns email, the support tool owns phone. This is
  the common real answer in bidirectional CRM sync and is currently unexpressible.
- **`recency`** — last writer wins, requiring a source modification timestamp. `moduleMap` gains a
  reserved `_modifiedAt` key for this; `recency` is rejected at config validation if absent.
- **`custom`** — an escape hatch receiving all candidate values.

**`hub` enables multi-directional sync.** With three or more modules, pairwise reconciliation is
combinatorial and order-dependent. Instead the canonical record becomes the hub: each module
reconciles against canonical, never against its peers. This requires **per-field provenance** on
the sync record — which module last wrote each field, when, and with what hash — so a winner can be
determined per field rather than per record. That storage cost is the real price of multi-directional
support and is why it is opt-in.

Conflict arises in two places, both resolved by the same policy: at initial sync, when both systems
already hold a record matching on `matchOn` but differing in data; and on an incremental run, when
both sides changed since the last reconciliation.

### 9. Lifecycle, execution, and safety

Drawn directly from what Quo and FreshBooks built:

- **Trigger modes** — `initial` (full backfill, fan-out by page, `sortDesc` so newest records land
  first), `delta` (watermark via `modifiedSince`, ascending), `webhook` (single or batched records,
  bypassing extraction), `manual`.
- **Watermark and hash are complementary.** The watermark reduces what is *fetched*; the hash
  decides what is *written*. Core has only the second. Both are needed.
- **Process state and resumption.** Runs are persisted with state and cursor, resumable after
  timeout, with metrics. Core's `packages/core/integrations/` process layer — repositories across
  four backends, atomic dot-path mutations, `findActiveProcesses` — already provides the storage;
  the extension supplies the workflow on top of it.
- **A declared state machine, not string literals** — but **not defined here**. State declaration
  and transition enforcement belong to the orchestrator substrate in
  [ADR-047](./047-orchestrator-worker-queue-pattern.md), whose reducer is the single authority. The
  sync extension declares a Tier 3 machine (ADR-047 §3) for `initial` and `delta` runs; `webhook`
  and `manual` single-hop runs sit at Tier 1 and declare no machine at all. Core inherited the
  process *storage* from the Crossbeam lineage but not the state machine —
  `update-process-state.js` documents `INITIALIZING → FETCHING_TOTAL → QUEUING_PAGES →
  PROCESSING_BATCHES → COMPLETING → COMPLETED` in a docstring, labelled an *example*, while
  `newState` remains an unvalidated string. That is how Crossbeam accumulated
  `AWAITING_SALESLOFT_ACCOUNTS` and `ERROR_RETRIEVING_SALESLOFT_ACCOUNTS` across 13 empty process
  discriminators. Declaring the machine is what stops the pattern recurring a fourth time.
- **Concurrency guard and cancellation.** `hasActiveSyncs` / `cancelActiveSyncs`. Overlapping runs
  are a classic duplicate-record source and neither core nor Faulkner guards against them.
- **Tombstones.** A `deletedDownstream` flag on the sync record, set when a destination reports the
  record missing on update, suppressing recreation. Generalizes `userManuallyDeleted`. Policy is
  configurable: `onDownstreamDelete: 'tombstone' | 'recreate' | 'fail'`. Distinct from **ADR-032
  Integration Deletion Data Cleanup** (lands with #644), which governs Frigg's *own* records —
  orphaned `Entity` and `Credential` rows — when an integration is torn down. Sync records are a
  third category and should be named in that ADR's cleanup scope.
- **Error taxonomy.** `halt` (stop the run — credential invalidation, rate-limit exhaustion),
  `skipRecord` (count and continue), `retry` (backoff). Credential invalidation routes to the
  existing diagnostic path rather than string-matching messages.
- **Selective scope.** Per-object-type enable/disable, generalizing FreshBooks' `includeExpenses`
  and `NOT_INCLUDED` and Quo's `personObjectTypes`.
- **Telemetry.** Emits `records.synced` per ADR-011, which already reserves the metric.

### 10. Generic use cases and their usage

| # | Use case | Real example | Configuration |
|---|---|---|---|
| 1 | **One-way feed** — source of record pushes to a passive destination | Aspire → QBO invoices | `direction: 'push'`, `trigger: 'delta'` |
| 2 | **Large backfill, resumable** — first run over a big dataset | Quo initial CRM sync | `trigger: 'initial'`, `fanOut: true`, `sortDesc: true` |
| 3 | **Delta on a watermark** — only fetch what changed | Quo ongoing sync | `trigger: 'delta'`, `watermark: 'lastSyncedTimestamp'` |
| 4 | **Webhook-driven** — provider pushes single records | Quo `handleWebhook` | `trigger: 'webhook'`, extraction bypassed |
| 5 | **Parent/child with cascade** — child needs a parent that may not exist | Invoice → Customer | `relationships.customer.cascade: 'ifMissing'` |
| 6 | **Reference-only relationship** — parent owned elsewhere | Invoice → Item catalog | `cascade: 'never'`, `onUnresolved: 'fail'` |
| 7 | **Bidirectional with a master system** | CRM ↔ support tool | `direction: 'bidirectional'`, `precedence.strategy: 'module'` |
| 8 | **Bidirectional with field-level mastership** | SFDC owns email, Zendesk owns phone | `precedence.strategy: 'field'`, `precedence.fields` |
| 9 | **Multi-directional hub** — 3+ systems | CRM + billing + support | `direction: 'hub'`, per-field provenance enabled |
| 10 | **Structural rendering** — one canonical fact, many destination shapes | Deposit/final invoices | facts in `keys`, shape in `reverseModuleMap` + `ctx` |
| 11 | **Respect downstream deletion** | FreshBooks manual delete | `onDownstreamDelete: 'tombstone'` |
| 12 | **Partial scope** — sync some object types only | FreshBooks `includeExpenses` | `syncObjects` subset per run |
| 13 | **High-volume reconciliation** — match two large record sets | Crossbeam, 750k-record batches | `reconcile()` hash join on POJOs; batched writes |
| 14 | **Detect records removed at source** | Crossbeam `bUniques` → archive | `onSourceDelete: 'tombstone' \| 'archive' \| 'ignore'` |

### 11. Tests and reference implementations

- Unit coverage for all three hashes (match, data, relationship), every precedence strategy, the
  cascade matrix, deferral, and two-phase writes.
- **`reconcile()` gets a correctness suite and a volume benchmark.** Correctness: the four-way
  partition against known inputs, duplicate-key handling under both `useFirstMatchingDuplicate`
  settings, empty and single-sided inputs. Volume: a benchmark asserting linear scaling, which is
  the regression guard that stops a future refactor quietly reintroducing a nested scan. The
  quadratic loop survived years in two repositories precisely because nothing measured it.
- Repository conformance tests across all four backends.
- **Two reference implementations**, because one does not exercise the surface:
  - **Aspire → QBO** (Faulkner) — unidirectional, relationships, structural rendering. Converts
    framework work into a client-visible fix: the update path becomes a property of the engine
    rather than a feature still to build.
  - **A bidirectional pair** — exercises precedence, conflict, and provenance, none of which the
    Faulkner shape touches.

### 12. Migration

Existing bespoke syncs are not rewritten on a schedule. New integrations use the extension. Faulkner
migrates as the primary reference. FreshBooks and Quo are migration candidates once the extension
covers process state and fan-out, but their working implementations are not disturbed before that.
`LHSyncManager` is archaeology, not code to import.

## Consequences

### Positive

- A new destination becomes a `moduleMap` / `reverseModuleMap` pair plus a `ctx` provider, rather
  than a sync rewrite. Faulkner's accounting-platform decision stops carrying a re-implementation
  cost, which removes a constraint from a live client conversation.
- Change detection and propagation become a framework guarantee. The defect behind Aspire invoice
  393 becomes structurally impossible rather than individually fixed.
- Five codebases' hard-won lessons — tombstones, resumable processes, watermarks, fan-out,
  cancellation, error taxonomy, and the hash-join reconciler — become framework capabilities
  instead of tribal knowledge in repos whose last commits are from 2022 and 2023.
- **Reconciliation goes from quadratic to linear.** This is the difference between an engine that
  works on a demo dataset and one that works on a real one, and the fix is a proven, instrumented
  implementation already running at 750,000-record batch scale rather than a new design.
- Deletion detection arrives free with the primitive, closing a gap core does not currently
  acknowledge.
- Bidirectional and multi-directional sync become expressible. Today a field-level mastership
  requirement cannot be met without abandoning the engine entirely.
- 1,552 lines of maintained-but-unused code become load-bearing, or are proven inadequate and
  replaced deliberately.

### Negative

- **The scope is materially larger than "resurrect a dormant module."** Sections 8 and 9 are new
  subsystems, not restoration. This should be staged: primitives and unidirectional push first,
  lifecycle second, bidirectional and hub third. Attempting all of it at once is the likeliest
  failure mode.
- Untested code is being promoted to a supported interface. The dead `isModuleInMap`, the
  constructor gap, and the absence of any exercised path mean the true defect count is unknown.
- Core's `initialSync()` has to be **rewritten**, not wrapped: both its in-memory extraction and
  its quadratic matching loop are load-bearing and both are wrong. This is the single largest piece
  of work, and it invalidates the most attractive framing of this ADR — that the engine is finished
  and merely unexported. It is not finished; it is a correct model with an unusable implementation.
- Per-field provenance for `hub` mode materially increases sync-record storage. It is opt-in for
  that reason, but it will be requested.
- Faulkner absorbs migration risk on a production nightly sync, for a client who has already seen
  one sync defect this quarter. Tests precede cutover, without exception.

### Neutral

- Sync objects become shared vocabulary across integrations, raising the versioning question
  ADR-013 addresses for integrations. Out of scope here; likely to surface. Tracked in [#647](https://github.com/friggframework/frigg/issues/647).
- The core/extension split means sync ships in two places — consistent with ADR-015, but a reader
  looking only in `packages/core/syncs/` will not see the whole engine.
- A stale foreign key after a destination-side delete-and-recreate is a known unhandled edge.
  Detecting it requires read-back or a generation counter. Deliberately deferred.

## Alternatives Considered

**Leave it dormant and keep hand-rolling.** Zero framework cost, and the status quo has shipped
working integrations. Rejected: it has produced four incompatible implementations, the same
relationship workaround twice four years apart, and a client-visible defect whose fix already
exists unused in the tree.

**Delete `packages/core/syncs/` entirely.** Honest about reality, removes maintenance drag.
Rejected: the reconciliation model is sound and the pattern keeps recurring. Deleting it guarantees
a fifth bespoke implementation.

**Promote `quo--frigg`'s orchestrator instead.** It is the most modern implementation and already
handles fan-out, watermarks, and cancellation. Rejected as the *base*, but adopted as the execution
model in §9 — it has no canonical object model, no relationships, and no conflict policy, so it
solves the half core doesn't and vice versa. The decision takes both halves.

**Port `LHSyncManager` forward from `fastspring--integration-service` or
`crossbeam--integration-service`.** Between them they handled relationships and ran at volume.
Rejected as a base: FastSpring's relationship handling is the specific thing this ADR replaces, and
Crossbeam's `LHSyncManager` carries the same quadratic matcher as core — its performance win lives
in `GeneralUtil`, which the sync manager next door never called. The parts worth taking are taken
(§4), not the container.

**Keep the nested-scan matcher and rely on paging to bound `n`.** Superficially attractive: if
pages are capped at 500 records, n² is only 250,000. Rejected — matching must happen across the
*whole* dataset, not within a page, or a record on page 1 of the source will be reported as
"missing from destination" because its counterpart sits on page 9. Paging bounds memory; it cannot
bound a join.

**Adopt a third-party sync engine.** Rejected: the canonical-object-plus-per-module-map model is
tightly coupled to Frigg's API module abstraction, and integration cost would likely exceed
finishing what exists.

**Per-integration base class, no canonical model.** A shared `SyncUseCase` each integration extends,
keeping provider shapes end to end. Simpler and honest about two-system syncs. Rejected: it
preserves the destination coupling that makes Faulkner's platform change expensive, gives
relationships no home, and cannot express multi-directional sync at all.

## Related

- [ADR-015: Extensions Taxonomy](./015-extensions-taxonomy.md) — names "sync engine" as an
  Integration Extension; this ADR acts on that classification
- [ADR-018: Integration Extensions](./018-integration-extensions.md) — the bundle shape and binding
  mechanism the sync extension uses
- [ADR-016: Plugins](./016-plugins.md) — the extension/plugin boundary placing sync above the
  framework, not beneath it
- [ADR-011: Integration Telemetry, Eventing & Feature-Usage Tracking](./011-integration-telemetry-and-usage-tracking.md)
  — already reserves `records.synced`, which this engine emits
- [ADR-021: Ontology](./021-ontology.md) — the provider-vocabulary/platform-neutral separation that
  the `syncedCompany.AccountId` leak violates
- [ADR-013: Integration Version Migrations](./013-integration-version-migrations.md) — the
  versioning question shared sync objects will raise
- **ADR-030 Integration Versioning** — the version *contract* ADR-013 defers to, drafted in
  [#620](https://github.com/friggframework/frigg/pull/620) and landing with #644. It is the ADR
  this one's versioning question actually belongs to.
- [ADR-045: Capability Traits](./045-capability-traits.md) — the declaration layer §2's storage
  tiers negotiate against
- [ADR-046: Canonical Models](./046-canonical-models.md) — ships the category models §6's canonical
  objects populate
- [ADR-047: Orchestrator/Worker Queue Pattern](./047-orchestrator-worker-queue-pattern.md) — the
  execution substrate §9 requires
