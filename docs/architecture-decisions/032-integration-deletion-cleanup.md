# ADR-032: Integration Deletion Data Cleanup

**Status**: Proposed
**Date**: 2026-08-20
**Deciders**: TBD

## Context

Deleting an integration removes the `Integration` row and — on two of the three database
backends — whatever the ORM cascades from it. Everything the integration needed in order to
exist (its `Entity` rows, their `Credential` rows) is left in the database forever, and on
DocumentDB even the integration's own child rows survive. Adopters end up with a database
that accumulates dead credentials holding live OAuth refresh tokens.

### What deletion does today

`DELETE /api/integrations/:integrationId` (`integration-router.js:315-324`) calls
`DeleteIntegrationForUser.execute(integrationId, userId)`
(`integrations/use-cases/delete-integration-for-user.js:35-116`), which:

1. Loads the integration and rejects it if `integrationRecord.userId !== userId` (`:50-54`).
2. Best-effort loads a module instance per entity id so provider-side teardown has API
   clients; failures are logged and counted, never fatal (`:56-80`).
3. Instantiates the integration class, `initialize()`s it, and sets status `IN_DELETION`
   (`:82-96`).
4. Sends `ON_DELETE` (`:98`). The base handler is a no-op — `async onDelete(params) {}`
   (`integration-base.js:485`) — so provider-side cleanup (webhooks, subscriptions,
   scheduled EventBridge jobs) happens only if the concrete integration overrides it. If it
   throws, an error message is appended and the status stays `IN_DELETION` (`:99-113`).
5. Calls `integrationRepository.deleteIntegrationById(integrationId)` (`:115`).

Step 5 is the only database write, and what it actually removes differs per backend:

| Backend | Implementation | Cascade behaviour |
|---|---|---|
| PostgreSQL | `prisma.integration.delete` (`integration-repository-postgres.js:178-186`) | Real FK cascades: `IntegrationMapping`, `Sync` (→ `DataIdentifier`), `Association` (→ `AssociationObject`), `Process`, plus the implicit `_EntityToIntegration` join rows (`prisma-postgresql/schema.prisma:196,218,239,261,278,308`) |
| MongoDB | `prisma.integration.delete` (`integration-repository-mongo.js:135-142`) | The same `onDelete: Cascade` declarations exist (`prisma-mongodb/schema.prisma:205,233,270,316`) but there are no DB-level FKs — the actions are **emulated by Prisma Client**, and the repo's own guidance is not to rely on them (see below) |
| DocumentDB | `deleteOne(...)` → `prisma.$runCommandRaw({delete: 'Integration', ...})` (`integration-repository-documentdb.js:52-58`, `database/documentdb-utils.js:91-101`) | **None.** The raw wire-protocol command bypasses the Prisma query engine entirely, so no emulated cascade fires |

`deleteMappingsByIntegration` exists on all three backends
(`integration-mapping-repository-mongo.js:125`, `-postgres.js:180`, `-documentdb.js:193`)
but has **no caller anywhere in the repo** — mapping cleanup today is purely a side effect
of the ORM cascade.

The codebase already records that the MongoDB half of that table is not to be trusted.
`user-repository-mongo.js:275-284`:

> Prisma's `onDelete: Cascade` does NOT work reliably with MongoDB (no database-level
> referential integrity). Integration developers MUST manually cascade delete related
> records before calling this method: 1. Delete integrations … 2. Delete entities …
> 3. Delete credentials … 4. Finally delete user

So the manual-cascade requirement, and even its ordering, is already written down for the
user path. This ADR applies the same rule to the integration path.

There is also no re-entrancy guard: the record's existing status is never inspected, so a
retried or concurrent `DELETE` re-runs `persistStatus` and the full `ON_DELETE` teardown.
`onDelete` implementations therefore have to be idempotent already — the change below does
not introduce that requirement, but it does make it worth documenting.

### What is left behind

Left behind on **every** backend:

- `Entity` rows for every entity the integration used.
- `Credential` rows behind those entities — including encrypted `access_token` /
  `refresh_token` / `domain` fields (`database/encryption/encryption-schema-registry.js`).
  A revoked-but-undeleted credential is the worst of the set: live secrets at rest with no
  owner.
- The `User` row and its `Token` rows.

Left behind on **DocumentDB always** (no cascade of any kind fires), and on **MongoDB
whenever the emulated cascade does not**: `IntegrationMapping`, `Process`, `Sync`,
`DataIdentifier`, `Association`, `AssociationObject`. PostgreSQL is the only backend where
these are reliably removed, because it is the only one with real foreign keys.

Dangling references:

- MongoDB `Entity.integrationIds` is a scalar ObjectId list
  (`prisma-mongodb/schema.prisma:135-136`). `createIntegration` writes only the
  `Integration.entityIds` side (`integration-repository-mongo.js:315-328`), so the entity
  side is already never populated. Every `Integration ↔ Entity` read in the codebase goes
  through the integration side (`entityIds: { has: entityId }`,
  `integration-repository-mongo.js:283-291`), which is why nothing has broken. Cleanup code
  must keep using the integration side and must not start trusting `Entity.integrationIds`.
- PostgreSQL join rows are removed by the implicit m2m cascade, so no dangling refs there.
- MongoDB `Process` has no parent/child *relation* — just `childProcesses String[]` /
  `parentProcessId String?` (`prisma-mongodb/schema.prisma:247-248`) — whereas PostgreSQL
  declares a self-relation with `onDelete: SetNull`
  (`prisma-postgresql/schema.prisma:322-324`). Process-hierarchy pointers therefore go stale
  on MongoDB and are nulled on PostgreSQL.
- DocumentDB writes `IntegrationMapping.integrationId` as a plain string
  (`integration-mapping-repository-documentdb.js:122,282-289`) while the shared mongodb
  schema declares it `@db.ObjectId`. Purge filters must match per backend: ObjectId for
  MongoDB/Prisma, raw string for DocumentDB.

Deliberately retained, and must stay retained:

- `UsageCounter` — "deliberately isolated: no userId and no foreign key to Integration, so
  … usage history survives integration deletion"
  (`prisma-postgresql/schema.prisma:416-418`, `prisma-mongodb/schema.prisma:434-436`).
- `WebsocketConnection` and `State` — neither model has a user, entity or integration
  reference at all (`prisma-postgresql/schema.prisma:343-353`).
- `ScriptSchedule` / `AdminScriptExecution` — app-level admin machinery (ADR-005), never
  per-integration.

Outside the database:

- EventBridge one-time schedules created via `createSchedulerCommands()`
  (`application/commands/scheduler-commands.js:104,188`). Job ids are integration-defined
  strings (`'zoho-notif-renewal-abc123'`, `:14`) and the scheduler port exposes only
  `scheduleOneTime` / `deleteSchedule` / `getScheduleStatus`
  (`infrastructure/scheduler/scheduler-service-interface.js:22,32,42`) — there is no list
  operation, so the framework cannot enumerate an integration's schedules.
- In-flight SQS messages naming the deleted integration.
- Provider-side webhooks and subscriptions.

### Why "delete everything the integration touches" is the wrong predicate

Three records are shared by design, and deleting them unconditionally is data loss:

1. **`Entity` is shared across integrations.** `findOrCreateEntity` matches on
   `{ externalId, user, moduleName }` and returns the existing row
   (`modules/use-cases/process-authorization-callback.js:202-232`); it only creates when no
   match exists (`:233-238`). ADR-024 states the goal explicitly — "One Nagaris entity
   should serve both Nagaris CRM integration AND Nagaris Analytics integration"
   (`docs/MULTI_STEP_AUTH_AND_SHARED_ENTITIES_SPEC.md:11,37-40`). The schema models it as
   many-to-many on all backends.
2. **`Credential` is shared across entities.** `Credential.entities` is one-to-many
   (`prisma-postgresql/schema.prisma:109`), `upsertCredential` matches an existing
   credential by `externalId`, and re-auth explicitly repoints an entity at a different
   credential (`process-authorization-callback.js:212-229`). PostgreSQL even declares
   `Entity.credential` as `onDelete: SetNull` (`:119`), i.e. the schema's own answer to
   "credential deleted" is "orphan the entity", not "delete it".
3. **`User` is per app-user, not per integration.** Users are looked up by `appUserId` /
   `appOrgId` on every authenticated request
   (`user/use-cases/authenticate-user.js:51-93`,
   `get-user-from-x-frigg-headers.js`, `get-user-from-adopter-jwt.js:76-113`), and
   `User.integrations` is a list (`prisma-postgresql/schema.prisma:56`). Deleting the user
   when one of their integrations is deleted would cascade away every other integration
   that user owns (`onDelete: Cascade` on `Integration.user`, `:152`), their credentials
   (`:97`), their entities (`:121`) and their sessions (`:82`). It would also break the
   next authenticated request for a user the adopter's app still considers active.

Global entities (ADR-024) sharpen the same point: an app-owner-owned entity is intended to
back many users' integrations. The `isGlobal` field does not exist in the schema or the
code yet (ADR-024 is Proposed and notes the feature is non-functional for exactly that
reason), so it cannot be checked today — but the predicate must be written so that adding
the check later is a one-line change.

## Decision

Add an explicit, backend-uniform purge that runs as part of integration deletion. Nothing
relies on ORM cascades any more; the same code path produces the same end state on
MongoDB, PostgreSQL and DocumentDB. Records the integration owns outright are deleted
unconditionally. Records that can be shared are deleted only when the integration being
deleted was their last referent. The `User` row is never touched.

### 1. Deletion policy

| Record | Policy | Predicate | Rationale |
|---|---|---|---|
| `Integration` | always delete | — | The thing being deleted. Deleted **last**, so `IN_DELETION` remains a durable checkpoint for the whole purge |
| `IntegrationMapping` | always delete | `integrationId = X` | Owned outright. Explicit call, not cascade — DocumentDB has none |
| `Sync` | always delete | `integrationId = X` | Owned outright |
| `DataIdentifier` | always delete | `syncId ∈ deleted syncs` | Cascades from `Sync` on MongoDB/PostgreSQL; explicit `deleteMany` on DocumentDB |
| `Association` | always delete | `integrationId = X` | Owned outright |
| `AssociationObject` | always delete | `associationId ∈ deleted associations` | Cascades on MongoDB/PostgreSQL; explicit on DocumentDB |
| `Process` | always delete | `integrationId = X` | Owned outright. A whole-integration delete makes the hierarchy moot, so children go with it rather than being re-parented |
| `Entity` | delete if orphaned | `findIntegrationsByEntityId(e).filter(i => i.id !== X).length === 0` **and** `entity.isGlobal !== true` **and** `entity.userId === integration.userId` | Shared by design (see Context). The user check is defensive: an entity owned by another user is never collateral of this delete |
| `Credential` | delete if orphaned | after entity deletion, `findEntities({ credentialId }).length === 0` | One credential can back several entities |
| `User` | **never** | — | Per app-user, reused across integrations, cascades to everything (see Context). Account erasure is a separate operation |
| `Token` | never | — | Session-scoped, user-scoped. Cascades only if a user is deleted |
| `UsageCounter` | never | — | Explicitly designed to survive integration deletion |
| `WebsocketConnection`, `State` | never | — | No integration, entity, credential or user reference exists |
| `ScriptSchedule`, `AdminScriptExecution` | never | — | App-level admin machinery, not per-integration |
| EventBridge schedules | integration's `onDelete` | — | Job ids are integration-defined and the scheduler port has no list operation. Optional follow-up in step 8 |
| In-flight SQS messages | never | — | Cannot be selectively purged. Handlers must tolerate a missing integration (see §4) |
| S3 artifacts (ADR-022) | out of scope | — | Separate lifecycle; call out explicitly rather than half-handle it |

### 2. Order of operations

`PurgeIntegrationData.execute({ integrationId, userId, entityIds })`:

1. `integrationMappingRepository.deleteMappingsByIntegration(integrationId)`
2. `processRepository.deleteByIntegrationId(integrationId)`
3. `syncRepository.deleteSyncsByIntegrationId(integrationId)`
4. `associationRepository.deleteByIntegrationId(integrationId)`
5. Orphan sweep, per entity id captured from the integration record **before** anything was
   deleted:
   - `others = findIntegrationsByEntityId(entityId).filter(i => String(i.id) !== String(integrationId))`
   - skip if `others.length > 0` (shared), if the entity is gone, if `entity.isGlobal === true`,
     or if `entity.userId` is set and differs from the integration's `userId`.
     Note `findEntityById` **throws** `Entity <id> not found` on all three backends
     (`module-repository-mongo.js:92-94`, `-postgres.js:126-128`, `-documentdb.js:35-41`)
     rather than returning null, so the "already gone" branch must catch, or the sweep must
     read through `findEntities({ id })` instead. Getting this wrong is what would make a
     retried purge fail instead of converging
   - remember `credentialId = entity.credential?.id`, then `moduleRepository.deleteEntity(entityId)`
   - if `credentialId` and `findEntities({ credentialId }).length === 0` →
     `credentialRepository.deleteCredentialById(credentialId)`
6. `integrationRepository.deleteIntegrationById(integrationId)`

Two properties fall out of that ordering, and both are the reason for it:

- **One durable checkpoint.** The `Integration` row — and therefore its `IN_DELETION`
  status and its `errors` messages — survives until the very last step. A crash anywhere in
  1–5 leaves a record an operator (or a retried `DELETE`) can still see and act on. That is
  why the reference-count predicate excludes the integration explicitly instead of relying
  on the row already being gone.
- **Idempotence, so retry is the recovery story.** Every step is "delete rows matching this
  id" or "delete this row if nothing else points at it". Re-running the purge after a
  partial failure converges to the same end state. Children are deleted before parents, so
  no step can violate a PostgreSQL FK.

Deleting entities while the `Integration` row still exists is safe: on PostgreSQL the
implicit `_EntityToIntegration` join rows cascade from the entity, and
`DataIdentifier`/`AssociationObject` rows referencing that entity cascade too
(`prisma-postgresql/schema.prisma:241,280`) — all of them already dead by that point.

### 3. Transactions

Do not require them. PostgreSQL can wrap steps 1–4 and 6 in `prisma.$transaction`, but
Prisma transactions on MongoDB need a replica set (not guaranteed in local Docker setups),
and the DocumentDB adapter issues one `$runCommandRaw` per operation with no transaction
helper in `documentdb-utils.js` at all. Rather than a capability that silently exists on one
backend, the ordering above is chosen so that a partial failure can only leave *extra*
rows — never a dangling reference — and the retry/sweeper path finishes the job. A
per-backend `runInTransaction(fn)` that PostgreSQL implements and the others no-op is a
reasonable later refinement, not a prerequisite.

### 4. Code changes

**New use case** — `packages/core/integrations/use-cases/purge-integration-data.js`,
exported from `use-cases/index.js`. Constructor-injected:
`integrationRepository`, `integrationMappingRepository`, `processRepository`,
`syncRepository`, `associationRepository`, `moduleRepository`, `credentialRepository`,
plus a `policy` object (§5). Returns a summary — counts deleted per model, and a list of
`{ entityId, reason }` skips — so the caller can log it and telemetry can count it.

**`DeleteIntegrationForUser`** — inject `purgeIntegrationData` and replace the bare
`deleteIntegrationById` call (`:115`) with a purge call that receives the entity ids
snapshotted from the record at `:60`. Keep the existing `ON_DELETE` failure semantics
untouched: provider-side teardown must still succeed before any local data is destroyed.

**Repository methods to add** (interface + all three adapters + tests):

| Repository | Method | Notes |
|---|---|---|
| `sync-repository-*` | `deleteSyncsByIntegrationId(integrationId)` | Mongo/Postgres: `prisma.sync.deleteMany`. DocumentDB: `deleteMany` on `Sync`, then `DataIdentifier` by the collected sync ids — no cascade there |
| `process-repository-*` | `deleteByIntegrationId(integrationId)` | Only `findByIntegrationAndType` / `findActiveProcesses` exist today (`process-repository-interface.js:102,112`); `deleteById` is single-row (`:130`) |
| `association-repository-*` | new repository | No association repository exists at all; `Association`/`AssociationObject` are referenced only by the schema-init test (`database/utils/mongodb-schema-init.test.js:9`). Add a minimal repository with `deleteByIntegrationId` so DocumentDB is covered and the model stops being invisible |
| `integration-repository-*` | make `deleteIntegrationById` idempotent | Mongo/Postgres throw Prisma `P2025` on a missing row and do not catch it. Catch it and return `deletedCount: 0` so a retried purge does not 500 — same pattern as `deleteUser` (`user-repository-mongo.js:294-301`) and the mapping repositories |

Already present and reused unchanged: `findIntegrationsByEntityId`
(`integration-repository-mongo.js:283`, `-postgres.js:464`, `-documentdb.js:43`),
`deleteMappingsByIntegration`, `moduleRepository.findEntityById` / `findEntities` /
`deleteEntity` (`module-repository-mongo.js:385`, `-postgres.js:428`, `-documentdb.js:189`),
`credentialRepository.deleteCredentialById` (`credential-repository-mongo.js:74`,
`-postgres.js:88`, `-documentdb.js:68`).

**DI wiring** — `createIntegrationRouter()` already builds `moduleRepository`,
`integrationRepository` and `credentialRepository`
(`integration-router.js:73-115`); add the mapping, process, sync and association factories
(`createIntegrationMappingRepository`, `createProcessRepository`, `createSyncRepository` all
exist) and pass the purge use case into `DeleteIntegrationForUser` at `:111`.

**Queue/worker guard** — an in-flight SQS message for a deleted integration must fail
closed, not loudly: workers that hydrate an integration by id should treat "not found" as a
completed message (ack and drop) rather than retry into the DLQ.

### 5. Configuration

Cascade-deleting credentials is the one part of this that an adopter might reasonably want
off (an installation that treats credentials as long-lived connections, reused when the user
re-adds an integration). Add a `deletion` block to the app definition:

```javascript
// backend/index.js
Definition = {
    deletion: {
        purgeOrphanedEntities: true,    // default true
        purgeOrphanedCredentials: true, // default true
    },
};
```

`loadAppDefinition()` destructures a fixed key set and returns a fixed object
(`handlers/app-definition-loader.js:33-38,62`), so the key must be added there and defaulted
to `{}`. Steps 1–4 and 6 are not configurable — those rows are the integration's own and
have no other referent.

### 6. Failure handling

- `ON_DELETE` failure keeps today's behaviour exactly: error message appended, status stays
  `IN_DELETION`, nothing purged, error rethrown (`:99-113`). Provider-side teardown before
  local destruction stays the invariant.
- Purge failure: log with the integration id and the step that failed, append an `errors`
  message via `updateIntegrationMessages`, leave the row `IN_DELETION`, rethrow. The client
  gets a 500; a retried `DELETE` resumes and converges.
- Skips are logged at `warn` with the reason (`shared`, `global`, `foreign-user`,
  `already-gone`) so "why is this entity still here" is answerable from logs.

### 7. Orphan sweeper

Existing deployments already hold orphans — every integration ever deleted, plus every
child row on DocumentDB. Ship an admin script (ADR-005 runner) `purge-orphaned-records`
that reports counts by default and deletes with `--apply`:

- `Entity` rows no integration references, respecting the same skip predicates
- `Credential` rows no entity references
- `IntegrationMapping` / `Sync` / `DataIdentifier` / `Association` / `AssociationObject` /
  `Process` rows whose parent id no longer resolves

It doubles as the recovery path for a purge that failed after the `Integration` row was
already gone.

### 8. Optional follow-up: scheduled-job sweep

Add `listSchedules({ namePrefix })` to `scheduler-service-interface.js` plus the EventBridge
and mock adapters (EventBridge Scheduler's `ListSchedules` supports `NamePrefix`), and a
`deleteJobsByPrefix(integrationId)` command. That only helps integrations that include the
integration id in their job ids, so document the convention rather than implying the
framework can clean up arbitrary job names.

## Implementation plan

Each step is independently reviewable and independently verifiable.

1. **This ADR** + a row in `docs/architecture-decisions/README.md`.
2. **Repository primitives.** `deleteSyncsByIntegrationId`, `processRepository.deleteByIntegrationId`,
   the new association repository, and `P2025`-tolerant `deleteIntegrationById` — interface
   first, then mongo / postgres / documentdb, with a repository test per backend.
3. **`PurgeIntegrationData` use case** + unit tests against repository doubles. Test matrix:
   sole-owner entity deleted; shared entity kept; credential with one entity deleted;
   credential with two entities kept; foreign-user entity skipped; already-deleted entity
   skipped; `isGlobal` entity skipped (forward-compat, asserted against a stub field);
   re-running the purge is a no-op.
4. **Wire into `DeleteIntegrationForUser`** + extend
   `tests/use-cases/delete-integration-for-user.test.js` and the doubles in
   `tests/doubles/` (`test-integration-repository.js` needs the ref-count and bulk-delete
   methods).
5. **Router DI** in `createIntegrationRouter()`.
6. **App-definition `deletion` block** in `app-definition-loader.js` + defaults + a loader test.
7. **Orphan sweeper admin script** with dry-run default.
8. **Queue/worker "integration not found → ack" guard.**
9. **Docs**: `packages/core/CLAUDE.md` deletion section, `docs/DANGER_ZONES.md`, the
   `onDelete` contract in `integration-base.js` (what the framework cleans up vs. what the
   integration still owns — provider webhooks and scheduled jobs — and that `onDelete` must
   be idempotent because a retried `DELETE` re-runs it), and the `delete` operation in
   `docs/frigg-management-api.yml:312-322`, which currently documents only the 204.
10. **Optional**: scheduler `listSchedules` + prefix sweep (§8).

No schema migration is required — the change is pure application code. That is deliberate:
it keeps the change deployable to existing installations with no coordination, and it is a
reason to prefer reference counting in the use case over adding schema-level machinery.

## Testing

- Use case unit tests: `cd packages/core && npx jest integrations/tests/use-cases/`
- Repository tests per backend: `cd packages/core && npx jest integrations/repositories syncs credential modules`
- Full package: `cd packages/core && npx jest` — and `npm run test:all` from the root before
  the PR, per `CLAUDE.md`.
- Real-database verification (PostgreSQL and MongoDB via Docker, no mocks) with the
  `frigg-canary-test` harness: create an integration, add a second integration sharing one
  entity, delete the first, and assert the shared entity and its credential survive while
  the sole-owner entity and credential are gone. DocumentDB has no local emulator; its
  adapter is covered by unit tests plus a manual check against a real cluster before
  release.

## Consequences

### Positive

- Deleting an integration stops leaving live OAuth refresh tokens at rest.
- DocumentDB stops orphaning the integration's own child rows — currently the worst-affected
  backend and the least obvious, because the schema *says* `onDelete: Cascade`.
- One code path, one end state, for all three backends. Deletion behaviour becomes
  something you can read in a use case instead of inferring from a schema annotation plus
  the ORM's emulation rules plus which adapter you happen to be running.
- Shared entities (ADR-024) get a deletion story before the feature ships, rather than
  after the first data-loss report.

### Negative

- More repository surface: three new bulk-delete methods across three backends, plus a
  repository for a model that had none.
- Deletion is now a multi-step destructive operation without a transaction on two of three
  backends. Mitigated by ordering and idempotence, but a partial failure does leave extra
  rows until a retry or the sweeper runs.
- Deleting a credential does not revoke it at the provider. The token stops existing locally
  and keeps existing upstream until it expires — worth stating plainly rather than implying
  full teardown.
- Reference counting costs one query per entity plus one per credential. Negligible at
  realistic entity counts, and only on the delete path.

### Neutral

- `User`, `Token` and `UsageCounter` behaviour is unchanged.
- Existing orphans are untouched until the sweeper is run deliberately.

## Alternatives Considered

**Lean on schema referential actions.** Making the ORM do the work fails on both ends: it
cannot express "delete only if nothing else references this" (which is the entire
shared-entity problem), and it does not run at all on DocumentDB, where the adapter bypasses
the query engine. It also would not fire for the `Entity → Credential` direction, which
PostgreSQL deliberately declares `SetNull`.

**Soft delete (`deletedAt` everywhere).** Reversible and audit-friendly, but it does not
solve the stated problem — the secrets stay in the database — and every read path in the
codebase would need a `deletedAt: null` filter, which is a large, easy-to-miss change. If
audit history is wanted, the right shape is an append-only deletion log recording what was
purged, not tombstoned rows.

**Delete the `User` too.** The maintainer's framing named the user record, so it is worth
being explicit: it is not safe. Users are keyed by the adopter's `appUserId`, reused across
integrations, and cascade to every integration, credential, entity and session they own.
"Erase this account and everything in it" is a legitimate operation — as a separate,
explicitly-invoked use case (a GDPR erasure path), not as a side effect of deleting one
integration.

**Fire-and-forget async purge (queue a cleanup job).** Keeps the API response fast, but
splits the durable state across a queue and hides failures. The synchronous purge with
`IN_DELETION` as the checkpoint keeps one place to look.

## Open questions for the maintainer

1. **Credential purge default.** Recommend `purgeOrphanedCredentials: true`, since dead
   credentials holding live refresh tokens are the main motivation. Adopters who treat a
   credential as a reusable connection may want `false`.
2. **Provider-side revocation.** Should credential deletion attempt an OAuth revoke where
   the module supports it? Not currently modelled in `requiredAuthMethods`; would need a new
   optional method.
3. **Account erasure.** Should the GDPR-style "delete user and everything they own" use case
   land in the same change, or as its own ADR?
4. **Deletion audit log.** Worth recording purge summaries durably (an `AdminScriptExecution`
   -shaped row, or telemetry only)?
5. **Adjacent papercut, in or out?** An ownership mismatch throws a plain `Error`
   (`delete-integration-for-user.js:51-53`), which the error middleware boomifies to a 500
   `{"error":"Internal Server Error"}` (`handlers/app-handler-helpers.js:26-37`) instead of a
   403/404. One-line fix in the same file this change already touches, but it is a
   behaviour change for API clients, so it should be an explicit yes/no rather than a
   drive-by.

## Related

- ADR-005: Admin Script Runner Service — home for the orphan sweeper
- ADR-011: Integration Telemetry, Eventing & Feature-Usage Tracking — why `UsageCounter` survives
- ADR-022: Artifacts — S3 artifact lifecycle, explicitly out of scope here
- ADR-024: Global Entities — `isGlobal` skip predicate, pending that field existing
- `docs/MULTI_STEP_AUTH_AND_SHARED_ENTITIES_SPEC.md` — shared-entity design intent
