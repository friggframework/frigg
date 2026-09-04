# ADR-042: In-Process Single-Flight Token Refresh

**Status**: Proposed  
**Date**: 2026-09-04  
**Deciders**: Daniel Klotz

## Context

This document is written in ASD-STE100 Simplified Technical English.

### Terms used in this document

- **Instance** means one api-module object in memory. It holds one
  `Requester` and one copy of the tokens.
- **Invocation** means one run of an AWS Lambda function. One invocation can
  send many requests at the same time through one instance.
- **401** means the HTTP status code for "not authorized".
- **Refresh** means the call to the token endpoint that gets a new access
  token.
- **Rotation** means the provider issues a new refresh token and kills the
  old one.
- **Retry budget** means `MAX_AUTH_RETRIES` (3): the number of refreshes one
  instance can start before it declares the credential dead.
- **Slot** means the instance field that holds the promise of the refresh in
  flight (`_inFlightRefresh`).
- **Initiator** means the request that starts a refresh. **Waiters** are the
  requests that await that same refresh.

### The problem

A sync stage sends a chunk of records through one instance with
`Promise.all`. When the access token has expired (the overnight case), all
requests in the chunk get a 401 at the same moment. Before this decision,
each 401 handler started its own refresh and spent the shared retry budget.

Measured with the PR test harness, on one instance, with 5 concurrent 401s
and Intuit-like rotation. The "Before" column ran the same harness against
the pre-PR `requester.js`:

| | Before | After |
|---|---|---|
| Refresh calls to the provider | 3 | 1 |
| Self-inflicted `invalid_grant` | 2 | 0 |
| Requests rejected (of 5) | 4 | 0 |
| `INVALID_AUTH` notifications | 4 | 0 |

Two mechanisms produce the "before" column:

1. **The budget kills healthy requests.** Requests 1–3 spend the budget.
   Requests 4 and 5 find the budget empty. They invalidate the credential at
   once. At that moment, request 1's refresh is in flight and about to
   succeed.
2. **The refreshes kill each other.** The provider accepts request 1's
   refresh and rotates the token. Requests 2 and 3 then present the consumed
   token and get `invalid_grant`. The framework makes these failures itself.
   On a provider that implements RFC 9700 §4.14.2 refresh-token rotation, a
   replay of a consumed refresh token revokes the grant. The provider then
   forces a new authorization. The framework has killed its own credential.

Each failure fires `INVALID_AUTH`. The credential gets `authIsValid: false`
while it is healthy, and the integration goes to `ERROR`.

### Why the database re-read of ADR-031 cannot cover this

ADR-031 handles the race between two invocations: the loser re-reads the
credential row and adopts the winner's tokens. That mechanism is blind
inside one invocation, for two reasons:

- Requests 4 and 5 die on the budget before any re-read runs.
- All requests share one instance. When request 2 re-reads after its
  `invalid_grant`, request 1 has already written the new refresh token into
  the same memory. The store and the memory match. The re-read reports
  "nothing newer", and request 2 declares a healthy credential dead.

Measured with the re-read alone (single-flight removed, same scenario):
3 refresh calls, 2 `invalid_grant`, 4 of 5 requests rejected, 6
`INVALID_AUTH`. The two mechanisms cover two different failure domains.
ADR-031 names this decision as its prerequisite.

### Constraints

- Node.js runs one event loop. A check-and-store of a promise with no
  `await` between the check and the store is atomic for all concurrent
  callers.
- Subclasses send the token request through `this._post`, which re-enters
  `_rawRequest`. The token endpoint can answer 401 (`invalid_client`: a
  revoked or rotated client secret). That 401 arrives inside the refresh
  itself.
- About 35 of the ~46 api modules are rotation-exposed. Several override
  the refresh. The mechanism must not need cooperation from the modules.
- `AsyncLocalStorage` is already a core pattern:
  `telemetry/telemetry-context.js` uses it for the ambient telemetry context
  (ADR-011).

## Decision

Three rules in the 401 path of `Requester._rawRequest`. They ship together
in PR #636.

### Rule 1 — single-flight refresh

The first 401 on an instance starts `refreshAuth()` and stores the promise
in the slot. Each 401 that arrives while the slot is full awaits the same
promise and gets the same result. Only the initiator spends the retry
budget. The slot clears in a `.finally` that is attached last, so the slot
is free before any waiter resumes. Code: `_refreshAuthOnce()` and
`_runMarkedRefresh()`.

This changes the meaning of the retry budget. It is now per initiator, not
per request. The budget still bounds a pathological upstream that answers
401 after a "successful" refresh, because each new refresh cycle needs a
new initiator.

### Rule 2 — the refresh flow is marked, and a 401 inside it is fatal

An `AsyncLocalStorage` context marks the async call chain of the running
`refreshAuth()`. A 401 that arrives inside that chain means the token
endpoint rejected the credential itself. The handler then invalidates the
credential and never joins the slot. Code: `_isInsideRefreshFlow()`.

Without this rule, that 401 finds the slot full and awaits it. The slot's
promise can only settle when the token request returns, and that request is
now the one waiting. This is a circular await. It hangs until the Lambda
times out, and it never clears the slot, so every later request on the
instance hangs too. Measured without the rule: the initiator hangs for more
than 1600 ms, and the slot stays full. The PR test asserts that the
initiator settles within 1500 ms with the rule.

After the guard throws, `refreshAuth()` sees the 401 as a definitive
rejection. For `authorization_code`, it runs the reload backoff (about 3 s
by default) and then invalidates, because the store has nothing newer. For
`client_credentials`, the token call reports the failure and `refreshAuth()`
returns false at once. In both cases the slot clears and the credential is
flagged. The guard removes the hang. It does not remove the backoff.

`AsyncLocalStorage` is the mechanism because the marker must be per call
chain, not per instance. During a refresh, the sibling requests' 401s also
arrive. They must join the slot, not fail. See Alternatives Considered.

### Rule 3 — token identity

`_authGeneration` increases one time per successful slot cycle. Each request
records the generation when it sends. A 401 that arrives after the
generation changed is stale: the request never tried the current token. It
retries with the current token and does not start a refresh. Each avoided
refresh is one avoided rotation, and each rotation can invalidate a pair
that another invocation just minted.

### Companion in the same PR: the requester side of ADR-031

`OAuth2Requester.refreshAuth()` implements ADR-031's option 4 for the
instance:

1. Before a refresh, ask the Module for the stored credential
   (`DLGT_CREDENTIAL_RELOAD`). If the stored refresh token differs, adopt
   the stored tokens and do not refresh.
2. Split the refresh errors. A 400, or a 401 for `invalid_client`, is a
   definitive rejection. A timeout, a 429, or a 5xx is a transport failure.
   Rethrow it as a fresh `Error`. The caller then retries, and the framework
   does not flag a healthy credential.
3. After a definitive rejection, re-read with a bounded backoff (500, 1000,
   1500 ms). Adopt if the store has a newer refresh token.
4. Invalidate only when the rejection is definitive and the store has
   nothing newer.
5. Emit `frigg.auth.refresh_race_recovered` and
   `frigg.auth.refresh_race_lost`.

The Module answers the reload from the database
(`Module.reloadCredential()`). The reload never writes to the database, and
it never changes the stored `authIsValid`. It does replace the Module's
in-memory `credential` with the row it read.

Not in this PR: the queue-worker change that stops the silent ack for
integrations in `ERROR`. It is independent of the requester. It is also the
exception to ADR-027 that a maintainer must ratify on its own, so it ships
as its own PR.

## Consequences

### Positive

- One provider call per burst. Zero self-inflicted `invalid_grant`. Zero
  false invalidations. Five of five requests complete.
- Waiters spend no budget, and they resume as soon as the shared refresh
  resolves. In-process losers no longer wait through a backoff.
- The rules work for every subclass, including modules with a custom
  `_post`-based refresh. No module changes.
- No new AWS resource and no new dependency. `AsyncLocalStorage` is part of
  Node.js (stable since Node 16.4.0; the root `package.json` requires Node
  22 or later).
- On a grant-revoking provider, the framework no longer replays consumed
  refresh tokens from inside one invocation. It no longer kills its own
  grant.

### Negative

- The retry budget is per initiator. A reviewer must accept that a burst of
  20 requests spends one unit of budget, not 20.
- On a transport failure, all waiters receive the same `Error` instance.
  Code that annotates errors per record can see cross-contamination. On a
  definitive rejection, each waiter builds its own `FetchError` and fires
  its own `INVALID_AUTH`. A burst of N requests then produces N+1
  `markCredentialsInvalid` writes. This is not a regression, but it is not
  deduplicated. This is an open issue.
- A module whose `refreshAuth()` does its own HTTP outside `_rawRequest`
  (for example, `intuit-oauth`) bypasses Frigg's per-attempt timeout.
  Single-flight concentrates that exposure: a hung token endpoint pins the
  initiator and every waiter until the Lambda times out. This is an open
  issue. A follow-up can wrap `refreshAuth()` in a timeout.
- The refresh context is module-scoped, not instance-scoped. If a custom
  `refreshAuth()` calls a *different* `Requester` instance, that instance
  inherits the marker, and its 401 becomes fatal by mistake. Fix: store the
  requester in the context and compare identity in `_isInsideRefreshFlow()`.
  This is an open review finding. The change is small.
- The adoption check reads the credential row. A read from a replica-set
  secondary can miss the winner's write. Nothing in this PR asserts
  `readPreference=primary`. ADR-031 owns that item.
- A second `AsyncLocalStorage` in core. Readers must know the pattern: the
  container is a process global; the value exists only inside the wrapped
  call chain.

### Neutral

- The rules are per instance by construction. The race between invocations
  stays with ADR-031.
- Consumers pinned to `2.0.0-next.78` or earlier have the old 401 path
  (fail-fast on `refreshCount > 0`). They must adopt a build at or after
  this PR before the ADR-031 recovery can work.
- The refresh-token comparison of ADR-031 is sound across processes and
  blind inside one process. That is the reason both ADRs exist.
- ADR-031's Sequencing defines "PR A" as option 4 plus the silent-ack fix.
  This PR ships option 4's requester side and defers the silent-ack fix to
  its own PR. ADR-031's Sequencing section needs an amendment.

## Alternatives Considered

- **Do nothing (per-request refresh).** Rejected. The measured harm is in
  the table above.
- **Raise or remove the retry budget.** Rejected. Every burst of N requests
  becomes N provider calls and N−1 reuse signals. On a strict provider, that
  revokes the grant. It also adds the full backoff latency for each loser.
- **A database re-read alone (ADR-031 option 4 without single-flight).**
  Rejected. Measured: 4 of 5 rejected, 6 `INVALID_AUTH`. Blind in-process,
  for the two reasons in the Context.
- **An instance flag (`this._isRefreshing`) instead of `AsyncLocalStorage`.**
  Rejected as incorrect. A refresh takes 300–600 ms. Sibling requests' 401s
  arrive in that window. The flag is also true for them. The guard then
  classifies them as fatal and kills a healthy credential. That is the bug
  this decision fixes. The state must be per call chain. A hand-rolled
  per-call-chain state is a worse `AsyncLocalStorage`.
- **Thread an explicit flag through the request options.** Rejected for
  now. Core has two token call sites and can mark them. A custom
  `_post`-based refresh does not carry the flag, so its deadlock returns. It
  then needs a join watchdog as a backstop. A revoked client secret then
  burns the full request timeout, not the 3 s reload backoff. The trade is
  familiar code for weaker protection. Revisit if the maintainers veto
  `AsyncLocalStorage`.
- **Compare the request URL to `tokenUri`.** Rejected. It covers core's two
  calls only. It breaks on custom token URLs and query strings.
- **A join watchdog only (race the join against a timer).** Rejected as the
  primary mechanism. It converts the hang into a bounded failure, but every
  `invalid_client` burns the timeout, and the timeout is a new magic
  constant.
- **Send the token request outside `_rawRequest` (a bare fetch).**
  Rejected. It duplicates the timeout and the error shaping, it protects
  core only, and it leaves custom modules exposed.
- **Serialize the sync stages (no fan-out).** Rejected in ADR-031: it about
  doubles the wall-clock time.

## Related

- [ADR-031](./031-concurrent-oauth-credential-refresh.md) — the race
  between invocations. It names this PR as its prerequisite, and it rejects
  "do nothing beyond PR #636" because that PR is per instance by
  construction.
- [ADR-011](./011-integration-telemetry-and-usage-tracking.md) —
  `telemetry-context.js`, the first `AsyncLocalStorage` in core; the two
  counters go through the requester telemetry it defines.
- [ADR-019](./019-api-module-extensions.md) — places the OAuth2 refresh
  state machine in core.
- [ADR-024](./024-global-entities.md) — makes `credential.authIsValid` the
  connection-status signal; a false write is a correctness bug.
- [ADR-027](./027-ssm-parameter-offload-and-env-scoping.md) — the
  no-behavior-change-on-upgrade bar; the silent-ack fix that left this PR
  is the argued exception.
- Key code: `packages/core/modules/requester/requester.js`
  (`_refreshAuthOnce`, `_runMarkedRefresh`, `_isInsideRefreshFlow`, the 401
  branch of `_rawRequest`); `packages/core/modules/requester/oauth-2.js`
  (`refreshAuth`, `_adoptNewerCredential`, `_adoptNewerCredentialWithBackoff`,
  `_isDefinitiveAuthRejection`, `_transportFailureError`);
  `packages/core/modules/module.js` (`reloadCredential`).
- Tests: `requester.concurrent-refresh.test.js`,
  `oauth-2.credential-reload.test.js`, `module-credential-reload.test.js`.
- Numbering note: 032–041 are claimed by unmerged branches
  (`claude/integration-deletion-cleanup-*`, `claude/aurora-serverless-*`,
  `claude/api-key-login-auth-mode`, and the renumbering on
  `docs/adr-register-reconciliation`, which uses 040–041). 042 is the first
  free integer.
