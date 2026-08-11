# ADR-031: Concurrent OAuth Credential Refresh Across Lambda Invocations

**Status**: Proposed
**Date**: 2026-08-11
**Deciders**: TBD

## Context

This document is written in ASD-STE100 Simplified Technical English.

### Terms used in this document

- **Invocation** means one run of an AWS Lambda function.
- **Credential record** means the database row that holds the tokens for one
  connection.
- **Access token** means a short-life token. The app sends it with each API
  request.
- **Refresh token** means a long-life token. The app uses it to get a new
  access token.
- **Rotation** means the provider issues a new refresh token and kills the
  old one.
- **Race** means two invocations do the same operation at almost the same
  time. One wins. One loses.
- **401** means the HTTP status code for "not authorized".
- **`invalid_grant`** means the OAuth error for a rejected refresh token.
- **Ack** means the worker tells SQS that a message is complete. SQS then
  deletes the message.
- **DLQ** means dead-letter queue. SQS moves a message there after too many
  failed tries.
- **Hydrate** means load data from the database into memory.
- **CAS** means compare-and-swap: a write that succeeds only when a stored
  value matches an expected value.
- **Pre-flight check** means a check that runs before a request.

### The problem

A production Frigg app (Aspire to QuickBooks Online, AWS Lambda, MongoDB)
silently orphaned **95 records over 4 months**. A cross-invocation credential
rotation race caused the failures. A separate amplifier in the invalidation
and queue-worker paths kept the failures silent. Both faults are in the
framework. Both faults can reach each of the ~46 api-modules in the
api-module-library. PR #636 (the per-instance single-flight refresh) does not
fix either fault.

### The race, as observed

Two *different* Lambda invocations refreshed the same QBO credential on
2026-08-09, 368ms apart:

```
06:00:50.244  requestId 2dbc8561  Starting token refresh
              grant_type: 'authorization_code'
06:00:50.815  requestId 2dbc8561  Token refresh SUCCEEDED
06:00:51.183  requestId 81915aec  Starting token refresh
              grant_type: 'authorization_code'
06:00:51.531  requestId 81915aec  Token refresh FAILED  invalid_grant
```

Invocation `81915aec` then failed 3 invoices with 401. Three measured numbers
matter for every option below:

- The winner's token round trip took **571ms**.
- The loser's token round trip took **348ms**.
- The gap between the winner's rotation and the loser's stale request was
  **368ms**.

### The code-level mechanism

Frigg fans a sync out as separate SQS messages. Each stage is a separate
Lambda invocation. The queue worker is configured `reservedConcurrency: 20`
and `batchSize: 1` (in `packages/devtools/infrastructure/`, at
`domains/integration/integration-builder.js:433` and `:443`). So up to 20
invocations of the same integration's worker run at the same time, one
message each.

Each invocation builds its own object graph:

1. `GetIntegrationInstance` constructs exactly one `Module` per entity
   (`packages/core/integrations/use-cases/get-integration-instance.js:58-64`).
   Each `Module` gets fresh repositories.
2. `Module` copies the credential's fields into memory once, at
   construction. `packages/core/modules/module.js:54` splats
   `this.apiParamsFromCredential(this.credential.data)` into `apiParams`.
   `packages/core/modules/module.js:75` is the copy itself:
   `_.pick(credential, ...this.apiPropertiesToPersist?.credential)`. In the
   published `2.0.0-next.78` build, the same statement sits at
   `module.js:67`.
3. After that line, the sync path never reads this credential from the
   database again. This is verified by call-site enumeration:
   `findCredential` and `findCredentialById` have **no** callers in any queue
   worker, integration handler, `Module` method, or requester.
4. `refreshAuth()` (`packages/core/modules/requester/oauth-2.js:297-332`)
   refreshes from the in-memory copy. It **never re-reads the credential
   from the database** before it refreshes.
5. On success, `setTokens()` fires `DLGT_TOKEN_UPDATE` (`oauth-2.js:145`).
   That calls `Module.onTokenUpdate()`
   (`packages/core/modules/module.js:108-141`), which calls
   `upsertCredential` (`module.js:124`).
6. `upsertCredential` is a blind write. The last writer wins. There is no
   version check. The Mongo adapter does `findFirst`, then `update`, in two
   round trips
   (`packages/core/credential/repositories/credential-repository-mongo.js:115`
   then `:120`). Postgres has the same structure
   (`credential-repository-postgres.js:132`, `:137`). DocumentDB does
   `findOne`, then `updateOne` (`credential-repository-documentdb.js:92`,
   `:121`).

So two invocations can refresh at almost the same time. Both present the
pre-rotation refresh token. The second one gets `invalid_grant`.

### The amplifier — why 95 orphans and not 3 failed invoices

The chain after a refresh failure is what made the loss large and silent:

1. `refreshAuth()` fires `DLGT_INVALID_AUTH` (`oauth-2.js:327`).
2. `Module.markCredentialsInvalid()`
   (`packages/core/modules/module.js:154-205`) writes `authIsValid: false`
   on the **shared** credential record.
3. That reaches `IntegrationBase.receiveNotification`, then
   `_recordCredentialRejection`, then `persistStatus('ERROR')`
   (`packages/core/integrations/integration-base.js:874`, `:878`, `:902`).
4. From then on, the queue worker checks
   `['DISABLED', 'ERROR', 'IN_DELETION'].includes(status)` and simply
   returns (`packages/core/handlers/backend-utils.js:193` and `:221`).
5. `Worker.run` treats that return as success. **SQS deletes every
   subsequent page message. No DLQ entry appears.**

One losing invocation flags a healthy credential as dead. The integration
then swallows work silently. The credential record is shared: production has
already shown two integrations that share one credential row (commit
`893b1e73`, PR #634).

This chain, not the `invalid_grant` itself, is how 95 records disappeared.

### Why PR #636 does not solve this

PR #636 (`fix/requester-single-flight-refresh`) added three guards in
`packages/core/modules/requester/requester.js`:

- `_refreshAuthOnce()` (`:516-535`). Concurrent callers share one refresh.
- A `refreshContext` re-entrancy guard, built on `AsyncLocalStorage` (`:25`,
  checked at `:303`). A 401 raised from *inside* the refresh flow is fatal,
  not a deadlock. This guard is needed because subclasses issue their token
  request through `this._post`, which re-enters `_rawRequest`.
- An `_authGeneration` counter (`:40`, `:214`, `:317-321`). A 401 that lands
  after another request already refreshed retries with the new token. It
  does not spend another rotation.

All three guards coordinate callers **inside one process**. The code's own
docstring says the assignment is safe because concurrent callers "on the
single-threaded event loop" cannot both start a refresh. The commit message
for `e34c9c0b` scopes itself out explicitly: "A single invocation could
therefore reproduce the production signature with no cross-process race at
all."

There is exactly one `Module`, and therefore one requester, per entity per
invocation (`get-integration-instance.js:58-64`). The 20 concurrent
invocations share no process memory. `AsyncLocalStorage` does not cross an
invocation boundary. **PR #636 cannot close the race in this ADR.** Also,
any design that moves the refresh into another process silently loses the
re-entrancy guard.

### Provider semantics

Intuit/QuickBooks rotates the refresh token on refresh. It force-expires the
previous one. Many OAuth2 providers do the same. (Frigg's own regression
fixture, `requester.concurrent-refresh.test.js:4-9`, models the same
rotate-and-force-expire semantics with no grace window. That is a modeling
choice consistent with this description. It is not independent evidence
about any provider.)

RFC 9700 §4.14.2 goes further. When a program replays an already-consumed
refresh token, the authorization server SHOULD revoke **the whole grant**.
That includes the access tokens. That includes the winner's freshly minted
pair.

**This is the load-bearing provider assumption in this ADR, so it is named
explicitly: layers 1-2 assume the winner's grant survives the loser's reuse
attempt.** The observed behavior in this incident supports that assumption
for Intuit: the winner's tokens kept working after the loser's
`invalid_grant`. But the assumption is **per-provider and unverified in
general**. Where a provider does revoke the whole grant, a re-read cannot
recover a lost race. The credential is dead the moment the loser's request
lands. Layers 1-2 handle that case by escalation (see layer 2's
"adoption failure" rule). The contract this ADR guarantees is *no failure is
silent*. The contract is not *no credential ever dies*. For such providers,
the only real protections are fewer refreshes (layer 4) and serialization
(layer 7). Layer 5 gives modules a place to declare this semantic.

**Unverified**: the exact rotation interval (commonly cited as 24-26h),
whether Intuit offers a grace or reuse window, and which providers revoke
the whole grant on reuse. Intuit's own doc pages are JS-rendered and could
not be fetched during this investigation. Intuit's Nov 2025 blog post on
refresh-token validity says nothing about the rotation interval or about
previous-token invalidation. **No part of this ADR depends on a grace window
existing.** Assume zero grace. The arithmetic here comes only from the
measured 571ms / 348ms / 368ms above.

### A second structural finding

Frigg cannot do a proactive refresh today. The evidence:

- `isAuthenticated()` (`oauth-2.js:279`) has **no non-test callers anywhere
  in `packages/core`** (verified by grep). The same method exists unused on
  `api-key.js:34` and `basic.js:27`.
- The code computes `accessTokenExpire` at `oauth-2.js:138` and then
  discards it. Persistence is gated on each module's
  `apiPropertiesToPersist.credential` list, and no module lists it. QBO's
  list is `["access_token","refresh_token","realmId"]`.

So every invocation hydrates with `accessTokenExpire = null`. It can
discover expiry only by taking a 401. That *maximizes* the collision
probability. The N stages do not refresh at random times. They all discover
expiry at the same instant, on the first request after the hour boundary.
The 06:00 burst signature in the log is exactly that.

### Decision drivers

- **Lambda runs one invocation per SQS message.** Stages share no process
  memory. Warm containers exist, but correctness cannot rely on them.
  ADR-027 already accepts this hazard for SSM: "warm containers hold values
  fetched at cold start".
- **Field-level KMS encryption.** `data.access_token`,
  `data.refresh_token`, and six other paths are envelope-encrypted. Each
  write uses a fresh random DEK (marked immutable, in
  `packages/core/database/encryption/encryption-schema-registry.js:16-28`;
  see also `packages/core/encrypt/Cryptor.js`). The ciphertext is
  non-deterministic. The Prisma encryption extension never processes
  `args.where`. **A conditional write cannot compare on the stored token
  value.** Any CAS needs a plaintext discriminator.
- **VPC.** The incident app is VPC-enabled. Each new AWS service reached
  from a private subnet costs an interface endpoint, unless the service has
  a free gateway endpoint. ADR-027 books ~$7-22/month for its SSM endpoint.
- **Three credential adapters, two engines.** The factory dispatches
  `mongodb`, `postgresql`, and `documentdb`
  (`credential-repository-factory.js:28-46`). The port
  (`credential-repository-interface.js:10-12`) claims one implementation
  serves Mongo and Postgres. DocumentDB is real. A solution must cover it or
  must scope it out explicitly.
- **No schema headroom.** `Credential` has no version column and no
  `@@unique`. Its fields are: `id, userId, authIsValid, externalId, data
  Json, createdAt, updatedAt @updatedAt`
  (`packages/core/prisma-mongodb/schema.prisma:96-116` and the Postgres
  twin). `updatedAt` is the only monotonic field.
- **No coordination primitives exist.** Core has no DynamoDB, Redis,
  ElastiCache, or Memcached dependency. Core has no lock, lease, mutex, or
  idempotency-key concept. The **runtime** Lambda role has no `dynamodb:*`
  grant. (The CLI's Terraform generator emits management-plane DynamoDB
  statements, at `terraform-generator.js:78-79` and `:229-239`, but those
  never reach the runtime role.) The baseline Lambda role grants only
  `sns:Publish` to the error topic and four `sqs:*` actions (in
  `packages/devtools/infrastructure/`, at
  `domains/shared/utilities/base-definition-factory.js:183-209`). The queues
  are plain standard SQS. No `MessageGroupId` appears anywhere.
- **Many apps pin published versions.** The published
  `@friggframework/core@2.0.0-next.78` has an *older* 401 path than `next`.
  It fails fast on `refreshCount > 0`. It never resets the count. It has no
  `_authGeneration`, no `_inFlightRefresh`, and no `refreshContext`. The
  incident app pins this build.
- **Dozens of api-modules inherit this path.** Of ~46 real modules, 37
  extend `OAuth2Requester`: 33 use `authorization_code`, 2 use ROPC, and 2
  use pure `client_credentials`. 35 are rotation-exposed. The 5 api-key
  modules, the 2 basic-auth modules, and marketo never refresh, but the
  shared invalidation amplifier still reaches them via `requester.js:341`.
  (These counts come from the separate `friggframework/api-module-library`
  repo checkout. They are not reproducible from this repo. Re-count them at
  implementation time.)
- **ADR-027 sets a bar**: "Both features are inert until opted into; no
  existing app changes behavior on upgrade." A correctness fix for silent
  data loss cuts against that bar. This ADR argues the exception explicitly.
  It does not ignore the bar.
- **CLAUDE.md hexagonal rules bind the placement.** A conditional-write
  primitive belongs in a port method, with one implementation per adapter.
  The policy for a lost write belongs in a use case. It does not belong in
  the repository. It does not belong in `Requester`.

## Decision

Adopt a **layered stack, not a single mechanism**. The membership is stated
once, here. Every later mention conforms to it:

- **Layers 1-4 are load-bearing.** All four must ship.
- **Layer 5 is required but is pure policy.** It is a declaration, not a
  mechanism. It ships with the stack.
- **Layer 6 is optional** defense-in-depth.
- **Layer 7 is deferred.** Its variants compete with each other. Pick at
  most one. Pick it only after layers 1-5 are in production with measured
  data. The metric is defined in the open-question section.

The register already has the pattern this needs. Frigg solved this class of
bug for `Integration.config` and for `Process`, and skipped `Credential`:

- `integration-repository-mongo.js:404-425` merges config via
  `findAndModify`, so there is "no JS-side read-modify-write to race on".
- `process-repository-mongo.js:97-137` is documented as the "race-safe
  counterpart to `update()`".
- `process-repository-postgres.js:163` is the `UPDATE ... RETURNING *` twin.
- `integration-base.js:654` `patchConfig` explicitly rejects the local-merge
  guess "which would silently drop keys a concurrent writer already landed".

`upsertCredential` is the one hot write that never got this treatment.
**This ADR finishes an existing pattern. It does not introduce a new one.
That is the strongest argument for it.**

### 1. Containment — a failed refresh is not a dead credential (load-bearing)

Three sub-changes. All are in existing code. No new component:

1. On refresh failure, do not invalidate unconditionally. Re-read the
   credential. Compare the database's `refresh_token` to the token that was
   presented. The comparison uses decrypted plaintext in application memory.
   That is what makes the comparison possible, because the ciphertext is
   non-deterministic. If the two tokens differ, this invocation lost a race.
   Raise a **retryable** error. Do not call `markCredentialsInvalid()`.
2. Give that comparison a bounded backoff: 2-3 re-reads over ~3s. The
   winner's write may not have landed yet. The observed window between the
   winner's success and the loser's failure was 716ms.
3. Fix the queue worker's `ERROR` handling. **Fix only `ERROR`.** The status
   gate `['DISABLED', 'ERROR', 'IN_DELETION']` appears twice, on two
   distinct paths: the process/page path (`backend-utils.js:193`) and the
   webhook path (`:221`). Handle the three states separately:
   - `ERROR`: do not silently ack. Throw, so SQS retries and eventually
     DLQs. Or, at minimum, record a Process failure row. A lost race can
     trip this state. The silent ack here is the amplifier.
   - `DISABLED` and `IN_DELETION`: keep the silent ack. These are
     *intentional* stops. `DISABLED` is an operator action. `IN_DELETION` is
     a deletion in flight. The system must drop this work. A throw here
     would push every in-flight message through 3 receives times
     `VisibilityTimeout: 1800` (`integration-builder.js:566-568`) into the
     DLQ, for integrations that behave correctly. Add a log line on the
     drop. Add nothing more.

**This layer alone would have prevented the incident, with the race fully
intact.** The race cost 3 invoices. This layer is the difference between 3
invoices and 95 records over 4 months. It is default-on. It only converts a
silent ack into a loud retry. It never changes happy-path behavior.

Two operational requirements ship with it:

- **Kill switch.** An environment variable (for example,
  `FRIGG_LEGACY_ERROR_ACK=true`) restores the old silent-ack behavior for
  `ERROR`, with no code redeploy. A fleet-wide change to ack semantics must
  have a rollback path. This is the rollback path.
- **Retry-safety audit.** After this change, each page message can run up to
  `maxReceiveCount: 3` times. Stage processing must tolerate that. The
  framework cannot guarantee this for app code. So PR 1 must document the
  new contract ("failed pages are retried; page handlers must tolerate
  re-delivery"), and PR 1 must audit the core-owned paths for it.

### 2. Loser recovery — re-read and adopt on failure (load-bearing)

A loser does not need to refresh. A loser needs a *valid access token*, and
the winner already persisted one. The rule: on a 401 before a refresh, and
again on `invalid_grant` after a failed refresh, re-read the credential. If
the persisted `access_token` differs from the in-memory copy, adopt it. Bump
`_authGeneration`. Retry via `requester.js:379`. The datastore is the shared
cache. No second cache is required.

**Adoption-failure escalation (required).** Adoption can fail in two ways:

1. The re-read finds no token newer than the one that was just rejected.
2. The retry also rejects the adopted token.

Either case means that nobody holds a valid token. This is not a lost race.
This is a dead credential. Possible causes: the user revoked access, or a
whole-grant-revoking provider killed the winner's tokens too (see "Provider
semantics"). At that point, the original behavior is correct and must run:
`markCredentialsInvalid()`, a loud failure, retry, DLQ. Layer 1 suppresses
invalidation **only while recovery is possible**. It never suppresses
invalidation unconditionally. Without this rule, layers 1-2 teach the system
to ignore exactly the signal that a dead credential emits.

Three implementation constraints. Each one, if missed, causes a silent no-op
or a regression:

- **Mutate the instance fields. Do not thread an argument.**
  `oauth-2.js:309-311` passes `{ refresh_token: this.refresh_token }` to
  `refreshAccessToken`. But the incident app's QBO override takes no
  argument. It reads `this.refresh_token` directly. An argument-threading
  implementation is a no-op in the exact module that caused the incident.
- **Do not route the reload through `setTokens()`.** `setTokens` ends in
  `notify(DLGT_TOKEN_UPDATE)` (`oauth-2.js:145`). That calls
  `onTokenUpdate`, which calls `upsertCredential` **and** sets
  `authIsValid = true` (`module.js:122-126`). That path would cost a write
  plus 2 KMS `GenerateDataKey` per 401. It would also silently resurrect a
  credential that an operator had just disabled.
- **Reload failure must be non-fatal.** `_rawRequest:376` awaits
  `_refreshAuthOnce()`. An unguarded rejection there skips
  `_invalidateAuth`. Every transient database blip would then become a hard
  worker failure.

Reuse the existing port method `findCredentialById`
(`credential-repository-interface.js:24`, implemented in all three
adapters), through a new `DLGT_CREDENTIAL_RELOAD` delegate type.
`Delegate.notify` already returns the delegate's return value
(`packages/core/core/Delegate.js:9-22`), so `Delegate` needs no change. Add
a reload budget, for example one reload per 401. The reason: the
generation-mismatch retry at `requester.js:317-321` has **no `attempt` cap
and no delay**, unlike every other retry branch. It is safe today only
because `_authGeneration` advances solely inside `_refreshAuthOnce`.

**Reject the per-API opt-in flag from the original option-3 framing.** A
re-read on 401 is one query, on a path that should be rare. A per-module
flag means 35 rotation-exposed modules keep dropping SQS messages until 35
separate authors opt in. Make the re-read unconditional. Delete the config
surface.

### 3. Compare-and-swap on the credential write (load-bearing)

Add a plaintext, monotonic `tokenVersion` scalar column. Do not use a JSON
path: Prisma JSON-path filtering diverges sharply between the Mongo and
Postgres providers. Make the token-refresh write one server-side conditional
write:

- Mongo: `$runCommandRaw({ findAndModify: 'Credential', query: { _id,
  tokenVersion: observed }, update: { $set: {...}, $inc: { tokenVersion: 1 } },
  new: true })`
- Postgres: `UPDATE "Credential" SET ... WHERE id = $1 AND "tokenVersion" =
  $2 RETURNING *`
- DocumentDB: the existing filter-conditional `updateOne` helper at
  `packages/core/database/documentdb-utils.js:77`

Zero rows returned means this writer lost. Then: re-read and adopt
(layer 2). Never clobber. This also removes a round trip. Today's
read-then-write becomes one server-side write.

**How the id and the observed version reach the write.** Today they do not.
That is the main implementation work in this layer. The current chain:
`Module.onTokenUpdate()` (`module.js:108`) builds `credentialDetails` from
`getCredentialDetails(api, userId)`. That shape is
`{identifiers: {userId, externalId}, details: {...}}`. It has no id and no
version. `upsertCredential` then does its own `findFirst` on the
identifiers. The fix uses state that `Module` already holds:
`this.credential` is the hydrated row (`module.js:32`), and the code
reassigns it to the persisted row after every write (`module.js:127`). So
`this.credential.id` and `this.credential.tokenVersion` are the observed
values, by construction. `onTokenUpdate` passes them, together with
`credentialDetails`, to a new port method
(`updateCredentialByVersion(id, observedVersion, details)`). On a CAS
failure, it re-reads, adopts (layer 2), and replaces `this.credential` with
the fresh row. The next attempt then observes the winner's version.

**The create branch is exempt from CAS. This is deliberate.** A conditional
upsert is a trap: `findAndModify` with `upsert: true` and a mismatched
version does not fail. It **inserts a duplicate credential row**. So: CAS
applies only when `this.credential.id` exists. That covers every token
refresh, which is the racy path. Initial credential creation keeps today's
identifier-keyed path, and writes `tokenVersion: 1`. Duplicate creation on
first authorization is a pre-existing exposure: the schema has no `@@unique`
on `(userId, externalId)`. That index is desirable. But it is a separate
migration with its own risks (PR #634 observed one credential row shared by
two integrations). It is out of scope here.

**Initialization and backfill.** Every pre-existing credential row lacks
`tokenVersion`. Do not backfill. Make the first conditional write tolerant:
match `{ _id, $or: [{tokenVersion: observed}, {tokenVersion: null}] }` when
the observed value is missing (Postgres: `"tokenVersion" IS NULL`), and set
the version to 1 on that write. From then on, the column is present and
strict CAS applies. This mirrors layer 4's "treat missing as unknown" rule.
It needs no data migration. It needs only the schema addition.

**Be honest about what this does and does not do.** CAS closes the
*clobber*, not the race. By the time the loser's CAS fails, the provider has
already force-expired the loser's refresh token. The damage happened at the
token endpoint, not at the database. The value of CAS is different: the
winner's token can never be overwritten by a loser's stale write, and the
loser gets a **reliable, local, timing-independent signal that it lost**.
That signal is what makes layers 1 and 2 sound rather than heuristic. See
"Dissent preserved" below. This is the point where the option evaluations
disagree most sharply.

### 4. Persist the expiry in core and pre-flight the refresh (load-bearing)

Four sub-changes. The first three are prerequisites. Without them, the
fourth is inert or harmful:

1. **Fix the expiry computation.** `setTokens` runs
   `this.accessTokenExpire = new Date(Date.now() + accessExpiresIn * 1000)`
   unconditionally (`oauth-2.js:138`). `accessExpiresIn` defaults to `null`.
   `null * 1000` is `0`. So a provider that omits `expires_in` yields a Date
   pinned to *now*: a token that looks permanently expired. The fix: set
   `accessTokenExpire` only when `expires_in` is a positive number.
   Otherwise leave it `null`, which means "unknown".
2. **Persist both expiry fields unconditionally from core.** Keep them
   outside each module's `apiPropertiesToPersist`. They are framework state,
   not module state. They are plaintext (not in the encryption schema), so
   this needs no new encrypted field and no schema change.
3. **Hydrate them back unconditionally from core.** Persisting alone is
   inert. Hydration is gated by the same per-module list:
   `apiParamsFromCredential` is `_.pick(credential,
   ...this.apiPropertiesToPersist?.credential)` (`module.js:75`). A field
   that no module lists never reaches the instance. `Module` must merge the
   two expiry fields into the API instance outside that pick. This is the
   read-half twin of sub-change 2. (The Context section identifies this
   gate. The original draft of this ADR fixed only the write half. A
   reviewer caught it.)
4. **Pre-flight gate. Do not reuse `isAuthenticated()` as written.**
   `isAuthenticated()` (`oauth-2.js:279-286`) requires **all four** fields —
   `access_token`, `refresh_token`, `accessTokenExpire`, and
   `refreshTokenExpire` — to be set. And the code sets `refreshTokenExpire`
   only when the provider sends `x_refresh_token_expires_in`
   (`oauth-2.js:131-142`). That is an Intuit-specific field. Most providers
   omit it. A gate built on this method returns "not authenticated" forever
   for most modules. The result is a **refresh on every request**: the exact
   stampede this layer exists to prevent. The correct gate is narrow:
   pre-flight refresh only when `accessTokenExpire` is present, parseable,
   and in the past minus a ~5-minute skew margin. When the expiry is missing
   or unknown: do nothing, and let the 401 path react. That is exactly
   today's behavior. The fail-safe direction is "unknown → reactive". It is
   never "unknown → refresh".

One core change covers all ~46 modules. This layer does **not** close the
race. Two invocations that hydrate at the same moment both see an expired
token, and both pre-flight refresh. The same collision moves ~50ms earlier.
But this layer cuts the number of refresh events to about one per token
lifetime, instead of one per stage-burst. It removes the enabling condition
where every stage discovers expiry at the same instant via 401. Old rows
without the fields behave exactly as today.

### 5. Declare rotation semantics per module (required, policy only)

Add two declarative fields. The defaults are the safe assumptions:

- `refreshTokenRotates: true | false` (default `true`). Core can then skip
  coordination for the ~11 of 46 modules that cannot lose a rotation race,
  and stay strict for the 35 that can.
- `revokesGrantOnReuse: true | false | undefined` (default `undefined`,
  which means "unknown"). This marks providers that follow RFC 9700 §4.14.2
  and kill the whole grant when a consumed refresh token is replayed. For a
  module that declares `true`, a lost race is unrecoverable. Core should
  then bias harder toward avoidance: always pre-flight (layer 4), and
  surface the module as a priority candidate if layer 7 ever ships.
  Per-provider values are unverified today. The field exists so that
  verification lands as one line in the module, instead of tribal knowledge.

Where a provider offers `client_credentials` for the data in question,
prefer it. That grant mints tokens from static credentials. Concurrent
refreshes are then merely wasteful, not mutually destructive. The incident
app already does this for Aspire.

This preference is narrow. QBO, Google, Slack, and HubSpot user-scoped data
have no `client_credentials` equivalent. For them, the grant is unavailable,
not merely unused. ADR-019 already anticipates exactly this split. It places
the "OAuth2 refresh state machine" in core, and the "refresh-without-rotate
/ refresh-with-rotate" quirks in the api-module.

### 6. Jittered dispatch (optional, defense-in-depth)

Add a random `DelaySeconds` (0-5s) to the fan-out sends in
`packages/core/queues/queuer-util.js`. Simultaneous first-requests then do
not align. This is ~5 lines. It is pure probability reduction. It directly
attacks the observed 368ms collision. It is worthless on its own. It is
worth having once layers 1-4 are in.

### 7. Single-writer semantics (deferred; pick at most one, only with data)

Three genuinely different ways exist to get serialization. **They compete
with each other, not with layers 1-4.** Do not ship any of them until
layers 1-4 are in production, with data on how often losses still occur.

- **Datastore lease.** Mongo `findAndModify` on a `leaseUntil` field, or
  Postgres `pg_try_advisory_xact_lock` **inside a transaction**
  (session-scoped advisory locks are unsafe under connection pooling). The
  correct TTL is bounded by Frigg's own per-attempt HTTP timeout:
  `DEFAULT_REQUEST_TIMEOUT_MS = 60_000` (`requester.js:8`), plus KMS and two
  writes. That gives ~90s, released in a `finally`. Do not use the 900s
  Lambda timeout: one crash would stall an integration for 15 minutes. Do
  not use 10s: a slow token endpoint would produce two lease holders. A TTL
  lease is a probabilistic optimization, not mutual exclusion. The abort is
  `setTimeout`-based, and a CPU-starved container can overshoot. That is
  precisely why layers 2 and 3 must sit underneath it.
- **Scheduled single-writer refresh.** An EventBridge Scheduler ticks below
  the access-token lifetime. The request path then never refreshes. This
  reuses the existing `domains/scheduler/scheduler-builder.js`. It depends
  on layer 4 for expiry data. It raises the floor. But it cannot remove the
  request-path fallback: a missed tick, a cold app, or a newly-authorized
  credential still needs one. A schedule per credential does not scale. The
  scalable shape is one sweeper that queries the credentials that are due.
- **SQS FIFO with `MessageGroupId = credentialId`.** This is the only
  *provable* fix on the table. SQS keeps at most one message per group in
  flight. Lambda initializes one execution per group. The race becomes
  structurally unreachable for one credential. Different credentials still
  run in parallel. The costs: head-of-line blocking (with
  `maxReceiveCount: 3` and `VisibilityTimeout: 1800` at
  `integration-builder.js:566-568`, one stuck message stalls a group for
  ~90 minutes); the loss of page-chain parallelism inside one integration;
  and a queue migration, because a standard queue cannot convert to FIFO in
  place. Each deployed app needs a new queue, a drain, and a cutover. Scope
  this as an opt-in `appDefinition` flag. Never make it the default.

### Ordered implementation sequence

1. **PR 1 — layer 1 (containment).** No migration. No infrastructure.
   Identical across all three adapters. Independent of the
   `next.78`-vs-`next` divergence, because it lives in the invalidation and
   worker paths, not in the 401 path that consumers pin. Default-on, with
   the kill switch. Rough size: ~100-150 LOC, plus the retry-safety audit.
   Days, not weeks.
2. **PR 2 — layers 3 + 2 together.** CAS and loser recovery are one use
   case: "lost the rotation race → recover". This PR needs one Prisma
   migration for Postgres, the new port method, three adapter
   implementations, the `onTokenUpdate` threading, the reload delegate, and
   the escalation rule. It is the largest PR: ~300-400 LOC across core, plus
   tests. Expect the bulk of review time here.
3. **PR 3 — layer 4.** The expiry fix, the core-owned persist and hydrate,
   and the narrow pre-flight gate. ~100 LOC, mostly in `oauth-2.js` and
   `module.js`.
4. **PR 4 — layers 5 + 6.** The two declared fields, and the jitter. Small:
   ~50 LOC.
5. **Then measure** against the metric defined below. Only then decide
   layer 7, or decide that it is not needed.

These sizes are estimates from reading the touched files. They do not come
from an implementation spike. Treat them as relative weights, not
commitments.

### Open question — why this ADR is Proposed and not Accepted

**Does Frigg need provable serialization? Or is "no failure is ever silent,
and losers always recover" a sufficient contract?**

Layers 1-4 give a system where a lost race costs one wasted provider
rotation and a retry. It never costs a dropped record. It never costs a
false `authIsValid: false`. One caveat is named under "Provider semantics":
a whole-grant-revoking provider turns a lost race into a real credential
death, loudly. Layers 1-4 require **zero new AWS infrastructure**. That is
the decisive argument against the heavier options, and against ADR-027's
VPC-endpoint cost precedent. But a residual race window remains: the
interval between a loser's read of the credential and its refresh request
landing at the provider. That interval has **not been measured**. The
348-571ms figures elsewhere in this ADR are token-endpoint round trips,
quoted only for scale. Layer 7's SQS FIFO variant is the only candidate that
provably closes the window, at the cost of a per-app queue cutover.

**The metric that decides layer 7.** PR 2 must emit two counters through the
existing requester telemetry (`requester.js` already carries a telemetry
runtime):

- `frigg.auth.refresh_race_recovered` — a loser re-read, adopted, and the
  retry succeeded.
- `frigg.auth.refresh_race_lost` — adoption failed, and the system
  escalated.

Suggested tipping condition, to be ratified with this ADR: more than one
`refresh_race_lost` per credential per week, sustained for a month, on any
production app → schedule layer 7 for that app. Without a named metric, the
"then measure" gate is unanswerable. This is the metric.

The recommendation: layers 1-5 now, layer 6 alongside (it is ~5 lines), and
layer 7 documented as an opt-in escape hatch. **A maintainer must ratify
that trade-off. A maintainer must also ratify the default-on decision in
layer 1 against ADR-027's opt-in bar.** Both must happen before this ADR
moves to Accepted.

### Dissent preserved

The option evaluations that fed this ADR did not agree. The disagreements
are load-bearing, not cosmetic:

- **Is CAS "the fix"?** One evaluation treats an atomic conditional write on
  `upsertCredential` as *the* fix. It "ships in a dependency bump, on by
  default, with no new IAM, no new Lambda, no new VPC endpoint". Another
  evaluation rejects that framing directly: CAS "closes the clobber, not the
  race", because the provider has already force-expired the token before the
  CAS fails. **This ADR sides with the second reading.** It therefore keeps
  CAS as layer 3, not as the headline, with layers 1 and 2 above it. A
  reviewer who reads only "CAS fixes it" is reading the weaker argument.
- **What ships first?** One evaluation ranks the DB re-read on 401 as the
  best value-per-line change available. Another ranks failure containment
  first, because containment is the only change that would have prevented
  the incident with the race fully intact. **This ADR takes the second
  ordering.** The race cost 3 invoices. The amplifier cost 95 records. The
  two positions overlap in the same re-read-and-compare primitive, so the
  practical gap is one PR boundary, not a design disagreement.
- **How much does read-on-401 actually buy?** One evaluation warns plainly
  against overclaiming. The dominant real trigger is the herd case: an
  access token that lapsed overnight makes an entire SQS burst 401 at once.
  With `reservedConcurrency: 20`, all twenty invocations then read the same
  stale credential inside the same few hundred milliseconds. The evaluation
  notes that the incident's own margin was only 368ms, and asks what happens
  at 100ms. **Layers 1-4 do not resolve that objection.** It is the
  substance of the open question above. It is also the reason layer 4
  (frequency reduction) is load-bearing rather than optional.

### What this ADR does not decide

- **Whether to build layer 7 at all, and which variant.** Explicitly
  deferred, pending data from layers 1-4.
- **Any `provider-aws` decoupling.** An unmerged draft ADR proposes
  decoupling AWS from core. That draft circulates under the number 010,
  which collides with the accepted ADR-010 "Reporting as an Admin
  Operation". Its final number is TBD. The draft would make an AWS-specific
  coordination mechanism awkward later. Nothing here adds new AWS coupling.
  Nothing here settles that draft.
- **The `authIsValid` semantics for a genuinely dead credential.** Also, the
  operator surface that distinguishes "lost a race" from "user revoked
  access" in reporting and telemetry. Layer 1 stops the code from writing
  `false` on a lost race. It does not redesign the field. ADR-024 makes
  `credential.authIsValid` the connection-status signal for every entity on
  the credential, including global entities. A redesign is a separate ADR.
- **Whether one Credential row should be shareable by two integrations at
  all.** Production has shown this sharing (PR #634). This ADR leaves it
  as-is.
- **Backfilling the 95 already-orphaned records.** That is operational work,
  not architecture.
- **The shared-credential invalidation exposure of the 8 non-refreshing
  modules** (5 api-key, 2 basic-auth, marketo) via `requester.js:341`.
  Layer 1 helps them incidentally. Nothing here audits them.
- **Test strategy beyond one regression case.** ADR-009's own coverage table
  already flags "Token refresh flows / OAuth refresh-on-401 / Low" as an
  untested gap. A two-instance / two-repository scenario belongs alongside
  `requester.concurrent-refresh.test.js`. The broader gap belongs to
  ADR-009.

## Consequences

### Positive

- The silent-data-loss path is removed entirely. After layer 1, no auth
  failure can cause SQS to delete a message as a success. Failures become
  loud: retry, then DLQ. They are not invisible for four months.
- A losing invocation stops corrupting the shared credential. `authIsValid`
  keeps the meaning ADR-024 gives it: a real connection-status signal, not a
  flag that any one unlucky Lambda can trip.
- Layers 1-4 require **no new AWS resource, no new IAM statement, no new VPC
  endpoint, no new runtime dependency, and no always-on stateful
  component**. The marginal cost is one extra credential read, plus its KMS
  decrypts, on the 401 path only. (The exact `Decrypt` count depends on how
  many of the record's 8 encrypted paths the reload touches.) That is inside
  the KMS free tier for a small app, and cents per month at scale.
- Layer 3 makes the credential write *cheaper* than today. One server-side
  round trip replaces read-then-write. The write also becomes safe.
- Layer 4 gives the framework a working expiry model for the first time.
  Today the code computes `accessTokenExpire`, corrupts it through the
  `null * 1000` default, and discards it. Layer 4 also reduces total
  provider token calls to roughly one per token lifetime, which reduces
  rate-limit pressure.
- The change finishes a pattern that the register already proves works on
  both engines, and that the tests already assert with "no last-writer-wins"
  in a test name. It introduces no new architectural concept.
- Newly possible: a credential write can become conditional on anything a
  plaintext discriminator can express. That is the prerequisite for a lease
  (layer 7), for per-credential rate limiting, and for a future
  "who rotated this token, when" audit trail.

### Negative

- **The race is narrowed, not closed.** The residual window is the loser's
  own read-to-refresh gap: the time between the read of the credential and
  the refresh request landing at the provider. That gap has not been
  measured. (The 348-571ms figures in Context are token-endpoint round
  trips, quoted for scale only.) Two invocations that land inside the gap
  still burn a rotation. ADR-012 treats "concurrency races across Lambdas"
  as sufficient grounds to reject a design. This ADR knowingly leaves one
  race, and argues that a bounded, always-recovered, never-silent race is
  acceptable where an unbounded silent one was not.
- **Layers 1-3 barely improve the herd case.** When a whole SQS burst 401s
  at the same time, every invocation reads the same stale credential.
  Layer 4 is what addresses that. And layer 4 is a frequency reduction, not
  a guarantee.
- Layer 1 is **default-on**. That cuts against ADR-027's precedent that "no
  existing app changes behavior on upgrade". The justification: the un-fixed
  state *is* the silent runtime failure that ADR-027's rule exists to
  prevent. A maintainer must accept that reasoning explicitly.
- Layer 3 needs a schema migration (Postgres; free on Mongo) under ADR-012.
  It touches all three adapters plus the port. It is the only layer with
  migration risk.
- Layer 2's correctness silently depends on `readPreference=primary`.
  Nothing in `packages/core` handles `readPreference`. The operator controls
  it entirely, through `DATABASE_URL`. An app that sets `secondaryPreferred`
  as an Atlas cost tweak gets a fix that is inert, with no signal. Document
  this. Ideally, assert it at startup.
- Modules that mint tokens through a vendor SDK bypass `_rawRequest`. They
  receive neither PR #636's re-entrancy guard nor layer 2's interception
  automatically. Two known cases: the incident app's QBO module
  (`backend/src/api-modules/qbo/api.ts` uses `intuit-oauth`'s
  `refreshUsingToken` on a module-level singleton client), and the
  salesforce module's jsforce refresh handler (in the separate
  `friggframework/api-module-library` repo,
  `packages/v1-ready/salesforce/api.js:25-38`). **Audit those two by
  hand.** This means the module that caused the incident is not protected by
  default.
- New surface to maintain: a delegate type, a `Module.reloadCredential`
  method, a `tokenVersion` column, a conditional-write path per adapter, and
  a per-401 reload budget. Roughly 150 LOC for layers 1-2, and rather more
  for layer 3.
- Newly risky: layer 2 adds a database read to the error path. A database
  blip now touches auth handling. The guard is that reload failure is
  non-fatal. That guard is the difference between a graceful degrade and a
  fleet where every 401 becomes a hard worker failure.

### Neutral

- **Rollout for consumers that pin published versions.** Layers 2 and 3 sit
  on the 401 path, where the published `2.0.0-next.78` build diverges from
  `next`. That build fails fast on `refreshCount > 0`, never resets the
  count, and has no `_authGeneration`, `_inFlightRefresh`, or
  `refreshContext`. On that build, layer 2 would rescue the first 401 and
  brick on the second. So layers 2-3 are **not independently backportable**.
  Consumers must first adopt a build at or after PR #636. Layer 1, by
  contrast, lives in the invalidation and worker paths. It is
  version-independent. That is one more reason it ships first. The
  end-to-end story for an app on `next.78`: bump core past PR #636 → take
  layer 1 (a behavior change on the failure path only) → run the Prisma
  migration for layer 3 if on Postgres → no infrastructure redeploy at any
  step.
- Layer 3 must cover the `documentdb` adapter, or must scope it out
  explicitly. The port's own note — "Credential model has identical
  structure across MongoDB and PostgreSQL, so CredentialRepository serves
  both" (`credential-repository-interface.js:10-12`) — stops being accurate
  once engine-specific conditional writes land.
- `tokenVersion` becomes a plaintext field inside a record that is otherwise
  partially encrypted. That is consistent with `authIsValid` and
  `externalId`, which are already plaintext columns. It is also *required*:
  an encrypted discriminator cannot appear in a `where` clause.
- The legacy generic
  `packages/core/credential/repositories/credential-repository.js` is
  exported from `core/index.js`, but the factory never returns it. It is
  dead on the runtime path. Layers 2-3 do not update it. If someone revives
  it, they must bring it in line.
- ADR-003 "Runtime State Only" is **not** a constraint here, despite the
  name. Its scope is the local-dev management GUI ("minimal security model
  appropriate for local development", "no production data"). It does not say
  that Frigg holds no runtime state. It cannot be cited against a DB-backed
  or lock-backed mechanism. It is named here to pre-empt the objection.

## Alternatives Considered

- **Central credential/token service — all requests proxy through a single
  service that loads the credential and refreshes at one point.** Rejected.
  The option has two readings. Both fail.
  As a *true network proxy*, it is not buildable. To inject an
  `Authorization` header on outbound HTTPS, the proxy must terminate TLS
  with a private CA. That is the hard blocker. (Transport-level routing is
  not the blocker: `Requester` accepts an injectable `agent` at
  `requester.js:43`, applied at `:216`. But `node-fetch@2`, Frigg's own
  stack, has no proxy-environment support, so routing would be per-stack
  work anyway. And even with routing solved, an agent cannot inject headers
  into TLS traffic it cannot read.) So "all requests flow through it" is
  false by default. The idea collapses into ADR-006's declared but
  unimplemented `/proxy` endpoints. That is a rewrite of the request layer
  of all ~46 modules. Estimated cost: ~$260/month at 50M calls (unverified,
  from AWS list pricing), plus a synchronous hop, plus a hard 6MB Lambda
  payload ceiling.
  As a *token broker*, it is buildable. It has two genuine virtues. It
  deletes the stale-copy problem at its source, instead of guarding it. And
  it puts the only party that ever sees `invalid_grant` in a position to
  distinguish "my stored token was stale" from "this credential is dead".
  But it **does not contain the fix**. Traced against the 2026-08-09 log: a
  broker at concurrency above 1, without a lock, closes 0% of the 571ms
  window. The two invocations 368ms apart still collide. The serialization
  it needs comes from one of two places. Either `reservedConcurrency: 1` —
  at the measured 348-571ms token round trip, that is a ~2 rps ceiling for
  the app's entire token vending, and it is the configuration in which
  cross-process refresh recursion becomes a **hard deadlock**, because
  `AsyncLocalStorage` silently stops guarding across a process boundary. Or
  a lock — and a lock closes the race by itself, with no broker. Worse, a
  broker outage reads as a failed token fetch. The chain is then
  `DLGT_INVALID_AUTH`, `authIsValid: false`, integration `ERROR`, silent SQS
  deletion. The new component's outage reproduces the exact data-loss
  mechanism this ADR exists to prevent, fleet-wide instead of per
  integration. The broker also requires bundling every api-module definition
  (so it is one more Lambda in each customer's own stack, not a shared
  service), new `lambda:InvokeFunction` IAM, and either a NAT hop or a
  Lambda interface endpoint that Frigg does not currently create. Keep the
  broker alive only as an optional *performance and observability* topology
  after layers 1-4. Never make it the correctness mechanism.
- **Each API class instance subscribes to emitted DB events, direct or via
  an SNS topic.** Rejected. The SNS form is architecturally impossible: no
  SNS subscription protocol delivers into an already-running Lambda
  invocation, and Lambda accepts no inbound connections. The implementable
  forms are a Mongo change stream, or a Postgres `LISTEN`, opened by the
  invocation itself. Neither form can carry the token: the `refresh_token`
  ciphertext is non-deterministic, and a plaintext token in a `NOTIFY`
  payload is a security regression against the whole point of the encryption
  registry. So the payload degenerates to "credential X changed". The
  subscriber must then re-read and KMS-decrypt anyway. That makes this
  option **a strictly worse layer 2, with extra infrastructure**. It also
  has a production trap at least as bad as the deadlock. Frigg has no
  teardown path at all: no `dispose`, `destroy`, or `finally` exists in
  `core/Worker.js`, `modules/module.js`, or the handler chain. Lambda
  freezes a container rather than terminates it. So every invocation on a
  warm container leaks a cursor and a database connection, until the pool is
  exhausted and the app's *normal* data path fails. Typical transport
  latencies (unverified, from published third-party benchmarks: SNS p99 on
  the order of ~200ms; SQS delivery p50 on the order of ~15ms) lose even
  against the single observed 368ms margin. And the colliding invocations
  came from an SQS fan-out, so most real races start inside the residual
  window. Fundamentally, this option reacts after the commit, while the race
  is decided before the commit. No notification, at any latency, can un-send
  an in-flight HTTP request. DocumentDB would have to be scoped out entirely
  (change streams need per-collection enablement, and auto-scaling clusters
  do not support them). The one salvageable 5% — bumping `_authGeneration`
  from an authoritative signal — is folded into layer 2.
- **Per-API opt-in flag: re-read on each 401 retry, plus dual-write to an
  instant system cache.** Partially adopted. This option is the source of
  layer 2. The read-on-401 half is the best value-per-line change on the
  table. It would have converted the observed sequence into a success, with
  a 368ms margin. Both bolt-ons are rejected.
  **The flag**: a re-read costs one query, on a rare path. A per-module gate
  leaves 35 rotation-exposed modules broken until 35 authors opt in. (A
  *declarative* rotation-semantics flag is a different thing. It is kept, as
  layer 5.)
  **The dual-write cache**: it optimizes the smaller latency term. The
  persist chain is a KMS `GenerateDataKey` plus two database round trips —
  estimated tens of milliseconds, unmeasured — against a measured 348-571ms
  token round trip. And it has **no write ordering that is both useful and
  safe**. Cache-first ordering: if the database write then fails, or the
  Lambda is killed between the writes, the only copy of the provider's
  currently-valid refresh token lives in a volatile store with a TTL.
  `onTokenUpdate` has no try/catch around `upsertCredential`, so nothing
  flags the loss. Today's bug loses records; that bug loses the credential.
  DB-first ordering: the cache contributes nothing to the race and is pure
  cost. The cache also needs permanent invalidation at every credential
  write site, forever. That includes
  `process-authorization-callback.js:184`, which is ADR-006's self-service
  reauthorize path, and which bypasses `Module.onTokenUpdate`. Miss that
  site, and a *successful* re-auth becomes a permanent failure loop. The
  cache's failure logic is also circular. Fail-open means the cache can
  never be authoritative, so it has no correctness role at all. Fail-closed
  makes the cache Frigg's first always-on stateful runtime dependency, and a
  new outage source for every sync in every app. SSM as the cache is
  disqualified twice over. `PutParameter` default write throughput is 3 TPS
  (10 TPS with paid higher throughput, per AWS's Parameter Store throughput
  documentation). A hot per-401 token path on 20 concurrent workers exceeds
  that on its own. And ADR-027 explicitly reserves Parameter Store for
  static config, with "no rotation machinery".
- **DynamoDB lease table.** Rejected, on a principle worth stating:
  **coordinate in the same store as the data**. A DynamoDB lock that guards
  a Mongo write is two stores that can disagree. A conditional write on the
  Mongo document itself cannot disagree with itself. Mechanically, this
  option is the closest to reachable: `vpc-builder.js` already creates the
  free `FriggDynamoDBVPCEndpoint` gateway endpoint, and conditional-write
  plus TTL is the textbook lease store. But it needs a new builder; new IAM
  in the runtime role (which today carries no `dynamodb:*` grant — the CLI's
  Terraform generator emits management-plane DynamoDB statements, but those
  never reach the runtime role); a new SDK dependency in core; and fresh AWS
  coupling that the unmerged provider-aws decoupling draft would make
  awkward. (See "What this ADR does not decide" for that draft's numbering
  collision.)
- **Eliminate the fan-out — serialize the stages, or hoist all auth into
  one credential-holding parent invocation.** Rejected. Serialization
  removes the parallel page chains and roughly doubles the wall-clock time.
  A "credential-holding step" requires an invocation that outlives the whole
  sync, against Lambda's hard 900s ceiling (`integration-builder.js:448`).
  Unbounded page counts turn that ceiling into a wall, not a trade-off.
  Passing tokens down in the SQS payload is worse still: KMS-protected
  secrets would sit in message bodies with a 4-day retention period. If
  serialization is genuinely wanted, layer 7's FIFO variant is the correct
  implementation of this idea.
- **Warm-container caching of the credential as the mechanism.** Rejected,
  on ADR-027's own precedent: "warm containers hold values fetched at cold
  start; after an out-of-band parameter edit, containers converge only
  within the cache TTL." Container reuse cannot carry correctness. A fix
  that depends on cache hits is non-deterministic by construction.
- **Compare-and-swap on the stored refresh-token value.** This is the
  obvious conditional-update design, and the reason layer 3 needs a version
  column. Rejected as impossible. The token is envelope-encrypted with a
  fresh random DEK per write, so ciphertext never compares equal across
  writes. And the Prisma encryption extension never processes `args.where`,
  so an encrypted path cannot appear in a filter at all.
- **Doing nothing beyond PR #636.** Rejected. PR #636 is per-instance by
  construction, and its own commit message scopes it out of the
  cross-invocation problem. Doing nothing leaves the amplifier chain armed.
  The failure mode stays: silent SQS deletion, with no DLQ entry. That is
  the worst possible shape for an integration framework.

## Related

- [ADR-005](./005-admin-script-runner.md) — names "OAuth token refresh" as a
  common admin-script utility. The admin-script runner is another surface
  that instantiates modules. It can therefore refresh concurrently with a
  queue worker.
- [ADR-006](./006-integration-router-v2.md) — defines
  `/api/credentials/:id/reauthorize` and the (unimplemented) `/proxy`
  endpoints. Its reauthorize path writes credentials outside
  `Module.onTokenUpdate`. That is one reason the cache alternative was
  rejected.
- [ADR-009](./009-e2e-test-package.md) — its coverage table already flags
  "Token refresh flows / OAuth refresh-on-401" as an untested gap.
- [ADR-012](./012-database-schema-migrations.md) — governs layer 3's
  migration (note: ADR-012 is itself still Proposed, not Accepted). It also
  supplies the precedent that "concurrency races across Lambdas" is a
  legitimate reason to reject a design.
- [ADR-019](./019-api-module-extensions.md) — already places the "OAuth2
  refresh state machine" in core, and the refresh-rotation quirks in the
  api-module. That is the precedent for layer 5.
- [ADR-024](./024-global-entities.md) — makes `credential.authIsValid` the
  connection-status signal for every entity on a credential. That is why a
  losing invocation that writes `false` is a correctness bug, not a cosmetic
  one.
- [ADR-027](./027-ssm-parameter-offload-and-env-scoping.md) — supplies four
  things: the opt-in / no-behavior-change-on-upgrade bar this ADR argues an
  exception to; the warm-container staleness precedent; the VPC
  interface-endpoint cost precedent; and the boundary that Parameter Store
  is for static config, not rotating tokens.
- [ADR-003](./003-runtime-state-only.md) — **not** applicable, despite the
  name. Its scope is the local-dev management GUI. Listed to pre-empt the
  objection.
- `packages/core/modules/module.js` — credential hydration (`:54`, `:75`),
  `onTokenUpdate` (`:108-141`), `markCredentialsInvalid` (`:154-205`).
- `packages/core/modules/requester/oauth-2.js` — `refreshAuth` (`:297-332`),
  `setTokens` (`:115-145`), dead `isAuthenticated` (`:279-286`).
- `packages/core/modules/requester/requester.js` — PR #636's
  `_refreshAuthOnce` (`:516-535`), `refreshContext` (`:25`, `:303`),
  `_authGeneration` (`:40`, `:214`, `:317-321`), and the uncapped
  generation-mismatch retry (`:317-321`).
- `packages/core/credential/repositories/` — the non-atomic upsert in all
  three adapters (`credential-repository-mongo.js:115,120`,
  `credential-repository-postgres.js:132,137`,
  `credential-repository-documentdb.js:92,121`) and the port
  (`credential-repository-interface.js`).
- `packages/core/handlers/backend-utils.js:193,221` — the silent
  `ERROR`/`DISABLED` ack that turns one lost race into ongoing data loss.
- `packages/core/integrations/repositories/process-repository-mongo.js:97-137`
  and `process-repository-postgres.js:163`, plus
  `integration-repository-mongo.js:404-425` — the dual-engine atomic-write
  pattern that layer 3 copies.
- `packages/core/modules/requester/requester.concurrent-refresh.test.js:4-9`
  — Frigg's regression fixture. It *models* rotate-and-force-expire with no
  grace window. That is a modeling choice, not provider evidence.
- Numbering note: this ADR takes 031 because ADR drafts on unmerged branches
  claim `028`, `029`, and `030`
  (`claude/frigg-adr-ssm-env-management`,
  `claude/frigg-adrs-app-init-skills-pipeline`). None of those drafts covers
  refresh concurrency. If one of those drafts is abandoned, a renumber of
  this ADR down is safe until other documents reference it.
