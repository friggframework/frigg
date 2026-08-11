# ADR-031: Concurrent OAuth Credential Refresh Across Lambda Invocations

**Status**: Proposed
**Date**: 2026-08-11
**Deciders**: TBD

## Context

A production Frigg app (Aspire → QuickBooks Online, AWS Lambda, MongoDB)
silently orphaned **95 records over 4 months**. The trigger is a
cross-invocation credential rotation race; the reason it stayed silent for
four months is a separate amplifier in the invalidation and queue-worker
paths. Both are framework-level, both are reachable by every one of the ~46
api-modules in the api-module-library, and neither is addressed by the
per-instance single-flight refresh that already shipped in PR #636.

### The race, as observed

Two *different* Lambda requestIds, 368ms apart, both refreshing the same QBO
credential on 2026-08-09:

```
06:00:50.244  requestId 2dbc8561  Starting token refresh
              grant_type: 'authorization_code'
06:00:50.815  requestId 2dbc8561  Token refresh SUCCEEDED
06:00:51.183  requestId 81915aec  Starting token refresh
              grant_type: 'authorization_code'
06:00:51.531  requestId 81915aec  Token refresh FAILED  invalid_grant
```

`81915aec` is the invocation that then failed 3 invoices with 401. The
measured numbers matter for every option below: the winner's token round trip
took **571ms**, the loser's **348ms**, and the gap between the winner's
rotation and the loser presenting a stale refresh token was **368ms**.

### The code-level mechanism

Frigg fans a sync out as separate SQS messages, so each stage is a separate
Lambda invocation. The queue worker is
configured `reservedConcurrency: 20`, `batchSize: 1` (in
`packages/devtools/infrastructure/`, at
`domains/integration/integration-builder.js:433` and `:443`), so up to 20
invocations of the same integration's worker run concurrently, one message
each.

Every invocation builds its own object graph. `GetIntegrationInstance`
constructs exactly one `Module` per entity
(`packages/core/integrations/use-cases/get-integration-instance.js:58-64`),
each with fresh repositories, and `Module` copies the credential's fields into
memory once at construction:

- `packages/core/modules/module.js:54` splats
  `this.apiParamsFromCredential(this.credential.data)` into `apiParams`
- `packages/core/modules/module.js:75` is the copy itself,
  `_.pick(credential, ...this.apiPropertiesToPersist?.credential)`
  (in the published `2.0.0-next.78` build the same statement sits at
  `module.js:67`)

After that line the DB is never consulted again for this credential on the
sync path. Verified by call-site enumeration: `findCredential` /
`findCredentialById` have **no** callers in any queue worker, integration
handler, `Module` method, or requester.

`refreshAuth()` (`packages/core/modules/requester/oauth-2.js:297-332`) then
refreshes from that in-memory copy and **never re-reads the credential from
the DB** before doing so. On success, `setTokens()` fires `DLGT_TOKEN_UPDATE`
(`oauth-2.js:145`) → `Module.onTokenUpdate()`
(`packages/core/modules/module.js:108-141`) → `upsertCredential`
(`module.js:124`), which is a blind last-writer-wins upsert with no version
check and no optimistic concurrency. The Mongo adapter is a non-atomic
`findFirst`-then-`update` across two round trips
(`packages/core/credential/repositories/credential-repository-mongo.js:115`
then `:120`); Postgres is structurally identical
(`credential-repository-postgres.js:132`, `:137`); DocumentDB is
`findOne`-then-`updateOne`
(`credential-repository-documentdb.js:92`, `:121`).

So two invocations that refresh near-simultaneously both present the
pre-rotation refresh token, and the second gets `invalid_grant`.

### The amplifier — why 95 orphans and not 3 failed invoices

On refresh failure `refreshAuth()` fires `DLGT_INVALID_AUTH`
(`oauth-2.js:327`) → `Module.markCredentialsInvalid()`
(`packages/core/modules/module.js:154-205`), which writes
`authIsValid: false` on the **shared** credential record. That reaches
`IntegrationBase.receiveNotification` →
`_recordCredentialRejection` →
`persistStatus('ERROR')`
(`packages/core/integrations/integration-base.js:874`, `:878`,
`:902`). From then on the queue worker checks
`['DISABLED', 'ERROR', 'IN_DELETION'].includes(status)` and simply `return`s
(`packages/core/handlers/backend-utils.js:193` and `:221`), which
`Worker.run` treats as success — **so SQS deletes every subsequent page
message with no DLQ entry**. One losing invocation flags an otherwise-healthy
credential dead, and the integration then swallows work silently. The
credential is shared: two integrations sharing one Credential row has already
been observed in production (commit `893b1e73`, PR #634).

This chain, not the `invalid_grant` itself, is how 95 records disappeared.

### Why the shipped per-instance single-flight (PR #636) does not solve this

PR #636 (`fix/requester-single-flight-refresh`) added, in
`packages/core/modules/requester/requester.js`:

- `_refreshAuthOnce()` (`:516-535`) — a single-flight promise so concurrent
  callers share one refresh
- a `refreshContext` `AsyncLocalStorage` re-entrancy guard (`:25`, checked at
  `:303`) so a 401 raised from *inside* the refresh flow is fatal rather than
  deadlocking, because subclasses issue their token request through
  `this._post` → `_rawRequest`
- an `_authGeneration` counter (`:40`, `:214`, `:317-321`) so a 401 that lands
  after another request already refreshed retries with the new token instead
  of spending another rotation

All three coordinate callers **inside one process**. Its own docstring says
the assignment is safe because concurrent callers "on the single-threaded
event loop" cannot both start a refresh. The commit message for `e34c9c0b`
scopes itself out explicitly: "A single invocation could therefore reproduce
the production signature with no cross-process race at all." There is exactly
one `Module`, and therefore one requester, per entity per invocation
(`get-integration-instance.js:58-64`), and no shared process memory across
the 20 concurrent invocations. `AsyncLocalStorage` does not cross an
invocation boundary. **PR #636 cannot close the race in this ADR**, and any
design that moves the refresh into another process silently loses its
re-entrancy guard.

### Provider semantics

Intuit/QuickBooks rotates the refresh token on refresh and force-expires the
previous one; many OAuth2 providers behave the same way. (Frigg's own
regression fixture, `requester.concurrent-refresh.test.js:4-9`, models the
same rotate-and-force-expire semantics with no grace window — that is a
modeling choice consistent with this description, not independent evidence
about any provider.)

RFC 9700 §4.14.2 goes further: on reuse of an already-consumed refresh
token, an authorization server SHOULD revoke **the whole grant** — access
tokens included, the winner's freshly minted pair too. **This is the
load-bearing provider assumption in this ADR, so it is named explicitly:
layers 1-2 assume the winner's grant survives the loser's reuse attempt.**
Observed behavior on this incident supports that assumption for Intuit (the
winner's tokens kept working after the loser's `invalid_grant`), but it is
**per-provider and unverified in general**. Where a provider does revoke the
whole grant, a lost race is not recoverable by re-reading — the credential
is genuinely dead the moment the loser's request lands. Layers 1-2 handle
that case by escalation (see layer 2's "adoption failure" rule): the
contract this ADR guarantees is *no failure is silent*, not *no credential
ever dies*. For such providers the only real protections are fewer refreshes
(layer 4) and serialization (layer 7), and layer 5 gives modules a place to
declare this semantic.

**Unverified**: the exact rotation interval (commonly cited as 24-26h),
whether Intuit offers any grace or reuse window, and which providers revoke
the whole grant on reuse. Intuit's own doc pages are JS-rendered and could
not be fetched during this investigation, and their Nov 2025 blog post on
refresh-token validity says nothing about rotation interval or
previous-token invalidation. **No part of this ADR depends on a grace window
existing.** Assume zero grace; the arithmetic here is derived only from the
measured 571ms / 348ms / 368ms above.

### A second structural finding

Frigg is currently incapable of proactive refresh. `isAuthenticated()`
(`oauth-2.js:279`) has **no non-test callers anywhere in `packages/core`**
(verified by grep; the same method exists unused on `api-key.js:34` and
`basic.js:27`). `accessTokenExpire` is computed at `oauth-2.js:138` and then
discarded, because persistence is gated on each module's
`apiPropertiesToPersist.credential` list and no module lists it — QBO's is
`["access_token","refresh_token","realmId"]`. Every invocation therefore
hydrates with `accessTokenExpire = null` and can only discover expiry by
taking a 401. That *maximises* collision probability: N stages do not refresh
at random times, they all discover expiry at the same instant, on the first
request after the hour boundary. The 06:00 burst signature in the log is
exactly that.

### Decision drivers

- **Lambda, one invocation per SQS message.** No shared process memory
  between stages. Warm containers exist but cannot be relied on for
  correctness — ADR-027 already accepts this hazard for SSM
  ("warm containers hold values fetched at cold start").
- **Field-level KMS encryption.** `data.access_token`, `data.refresh_token`,
  and six other paths are envelope-encrypted with a fresh random DEK per
  write (marked immutable, in
  `packages/core/database/encryption/encryption-schema-registry.js:16-28`;
  see also `packages/core/encrypt/Cryptor.js`). Ciphertext is
  non-deterministic, and the Prisma encryption extension never processes
  `args.where`. **A conditional write cannot compare on the stored token
  value.** Any compare-and-swap needs a plaintext discriminator.
- **VPC.** The incident app is VPC-enabled. Any new AWS service reached from
  a private subnet costs an interface endpoint (ADR-027 books ~$7-22/month
  for its SSM endpoint) unless it has a free gateway endpoint.
- **Three credential adapters, two engines.** `mongodb`, `postgresql`, and
  `documentdb` are all factory-dispatched
  (`credential-repository-factory.js:28-46`). The port
  (`credential-repository-interface.js:10-12`) claims one implementation
  currently serves Mongo and Postgres. DocumentDB is real and must be either
  covered or explicitly scoped out.
- **No schema headroom.** `Credential` has no version column and no
  `@@unique`: `id, userId, authIsValid, externalId, data Json, createdAt,
  updatedAt @updatedAt` (`packages/core/prisma-mongodb/schema.prisma:96-116`
  and the Postgres twin). `updatedAt` is the only existing monotonic field.
- **No coordination primitives exist.** No DynamoDB, Redis, ElastiCache, or
  Memcached dependency; no lock, lease, mutex, or idempotency-key concept
  anywhere in `packages/core`; no `dynamodb:*` grant in the **runtime**
  Lambda role (the CLI's Terraform generator does emit management-plane
  DynamoDB statements, at `terraform-generator.js:78-79` and `:229-239`,
  but those never reach the runtime role); the baseline Lambda role grants
  only `sns:Publish` to the error topic and four `sqs:*` actions (in
  `packages/devtools/infrastructure/`, at
  `domains/shared/utilities/base-definition-factory.js:183-209`). Queues are
  plain standard SQS with no `MessageGroupId` anywhere.
- **Framework consumed by many apps pinning published versions.** The
  published `@friggframework/core@2.0.0-next.78` has an *older* 401 path than
  `next`: `refreshCount > 0` fail-fast, never reset, and no `_authGeneration`,
  `_inFlightRefresh`, or `refreshContext`. The incident app pins it.
- **Dozens of api-modules inherit this path.** Of ~46 real modules, 37 extend
  `OAuth2Requester`: 33 `authorization_code`, 2 ROPC, 2 pure
  `client_credentials`. 35 are rotation-exposed. The 5 api-key + 2 basic-auth
  + marketo modules never refresh but *are* still exposed to the shared
  invalidation amplifier via `requester.js:341`. (These counts were taken in
  the separate `friggframework/api-module-library` repo checkout; they are
  not reproducible from this repo and should be re-counted at
  implementation time.)
- **ADR-027's bar**: "Both features are inert until opted into; no existing
  app changes behavior on upgrade." A correctness fix for silent data loss
  cuts against that bar. This ADR argues the exception explicitly rather than
  ignoring it.
- **CLAUDE.md hexagonal rules** are binding on placement: a conditional-write
  primitive belongs as a port method with per-adapter implementations; the
  policy for what to do when it loses belongs in a use case, not in the
  repository and not in `Requester`.

## Decision

Adopt a **layered stack, not a single mechanism**. The membership is stated
once, here, and every later mention conforms to it:

- **Layers 1-4 are load-bearing.** All four must ship.
- **Layer 5 is required but is pure policy** (a declaration, no mechanism).
  It ships with the stack.
- **Layer 6 is optional** defense-in-depth.
- **Layer 7 is deferred.** Its variants compete with each other; pick at
  most one, and only after layers 1-5 are in production with measured data
  (the metric is defined in the open-question section).

The register already has the pattern this needs. Frigg solved exactly this
class of bug for `Integration.config` and `Process` and skipped `Credential`:
`integration-repository-mongo.js:404-425` merges config via `findAndModify`
so there is "no JS-side read-modify-write to race on";
`process-repository-mongo.js:97-137` is documented as the "race-safe
counterpart to `update()`"; `process-repository-postgres.js:163` is the
`UPDATE ... RETURNING *` twin; `integration-base.js:654` `patchConfig`
explicitly rejects the local-merge guess "which would silently drop keys a
concurrent writer already landed". `upsertCredential` is the one hot write
that never got the treatment. **This ADR finishes an existing pattern rather
than introducing a new one, and that is the strongest argument for it.**

### 1. Containment — a failed refresh is not a dead credential (load-bearing)

Three sub-changes, all in existing code, no new component:

1. On refresh failure, do not invalidate unconditionally. Re-read the
   credential and compare the DB's `refresh_token` to the one that was
   presented. The comparison happens on decrypted plaintext in application
   memory, which is what makes it possible at all given non-deterministic
   ciphertext. If they differ, this invocation lost a race → raise a
   **retryable** error instead of calling `markCredentialsInvalid()`.
2. Give that discriminator bounded backoff (2-3 re-reads over ~3s), because
   the winner may not have committed yet — the observed window between the
   winner's success and the loser's failure was 716ms.
3. Fix the queue worker's `ERROR` handling — **and only `ERROR`**. The
   status gate `['DISABLED', 'ERROR', 'IN_DELETION']` appears twice, on two
   distinct paths: the process/page path (`backend-utils.js:193`) and the
   webhook path (`:221`). The three states must be handled separately:
   - `ERROR`: must not silently ack. Throw so SQS retries and eventually
     DLQs, or at minimum record a Process failure row. This is the state a
     lost race can trip, and the silent ack here is the amplifier.
   - `DISABLED` and `IN_DELETION`: keep the silent ack. These are
     *intentional* stops (an operator action; a deletion in flight). Work
     for them is supposed to be dropped. Throwing here would push every
     in-flight message through 3 receives x `VisibilityTimeout: 1800`
     (`integration-builder.js:566-568`) into the DLQ for integrations that
     are behaving correctly. Add a log line on the drop; nothing more.

**This is the layer that would have prevented the incident even with the race
fully intact.** The race cost 3 invoices; this layer is the difference between
3 and 95-over-4-months. It is default-on: it only ever converts a silent ack
into a loud retry, and it never changes happy-path behavior.

Two operational requirements ship with it:

- **Kill switch.** An environment variable (e.g.
  `FRIGG_LEGACY_ERROR_ACK=true`) restores the old silent-ack behavior for
  `ERROR` without a redeploy of code. Default-on with no rollback path is
  not an acceptable ask for a fleet-wide ack-semantics change; this is the
  rollback story.
- **Retry-safety audit.** Converting a silent ack into a retry means each
  page message can now run up to `maxReceiveCount: 3` times. Stage
  processing must be idempotent for that to be safe. The framework cannot
  guarantee this for app code, so PR 1 must document the new contract
  ("failed pages are retried; page handlers must tolerate re-delivery") and
  the core-owned paths must be audited for it as part of the PR.

### 2. Loser recovery — re-read and adopt on failure (load-bearing)

A loser does not need to refresh; it needs a *valid access token*, and the
winner already persisted one. On a 401 before refreshing, and again on
`invalid_grant` after failing, re-read the credential; if the persisted
`access_token` differs from the in-memory copy, adopt it, bump
`_authGeneration`, and retry via `requester.js:379`. The datastore is the
shared cache — no second cache is required.

**Adoption-failure escalation (required).** Adoption can fail two ways: the
re-read finds no newer token than the one that just got rejected, or the
adopted token is itself rejected on the retry. Either one means nobody holds
a valid token — this is no longer a lost race, it is a genuinely dead
credential (user revoked access, or a whole-grant-revoking provider killed
the winner's tokens too; see "Provider semantics"). At that point the
original behavior is correct and must run: `markCredentialsInvalid()`, a
loud failure, retry, DLQ. Layer 1 suppresses invalidation **only while
recovery is possible**, never unconditionally — without this rule, layers
1-2 would teach the system to ignore exactly the signal that a dead
credential emits.

Three implementation constraints, each a silent no-op or a regression if
missed:

- **Mutate the instance fields; do not thread an argument.**
  `oauth-2.js:309-311` passes `{ refresh_token: this.refresh_token }` to
  `refreshAccessToken`, but the incident app's QBO override takes no argument
  and reads `this.refresh_token` directly. An argument-threading
  implementation is a no-op in the exact module that caused the incident.
- **Do not route the reload through `setTokens()`.** `setTokens` ends in
  `notify(DLGT_TOKEN_UPDATE)` (`oauth-2.js:145`) → `onTokenUpdate` →
  `upsertCredential` **and** `authIsValid = true` (`module.js:122-126`),
  which would cost a write plus 2 KMS `GenerateDataKey` per 401 and would
  silently resurrect a credential an operator had just disabled.
- **Reload failure must be non-fatal.** `_rawRequest:376` awaits
  `_refreshAuthOnce()`; an unguarded rejection there skips `_invalidateAuth`
  and turns every transient DB blip into a hard worker failure.

Reuse the existing port method `findCredentialById`
(`credential-repository-interface.js:24`, implemented in all three adapters)
via a new `DLGT_CREDENTIAL_RELOAD` delegate type. `Delegate.notify` already
returns the delegate's return value
(`packages/core/core/Delegate.js:9-22`), so no change to `Delegate` is
needed. Add a reload budget (e.g. one per 401): the generation-mismatch
retry at `requester.js:317-321` has **no `attempt` cap and no delay**, unlike
every other retry branch, and is only safe today because `_authGeneration`
advances solely inside `_refreshAuthOnce`.

**Reject the per-API opt-in flag from the original option-3 framing.** A
re-read on 401 is one query on a path that should be rare. Gating it behind a
per-module flag means 35 rotation-exposed modules keep dropping SQS messages
until 35 separate authors opt in. Make it unconditional and delete the config
surface.

### 3. Compare-and-swap on the credential write (load-bearing)

Add a plaintext monotonic `tokenVersion` scalar column (not a JSON path —
Prisma JSON-path filtering diverges sharply between the Mongo and Postgres
providers) and make the token-refresh write a single server-side conditional
write:

- Mongo: `$runCommandRaw({ findAndModify: 'Credential', query: { _id,
  tokenVersion: observed }, update: { $set: {...}, $inc: { tokenVersion: 1 } },
  new: true })`
- Postgres: `UPDATE "Credential" SET ... WHERE id = $1 AND "tokenVersion" =
  $2 RETURNING *`
- DocumentDB: the existing filter-conditional
  `updateOne` helper at `packages/core/database/documentdb-utils.js:77`

Zero rows returned means this writer lost: re-read and adopt (layer 2), never
clobber. This also removes a round trip — today's read-then-write becomes one
server-side write.

**How the id and the observed version reach the write** — today they do
not, and that is the main implementation work in this layer. The current
chain is: `Module.onTokenUpdate()` (`module.js:108`) builds
`credentialDetails` from `getCredentialDetails(api, userId)`, whose shape is
`{identifiers: {userId, externalId}, details: {...}}` — no id, no version —
and `upsertCredential` then does its own `findFirst` on the identifiers. The
fix uses state `Module` already holds: `this.credential` is the hydrated row
(`module.js:32`) and is reassigned to the persisted row after every write
(`module.js:127`), so `this.credential.id` and `this.credential.tokenVersion`
are the observed values by construction. `onTokenUpdate` passes them
alongside `credentialDetails` to a new port method
(`updateCredentialByVersion(id, observedVersion, details)`); on CAS failure
it re-reads, adopts (layer 2), and replaces `this.credential` with the fresh
row so the next attempt observes the winner's version.

**The create branch is exempt from CAS — deliberately.** A conditional
upsert is a trap: `findAndModify` with `upsert: true` and a mismatched
version does not fail, it **inserts a duplicate credential row**. So: CAS
applies only when `this.credential.id` exists (every token refresh, which is
the racy path). Initial credential creation keeps today's identifier-keyed
path and writes `tokenVersion: 1`. Duplicate-creation on first authorization
is a pre-existing exposure (the schema has no `@@unique` on
`(userId, externalId)`); adding that index is desirable but is a separate
migration with its own risks (PR #634 observed one credential row shared by
two integrations) and is out of scope here.

**Initialization and backfill.** Every pre-existing credential row lacks
`tokenVersion`. Do not backfill; make the first conditional write tolerant:
match `{ _id, $or: [{tokenVersion: observed}, {tokenVersion: null}] }` when
the observed value is missing (Postgres: `"tokenVersion" IS NULL`), and set
it to 1 on that write. From then on the column is present and strict CAS
applies. This mirrors layer 4's "treat missing as unknown" rule and needs no
data migration, only the schema addition.

**Be honest about what this does and does not do.** CAS closes the *clobber*,
not the race: by the time the loser's CAS fails, the provider has already
force-expired its refresh token, so the damage happened at the token
endpoint, not at the DB. Its value is that the winner's token can never be
overwritten by a loser's stale write, and that the loser gets a **reliable,
local, timing-independent signal that it lost** — which is what makes layers
1 and 2 sound rather than heuristic. See "Dissent preserved" below; this is
the point on which the option evaluations disagree most sharply.

### 4. Persist the expiry in core and pre-flight the refresh (load-bearing)

Four sub-changes. The first three are prerequisites without which the fourth
is either inert or actively harmful:

1. **Fix the expiry computation.** `setTokens` currently runs
   `this.accessTokenExpire = new Date(Date.now() + accessExpiresIn * 1000)`
   unconditionally (`oauth-2.js:138`), and `accessExpiresIn` defaults to
   `null` — `null * 1000` is `0`, so a provider that omits `expires_in`
   yields a Date pinned to *now*: a token that looks permanently expired.
   Set `accessTokenExpire` only when `expires_in` is a positive number;
   otherwise leave it `null` (meaning "unknown").
2. **Persist both expiry fields unconditionally from core**, outside each
   module's `apiPropertiesToPersist` — they are framework state, not module
   state. They are plaintext (not in the encryption schema), so no new
   encrypted field and no schema change.
3. **Hydrate them back unconditionally from core.** Persisting alone is
   inert: hydration is gated by the same per-module list —
   `apiParamsFromCredential` is `_.pick(credential,
   ...this.apiPropertiesToPersist?.credential)` (`module.js:75`), so a field
   no module lists never reaches the instance. `Module` must merge the two
   expiry fields into the API instance outside that pick, as the read-half
   twin of sub-change 2. (The Context section identifies this gate; the
   original draft of this ADR fixed only the write half — a reviewer
   caught it.)
4. **Pre-flight gate — do not reuse `isAuthenticated()` as written.**
   `isAuthenticated()` (`oauth-2.js:279-286`) requires **all four** fields —
   `access_token`, `refresh_token`, `accessTokenExpire`, and
   `refreshTokenExpire` — to be set, and `refreshTokenExpire` is only ever
   set when the provider sends `x_refresh_token_expires_in`
   (`oauth-2.js:131-142`), an Intuit-specific field most providers omit. A
   gate built on it returns "not authenticated" forever for most modules,
   which means **refresh on every request**: the exact stampede this layer
   exists to prevent. The correct gate is narrow: pre-flight refresh only
   when `accessTokenExpire` is present, parseable, and in the past minus a
   ~5-minute skew margin. Missing or unknown expiry → do nothing and let
   the 401 path handle it, which is exactly today's behavior. The fail-safe
   direction is "unknown → reactive", never "unknown → refresh".

One core change covers all ~46 modules. This does **not** close the race —
two invocations hydrating at the same moment both see an expired token and
both pre-flight refresh, the same collision moved ~50ms earlier — but it
cuts the number of refresh events (one per token lifetime instead of one per
stage-burst) and removes the "everyone discovers expiry at the same instant
via 401" enabling condition. Old rows without the fields behave exactly as
today.

### 5. Declare rotation semantics per module (required, policy only)

Add two declarative fields (defaults are the safe assumptions):

- `refreshTokenRotates: true | false` (default `true`) so core can skip
  coordination for the ~11 of 46 modules that cannot lose a rotation race,
  and be strict for the 35 that can.
- `revokesGrantOnReuse: true | false | undefined` (default `undefined`,
  "unknown") for providers that follow RFC 9700 §4.14.2 and kill the whole
  grant when a consumed refresh token is replayed. For a module that
  declares `true`, a lost race is unrecoverable, so core should bias harder
  toward avoidance for it: always pre-flight (layer 4) and surface it as a
  priority candidate if layer 7 ever ships. Per-provider values are
  unverified today; the field exists so verification lands as one line in
  the module instead of tribal knowledge.

Where a provider offers `client_credentials` for the data in question,
prefer it — it mints from static credentials and concurrent refreshes are
merely wasteful, not mutually destructive. The incident app already does
this for Aspire.

This is narrow: QBO, Google, Slack, and HubSpot user-scoped data have no
`client_credentials` equivalent, so the grant is unavailable rather than
merely unused. ADR-019 already anticipates exactly this split, placing the
"OAuth2 refresh state machine" in core and "refresh-without-rotate /
refresh-with-rotate" quirks in the api-module.

### 6. Jittered dispatch (optional, defense-in-depth)

Random `DelaySeconds` (0-5s) on fan-out sends in
`packages/core/queues/queuer-util.js`, so simultaneous first-requests do not
align. ~5 lines, pure probability reduction, directly attacks the observed
368ms collision. Worthless on its own; worth having once 1-4 are in.

### 7. Single-writer semantics (deferred; pick at most one, only with data)

Three genuinely different ways to get serialization. **They compete with each
other, not with layers 1-4.** Do not ship any of them until 1-4 are in
production and there is data on how often losses still occur.

- **Datastore lease.** Mongo `findAndModify` on a `leaseUntil` field, or
  Postgres `pg_try_advisory_xact_lock` **inside a transaction** (session-scoped
  advisory locks are unsafe under connection pooling). Correct TTL is bounded
  by Frigg's own per-attempt HTTP timeout — `DEFAULT_REQUEST_TIMEOUT_MS =
  60_000` (`requester.js:8`) — plus KMS and two writes, so ~90s, released in
  a `finally`. Not the 900s Lambda timeout (one crash would stall an
  integration for 15 minutes) and not 10s (a slow token endpoint would
  produce two holders). A TTL lease is a probabilistic optimization, not
  mutual exclusion — the abort is `setTimeout`-based and a CPU-starved
  container can overshoot. This is precisely why layers 2 and 3 must sit
  underneath it.
- **Scheduled single-writer refresh.** EventBridge Scheduler ticks below the
  access-token lifetime; the request path never refreshes. Reuses the existing
  `domains/scheduler/scheduler-builder.js`. Depends on layer 4 for expiry
  data. Raises the floor but cannot remove the request-path fallback (missed
  tick, cold app, newly-authorized credential). A schedule-per-credential
  does not scale; the scalable shape is one sweeper that queries due
  credentials.
- **SQS FIFO with `MessageGroupId = credentialId`.** The only *provable* fix
  on the table: SQS keeps at most one message per group in flight and Lambda
  initializes one execution per group, so the race becomes structurally
  unreachable for one credential while different credentials still
  parallelize. Costs head-of-line blocking (with `maxReceiveCount: 3` and
  `VisibilityTimeout: 1800` at `integration-builder.js:566-568`, one stuck
  message stalls a group for ~90 minutes), loses intra-integration page-chain
  parallelism, and FIFO queues cannot be converted in place — new queue,
  drain, cutover, per deployed app. Scope as an opt-in `appDefinition` flag,
  never default.

### Ordered implementation sequence

1. **PR 1 — layer 1 (containment).** No migration, no infra, identical across
   all three adapters, and independent of the `next.78`-vs-`next` divergence
   because it lives in the invalidation and worker paths rather than the 401
   path consumers are pinned to. Default-on, with the kill switch. Rough
   size: ~100-150 LOC plus the retry-safety audit; days, not weeks.
2. **PR 2 — layers 3 + 2 together** (CAS and loser recovery are one use case:
   "lost the rotation race → recover"). Needs one Prisma migration for
   Postgres, the new port method, three adapter implementations, the
   `onTokenUpdate` threading, the reload delegate, and the escalation rule.
   The largest PR: ~300-400 LOC across core plus tests; expect the bulk of
   review time here.
3. **PR 3 — layer 4** (expiry fix + core-owned persist/hydrate + the narrow
   pre-flight gate). ~100 LOC, mostly in `oauth-2.js` and `module.js`.
4. **PR 4 — layers 5 + 6** (two declared fields, jitter). Small; ~50 LOC.
5. **Then** measure against the metric defined below, and only then decide
   layer 7 — or decide it is not needed.

These sizes are estimates from reading the touched files, not from an
implementation spike; treat them as relative weights, not commitments.

### Open question — why this ADR is Proposed and not Accepted

**Does Frigg need provable serialization, or is "no failure is ever silent,
and losers always recover" a sufficient contract?**

Layers 1-4 give a system where a lost race costs one wasted provider rotation
and a retry, never a dropped record and never a false `authIsValid: false`
(with the one caveat named under "Provider semantics": a
whole-grant-revoking provider turns a lost race into a real credential
death, loudly). They require **zero new AWS infrastructure**, which is the
decisive argument against the heavier options and against ADR-027's
VPC-endpoint cost precedent. But a residual race window remains: the
interval between a loser hydrating (or re-reading) the credential and its
refresh request landing at the provider. That interval has **not been
measured** — the 348-571ms figures elsewhere in this ADR are token-endpoint
round trips, quoted only for scale. Layer 7's SQS FIFO variant is the only
candidate that closes the window provably, at the cost of a per-app queue
cutover.

**The metric that decides layer 7.** PR 2 must emit two counters through the
existing requester telemetry (`requester.js` already carries a telemetry
runtime): `frigg.auth.refresh_race_recovered` (loser re-read, adopted, retry
succeeded) and `frigg.auth.refresh_race_lost` (adoption failed → escalated).
Suggested tipping condition, to be ratified with this ADR: more than one
`refresh_race_lost` per credential per week, sustained for a month, on any
production app → schedule layer 7 for that app. Without a named metric the
"then measure" gate is unanswerable; this is it.

The recommendation here is layers 1-5 now, layer 6 alongside (it is ~5
lines), layer 7 documented as an opt-in escape hatch. **A maintainer must
ratify that trade-off, and must also ratify the default-on decision in
layer 1 against ADR-027's opt-in bar**, before this ADR moves to Accepted.

### Dissent preserved

The option evaluations that fed this ADR did not agree, and the disagreements
are load-bearing rather than cosmetic:

- **Is CAS "the fix"?** One evaluation treats an atomic conditional write on
  `upsertCredential` as *the* fix — it "ships in a dependency bump, on by
  default, with no new IAM, no new Lambda, no new VPC endpoint". Another
  rejects that framing directly: CAS "closes the clobber, not the race",
  because the provider has already force-expired the token before the CAS
  fails. **This ADR sides with the second reading** and therefore keeps CAS
  as layer 3 rather than as the headline, with layers 1 and 2 above it. A
  reviewer who reads only "CAS fixes it" is reading the weaker argument.
- **What ships first?** One evaluation ranks the DB re-read on 401 as the
  best value-per-line change available. Another ranks failure containment
  first, on the grounds that it is the only change that would have prevented
  the incident with the race fully intact. **This ADR takes the second
  ordering** — the race cost 3 invoices, the amplifier cost 95 records — but
  the two overlap in the same re-read-and-compare primitive, so the practical
  gap is one PR boundary, not a design disagreement.
- **How much does read-on-401 actually buy?** One evaluation warns plainly
  against overclaiming: the dominant real trigger is the herd case — an
  access token that lapsed overnight makes an entire SQS burst 401 at once,
  and with `reservedConcurrency: 20` all twenty invocations then read the
  same stale credential inside the same few hundred milliseconds. It notes
  the incident's own margin was only 368ms and asks what happens at 100ms.
  **That objection is not resolved by layers 1-4** and is the substance of
  the open question above. It is the reason layer 4 (frequency reduction) is
  load-bearing rather than optional.

### What this ADR does not decide

- **Whether to build layer 7 at all, or which variant.** Explicitly deferred
  pending data from layers 1-4.
- **Any `provider-aws` decoupling.** An unmerged draft ADR proposes
  decoupling AWS from core (it circulates under the number 010, which
  collides with the accepted ADR-010 "Reporting as an Admin Operation"; its
  final number is TBD). It would make an AWS-specific coordination mechanism
  awkward later; nothing here adds new AWS coupling, but nothing here
  settles that draft either.
- **The `authIsValid` semantics for a genuinely dead credential**, or the
  operator surface for distinguishing "lost a race" from "user revoked
  access" in reporting/telemetry. Layer 1 stops writing `false` on a lost
  race; it does not redesign the field. ADR-024 makes
  `credential.authIsValid` the connection-status signal for every entity on
  the credential, including global entities, so a redesign is a separate ADR.
- **Whether one Credential row should be shareable by two integrations at
  all.** Observed in production (PR #634) and left as-is here.
- **Backfilling the 95 already-orphaned records.** Operational, not
  architectural.
- **The shared-credential invalidation exposure of the 8 non-refreshing
  modules** (5 api-key, 2 basic-auth, marketo) via `requester.js:341`. Layer
  1 helps them incidentally; nothing here audits them.
- **Test strategy beyond one regression case.** ADR-009's own coverage table
  already flags "Token refresh flows / OAuth refresh-on-401 / Low" as an
  untested gap; a two-instance / two-repository scenario belongs alongside
  `requester.concurrent-refresh.test.js`, but the broader gap is ADR-009's.

## Consequences

### Positive

- Removes the silent-data-loss path entirely. After layer 1 no auth failure
  can cause an SQS message to be deleted as a success; failures become loud
  (retry, then DLQ) instead of invisible for four months.
- A losing invocation stops corrupting the shared credential. `authIsValid`
  keeps meaning what ADR-024 says it means — a real connection-status signal
  rather than a flag any one unlucky Lambda can trip.
- Layers 1-4 require **no new AWS resource, no new IAM statement, no new VPC
  endpoint, no new runtime dependency, and no always-on stateful component**.
  Marginal cost is one extra credential read plus its KMS decrypts on the
  401 path only (the exact `Decrypt` count depends on how many of the
  record's 8 encrypted paths the reload touches), which is inside the KMS
  free tier for a small app and cents per month at scale.
- Layer 3 makes the credential write *cheaper* than today (one server-side
  round trip instead of read-then-write) while making it safe.
- Layer 4 gives the framework a working expiry model for the first time
  (today `accessTokenExpire` is computed, corrupted by the `null * 1000`
  default, and discarded) and reduces total provider token calls to roughly
  one per token lifetime, which also reduces rate-limit pressure.
- Finishes a pattern the register already proves dual-engine and already
  tests with "no last-writer-wins" in the test name, rather than introducing
  a new architectural concept.
- Newly possible: a credential write can now be made conditional on anything
  a plaintext discriminator can express — which is the prerequisite for a
  lease (layer 7), for per-credential rate limiting, and for a future
  "who rotated this token, when" audit trail.

### Negative

- **The race is narrowed, not closed.** The residual window is the loser's
  own read-to-refresh gap: the time between reading the credential and its
  refresh request landing at the provider. That gap has not been measured
  (the 348-571ms figures in Context are token-endpoint round trips, quoted
  for scale only). Two invocations landing inside it still burn a rotation.
  ADR-012 treats "concurrency races across Lambdas" as sufficient grounds to
  reject a design; this ADR knowingly leaves one and argues that a bounded,
  always-recovered, never-silent race is acceptable where an unbounded
  silent one was not.
- **The herd case is barely improved by layers 1-3.** When a whole SQS burst
  401s simultaneously, every invocation reads the same stale credential.
  Layer 4 is what addresses that, and layer 4 is a frequency reduction, not a
  guarantee.
- Layer 1 is **default-on**, which cuts against ADR-027's precedent that "no
  existing app changes behavior on upgrade". The justification is that the
  un-fixed state *is* the silent runtime failure ADR-027's rule exists to
  prevent, but a maintainer must accept that reasoning explicitly.
- Layer 3 needs a schema migration (Postgres; free on Mongo) under ADR-012,
  and touches all three adapters plus the port. It is the only layer with
  migration risk.
- Layer 2's correctness silently depends on `readPreference=primary`. There
  is no `readPreference` handling anywhere in `packages/core` — it is entirely
  operator-controlled via `DATABASE_URL`. An app that sets
  `secondaryPreferred` as an Atlas cost tweak gets a fix that is inert with
  no signal. This must be documented and ideally asserted at startup.
- Modules that mint tokens through a vendor SDK bypass `_rawRequest` and so
  receive neither PR #636's re-entrancy guard nor layer 2's interception
  automatically: the incident app's QBO module
  (`backend/src/api-modules/qbo/api.ts`
  uses `intuit-oauth`'s `refreshUsingToken` on a module-level singleton
  client) and the salesforce module's jsforce refresh handler (in the
  separate `friggframework/api-module-library` repo,
  `packages/v1-ready/salesforce/api.js:25-38`). **Those two must be audited
  by hand**, which means the module that caused the incident is not
  protected by default.
- New surface to maintain: a delegate type, a `Module.reloadCredential`
  method, a `tokenVersion` column, a conditional-write path per adapter, and
  a per-401 reload budget. Roughly 150 LOC for layers 1-2 and rather more for
  layer 3.
- Newly risky: layer 2 adds a DB read to the error path, so a DB blip now
  touches auth handling. Guarded by making reload failure non-fatal, but that
  guard is the difference between a graceful degrade and turning every 401 in
  the fleet into a hard worker failure.

### Neutral

- **Rollout for consumers pinning published versions.** Layers 2 and 3 sit on
  the 401 path where the published `2.0.0-next.78` build diverges from
  `next`: it fails fast on `refreshCount > 0` with no reset and has no
  `_authGeneration`, `_inFlightRefresh`, or `refreshContext`. On that build
  layer 2 would rescue the first 401 and brick on the second, so it is **not
  independently backportable**. Consumers must adopt a build at or after PR
  #636 first. Layer 1, by contrast, lives in the invalidation and worker
  paths and is version-independent, which is another reason it ships first.
  The end-to-end story for an app on `next.78` is therefore: bump core past
  PR #636 → take layer 1 (behavior change on the failure path only) → run the
  Prisma migration for layer 3 if on Postgres → no infrastructure redeploy at
  any step.
- The `documentdb` adapter must be covered by layer 3 or explicitly scoped
  out; the port's own note that "Credential model has identical structure
  across MongoDB and PostgreSQL, so CredentialRepository serves both"
  (`credential-repository-interface.js:10-12`) stops being accurate once
  engine-specific conditional writes land.
- `tokenVersion` becomes a plaintext field inside a record that is otherwise
  partially encrypted. That is consistent with `authIsValid` and
  `externalId`, which are already plaintext columns, and it is *required* —
  a discriminator that is encrypted cannot be used in a `where` clause.
- The legacy generic
  `packages/core/credential/repositories/credential-repository.js` is
  exported from `core/index.js` but never returned by the factory, so it is
  dead on the runtime path. Layers 2-3 do not update it; if it is ever
  revived it must be brought in line.
- ADR-003 "Runtime State Only" is **not** a constraint here despite the name.
  It is scoped entirely to the local-dev management GUI ("minimal security
  model appropriate for local development", "no production data"). It does
  not say Frigg holds no runtime state and cannot be cited against a
  DB-backed or lock-backed mechanism. Named here pre-emptively.

## Alternatives Considered

- **Central credential/token service — all requests proxy through a single
  service that loads the credential and refreshes at one point.** Rejected.
  Two readings, both fail. As a *true network proxy* it is not buildable:
  injecting an `Authorization` header on outbound HTTPS requires terminating
  TLS with a private CA — that is the hard blocker. (Transport-level routing
  is not: `Requester` accepts an injectable `agent` at `requester.js:43`,
  applied at `:216`, and `node-fetch@2` — Frigg's own stack — has no
  proxy-environment support, so routing would be per-stack work anyway. But
  even with routing solved, an agent cannot inject headers into TLS traffic
  it cannot read.) So "all requests flow through it" is false by default. It collapses into ADR-006's declared but
  unimplemented `/proxy` endpoints, which is a rewrite of the request layer
  of all ~46 modules, an estimated ~$260/month at 50M calls (unverified,
  from AWS list pricing), plus a synchronous hop and a hard 6MB Lambda
  payload ceiling. As a *token broker* it is buildable and
  has two genuine virtues worth stating: it deletes the stale-copy problem at
  its source rather than guarding it, and it puts the only party that ever
  sees `invalid_grant` in a position to distinguish "my stored token was
  stale" from "this credential is dead". But it **does not contain the fix**
  — traced against the 2026-08-09 log, a broker at concurrency > 1 without a
  lock closes 0% of the 571ms window and the two invocations 368ms apart
  still collide. The serialization it needs comes either from
  `reservedConcurrency: 1` (at the measured 348-571ms token round trip that
  is a ~2 rps ceiling for the app's entire token vending, and the
  configuration in which cross-process refresh recursion becomes a **hard
  deadlock**, because `AsyncLocalStorage` silently stops guarding across a
  process boundary) or from a lock, which closes the race by itself with no
  broker. Worse, a broker outage reads as a failed token
  fetch → `DLGT_INVALID_AUTH` → `authIsValid: false` → integration `ERROR` →
  silent SQS deletion: the new component's outage reproduces the exact
  data-loss mechanism this ADR exists to prevent, fleet-wide instead of per
  integration. Also requires bundling every api-module definition (so it is
  one more Lambda in each customer's own stack, not a shared service), new
  `lambda:InvokeFunction` IAM, and either a NAT hop or a Lambda interface
  endpoint that Frigg does not currently create. Keep it alive only as an
  optional *performance and observability* topology after layers 1-4, never
  as the correctness mechanism.
- **Each API class instance subscribes to emitted DB events, direct or via an
  SNS topic.** Rejected. The SNS form is architecturally impossible: no SNS
  subscription protocol delivers into an already-running Lambda invocation,
  and Lambda accepts no inbound connections. The only implementable forms are
  a Mongo change stream or Postgres `LISTEN` opened by the invocation itself,
  neither of which can carry the token — `refresh_token` ciphertext is
  non-deterministic, and putting a plaintext token in a `NOTIFY` payload is a
  security regression against the whole point of the encryption registry. So
  the payload degenerates to "credential X changed" and the subscriber must
  re-read and KMS-decrypt anyway, making this **a strictly worse layer 2 with
  extra infrastructure**. It also has a production trap at least as bad as
  the deadlock: Frigg has no teardown path at all (no `dispose`, `destroy`,
  or `finally` in `core/Worker.js`, `modules/module.js`, or the handler
  chain), and Lambda freezes rather than terminates a container, so every
  invocation on a warm container leaks a cursor and a DB connection until the
  pool is exhausted and the app's *normal* data path fails. Typical
  transport latencies (unverified, from published third-party benchmarks:
  SNS p99 on the order of ~200ms; SQS delivery p50 on the order of ~15ms)
  make it lose even against the single observed 368ms margin, and since the
  colliding invocations came from an SQS fan-out, most real races start
  inside the residual window. Fundamentally it is reactive-after-commit while the race is decided
  before the commit: no notification, at any latency, can un-send an
  in-flight HTTP request. DocumentDB would have to be scoped out entirely
  (change streams need per-collection enablement and are unsupported on
  auto-scaling clusters). The one salvageable 5% — bumping `_authGeneration`
  from an authoritative signal — is folded into layer 2.
- **Per-API opt-in flag: re-read on each 401 retry, plus dual-write to an
  instant system cache.** Partially adopted, and the source of layer 2. The
  read-on-401 half is the best value-per-line change on the table and would
  have converted the observed sequence into a success with a 368ms margin.
  Both bolt-ons are rejected. **The flag**: a re-read costs one query on a
  rare path; gating it per module leaves 35 rotation-exposed modules broken
  until 35 authors opt in. (A *declarative* rotation-semantics flag is
  different and is kept as layer 5.) **The dual-write cache**: it optimizes
  the smaller latency term — the persist chain (a KMS `GenerateDataKey`
  plus two DB round trips; estimated tens of milliseconds, unmeasured)
  against a measured 348-571ms token round trip — and has **no write
  ordering that is both useful and safe**. Cache-first means that if the DB write then fails
  or the Lambda is killed between writes, the only copy of the provider's
  currently-valid refresh token lives in a volatile store with a TTL, and
  `onTokenUpdate` has no try/catch around `upsertCredential`, so nothing
  flags it: today's bug loses records, that bug loses the credential.
  DB-first means the cache contributes nothing to the race and is pure cost.
  It also needs permanent invalidation at every credential write site
  forever, including `process-authorization-callback.js:184`, which is
  ADR-006's self-service reauthorize path and bypasses
  `Module.onTokenUpdate` — miss it and a *successful* re-auth becomes a
  permanent failure loop. And its failure logic is circular: fail-open means
  it can never be authoritative and therefore has no correctness role at all;
  fail-closed makes it Frigg's first always-on stateful runtime dependency
  and a new outage source for every sync in every app. SSM as the cache is
  disqualified twice over — `PutParameter` default write throughput is 3
  TPS (10 TPS with paid higher throughput, per AWS's Parameter Store
  throughput documentation), which a hot per-401 token path on 20 concurrent
  workers exceeds on its own, and ADR-027 explicitly reserves Parameter
  Store for static config with "no rotation machinery".
- **DynamoDB lease table.** Rejected on a principle worth stating:
  **coordinate in the same store as the data**. A DynamoDB lock guarding a
  Mongo write is two stores that can disagree; a conditional write on the
  Mongo document itself cannot. Mechanically it is the closest thing to
  reachable — the free `FriggDynamoDBVPCEndpoint` gateway endpoint is already
  created by `vpc-builder.js`, and conditional-write plus TTL is the textbook
  lease store — but it needs a new builder, new IAM in the runtime role (which today
  carries no `dynamodb:*` grant; the CLI's Terraform generator emits
  management-plane DynamoDB statements, but those never reach the runtime
  role), a new SDK dependency in core, and fresh AWS coupling that the
  unmerged provider-aws decoupling draft would make awkward (see "What this
  ADR does not decide" for that draft's numbering collision).
- **Eliminate the fan-out — serialize stages, or hoist all auth into one
  credential-holding parent invocation.** Rejected. Serializing removes the
  parallel page chains and roughly doubles wall-clock. "One credential-holding
  step" requires an invocation that outlives the whole sync against Lambda's
  hard 900s ceiling (`integration-builder.js:448`), which unbounded page
  counts turn into a wall rather than a trade-off. Passing tokens down in the
  SQS payload is worse still — KMS-protected secrets in message bodies with a
  4-day retention period. If serialization is genuinely wanted, layer 7's
  FIFO variant is the correct implementation of this idea.
- **Warm-container caching of the credential as the mechanism.** Rejected on
  ADR-027's own precedent: "warm containers hold values fetched at cold
  start; after an out-of-band parameter edit, containers converge only within
  the cache TTL." Container reuse cannot be relied on for correctness, and a
  cache-hit-dependent fix is non-deterministic by construction.
- **Compare-and-swap on the stored refresh-token value** (the obvious
  conditional-update design, and the reason layer 3 needs a version column).
  Rejected as impossible: the token is envelope-encrypted with a fresh random
  DEK per write so ciphertext never compares equal across writes, and the
  Prisma encryption extension never processes `args.where`, so an encrypted
  path cannot appear in a filter at all.
- **Doing nothing beyond PR #636.** Rejected. PR #636 is per-instance by
  construction and its own commit message scopes itself out of the
  cross-invocation problem. Leaving it here means the amplifier chain stays
  armed, and the failure mode is silent SQS deletion with no DLQ entry — the
  worst possible shape for an integration framework.

## Related

- [ADR-005](./005-admin-script-runner.md) — names "OAuth token refresh" as a
  common admin-script utility; the admin-script runner is another surface
  that instantiates modules and can therefore refresh concurrently with a
  queue worker.
- [ADR-006](./006-integration-router-v2.md) — defines
  `/api/credentials/:id/reauthorize` and the (unimplemented) `/proxy`
  endpoints. Its reauthorize path writes credentials outside
  `Module.onTokenUpdate`, which is why the cache alternative was rejected.
- [ADR-009](./009-e2e-test-package.md) — its coverage table already flags
  "Token refresh flows / OAuth refresh-on-401" as an untested gap.
- [ADR-012](./012-database-schema-migrations.md) — governs layer 3's
  migration (note ADR-012 is itself still Proposed, not Accepted), and
  supplies the precedent that "concurrency races across Lambdas" is a
  legitimate reason to reject a design.
- [ADR-019](./019-api-module-extensions.md) — already places the "OAuth2
  refresh state machine" in core and refresh-rotation quirks in the
  api-module; that is the precedent for layer 5.
- [ADR-024](./024-global-entities.md) — makes `credential.authIsValid` the
  connection-status signal for every entity on a credential, which is why a
  losing invocation writing `false` is a correctness bug and not cosmetic.
- [ADR-027](./027-ssm-parameter-offload-and-env-scoping.md) — the opt-in /
  no-behavior-change-on-upgrade bar this ADR argues an exception to, the
  warm-container staleness precedent, the VPC interface-endpoint cost
  precedent, and the boundary that Parameter Store is for static config, not
  rotating tokens.
- [ADR-003](./003-runtime-state-only.md) — **not** applicable despite the
  name; scoped to the local-dev management GUI. Listed to pre-empt the
  objection.
- `packages/core/modules/module.js` — credential hydration (`:54`, `:75`),
  `onTokenUpdate` (`:108-141`), `markCredentialsInvalid` (`:154-205`).
- `packages/core/modules/requester/oauth-2.js` — `refreshAuth` (`:297-332`),
  `setTokens` (`:115-145`), dead `isAuthenticated` (`:279-286`).
- `packages/core/modules/requester/requester.js` — PR #636's
  `_refreshAuthOnce` (`:516-535`), `refreshContext` (`:25`, `:303`),
  `_authGeneration` (`:40`, `:214`, `:317-321`), uncapped
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
  pattern layer 3 copies.
- `packages/core/modules/requester/requester.concurrent-refresh.test.js:4-9`
  — Frigg's regression fixture, which *models* rotate-and-force-expire with
  no grace window (a modeling choice, not provider evidence).
- Numbering note: this ADR takes 031 because `028`, `029`, and `030` are
  claimed by ADR drafts on unmerged branches
  (`claude/frigg-adr-ssm-env-management`,
  `claude/frigg-adrs-app-init-skills-pipeline`). None of them covers refresh
  concurrency. If any of those drafts is abandoned, renumbering this ADR
  down is safe until it is referenced elsewhere.
