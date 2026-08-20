# ADR-032: Integration Deletion Data Cleanup

**Status**: Proposed
**Date**: 2026-08-20
**Deciders**: TBD

## Context

Deleting an integration removes one row: the `Integration` record. Everything that integration
needed in order to work stays in the database — its `Entity` records, and the `Credential`
records holding the OAuth access and refresh tokens. Those tokens are still valid. Nobody owns
them any more, and nothing will ever clean them up.

How much of the integration's *own* data goes away depends on which database you run:

| Backend | What happens | Result |
|---|---|---|
| PostgreSQL | Real foreign keys with `ON DELETE CASCADE` | Mappings, associations and processes are removed |
| MongoDB | Same `onDelete: Cascade` in the schema, but no real foreign keys — Prisma emulates it | The same set, usually. The repo already warns against relying on it (`user-repository-mongo.js`) |
| DocumentDB | The adapter deletes through `$runCommandRaw`, which bypasses Prisma's query engine | Nothing cascades. Every child row is orphaned too |

Syncs are the exception on every backend. The cascade is declared, but `SyncManager` never writes
`Sync.integrationId`, so for every sync the framework has created that foreign key is null and
matches nothing — see the fourth bug below.

So the schema says one thing and the behaviour is three different things. DocumentDB is the
worst affected and the least obvious, because the schema *does* say `Cascade`.

### Why we can't just delete everything the integration points at

Three records are shared on purpose, and deleting them blindly would destroy live data:

- **An `Entity` can belong to more than one integration.** Entities are found-or-created per
  user, module and external id (`process-authorization-callback.js`), so two integrations that
  use the same HubSpot account share one entity row.
- **A `Credential` can back more than one entity.** The schema even says what should happen
  when a credential goes away: `Entity.credential` is `onDelete: SetNull`, meaning "orphan the
  entity", not "delete it".
- **A `User` is one app user, not one integration.** Users are looked up by `appUserId` on every
  authenticated request, and one user owns many integrations. Deleting the user would sign them
  out of everything.

So the rule cannot be "delete what it touches". It has to be "delete what it owns, plus what
nothing else needs".

### Four existing bugs on this path

Found while working this out. Each is a real bug on its own, and this change depends on all
four being fixed:

1. **A retried delete returns 500, not 404.** `findIntegrationById` throws on all three
   backends, so the `Boom.notFound` check in the delete use case is unreachable. That matters
   because retrying is meant to be the recovery path.
2. **Deletion error messages erase each other.** `updateIntegrationMessages` reads a `messages`
   column that does not exist — there are four separate arrays (`errors`, `warnings`, `info`,
   `logs`) — so it always reads empty and writes a single-element array over the top.
3. **Queue workers will start dead-lettering.** Workers discard messages for a deleted or
   `IN_DELETION` integration, but only after hydrating it, and hydration throws if an entity is
   missing. The `processId` path throws outright. Once we delete processes and entities, messages
   that used to be discarded cleanly will fail instead.
4. **Sync rows are never linked to their integration.** `SyncManager` never writes
   `Sync.integrationId`, so the cascade the schema declares has never matched a row.

## Decision

Add a `PurgeIntegrationData` use case that runs inside the existing delete flow: after
`ON_DELETE` (so provider-side teardown still happens first), and before the `Integration` row is
removed (so the `IN_DELETION` status keeps queue work away while we work).

The rules:

| Record | What we do | When |
|---|---|---|
| `IntegrationMapping`, `Process`, `Sync`, `DataIdentifier`, `Association`, `AssociationObject` | Always delete | They belong to this integration and nothing else |
| `Entity` | Delete only if orphaned | No other integration references it, and its `userId` matches the integration's |
| `Credential` | Delete only if orphaned | No entity is left pointing at it |
| `User`, `Token` | Never | One user owns many integrations |
| `UsageCounter` | Never | Deliberately kept so usage history survives deletion |
| `WebsocketConnection`, `State`, `ScriptSchedule`, `AdminScriptExecution` | Never | Not tied to an integration at all |
| EventBridge jobs, provider webhooks | The integration's `onDelete` | The framework cannot list them |
| In-flight SQS messages | Nothing | Cannot be purged selectively; workers discard them instead |

Order matters, so the steps run children first and the integration row last:

1. Delete the integration's own children, deepest first, so nothing is left pointing at a parent
   that is already gone. DocumentDB cascades nothing, so each level is deleted explicitly rather
   than assumed:
   - `DataIdentifier`, then `Sync`. Match syncs on integration id **or** on the integration's
     entity ids — the second arm matters, because matching on `Sync.integrationId` alone would
     delete nothing today. Scope it to *those* entity ids, never to "where `integrationId` is
     null", which would take every parentless sync in the database. On DocumentDB the
     identifiers are an embedded array inside the sync document, so deleting the sync removes
     them and there is no separate collection to clear.
   - `AssociationObject`, then `Association`.
   - `IntegrationMapping` and `Process`, by integration id.
2. For each entity: count the *other* integrations using it. Skip it if any remain, if it is
   marked global, or if its `userId` does not match. Otherwise delete it, and remember its
   credential id.
3. For each remembered credential: delete it only if no entities are left pointing at it.
4. Delete the `Integration` row.

Every step is explicit, in the use case, and identical on all three backends. We do not rely on
the ORM's cascade behaviour, because it differs per backend and one backend has none. Extra
deletes on PostgreSQL are harmless — the rows are already gone.

Three details worth writing down:

- **Ownership is strict.** `Entity.userId` is nullable, and a null owner is the shape a global
  entity takes (ADR-024), so a null `userId` skips rather than matches. Skipping leaves an
  orphan; a false match destroys live data.
- **Prefer `deleteMany` for encrypted rows.** The encryption extension's `delete` hook decrypts
  the deleted record *after* the delete, with no error handling down to KMS, so a bad key throws
  with the row already gone. `deleteMany` skips that path.
- **On MongoDB, count from the integration side.** `Entity.integrationIds` is never written, so
  reference counting must query `Integration.entityIds`.

Credential deletion is behind `deletion.purgeOrphanedCredentials` in the app definition,
defaulting to on. Entities and the integration's own children are not configurable.

Existing deployments already hold orphans from every integration ever deleted. A
`purge-orphaned-records` admin script reports counts by default and deletes with `--apply`. It
needs two new command-layer reads first, because admin scripts talk to the database only through
commands, and neither "which integrations use this entity" nor "which entities use this
credential" is exposed today.

No schema migration is required. This is application code, so it deploys to existing
installations with no coordination.

## Consequences

### Positive

- Deleting an integration stops leaving valid OAuth refresh tokens at rest.
- DocumentDB stops orphaning the integration's own child rows.
- Deletion behaviour becomes something you can read in one use case, instead of inferring it
  from a schema annotation plus the ORM's emulation rules plus which adapter you happen to run.
- Shared entities (ADR-024) get a deletion story before the feature ships.
- Four latent bugs get fixed on the way.

### Negative

- More repository surface: bulk deletes across three backends, plus a repository for a model
  that has none today.
- Deletion is a multi-step destructive operation with no transaction on two of three backends.
  A partial failure leaves extra rows until a retry or the sweeper runs.
- Deleting a credential does not revoke it upstream. The token stops existing locally and keeps
  existing at the provider until it expires. And once the row is gone we can never revoke it, so
  if revocation is added later it has to run before the purge.
- Checking then deleting is not atomic. A concurrent create could link an entity in between.
  The window is small and there is no lock to fall back on.
- The purge is only tested end to end against PostgreSQL and MongoDB. DocumentDB has no local
  emulator, so it gets unit tests and a manual check — and it is the backend this helps most.

### Neutral

- `User`, `Token` and `UsageCounter` behaviour is unchanged.
- Existing orphans stay until someone runs the sweeper.
- Org-linked users are skipped rather than resolved. The purge compares ids, while the rest of
  the codebase resolves ownership through `User.ownsUserId`, so some org setups will accumulate
  orphans that only the sweeper clears.

## Alternatives Considered

- **Fix the schema and let the database cascade.** Rejected: it cannot express "delete only if
  no one else needs this", and it does nothing for DocumentDB, which never reaches the query
  engine.
- **Delete the user too.** Rejected: users are per app user and own many integrations. This is a
  separate account-erasure operation, not part of deleting one integration.
- **Soft delete (a `deletedAt` column).** Rejected: it does not solve the problem. The point is
  to stop storing live credentials, and a soft-deleted credential is still a stored credential.
- **Leave it to each integration's `onDelete`.** Rejected: every integration would reimplement
  reference counting, and the default handler is a no-op, so most would simply not do it.
- **Sweep on a schedule instead of on delete.** Rejected as the primary mechanism — credentials
  would linger for a whole sweep interval. Kept as the backstop for existing orphans and failed
  purges.

## Open Questions

1. **Provider-side revocation.** Should deleting a credential try to revoke it upstream where
   the module supports it? Best-effort, or fail the delete?
2. **Account erasure.** Should there be a separate "delete this user and everything they own"
   use case? The four-step order is already documented in `user-repository-mongo.js` and
   implemented nowhere.
3. **`UsageCounter` and lawful erasure.** The policy here is "never delete", which is right for
   integration deletion. But no prune path exists at all, so an adopter served an erasure
   request has no lawful way to remove usage rows.
4. **Audit trail.** Worth recording what each purge deleted, somewhere durable?

## Related

- [ADR-024: Global Entities](./024-global-entities.md) — the sharing model this must not break
- [ADR-005: Admin Script Runner](./005-admin-script-runner.md) — how the orphan sweeper ships
- [ADR-010: Reporting as an Admin Operation](./010-reporting-as-admin-operation.md) — owns the S3
  report artifacts, which are execution-scoped and out of scope here
- Implementation: `packages/core/integrations/use-cases/delete-integration-for-user.js`,
  `packages/core/integrations/repositories/`, `packages/core/modules/repositories/`,
  `packages/core/credential/repositories/`
