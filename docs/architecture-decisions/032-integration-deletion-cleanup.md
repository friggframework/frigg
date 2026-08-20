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
  `Entity.syncIds` / `Sync.entityIds` (`:138-139`, `:273-274`) are a second pair with the
  same property. Prisma forbids referential actions on implicit many-to-many relations and
  does not strip a deleted document's id from the surviving side's scalar list, so any id
  written into these arrays would dangle permanently.
- PostgreSQL join rows are removed by the implicit m2m cascade on both sides of
  `_EntityToIntegration` and `_EntityToSync`
  (`prisma-postgresql/migrations/20250930193005_init/migration.sql:306-315`), so no dangling
  refs are possible there.
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

### Three defects on this path the plan must fix, not inherit

**A retried `DELETE` returns 500, not 404.** `findIntegrationById` *throws* on all three
backends — `integration-repository-mongo.js:195`, `-postgres.js:239`,
`-documentdb.js:71,75` — so the `Boom.notFound` guard at
`delete-integration-for-user.js:38-42` is unreachable dead code. Retrying a delete against an
already-deleted integration produces a plain `Error`, which the middleware boomifies to a 500.
Any plan that names retry as its recovery path has to make that read tolerant first. Do it in
the use case rather than by changing the repositories: callers elsewhere depend on the throw
and match on its message (`handlers/backend-utils.js:99-103`). The existing test double
returns `null`, which is exactly why this has stayed invisible.

**The failure breadcrumb overwrites itself.** `updateIntegrationMessages` reads
`integration.messages` (`integration-repository-mongo.js:254`, `-postgres.js:300`,
`-documentdb.js:110`), but neither schema has a `messages` column — there are four separate
Json arrays, `errors` / `warnings` / `info` / `logs`
(`prisma-postgresql/schema.prisma:164-168`). So the array read is always `[]`, and the write
`data: { [messageType]: messageArray }` replaces the column with a single element. Every
deletion error message destroys the previous one, and any pre-existing errors on the
integration. The purge's error reporting depends on this appending, so it needs fixing here.

**There is a second delete path that skips the lifecycle entirely.**
`application/commands/integration-commands.js:315-339` calls `deleteIntegrationById` raw — no
ownership check, no `IN_DELETION`, no `ON_DELETE` — and its `if (!deleted)` guard at `:325` is
unreachable because every adapter returns a truthy `{ acknowledged, deletedCount }`. Whether
the purge belongs on that path is a decision, not an oversight: it is the developer-facing
primitive, and the sweeper needs an unpurged raw delete. The recommendation is to leave it raw
and document it as such, while exposing the purge as its own command.

One caller must be left alone: `create-integration.js:70-78` deletes the duplicate row it
just created when it loses a concurrent-create race. That row never had entities set up and
owes no teardown — and the surviving integration holds the same entities — so purging there is
wasted work at best. Excluding it is deliberate, noted so a later reader does not "fix" it.

### Two findings that change the design

**`Sync` rows are never linked to their integration.** The schema declares
`Sync.integrationId` as optional with `onDelete: Cascade`
(`prisma-postgresql/schema.prisma:216-218`), but the only framework writer never sets it:
`SyncManager.createSyncDBObject` builds `{ name, entities, hash, dataIdentifiers }`
(`syncs/manager.js:330-337`) and the integration is captured into `this.integration`
(`:33`) and never used again. Every sync row the framework writes therefore has
`integrationId = null`, which means the cascade matches nothing *and* a purge keyed on
`integrationId` alone would delete zero rows. Those rows are only reachable through their
entity ids, so the purge must match on `integrationId` **or** on the integration's entity ids.

The write path looks broken beyond that missing field, which is why fixing it is *not* a
prerequisite here. `upsertSync` passes `syncData` with `entities` as a bare id array into a
Prisma *relation* field (`sync-repository-mongo.js:87-89`), and `_convertFilterToWhere`
spreads the caller's filter straight into `where` (`:225-236`) while `SyncManager` builds that
filter from Mongo operators — `$elemMatch`, `$all` (`manager.js:338-347`). Prisma accepts
neither shape, so there are probably no framework-written `Sync` rows on either Prisma backend
at all. Repairing `SyncManager` is a separate defect with its own test surface; this change
ships the correct purge rules and leaves them accurate whether or not rows exist.

**Deleting an encrypted row can fail after the row is gone.** The Prisma encryption
extension's `delete` hook runs the query and *then* decrypts the returned record
(`database/encryption/prisma-encryption-extension.js:171-182`), and `decryptFields` →
`Cryptor.decrypt` → KMS has no error handling
(`database/encryption/field-encryption-service.js:101`, `encrypt/Cryptor.js:92-98`). So a
KMS outage or a rotated-away key throws *after* the row has been removed: the caller sees a
500 and may retry, but the data is already gone. The affected models are exactly the ones
this purge touches — `Credential` and `IntegrationMapping`
(`database/encryption/encryption-schema-registry.js:16-41`). `deleteMany` is a pure
pass-through with no crypto (`prisma-encryption-extension.js:184-186`), so purge paths
should prefer it.

### The same missing predicate, elsewhere

Integration deletion is where the gap is most visible, but nothing in the codebase
reference-counts these records today. A repo-wide search for reference counting or orphan
cleanup of data records finds one hit, and it is a log line rather than logic:
`[Frigg] findIntegrationByEntityExternalId: entity ${entity.id} has no owning integrations (orphan)`
(`integrations/use-cases/find-integration-by-entity-external-id.js:57`). Orphaned entities
are already a condition the framework recognises at runtime and does nothing about.

Two other paths delete these records with no reference check at all:

- `Module.deauthorize()` (`modules/module.js:206-227`) deletes the `Credential` row
  unconditionally and then unsets `credentialId` on **only the entity it happens to hold in
  memory**. Any sibling entity sharing that credential keeps a dangling pointer. Same
  predicate, same fix — worth doing with the same helper rather than separately.
- The developer command surface exposes the raw primitives with only a truthy-id check:
  `createEntityCommands().deleteEntity` / `deleteEntityById` / `unsetCredential`
  (`application/commands/entity-commands.js:273,294,315`) and
  `createCredentialCommands().deleteCredential` / `deleteCredentialById`
  (`credential-commands.js:203,241`). Those stay as-is — they are the primitives — but the
  safe, reference-counted operation should be reachable from the same surface so integration
  authors are not obliged to reimplement the predicate.

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
| `Sync` | always delete | `integrationId = X` **or** `entityIds ∩ integration.entityIds` | Owned outright, but `integrationId` is never written today (see Context), so the entity-id arm is what actually matches existing rows |
| `DataIdentifier` | always delete | `syncId ∈ deleted syncs` | Cascades from `Sync` on MongoDB/PostgreSQL. On **DocumentDB** there is nothing to delete — identifiers are an embedded array inside the Sync document (`sync-repository-documentdb.js:100-121,201-227`), not a collection, so deleting the sync removes them. The two Mongo-family backends genuinely diverge in storage shape here |
| `Association` | always delete | `integrationId = X` | Owned outright. Note nothing in the codebase reads or writes these models today (`associations/association.js` is an in-memory hashing helper with no repository), so this is future-proofing, not a live orphan source |
| `AssociationObject` | always delete | `associationId ∈ deleted associations` | Cascades on MongoDB/PostgreSQL; explicit on DocumentDB |
| `Process` | always delete | `integrationId = X` | Owned outright. A whole-integration delete makes the hierarchy moot, so children go with it rather than being re-parented |
| `Entity` | delete if orphaned | `findIntegrationsByEntityId(e).filter(i => i.id !== X).length === 0` **and** `entity.isGlobal !== true` **and** `String(entity.userId) === String(integration.userId)` | Shared by design (see Context). The ownership check is strict on purpose: `Entity.userId` is nullable (`prisma-postgresql/schema.prisma:120`) and a null owner is the shape ADR-024 gives a global entity, so a null `userId` **skips**, it does not match |
| `Credential` | delete if orphaned | after entity deletion, `findEntities({ credentialId }).length === 0` | One credential can back several entities |
| `User` | **never** | — | Per app-user, reused across integrations, cascades to everything (see Context). Account erasure is a separate operation |
| `Token` | never | — | Session-scoped, user-scoped. Cascades only if a user is deleted |
| `UsageCounter` | never | — | Explicitly designed to survive integration deletion |
| `WebsocketConnection`, `State` | never | — | No integration, entity, credential or user reference exists |
| `ScriptSchedule`, `AdminScriptExecution` | never | — | App-level admin machinery, not per-integration |
| EventBridge schedules | integration's `onDelete` | — | Job ids are integration-defined and the scheduler port has no list operation. Optional follow-up in step 8 |
| In-flight SQS messages | never | — | Cannot be selectively purged. Handlers must tolerate a missing integration (see §4) |
| S3 report artifacts (ADR-010) | out of scope | — | Keys are execution-scoped (`reports/{executionId}/…`), not integration-scoped, so per-integration purge is impossible by key. Separately: the artifact port has no `delete` at all (`artifacts/repositories/artifact-repository-interface.js:6-25`) and the bucket has no lifecycle policy — worth its own issue. ADR-022 "Artifacts" is a different concept (provider-side deployables) |

### 2. Order of operations

`PurgeIntegrationData.execute({ integrationId, userId, entityIds })`:

1. `integrationMappingRepository.deleteMappingsByIntegration(integrationId)`
2. `processRepository.deleteByIntegrationId(integrationId)`
3. `syncRepository.deleteSyncsForIntegration({ integrationId, entityIds })` — matching either
   arm, because `integrationId` is null on every sync the framework has written so far
4. `associationRepository.deleteByIntegrationId(integrationId)`
5. Orphan sweep, per entity id captured from the integration record **before** anything was
   deleted:
   - `others = findIntegrationsByEntityId(entityId).filter(i => String(i.id) !== String(integrationId))`
   - skip if `others.length > 0` (shared), if the entity is gone, if `entity.isGlobal === true`,
     or if `String(entity.userId) !== String(integration.userId)` — which includes a null
     owner, per the policy table.
     Note `findEntityById` **throws** `Entity <id> not found` on all three backends
     (`module-repository-mongo.js:92-94`, `-postgres.js:126-128`, `-documentdb.js:35-41`)
     rather than returning null, so the "already gone" branch must catch, or the sweep must
     read through `findEntities({ id })` instead. Getting this wrong is what would make a
     retried purge fail instead of converging. `deleteEntity` and `deleteCredentialById`
     already swallow `P2025` and report "nothing deleted"
     (`module-repository-mongo.js:385-398`, `credential-repository-mongo.js:74-86`), so the
     write side of a retry is already safe — it is only the read that throws
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
| `sync-repository-*` | `deleteSyncsForIntegration({ integrationId, entityIds })` | The entity arm must be scoped to *these* entity ids — never "where `integrationId is null`", which would delete every parentless sync in the database. Mongo/Postgres: `prisma.sync.deleteMany`. MongoDB additionally needs its separate `DataIdentifier` rows removed; DocumentDB does not (embedded). Only `deleteSync(id)` exists today (`sync-repository-interface.js:104`) |
| `process-repository-*` | `deleteByIntegrationId(integrationId)` | Only `findByIntegrationAndType` / `findActiveProcesses` exist today (`process-repository-interface.js:102,112`); `deleteById` is single-row (`:130`) |
| `association-repository-*` | new repository | No association repository exists at all; `Association`/`AssociationObject` are referenced only by the schema-init test (`database/utils/mongodb-schema-init.test.js:9`). Add a minimal repository with `deleteByIntegrationId` so DocumentDB is covered and the model stops being invisible |
| `integration-repository-*` | make `deleteIntegrationById` idempotent | Mongo/Postgres throw Prisma `P2025` on a missing row and do not catch it. Catch it and return `deletedCount: 0` so a retried purge does not 500 — same pattern as `deleteUser` (`user-repository-mongo.js:294-301`) and the mapping repositories |

**Prefer `deleteMany` for encrypted models.** `Credential` and `IntegrationMapping` carry
encrypted fields, and the extension's `delete` hook decrypts the deleted row afterwards, so a
KMS failure throws with the row already gone (see Context). `deleteMany({ where: { id } })`
skips the crypto path entirely. That argues for a `deleteCredentialsByIds` bulk method rather
than looping the existing `deleteCredentialById`, which uses `.delete()`
(`credential-repository-mongo.js:74-86`).

**Shared orphan-check helper** — the entity and credential predicates should live in one
place the purge and `Module.deauthorize()` both call, so the deauthorize bug
(`modules/module.js:206-227`, credential deleted without checking sibling entities) is fixed
by construction rather than separately. Expose the reference-counted operation on the
developer command surface alongside the existing raw `deleteEntity` / `deleteCredential`
commands.

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

**Queue/worker guard — a regression this change would otherwise introduce.** The guard
already exists on the `integrationId` path: `createQueueWorker` discards when hydration
returns null and when status is `DISABLED` / `ERROR` / `IN_DELETION`
(`handlers/backend-utils.js:202-229`, tested at `backend-utils.test.js:152-161`). The
`processId` path has no such tolerance — `loadIntegrationForProcess` throws
`Process not found: ${processId}` (`:143-153`). Today such a message hydrates fine and is
discarded on status; once the purge deletes `Process` rows, every in-flight process-keyed
message for a deleted integration starts throwing and lands in the DLQ. Per-integration
queues retain messages for 4 days and the shared error queue for 14
(`devtools/infrastructure/domains/integration/integration-builder.js:462-469,557-574`), so
this is not theoretical. Fixing that one branch is part of this change, not an optional
follow-up.

There is a second, sharper version of the same problem. Both paths hydrate **before** they
check status, and `GetIntegrationInstance` loops the entity ids calling
`moduleFactory.getModuleInstance` with no try/catch
(`integrations/use-cases/get-integration-instance.js:57-63`) — unlike `DeleteIntegrationForUser`,
which wraps each load. Since `findEntityById` throws when the entity is gone, a worker that
arrives during the purge window — `Integration` row still present as `IN_DELETION`, entities
already deleted — throws inside hydration and never reaches the `IN_DELETION` discard at
`backend-utils.js:220-229`. The fix is to check status before hydrating modules, or to make
that loop tolerant the way the delete path already is. This hazard exists today in a narrower
form (any manually-deleted entity does it); the purge widens the window, so closing it belongs
to this change.

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
  gets a 500; a retried `DELETE` resumes and converges. Both halves of that sentence currently
  need a fix to be true: `updateIntegrationMessages` clobbers rather than appends, and a retry
  against an already-deleted integration 500s instead of returning 404 (see Context). Those are
  steps 2 and 3.
- Skips are logged at `warn` with the reason (`shared`, `global`, `foreign-user`,
  `already-gone`) so "why is this entity still here" is answerable from logs.

#### Known limits, stated rather than hidden

- **Check-then-act is not atomic.** Between the reference-count read and the delete, a
  concurrent `createIntegration` could link that entity. There is no unique index or lock to
  fall back on. The window is small and the operation requires the same user to be adding an
  integration while deleting another, but it is real — and it argues for keeping the
  `IN_DELETION` status guard (which stops queue work for this integration) rather than
  deleting the row early.
- **Syncs are not consulted by the entity predicate.** An entity can be referenced by a
  `Sync` even when no integration references it, and on PostgreSQL deleting the entity
  cascades that sync's `DataIdentifier` rows away
  (`prisma-postgresql/schema.prisma:241`). While `Sync.integrationId` is unwritten the syncs
  are unattributable, so the honest position is: after step 2 makes syncs attributable, the
  entity predicate should also require that no *surviving* integration's sync references the
  entity. Until then, pre-existing parentless syncs are the sweeper's problem, not the
  purge's.
- **Org-linked users are skipped, not resolved.** The predicate compares raw ids, while the
  rest of the codebase resolves ownership through `User.ownsUserId`, which understands
  individual↔organization membership (`modules/use-cases/get-module.js:32-35`,
  `test-module-auth.js:37-38`). The purge only has ids, so an entity owned by the individual
  while the integration is owned by the org is skipped. That is the safe direction — a skip
  leaves an orphan, a false match destroys live data — but it means org-configured
  deployments will accumulate some orphans that only the sweeper clears.
- **Deleting a credential forecloses revoking it.** Once the row is gone the refresh token is
  gone with it, so provider-side revocation can never happen afterwards. If revocation is
  added later it has to run *before* the purge — `ON_DELETE`, which already executes first
  with modules loaded, is the natural place.
- **Guard against empty filters on DocumentDB.** `_buildFilter` can drop an unconvertible id
  and return a match-all query. For the credential reference count that fails safe (it looks
  like "still referenced", so nothing is deleted), but any purge filter must assert it is
  non-empty before issuing a `deleteMany`.

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

One constraint makes this more than a scripting job: **admin scripts have no repository
access.** They reach the database only through the injected command bundle —
`{ users, credentials, entities, integrations }`
(`admin-scripts/src/application/admin-script-context.js:7-11`,
`src/infrastructure/bootstrap.js:91-96`) — and the two reads the orphan predicate needs are
not on it:

- `findIntegrationsByEntityId` exists on the repository interface (`:182`) but is not exposed
  as an integration command.
- `commands.entities.findEntity` rejects a filter that carries only `credentialId` — it
  requires `externalId`, `userId` or `moduleName` (`entity-commands.js:92-104`) — so the
  credential reference count is unreachable.

Both writes are already reachable (`integration-commands.js:315`,
`entity-commands.js:273,294`, `credential-commands.js:203,241`). So the sweeper step includes
adding those two reads to the command layer — which is also what makes the reference-counted
operation available to integration authors.

### 8. Optional follow-up: scheduled-job sweep

Add `listSchedules({ namePrefix })` to `scheduler-service-interface.js` plus the EventBridge
and mock adapters (EventBridge Scheduler's `ListSchedules` supports `NamePrefix`), and a
`deleteJobsByPrefix(integrationId)` command. That only helps integrations that include the
integration id in their job ids, so document the convention rather than implying the
framework can clean up arbitrary job names.

## Implementation plan

Each step is independently reviewable and independently verifiable.

1. **This ADR** + a row in `docs/architecture-decisions/README.md`.
2. **Make the delete path retryable.** Translate a not-found read into `Boom.notFound` inside
   `DeleteIntegrationForUser` (`:35-42`), so the existing dead guard becomes live and a retried
   `DELETE` returns 404 rather than 500. Do not change the repositories' throw — other callers
   match on its message.
3. **Fix `updateIntegrationMessages` to append**, against the real `errors` / `warnings` /
   `info` / `logs` columns rather than a `messages` column that does not exist. Without this
   every purge failure erases the previous one's breadcrumb. Align the test double's
   `deleteIntegrationById` return shape at the same time.
4. **Do not fix `SyncManager` here** — file it separately. The purge's sync rules are written
   to be correct either way (entity-id arm included), and the write path needs its own repair
   plus its own tests (see Context). Persisting `integrationId` is the smallest part of that
   defect, and coupling the two would make this change unshippable until the larger one lands.
5. **Repository primitives.** `deleteSyncsForIntegration`,
   `processRepository.deleteByIntegrationId`, a bulk `deleteCredentialsByIds` that uses
   `deleteMany`, the new association repository, and `P2025`-tolerant
   `deleteIntegrationById` — interface first, then mongo / postgres / documentdb.
6. **`PurgeIntegrationData` use case** + unit tests against repository doubles. Test matrix:
   sole-owner entity deleted; shared entity kept; credential with one entity deleted;
   credential with two entities kept; entity with a foreign `userId` skipped; entity with a
   null `userId` skipped; already-deleted entity skipped; `isGlobal` entity skipped
   (forward-compat, asserted against a stub field); sync matched by entity id when
   `integrationId` is null; re-running the whole purge is a no-op.
7. **Wire into `DeleteIntegrationForUser`** + extend
   `tests/use-cases/delete-integration-for-user.test.js`. The existing failure-path tests
   (`:132-232`, `:269-320`, including a `throw null` case) lock in current behaviour — do not
   regress them. The double `test-integration-repository.js` already implements
   `findIntegrationsByEntityId`; what it needs is the bulk deletes, and its
   `deleteIntegrationById` aligned to the real `{ acknowledged, deletedCount }` shape rather
   than a bare boolean. Note its field is `entitiesIds`, matching the domain mapping.
   `DeleteIntegrationForUser` is constructed without `moduleFactory` throughout that suite, so
   it must keep tolerating its absence.
8. **Close the queue-worker window** — two small fixes, both regression guards rather than
   niceties (see §4): make the `processId` path discard a missing process
   (`handlers/backend-utils.js:143-153`) the way the `integrationId` path already discards a
   missing integration, and check integration status *before* hydrating modules so a purge in
   progress cannot throw a message into the DLQ
   (`integrations/use-cases/get-integration-instance.js:57-63`).
9. **Router DI** in `createIntegrationRouter()`.
10. **App-definition `deletion` block** in `app-definition-loader.js` + defaults + a loader test.
11. **Command-layer reads** — expose `findIntegrationsByEntityId`, and let entity lookup filter
   on `credentialId` — then the **orphan sweeper admin script**, dry-run by default.
12. **Docs**: `packages/core/CLAUDE.md`, `docs/DANGER_ZONES.md`, the `onDelete` contract in
   `integration-base.js`, and the `delete` operation in `docs/frigg-management-api.yml:312-322`
   (which documents only the 204 today). Also `packages/core/integrations/EXTENSIONS.md` and
   `WEBHOOK-QUICKSTART.md`: both document registering provider-side webhooks and contain no
   mention of deletion, teardown or `onDelete` anywhere — an author following either is never
   told they own the removal. `EXTENSIONS.md:175` ("Contract enforced by the framework") is the
   natural home for the teardown half.
13. **Optional**: scheduler `listSchedules` + prefix sweep (§8).

No schema migration is required — the change is pure application code. That is deliberate:
it keeps the change deployable to existing installations with no coordination, and it is a
reason to prefer reference counting in the use case over adding schema-level machinery.

## Testing

The repo has no real-database test tier: there is no `testcontainers` dependency, no
`docker-compose` file, and no per-backend jest project. Repository tests are
*command-generation* tests — instantiate the adapter, replace `repo.prisma` with a hand-rolled
fake, and assert on the emitted command shape (exemplars:
`integration-repository-mongo.test.js:15-25`,
`integration-repository-documentdb.test.js:17-30`). Match that habit rather than inventing a
new tier. Use-case tests use the stateful fake in `integrations/tests/doubles/`, and every core
test file starts by mocking `database/config` so requiring a use case does not pull a real
Prisma client (copy `delete-integration-for-user.test.js:1-6`, adjusting the relative depth).

```bash
npm install                                    # from the repo root; needed before any run

cd packages/core
npm test -- integrations/tests/use-cases/      # use-case suites
npm test -- integrations/repositories/         # integration, mapping, process adapters
npm test -- syncs credential modules           # sync, credential, entity adapters
npm test                                       # whole core package

# from the root, what CI runs
npm run test:all
npm run lint:fix --workspaces
```

Note every core jest invocation boots an in-memory mongod via `globalSetup`
(`packages/core/jest.config.js:19-22`), so runs are slower than they look and need the
workspace installed.

Real-database verification is therefore out-of-suite, with the canary harness against
PostgreSQL and MongoDB: create two integrations sharing one entity, delete the first, and
assert the shared entity and its credential survive while the sole-owner pair is gone.
DocumentDB has no local emulator — its adapters are covered by command-shape tests plus a
manual check against a real cluster before release. That gap is worth stating plainly: the
backend with no cascade at all is also the one that cannot be integration-tested locally.

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
- Four latent bugs get fixed on the way: a retried `DELETE` returns 404 instead of 500;
  deletion error messages stop erasing each other; `Module.deauthorize()` stops leaving
  dangling `credentialId` pointers; and queue workers stop DLQ-ing on a missing process. Each
  is a defect on its own merits — the purge is what surfaced them.

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
- Deleting `Process` rows turns a currently-harmless in-flight SQS message into a DLQ entry
  unless the `processId` hydration path is fixed in the same change. That fix is step 6, and
  it is the one part of this plan that is a guard against the plan itself.
- The purge is exercised end to end only against PostgreSQL and MongoDB. DocumentDB — the
  backend this change helps most — has no local emulator, so its adapters get command-shape
  tests and a manual pre-release check.

### Neutral

- `User`, `Token` and `UsageCounter` behaviour is unchanged.
- Existing orphans are untouched until the sweeper is run deliberately.
- `Association` / `AssociationObject` gain a repository with nothing to clean yet — nothing
  in the codebase writes those models today. It is there so DocumentDB is not the odd one out
  if an adopter starts.

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
   land in the same change, or as its own ADR? The pieces are already half-built: `deleteUser`
   exists on all three backends (`user-repository-interface.js:195`), it is exposed to
   developers as `deleteUserById` (`application/commands/user-commands.js:281`) whose docblock
   spells out the manual cascade order but does not perform it, no framework flow calls it,
   and ADR-007 sketches a `DELETE /users/:id` route (`:229`) that was never implemented. An
   erasure use case would give that command the cascade its own documentation asks for.
4. **`UsageCounter` under a lawful erasure request.** The policy here is "never delete", per
   the schema's stated intent, and that is right for integration deletion. But no purge or
   prune path exists at all, so an adopter served an erasure request has no lawful way to
   remove usage rows. Should the erasure use case (question 3) be allowed to purge them —
   making the policy "configurable, default never" — or is aggregation enough to consider them
   non-personal?
5. **Deletion audit log.** Worth recording purge summaries durably (an `AdminScriptExecution`
   -shaped row, or telemetry only)?
6. **Adjacent papercut, in or out?** An ownership mismatch throws a plain `Error`
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
