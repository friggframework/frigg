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
- **401** means the HTTP status code for "not authorized".
- **`invalid_grant`** means the OAuth error for a rejected refresh token.
- **Ack** means the worker tells SQS that a message is complete. SQS then
  deletes the message.
- **DLQ** means dead-letter queue. SQS moves a message there after too many
  failed tries.

### The problem

Frigg's api modules and the `Requester` class have no way to deconflict
parallel processes that hit auth-refresh errors. Each invocation hydrates
the credential into memory once (`module.js:75`; `module.js:67` in the
published `2.0.0-next.78` build). `refreshAuth()`
(`oauth-2.js:297-332`) refreshes from that in-memory copy and never re-reads
the database first. The persist is a blind upsert: the last writer wins,
with no version check (`module.js:124`;
`credential-repository-mongo.js:115,120`;
`credential-repository-postgres.js:132,137`;
`credential-repository-documentdb.js:92,121`).

For many providers this is a non-issue. Those providers allow several live
access tokens, or allow multi-use refresh tokens. For some providers it is
an acute issue. Either a new access token invalidates all prior ones, or the
refresh tokens are single-use. Intuit/QuickBooks is in the second group: it
rotates the refresh token on refresh and force-expires the previous one.

Of the ~46 modules in the api-module-library, 35 are rotation-exposed.
(These counts come from the separate api-module-library repo checkout.
Re-count them at implementation time.)

### The incident that raised this

A production Frigg app (Aspire to QuickBooks Online) silently orphaned
**95 records over 4 months**. On 2026-08-09, two invocations refreshed the
same QBO credential 368ms apart:

| Time (UTC) | Invocation | Event |
|---|---|---|
| 06:00:50.244 | 2dbc8561 | Starts a QBO token refresh |
| 06:00:50.815 | 2dbc8561 | Succeeds. QBO rotates the refresh token. |
| 06:00:51.183 | 81915aec | Starts a refresh with the now-stale token |
| 06:00:51.531 | 81915aec | Fails with `invalid_grant` |

The loser then failed 3 invoices with 401. An amplifier made the loss large
and silent:

1. The failed refresh fires `DLGT_INVALID_AUTH` (`oauth-2.js:327`).
2. `markCredentialsInvalid()` (`module.js:154-205`) writes
   `authIsValid: false` on the **shared** credential record.
3. The integration goes to status `ERROR`
   (`integration-base.js:874`, `:878`, `:902`).
4. The queue worker then silently acks every later message
   (`backend-utils.js:193`, `:221`). SQS deletes the work. No DLQ entry
   appears.

PR #636 added a per-instance single-flight refresh. It coordinates callers
inside one process only. It cannot reach a race between invocations.

### Constraints

- Lambda runs one invocation per SQS message, up to `reservedConcurrency:
  20` in parallel (`integration-builder.js:433`). The invocations share no
  memory.
- The tokens are field-level KMS-encrypted with a fresh key per write. The
  ciphertext is non-deterministic. A database filter cannot compare on a
  token value. Comparisons must happen on decrypted plaintext, in
  application memory.
- **Database propagation delay (review caveat).** A read that follows a
  write may lag. The measured gap between the winner's success and the
  loser's failure was 716ms in the incident. The design below uses a bounded
  backoff for this. Correctness also requires `readPreference=primary`;
  nothing in core sets it, so it must be documented and asserted at startup.
- Consumers pin published versions. The published `2.0.0-next.78` build has
  an older 401 path (fail-fast on `refreshCount > 0`, no reset, no
  `_authGeneration`). Fixes on the 401 path are not backportable to it.
  Consumers must first adopt a build at or after PR #636.
- **Provider assumption, named.** The recovery below assumes the winner's
  tokens survive the loser's failed replay. RFC 9700 §4.14.2 says a server
  SHOULD revoke the whole grant on reuse of a consumed refresh token. The
  observed Intuit behavior in this incident supports the assumption. It is
  unverified for other providers. Where a provider revokes the whole grant,
  a lost race kills the credential. The guarantee of this ADR is then still
  met: the death is loud, never silent.

## Decision

Maintainer review (PR #637, 2026-08-13) set the direction. Four options were
assessed:

1. Each invocation listens for database change events and updates its
   in-memory credential.
2. Proactive refresh on a schedule, through the admin scripts, with an
   optional core script on a cron.
3. Pre-flight fetch of the credential from the database, per request.
4. Reactive check against the database, before a refresh and on each 401.

**The decision is options 4 and 2 together. Option 4 is the mechanism.
Option 2 is the companion that makes races rare.** Options 1 and 3 are
rejected (see Alternatives Considered).

### Option 4 — reactive database check (the mechanism)

Six rules define it:

1. **Before a refresh: re-read the credential.** If the stored refresh
   token differs from the in-memory copy, another process already
   refreshed. Adopt the complete stored token state. Do not refresh.
2. **On `invalid_grant`, and on a 401: re-read.** If the stored refresh
   token differs from the token that was presented, adopt the complete
   stored state, bump `_authGeneration`, and retry once
   (`requester.js:379`). **Key this test to the refresh token, not the
   access token.** A provider can rotate the refresh token and return an
   identical access-token string. An access-token comparison would then
   miss the winner and kill a healthy credential (review finding).
3. **Escalate only on proof of death.** Invalidate the credential only
   when both are true: the provider returned a definitive authorization
   rejection, such as `invalid_grant`, and the re-read found no newer
   refresh token. A timeout, a network error, a 429, or a 5xx from the
   token endpoint must never invalidate. Today `oauth-2.js:317-330` funnels
   every thrown error through one failure path; the implementation must
   split rejection from transport failure (review finding). When both
   conditions are true, the credential is genuinely dead. Then the original
   behavior is correct and must run: `markCredentialsInvalid()`, a loud
   failure, retry, DLQ.
4. **Bound the propagation delay.** The winner's write may not be readable
   yet. Use 2-3 re-reads over ~3s. The observed window was 716ms.
5. **Three implementation constraints.** Mutate the instance fields; do not
   thread an argument (the incident app's QBO override takes no argument
   and reads `this.refresh_token` directly — an argument-threading
   implementation is a no-op exactly there). Do not route the reload
   through `setTokens()`; that path writes to the database and sets
   `authIsValid = true`, which would resurrect a credential an operator
   disabled. Reload failure must be non-fatal; a database blip must not
   become a hard worker failure.
6. **No per-module flag.** The re-read is one query on a rare path. A flag
   would leave 35 rotation-exposed modules broken until 35 authors opt in.
   Make it unconditional.

**A required companion: stop the silent ack.** The incident stayed
invisible because the worker silently acks all work for an integration in
status `ERROR` (`backend-utils.js:193`, `:221`). Fix `ERROR` only: throw,
so SQS retries and eventually DLQs. `DISABLED` and `IN_DELETION` are
intentional stops and keep the silent ack, plus a log line. Ship a kill
switch (for example `FRIGG_LEGACY_ERROR_ACK=true`) and document the new
retry contract: failed pages are retried, so page handlers must tolerate
re-delivery (`maxReceiveCount: 3`).

**The metric.** Emit two counters through the existing requester telemetry:
`frigg.auth.refresh_race_recovered` (re-read, adopted, retry succeeded) and
`frigg.auth.refresh_race_lost` (escalated). Suggested tipping condition:
more than one loss per credential per week, sustained for a month, on any
production app. If the data shows that, revisit serialization (see
Alternatives).

### Option 2 — proactive scheduled refresh (the companion)

Build it as Sean framed it: an admin-script surface (ADR-005), plus an
optional core script that runs on a cron. When someone installs an
api-module with expiring OAuth tokens and refresh, the CLI offers the
script, or installs it automatically.

The simplest form needs **zero changes to core**. The script refreshes
blind, on a fixed cadence, below the shortest access-token lifetime (QBO
tokens live 60 minutes). It does not track expiry:

1. Enumerate the entities. Hydrate each module.
2. Skip modules that do not refresh (`isRefreshable` false) and modules on
   `client_credentials` (no rotation risk).
3. Call `refreshAuth()` on the rest, **serially**. One writer, so the
   script cannot race itself.
4. Persistence needs no new code. The existing chain already fires:
   `setTokens` → `DLGT_TOKEN_UPDATE` → `onTokenUpdate` →
   `upsertCredential`.

The waste is bounded: at a 30-minute cadence, 48 provider calls per
credential per day. For a small app, that is nothing. For one known sync
window, the cadence can be one refresh, minutes before the window.

Two caveats:

- A blind refresh rotates the refresh token each time. For a provider that
  also kills prior *access* tokens on each mint, a mid-sync refresh could
  break in-flight work. Schedule the sweep outside sync windows. Option 4
  also self-heals this case: the 401 re-reads and adopts the newer token.
- The chain "hydrate a module outside an integration, call `refreshAuth()`,
  persistence fires" must be confirmed against the module factory at
  implementation time. Each link is verified in code; the standalone run is
  not.

An expiry-aware version ("skip credentials that are still fresh") is an
optional later optimization, not a prerequisite. It would require core to
fix the expiry computation (`oauth-2.js:138` turns a missing `expires_in`
into a date pinned to *now*, via `null * 1000`) and to persist and hydrate
the expiry fields itself, outside `apiPropertiesToPersist` (`module.js:75`
gates hydration). Defer all of that until the waste matters.

Option 2 reduces request-path refreshes to nearly zero. It makes the race
rare. It cannot make the race impossible: a missed tick, a cold app, or a
newly authorized credential still refreshes on the request path. That is
why option 4 is the mechanism and option 2 is the companion.

### Sequencing

1. **PR A — option 4 plus the silent-ack fix.** No migration, no new
   infrastructure. Requires a build at or after PR #636.
2. **PR B — the scheduled refresh script, its schedule, and the CLI
   offer.** Zero core changes.
3. **Then measure** against the metric, and only then revisit
   serialization.

### Open question

Is "no failure is ever silent, and losers always recover" a sufficient
contract? Or does Frigg need provable serialization per credential? The
serialization candidates cost real money and migrations (see Alternatives).
The metric above decides. A maintainer must also ratify that the silent-ack
fix is default-on, which is an exception to ADR-027's
no-behavior-change-on-upgrade bar. The justification: the un-fixed state
*is* the silent runtime failure that ADR-027's rule exists to prevent.

## Consequences

### Positive

- No auth failure can silently delete queued work. Failures become loud:
  retry, then DLQ.
- A losing invocation stops corrupting the shared credential. `authIsValid`
  keeps the meaning ADR-024 gives it.
- Options 4 and 2 need **no new AWS resource, no new IAM, and no new
  runtime dependency**. The marginal cost is one credential re-read, with
  its KMS decrypts, on the failure path only.
- The scheduled refresh keeps the access token fresh through each sync
  window, so the request path almost never refreshes. The stampede
  condition (every stage discovers expiry at the same instant, via 401)
  disappears in normal operation.

### Negative

- **The race is narrowed, not closed.** Two invocations can still refresh
  inside the read-to-refresh window. That window is unmeasured. A lost race
  costs one wasted rotation and a retry, never a silent loss.
- The herd case (a whole SQS burst that 401s at once) is only reduced, by
  option 2. It is not eliminated.
- Correctness depends on `readPreference=primary`. An app that reads from
  secondaries gets a fix that is inert, with no signal. Document and assert
  at startup.
- Modules that mint tokens through a vendor SDK bypass `_rawRequest` and do
  not get the interception automatically. Two known cases must be audited
  by hand: the incident app's QBO module (`intuit-oauth` on a module-level
  singleton) and the salesforce module's jsforce handler (api-module-library
  repo, `packages/v1-ready/salesforce/api.js:25-38`). The module that
  caused the incident is not protected by default.
- The silent-ack fix is default-on. A maintainer must accept the ADR-027
  exception explicitly. The kill switch is the rollback.

### Neutral

- Rollout for an app pinned to `2.0.0-next.78`: bump core past PR #636,
  take PR A, then PR B. No infrastructure redeploy at any step.
- The DocumentDB adapter must be covered or explicitly scoped out.
- ADR-003 "Runtime State Only" is not a constraint here. Its scope is the
  local-dev management GUI.

## Alternatives Considered

- **Option 1 — listen for database change events (direct, or via an SNS
  topic).** Rejected. It adds too much overhead and may be brittle
  (maintainer review). Also: no SNS delivery protocol reaches a running
  invocation, and Lambda accepts no inbound connections. The implementable
  forms (Mongo change stream, Postgres `LISTEN`) cannot carry the token,
  because the ciphertext is non-deterministic; the subscriber must re-read
  anyway. Frigg also has no teardown path, so each warm invocation would
  leak a cursor and a connection. The pattern stays worth a look for future
  distributed workloads, as the review notes.
- **Option 3 — pre-flight fetch of the credential per request.** Rejected.
  Per-request database fetches flood the database (maintainer review).
  Option 2's scheduled refresh reaches the same goal — a fresh token on the
  request path — with a handful of scheduled calls instead of one database
  read per request.
- **Compare-and-swap on a `tokenVersion` column.** Deferred, as optional
  hardening. The refresh-token comparison in option 4 already gives the
  loser a reliable "you lost" signal. A version column adds a migration and
  touches all three adapters. Revisit if the metric shows repeated losses.
  Note for any future CAS: a conditional write cannot compare on the token
  value itself, because the ciphertext is non-deterministic; it needs a
  plaintext discriminator.
- **A central token service or broker.** Rejected as the correctness
  mechanism. At concurrency above 1 it closes none of the observed race
  window. At `reservedConcurrency: 1` it becomes a ~2 rps ceiling and a
  hard-deadlock configuration. A broker outage reads as a failed token
  fetch and reproduces the exact silent-loss chain, fleet-wide. It may
  return later as an optional performance and observability topology.
- **A DynamoDB lease table.** Rejected. Coordinate in the same store as the
  data: a lock in one store that guards a write in another store can
  disagree with it. It also needs new runtime IAM, a new SDK dependency,
  and new AWS coupling.
- **Serialization (deferred family; pick at most one, only with data).**
  A datastore lease (TTL ~90s, bounded by the 60s request timeout); a
  scheduled single-writer (a stronger form of option 2); or SQS FIFO with
  `MessageGroupId = credentialId`. FIFO is the only provable close. It
  costs head-of-line blocking (~90 minutes for one stuck message) and a
  per-app queue migration, because a standard queue cannot convert to FIFO
  in place. Opt-in only, never the default.
- **Eliminate the fan-out.** Rejected. Serializing the stages roughly
  doubles wall-clock time. A parent invocation that holds the credential
  for a whole sync collides with Lambda's 900s ceiling. Tokens in SQS
  payloads would put secrets in message bodies with a 4-day retention.
- **Warm-container caching as the mechanism.** Rejected. ADR-027's own
  precedent: container reuse cannot carry correctness.
- **Do nothing beyond PR #636.** Rejected. That PR is per-instance by
  construction. The amplifier chain stays armed, and the failure mode
  stays silent.

## Related

- [ADR-005](./005-admin-script-runner.md) — the admin-script surface that
  option 2 builds on.
- [ADR-009](./009-e2e-test-package.md) — already flags refresh-on-401 as an
  untested gap.
- [ADR-019](./019-api-module-extensions.md) — places the OAuth2 refresh
  state machine in core and rotation quirks in the api-module.
- [ADR-024](./024-global-entities.md) — makes `credential.authIsValid` the
  connection-status signal; that is why a false write is a correctness bug.
- [ADR-027](./027-ssm-parameter-offload-and-env-scoping.md) — the opt-in
  bar this ADR argues one exception to.
- [ADR-003](./003-runtime-state-only.md) — not applicable; scoped to the
  local-dev GUI. Listed to pre-empt the objection.
- Key code: hydration `module.js:54,75`; blind upsert `module.js:124` and
  the three adapters; `refreshAuth` `oauth-2.js:297-332`; error funnel
  `oauth-2.js:317-330`; expiry bug `oauth-2.js:138`; silent ack
  `backend-utils.js:193,221`; PR #636 guards `requester.js:516-535`.
- History: the full analysis behind this decision (the incident forensics,
  the option evaluations, and the review findings) is in this PR's history,
  at commit `42d1e6fa` and earlier.
- Numbering note: this ADR takes 031 because unmerged branches claim
  `028`-`030`. None of those drafts covers refresh concurrency.
