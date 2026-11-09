# ADR-049: Rate-Limit Awareness

**Status**: Proposed  
**Date**: 2026-09-25  
**Deciders**: Daniel Klotz, Sean Matthews

## Context

This document is written in ASD-STE100 Simplified Technical English.

### Terms used in this document

- **Provider** means the third-party API that an API module calls.
- **Limit** means a provider rule that caps calls: per window, per day, per
  month, or per number of requests in flight.
- **Throttled response** means a response that says a limit was hit. It is
  usually HTTP 429, but not always (see the survey below).
- **Hint** means what Frigg reads from a throttled response or from the API
  module: when to call again, and why.
- **Wait** means the time from now until the hint says the provider accepts
  calls again.
- **Caller** means the entry point that starts an invocation: an HTTP
  handler, a queue worker, an admin-script runner or a migration handler.
- **Budget** means the time that a request may wait in process. The caller
  sets it (section 2).
- **Short wait** means a wait that fits the budget. **Long wait** means any
  other wait.
- **Defer** means to put a queue message back so that it runs after the wait,
  without counting a failed receive.
- **Probe** means a call at a fixed interval when the provider gives no reset
  time.
- **Scope key** means the key that a limit counts against, for example one
  credential, one entity, or the whole app.
- **Pacing** means sending calls at or below a known limit, before the
  provider throttles them.
- **Halt** means an error with `isHaltError`. The worker discards the message
  and does not retry it.
- **Delivery** means one SQS receive of a message. `delivery` also names the
  handler field from friggframework/frigg#653.
- `requester.js:22` means the file under `packages/core` at that line on
  `next` (93c9557f).

### Current state (on `next`)

| Finding | Evidence |
|---|---|
| The Requester retries 429 and 5xx with one fixed ladder of 1, 3, 10, 30, 60 and 180 s (~284 s in total). It reads no response header. | `modules/requester/requester.js:22`, `:276-284` |
| Any other 4xx becomes a plain `FetchError`. | `requester.js:363-372` |
| The queue worker marks each 4xx except 408 and 429 as a halt. So a provider that signals a limit with 403 loses the message. | `handlers/backend-utils.js:286-293` |
| After the ladder, a thrown 429 goes back to SQS. The integration queue has a 1800 s visibility timeout and `maxReceiveCount: 3`, and then the DLQ, which only logs. | `devtools/.../integration-builder.js:570-572` |
| The queue worker has `reservedConcurrency: 20` and a 900 s timeout. Up to 20 invocations share one provider limit. | `integration-builder.js:437,452` |
| `Worker.send` can set `DelaySeconds`. `QueuerUtil.send` cannot. | `core/Worker.js:84-96`; `queues/queuer-util.js:93` |
| Core can already schedule a one-time EventBridge job to SQS with `at(...)`. Devtools provisions the scheduler only when `scheduler.enable` is set or an integration has webhooks. | `infrastructure/scheduler/eventbridge-scheduler-adapter.js:45-68`; `devtools/.../scheduler-builder.js:29-40` |
| The base role grants `sqs:SendMessage` but not `sqs:ChangeMessageVisibility`. | `devtools/.../base-definition-factory.js:192-195` |
| A module-to-integration path for credential problems exists: the `CREDENTIAL_INVALIDATED` delegate. | `modules/module.js:42,210`; `integrations/integration-base.js:857` |
| The only 429 and 500 Requester tests are `it.skip` and call a live mock server. | `requester.test.js:48,58` |
| jsforce 3.10.14, which the Salesforce module uses instead of the Requester, already parses `Sforce-Limit-Info` into `conn.limitInfo`. | `jsforce/lib/connection.js:537-540` |

### The problem

A provider that throttles us gets the same response from Frigg every time:
wait up to ~284 s in process, then give the message back to SQS for 30 minutes,
three times. Frigg does not use what the provider tells it, and it does not use
what the provider documents.

1. **Short limits cost too much.** A provider that says "call again in 2 s"
   still gets the fixed ladder, and 20 parallel workers can keep one token
   saturated for minutes.
2. **Long limits lose work.** A daily or monthly quota outlasts three
   30-minute redeliveries. The message goes to the DLQ, and a sync that is
   split into many messages stays open: never completed, never failed.
3. **Some limits are not 429.** A 403 limit is halted at once
   (`backend-utils.js:286-293`).
4. **The user sees nothing useful.** No standard path tells the user "limit
   hit, next refresh at 23:00 UTC, retry then".

friggframework/frigg#653 gives each handler `delivery.isLastAttempt`, so an
integration can end a run or count lost work on the final try. That is the
fallback for every provider. This ADR adds the case where the provider or its
docs tell Frigg when to call again.

### Provider survey (official docs, 2026-09-25)

We checked 24 provider APIs against their official docs: HubSpot,
Salesforce, Pipedrive, Stripe, GitHub, Slack, Zendesk, Shopify REST, Shopify
GraphQL, Microsoft Graph, Google (Gmail, Calendar), Intercom, Asana, Jira
Cloud, Xero, QuickBooks Online, Twilio, Zoom, Notion, Airtable, Clio,
monday.com, Mailchimp and Greenhouse Harvest. The results that shape this
decision:

- **The limit models are few.** A `Retry-After`, a rolling window (burst), a
  daily or monthly quota, and a concurrency limit.
- **The signals are many.** Of the 21 APIs after Salesforce, HubSpot and
  Pipedrive in the list, 11 give a full retry time in the throttled response,
  4 give part of one, and 6 give none.
  The formats differ:
  - `Retry-After` in seconds, as an HTTP-date, or as an ISO timestamp (Zoom);
  - reset headers as epoch, ISO 8601 or delta;
  - the IETF `RateLimit` / `RateLimit-Policy` fields
    (draft-ietf-httpapi-ratelimit-headers-11, still a draft; monday.com uses
    them);
  - a cost budget in the body (Shopify GraphQL);
  - a reason only (Stripe `Stripe-Rate-Limited-Reason`, HubSpot `policyName`).
- **Not all limits are 429.** Salesforce returns 403 `REQUEST_LIMIT_EXCEEDED`.
  Shopify GraphQL returns 200 with `THROTTLED`. GitHub, Google and Mailchimp
  can return 403.
- **Docs often know what the response does not.** QuickBooks Online says to
  wait 60 s. Airtable says a throttled client waits 30 s. Stripe publishes its
  per-second limits.
- **Long quotas rarely say when they reset.** The Salesforce 24 h rolling
  limit, the Pipedrive daily token budget (resets at the server's midnight),
  and the QuickBooks Online monthly tier cap give no reset time in the
  response.

So one mechanism can serve all providers if each API module supplies the
provider knowledge: its static limits, and a parser for its signals.

## Decision

Add rate-limit awareness to Frigg core, devtools and the API modules. Each
part has one job:

- The **API module** describes its provider. It declares the limits and how
  to read a throttled response.
- The **caller** sets the budget, that is, how long a request may wait in
  process.
- The **Requester** waits when the wait fits the budget. When it does not, the
  Requester throws `RateLimitError`.
- The **queue worker** turns that error into a `RATE_LIMITED` event. The
  integration's handler, or the framework default handler, decides what
  happens next.

#653 stays the fallback when no hint exists.

Phase 1 is friggframework/frigg#656, phase 2 is friggframework/frigg#657,
phase 3 is friggframework/api-module-library#102 and phase 4 is
friggframework/frigg#658. The [appendix](#appendix-code-sketches) points at the
code for each part. Where the code and this section differ, this section is
the decision, and the code changes to match it.

### 1. The API-module contract

An API module can declare a static policy. All fields are optional. Every
field describes the provider. A module never decides whether to wait, retry
or defer. The caller (section 2) and the queue worker (section 3) decide that.

```js
static rateLimit = {
    scope: 'entity',             // 'credential' | 'entity' | 'app' | (api) => key
    windows: [
        { name: 'burst', limit: 100, perMs: 10_000 },
        { name: 'daily', resets: { at: '00:00', tz: 'UTC' } },
    ],
    maxConcurrency: 5,
    minRetryAfterMs: 60_000,
    parsers: ['retryAfter', 'resetHeaders', 'ietf'],  // built-ins, in order
    classify({ status, headers, body }) { return null; }, // provider-specific
    userHints: { daily: { links: [{ label: 'Limits', url: 'https://…' }] } },
};
```

A **hint** has one shape everywhere:

```js
{ retryAt, waitMs, reason, policy, remaining, source }
// reason: 'burst' | 'daily' | 'monthly' | 'concurrency' | 'unknown'
// source: 'header' | 'body' | 'static' | 'backoff'
```

- **Built-in parsers** are pure functions in
  `modules/requester/rate-limit/`. They read `Retry-After` (delta seconds,
  HTTP-date, ISO timestamp), reset headers (epoch seconds, epoch milliseconds,
  delta or ISO, told apart by magnitude), and the IETF fields.
- **`classify`** recognises provider signals that are not 429, or that
  need the body (a 403 limit code, a `policyName`). It returns a hint or
  `null`. A hint may name only a `reason`. Its time then comes from the
  parsers, or from the policy. A hint must have a known `reason`, a `waitMs`
  or a `retryAt`. Any other object is not a hint. `classify` must be
  synchronous. The Requester logs a returned Promise as a `classify` error and
  ignores it.
- **`classify` runs for a 429 and for any other 4xx or 5xx except 401.** It
  does not run for a 2xx, because a retry of a "throttled 200" would send a
  POST again. A module with such a response (a Shopify GraphQL `THROTTLED`)
  wraps its own call with `classifyRateLimit()`. A status other than 429 is a
  limit only when `classify` returns a hint for it.
- **Resolution order:** `classify`, then the parsers in order (default: all
  three), then the static policy (the larger of `minRetryAfterMs` and the
  `perMs` of the window that the reason names). For a 429 only, the fixed
  `backOff` comes last. The static policy does not read `windows[].resets`
  yet.
- **A limit that is not 429 never uses the `backOff` ladder.** When `classify`
  names a limit for a status other than 429, and no parser and no policy give
  a time, the Requester throws `RateLimitError` after one call. `retryAt` and
  `waitMs` are then undefined. Section 3 says how the queue worker handles an
  unknown `retryAt`.
- **`Retry-After` is read for every module, on a 429 and on a response that
  `classify` recognises.** A 503 that `classify` does not recognise keeps the
  5xx ladder, also with `Retry-After`.
- **Modules that do not use the Requester** (for example a module on jsforce)
  call the exported `classifyRateLimit()` around their own client.

### 2. Requester and the caller's budget

- **The hint wins.** With a hint, the wait is the largest of the hint,
  `minRetryAfterMs` and 1 s, plus jitter of at most 10 % and at most 1 s.
  Jitter only adds, and it never passes the budget. The fixed ladder is not a
  floor under a hint. A provider that says "call again in 2 s" gets 2 s.
- **No hint, no change.** A 429 with no hint keeps today's ladder: the same
  calls, the same delays, then a plain `FetchError`. The ladder has no
  budget, so it makes the same calls in every Lambda.
- **The caller owns the budget.** `maxInProcessWaitMs` is not a field of
  `static rateLimit`. The entry point sets it with
  `runWithInvocationDeadline({ deadlineAt, maxInProcessWaitMs }, fn)`
  (`core/invocation-deadline.js`). `createHandler` does this for every handler
  that it builds, through `runInvocationScope`, and takes `maxInProcessWaitMs`
  as an option. A nested scope can only lower the outer values. The defaults
  are in `MAX_IN_PROCESS_WAIT_MS`:

  | Caller | `maxInProcessWaitMs` |
  |---|---|
  | HTTP handler (the `createHandler` default) | 10 s |
  | Integration queue worker | 60 s today, 0 when phase 2 (#657) lands |
  | No invocation (a script, a test, local code) | 300 s |

  With a budget of 0, a queue worker never sleeps for a hint. The Requester
  throws at once, the worker defers the message, and the worker slot (one of
  20) is free again.
- **Short wait.** The Requester sleeps in process when the wait fits the
  budget. The budget is the smaller of two values: the caller's
  `maxInProcessWaitMs` less what this request slept already, and the time left
  in the invocation less a reserve for the next request. The reserve is the
  request timeout, or half the time left when that is smaller. So in a 29 s
  HTTP Lambda, a 2 s wait sleeps and the Requester calls again.
  `core/invocation-deadline.js` keeps the deadline and the budget in its own
  `AsyncLocalStorage`, not in the logs store, because the telemetry bus
  forwards every key of that store that is not `log`. Outside a Lambda there
  is no deadline, and the budget alone applies.
- **Hinted retries are capped.** One request makes at most 10 hinted retries
  (`MAX_HINTED_RETRIES`). A hinted retry does not spend the `attempt` of the
  ladder, so the 5xx and `ECONNRESET` retries keep their full ladder.
- **Long wait.** The Requester throws `RateLimitError`, which extends
  `FetchError`. It keeps `statusCode` and adds `isRateLimited`, `retryAt`,
  `waitMs`, `reason`, `policy`, `source`, `scopeKey` and `module`. It throws
  this error when a hint exists (`source` is `header`, `body` or `static`), and
  for the untimed limit of section 1 (`source` is `unknown`). A 429 with no
  hint that used the ladder ends as a plain `FetchError`, as today.
- **A module that declares nothing keeps today's behaviour** for a 429 with no
  hint, with the same calls and the same delays.
- **`backOff: []` means no retries.** With an empty ladder the Requester does
  not sleep for a hint either. A hint throws `RateLimitError` at once, so the
  queue worker can still defer the message.
- **The OAuth token endpoint keeps the fields.** When a token request is rate
  limited, `OAuth2Requester._transportFailureError` copies `isRateLimited`,
  `retryAt`, `waitMs`, `reason` and `module` to the error that it throws. So
  the queue worker defers a rate-limited token refresh as it defers any other
  call.
- **Logs.** A hinted wait writes one TRACE record (`<logger>.rate_limited`),
  because a backoff is step detail. The Requester does not log a throw. The
  boundary logs the error once, and the error serializer adds `retryAt` and
  `reason` to it.

Every entry point must set the deadline. These do it now:

- HTTP handlers, through `createHandler` (phase 1).
- Integration queue workers, through `createHandler` in
  `handlers/workers/integration-defined-workers.js` (phase 1).

These entry points do not use `createHandler`, so they set no deadline and run
with the 300 s budget. Adding the deadline to them is open work:

- The admin-script routers `admin-script-router.js` and `report-router.js`,
  and the executors `script-executor-handler.js` and
  `report-executor-handler.js`, in `packages/admin-scripts/src/infrastructure/`.
- `handlers/database-migration-handler.js` and `handlers/workers/db-migration.js`.

### 3. Queue worker: a `RATE_LIMITED` event, then a handler

- `backend-utils.js` does not halt an error with `isRateLimited`, whatever its
  status. The exemption lands with the deferral in phase 2 (section 7).
- **The event.** `Worker.run` catches an error with `isRateLimited` and builds
  a `RATE_LIMITED` event:

  ```js
  {
      retryAt, waitMs, reason, module, scopeKey, // from the error; retryAt can be undefined
      message,                                   // the body of the queue message
      delivery: { messageId, receiveCount, deferrals, deferredMs },
  }
  ```

- **The integration's handler decides, when it has one.** `QueueWorker` gives
  the event to the integration when the integration defines a `RATE_LIMITED`
  event handler. The handler returns one of these values:
  - `'defer'`, or no value: the default handler runs.
  - `'drop'`: the worker acknowledges the record, and SQS deletes the message.
  - `'retry'`: the worker reports the record as a failure, and SQS delivers
    it again as for any other error.

  A handler that throws counts as `'retry'`.
- **The default handler** runs when the integration has no `RATE_LIMITED`
  handler, or when that handler returns `'defer'` or no value. It puts the
  message back at `retryAt`:
  - **Unknown `retryAt`:** the handler uses now plus the probe interval,
    `FRIGG_QUEUE_RATE_LIMIT_PROBE_MS` (default 1 hour). It does not wait for
    the visibility timeout of the queue.
  - **Wait up to 900 s:** send the same body again with `DelaySeconds`, a
    `_frigg.deferrals` counter and `_frigg.deferralId` (the SQS id of the first
    message that was put back), then report the record as a success. The new
    message starts at receive count 1.
  - **Wait over 900 s:** schedule the same body with the one-time scheduler
    at `retryAt`, then report the record as a success. The schedule name is
    `frigg-defer-<messageId>`. If the Lambda stops after the schedule exists
    and before the acknowledgement, SQS delivers the message again, and the
    second schedule call gets a `ConflictException`. The worker treats that
    conflict as success, so the tier is idempotent. Devtools provisions the
    scheduler when any module declares `rateLimit`. The worker never uses the
    mock scheduler, because a schedule kept in memory is lost with the
    acknowledged message.
  - **No scheduler, or the schedule fails:** call `ChangeMessageVisibility`
    to `retryAt` and report the record as a failure. This uses one delivery.
    SQS counts the 12 h maximum from the receive, and an extension does not
    reset it. So the worker sets at most 12 h less 20 minutes (the longest
    Lambda run plus the longest batching window). The base role gets the new
    IAM action in every stack, because `Retry-After` is honoured for every
    module.
- **External queues.** For an integration with `ownership.queue: 'external'`,
  `SchedulerExecutionRole` grants `sqs:SendMessage` on the ARN of the queue at
  `queue.url`. It must not use `Fn::GetAtt` on a `<Name>Queue` resource,
  because the stack does not create that resource for an external queue.
- **Cap:** `maxDeferrals` and `maxDeferredMs`, from
  `FRIGG_QUEUE_MAX_DEFERRALS` (default 30) and `FRIGG_QUEUE_MAX_DEFERRED_MS`
  (default 26 h, from the first deferral to the retry time). The HubSpot and
  Salesforce modules probe a daily limit every hour, so the defaults cover one
  full day of hourly probes, and each probe can start a little late. Past the
  cap, the record fails as any retryable error does, and #653 `isLastAttempt`
  is the fallback.
- **No deferral.** The worker does not defer a record that has no event source
  ARN or that comes from a FIFO queue. A failed send or a failed visibility
  change is not a deferral either. In each case the record fails as any
  retryable error does.
- **Order:** send (or schedule) first, then acknowledge. Delivery stays at
  least once, so handlers stay idempotent as today.
- **One record at a time.** `Worker.run` handles each record in its own
  `runMessageScope` callback. A deferral or a failure ends only that callback.
  So the worker reaches every record of the batch and reports each failure in
  `batchItemFailures`.
- **Handler contract:** a queue handler checks `delivery.isLastAttempt` first,
  then rethrows. It does not catch a `RateLimitError` to defer the message
  itself. The `RATE_LIMITED` handler decides that. The delay and schedule
  tiers send a new message, so they never reach the last attempt. The
  visibility tier and a cap use a receive. On the last one the worker writes
  an ERROR (`record_lost_rate_limited`), and the handler has one chance to end
  the run.
- **ADR-047:** the same `RATE_LIMITED` event is the input of the
  orchestrator's reducer when ADR-047 lands. The reducer then decides when the
  next tick runs. So this mechanism becomes the input of the orchestrator, not
  a parallel path. ADR-047 must list `RATE_LIMITED` with its event types.

### 4. Run state

The queue worker writes `Process.context.rateLimit` through two use cases,
`RecordRateLimitWait` and `ClearRateLimitWait` (`integrations/use-cases/`):
`{ status, mechanism, retryAt, reason, module, deferrals, deferralId, updatedAt }`.
`status` is `WAITING`, or `EXHAUSTED` when a cap ended the deferrals or a
visibility change came on the last delivery.

- **One value per process.** `RecordRateLimitWait` always writes a new
  `EXHAUSTED` value. Otherwise it keeps the stored value when that value is
  `EXHAUSTED`, or when its `retryAt` is strictly later than the new one.
- **Clear only the own wait.** After a deferred or redelivered message ran
  without error, `ClearRateLimitWait` sets the value to `null` only when the
  value is `WAITING` and one of these is true:
  - It carries the caller's own `deferralId`. A deferred message carries its
    `deferralId` in `_frigg`. The visibility tier does not change the body, so
    a message with no `deferralId` in `_frigg` uses its SQS message id.
  - Its `retryAt` is past or within 5 s.

  So a message cannot clear the wait of another message that is still
  deferred.
- **Write order.** The delay tier writes the wait before it sends the new
  message, because with a short delay the new message can run and clear the
  wait before a later write lands. If the send fails, the delay tier clears
  the wait again. The schedule and visibility tiers write the wait after the
  change succeeds.
- **Not atomic.** Both use cases read the process, then write the value with
  `applyProcessUpdate` and `set`. Two workers that write in the same instant
  can keep the earlier `retryAt`. The value is a UI signal only, so the next
  write corrects it.

A UI can then show "waiting for the provider limit until 23:00 UTC" instead of
a run that looks stuck.

### 5. User-facing message

The default handler of section 3 writes the `RATE_LIMITED` integration message
from the event. No module delegate writes it. The component that decides to
defer is the component that writes the message. It records one standard,
client-safe message:

```js
{
    code: 'RATE_LIMITED',
    module, reason,
    retryAt,                 // ISO UTC; the UI shows local time
    actions: [
        { type: 'RETRY_WHEN_READY' },
        { type: 'LINK', label, url },   // from module userHints
    ],
}
```

The module supplies the text and the links as data, in `userHints`, keyed by
`reason`. The default handler reads them from the policy of the module that
the event names.

The default handler writes the message only in these cases:

- The wait goes past the delay tier (more than 900 s).
- `retryAt` is unknown. The message then carries the probe time.
- A cap ended the deferrals.

A shorter wait gives the user nothing to do, because the run continues within
15 minutes.

Twenty workers can meet the same limit at once. So the repository writes the
message with one atomic upsert, keyed on `code`, `module` and a `retryAt`
within 60 s. When a stored `RATE_LIMITED` message already matches that key,
the upsert writes nothing. Concurrent workers therefore write one message.

A rate limit is not an error, so the status of the integration does not
change. Each message type (`errors`, `warnings`, `info`, `logs`) keeps its
newest 50 items. The stored messages append, and `testAuth` and
`validateConfig` write one on every call.

### 6. Pacing (PR 5)

- **2a, no shared state:** an in-process token bucket from `windows`, and a
  sleep before the call when `remaining` is 0. Devtools derives the queue
  worker's maximum concurrency from `maxConcurrency` (with the queue settings
  of friggframework/frigg#633).
- **2b, shared state:** one write of `rateLimitedUntil[scopeKey]` on the
  entity for each long wait. Hydration already reads the entity, so other
  workers defer before they call, with no extra read.
- **Not now:** a distributed per-call bucket (DynamoDB, Redis). It adds a
  round trip per call, IAM and an SDK. ADR-031 rejected a DynamoDB lease table
  for the same reasons. We build it only when data shows the need.

Pacing runs in the caller, from the module's `windows`, and the module stays
descriptive. ADR-063 §19 plans the same pacing as "a token bucket per module
and installation, in the ports".

### 7. Phasing

| PR | Scope | Files |
|---|---|---|
| 1 (core, opt-in; frigg#656) | Parsers, `static rateLimit`, honour `Retry-After` and `minRetryAfterMs`, the caller's budget, the cap of 10 hinted retries, `RateLimitError`, the throw for an untimed limit that is not 429. No queue change: the error still rethrows, and a classified 403 is still halted. | `modules/requester/requester.js`, `modules/requester/rate-limit/*`, `errors/rate-limit-error.js`, `errors/fetch-error.js`, `errors/index.js`, `core/invocation-deadline.js`, `core/invocation-scope.js`, `core/create-handler.js`, `handlers/workers/integration-defined-workers.js`, `logs/serialize.js`, `packages/core/CLAUDE.md` |
| 2 (core + devtools; frigg#657) | The halt exemption, the `RATE_LIMITED` event, the integration's handler and the default handler, the probe interval, the deferral tiers, run state, the queue-worker budget of 0, the rate-limit fields on the OAuth token error, the scheduler switch with the ARN of an external queue, the IAM action. | `core/Worker.js`, `queues/queue-deferral.js`, `queues/queuer-util.js`, `handlers/backend-utils.js`, `integrations/use-cases/record-rate-limit-wait.js`, `integrations/use-cases/clear-rate-limit-wait.js`, `core/invocation-deadline.js`, `modules/requester/oauth-2.js`, `devtools/.../scheduler-builder.js`, `base-definition-factory.js`, `docs/guides/INTEGRATION-PATTERNS.md` |
| 3 (api-module-library#102) | Policies and classifiers: HubSpot (`policyName`), Salesforce (403 `REQUEST_LIMIT_EXCEEDED`, `withLimits`), Pipedrive (`x-ratelimit-*`). | each module's `api.js`, README and tests |
| 4 (core; frigg#658) | The `RATE_LIMITED` message from the default handler, the message shape, the `RETRY_WHEN_READY` action, the atomic upsert, a repository read for the stored messages, and the fix that made `updateIntegrationMessages` append. | `handlers/backend-utils.js`, `integrations/use-cases/record-rate-limit-message.js`, `integrations/use-cases/update-integration-messages.js`, `integrations/repositories/*` |
| 5 (core + devtools) | Pacing 2a, then 2b. | `modules/requester/rate-limit/*`, `integration-builder.js` |

**The halt exemption lands with phase 2.** Phase 1 alone keeps the behaviour of
`next` for a classified 403, and the queue worker halts it. If phase 1 removed
the halt, a daily-limited 403 would go back to SQS three times, about 30
minutes apart (`VisibilityTimeout: 1800`, `maxReceiveCount: 3`), and then to
the DLQ. The work would still be lost, after about one hour. With phase 2 the
default handler defers it instead.

### 8. Testing

- **Parsers:** table tests for seconds, HTTP-date, ISO, epoch s and ms,
  delta, IETF, bad input, past times and very large values.
- **Requester:** an injected `fetch` and a `setTimeout` spy. It waits for
  `Retry-After`, not for `backOff`. A long wait throws `RateLimitError` with
  `retryAt`. A 429 with no hint makes the same calls with the same delays,
  also inside a 29 s invocation. A 429 with `Retry-After: 2` inside a 29 s
  invocation sleeps 2 s and calls again. A classified limit that is not 429
  and has no time throws after one call. A request makes at most 10 hinted
  retries. The budget comes from the caller. The 5xx path does not change.
  The skipped live-mock tests (`requester.test.js:48,58`) are replaced.
- **Worker:** `aws-sdk-client-mock` checks the `RATE_LIMITED` event and each
  handler result, `DelaySeconds`, the scheduler and its `ConflictException`,
  the visibility fallback, the probe interval, the cap, and that a 403 limit
  is not halted.
- **Devtools:** when no module declares `rateLimit`, the rendered template
  gains one action string (`sqs:ChangeMessageVisibility`) and nothing else: no
  new resource, function or environment variable. An external queue gets its
  own ARN in `SchedulerExecutionRole`.
- **API modules:** recorded fixtures of real throttled responses.

## Consequences

### Positive

- A provider that says when to call again gets called then: no fixed ladder,
  no 30-minute redelivery.
- Daily and monthly limits no longer send work to the DLQ. A run waits,
  shows why, and continues.
- Provider knowledge lives in the API module, once, for every integration
  that uses it. The module only describes. The caller and the worker decide,
  each in one place.
- Limits that are not 429 stop being halted (phase 2).
- The user gets one standard message with the reset time and the provider's
  options.
- A module that declares nothing behaves as today for a 429 with no hint. A
  429 with `Retry-After` gets the wait that the header says.

### Negative

- More moving parts in the Requester and the worker: deadline propagation,
  deferral, scheduling.
- A deferred message is a new message. Delivery stays at least once, so
  duplicate work is possible, as today.
- Waits over 900 s need the scheduler (more infrastructure) or
  `ChangeMessageVisibility` (a new IAM action, and one delivery used).
- Each API module owner must write and maintain a policy and a classifier.
  A wrong policy can make Frigg wait too long or too little.
- Phase 1 alone does not stop 20 workers from saturating one limit. That
  needs pacing (section 6).
- Until phase 2 sets the queue-worker budget to 0, a hinted wait holds a
  worker slot for up to 60 s for each request.

### Neutral

- #653 `isLastAttempt` stays the fallback for providers with no hint, and
  for failures that are not limits (5xx, timeouts).
- The Salesforce module keeps jsforce and calls `classifyRateLimit()` itself.
- When ADR-047 lands, its reducer receives the `RATE_LIMITED` event of
  section 3.

## Alternatives Considered

1. **Keep the fixed ladder and rely on #653 only.** Rejected as the only
   answer. #653 ends the run or counts lost work, but it cannot wait for a
   known reset time, and every long limit still ends in a failed run.
2. **Honour `Retry-After` only.** Rejected as too narrow. In the survey, 6 of
   21 APIs give no retry time, some limits are not 429, and daily quotas
   rarely send `Retry-After`.
3. **Rate limiters in each integration repository.** Rejected. Provider
   knowledge belongs in the API module and the retry mechanism belongs in
   core. Copies in integrations drift.
4. **Sleep in process for any wait.** Rejected. Lambda stops at 900 s, a
   sleeping invocation is billed, and it holds one of the 20 worker slots.
5. **A distributed per-call limiter now (DynamoDB, Redis).** Deferred to
   data, for the reasons in ADR-031.
6. **Step Functions for waits.** Out of scope. ADR-047 already chose a
   stateless reducer with a scheduler tick. This ADR fits into that design.
7. **Let the module decide.** A `maxInProcessWaitMs` in `static rateLimit`,
   and a `RATE_LIMITED` delegate from the module to `IntegrationBase` on the
   `CREDENTIAL_INVALIDATED` path. Rejected. The module does not know its
   caller, and an HTTP request, a queue worker and a script need different
   budgets. The module also does not know whether the worker defers. The
   worker knows, so it writes the message.

## Related

- [ADR-031](./031-concurrent-oauth-credential-refresh.md): concurrent OAuth
  refresh; rejected a DynamoDB lease table.
- [ADR-042](./042-in-process-single-flight-token-refresh.md): in-process
  single flight with `AsyncLocalStorage`.
- ADR-047 (friggframework/frigg#648): orchestrator/worker queue pattern. Its
  reducer receives the `RATE_LIMITED` event of section 3.
- [ADR-048](./048-structured-logging.md): the log fields for throttled calls
  and deferrals.
- ADR-055 (friggframework/frigg#669): recurring triggers. Its run step 3 says
  "a `RateLimitError` defers as ADR-049 says". The same rule applies to the
  recurring mechanism that remains after friggframework/frigg#694.
- ADR-063 (friggframework/frigg#692 to #700): integration definitions as data.
  - §19 plans "a token bucket per module and installation, in the ports".
    Under this ADR, those ports are the caller that owns the budget, and the
    module stays descriptive. The token bucket is the pacing of section 6.
    ADR-063 §19 cites this ADR for it.
  - §14 fails the step on a 429, releases the dedupe claim, and lets the
    queue retry. With friggframework/frigg#657, a `RateLimitError` defers the
    message to its retry time instead. So the definitions interpreter must
    rethrow `RateLimitError` unwrapped. Its `onError: continue` must not
    swallow that error.
- The sync engine (friggframework/frigg#695): its backfill re-enqueues pages.
  A rate-limited page uses the defer path of section 3. It does not spend
  receives toward the DLQ.
- friggframework/frigg#653: `delivery.isLastAttempt` for queue handlers.
- friggframework/frigg#633: declarative queue tuning.

## Decisions and Open Questions

### Decided

Reviewers settled these items on 2026-09-28, on 2026-09-29, and on
2026-11-09 from the review of #656.

1. **`Retry-After` is honoured for every module, by default.** The default
   parser list is `retryAfter`, `resetHeaders`, `ietf`.
2. **A module describes its provider.** It never decides whether to wait,
   retry or defer.
3. **The caller owns the budget.** The entry point sets `maxInProcessWaitMs`
   with `runWithInvocationDeadline`. The defaults are 10 s for HTTP, 0 for a
   queue worker (60 s until phase 2 lands) and 300 s outside an invocation.
   The budget never passes the time left in the invocation less a reserve for
   the next request (the request timeout, or half the time left when that is
   smaller).
4. **Hinted retries are capped.** One request makes at most 10 hinted retries,
   and they do not spend the `attempt` of the ladder.
5. **A limit that is not 429 never uses the ladder.** With no time, the
   Requester throws `RateLimitError` after one call, with `retryAt` and
   `waitMs` undefined.
6. **The `RATE_LIMITED` event is the one seam** for deferral and for the user
   message. The integration's handler decides, or the default handler does.
7. **A deferral sends a new message** (the receive count restarts) for a wait
   up to 15 minutes. A longer wait uses the one-time scheduler. Without a
   scheduler, the worker extends the visibility timeout (12 hours at most, one
   receive used).
8. **An unknown `retryAt` uses the probe interval**, 1 hour by default
   (`FRIGG_QUEUE_RATE_LIMIT_PROBE_MS`).
9. **The default caps are 30 deferrals and 26 hours** from the first
   deferral. An hourly probe of a daily limit needs about 24 deferrals in one
   day. A monthly quota is capped at once and falls back to #653. Reviewers
   can change the defaults.
10. **The default handler writes the `RATE_LIMITED` message** past the delay
    tier, for an unknown `retryAt`, or at a cap, with one atomic upsert.
11. **Each stored message type keeps its newest 50 items.** The use case sets
    the limit, and the repository removes the oldest items.
12. **Run state is `Process.context.rateLimit`**, one value per process
    (section 4).
13. **The halt exemption lands with phase 2**, together with the deferral.

### Open

14. Does `rateLimitedUntil` live on the entity (a migration) or in a separate
    table?
15. Who owns app-wide limits (`scope: 'app'`)? Does a monthly quota pause the
    integration instead of scheduling it?
16. Is the message shape a schema change, or a JSON body in the existing
    message field? Who translates the `userHints` text?
17. A 429 whose `classify` names only a reason still takes the `backOff`
    ladder. So the HubSpot `DAILY` policy (api-module-library#102) sets a
    1-hour `waitMs` itself. Should a reason-only 429 also throw
    `RateLimitError` with no `retryAt`, so that the probe interval of
    section 3 applies?
18. `classifyRateLimit()` returns `null` when `classify` names a limit that is
    not 429 and no time exists. A module on its own client (Salesforce on
    jsforce) then cannot throw the untimed `RateLimitError` of section 1.
    Should the export return the untimed hint?

### Open work

- The admin-script and migration entry points do not set the deadline yet
  (section 2).

## Appendix: Code Sketches

The module sketches show the proposed API. They are illustrative, not final.
For the core parts, the appendix points at the code.

### A.1 API module: headers and a body reason (HubSpot-style)

The 10-second window comes from the provider docs. The body tells which
limit was hit, so `classify()` names a daily limit. HubSpot resets a daily
limit at midnight in the time zone of the account, and the module does not know
that zone, so it probes every hour (open question 17). A burst limit names only
its reason. Its time comes from `Retry-After` when there is one, and from the
burst window when there is none.

```js
class Api extends OAuth2Requester {
    static rateLimit = {
        scope: 'entity',                                  // one portal, one budget
        windows: [{ name: 'burst', limit: 110, perMs: 10_000 }],
        maxConcurrency: 10,
        parsers: ['retryAfter', 'resetHeaders'],          // built-ins, tried in order

        classify({ status, body }) {
            if (status !== 429) return null;
            if (body?.policyName === 'DAILY') {
                return { reason: 'daily', policy: 'DAILY', waitMs: 3_600_000, source: 'static' };
            }
            return { reason: 'burst', policy: body?.policyName };
        },

        userHints: {
            daily: {
                links: [{
                    label: 'API usage limits',
                    url: 'https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines',
                }],
            },
        },
    };
}
```

### A.2 API module: limits only in the docs (QuickBooks-style)

The response says nothing useful, but the docs say "wait 60 seconds". That
value becomes a minimum for every wait.

```js
class Api extends OAuth2Requester {
    static rateLimit = {
        scope: 'entity',                                  // one company file (realm)
        windows: [
            { name: 'burst', limit: 10, perMs: 1_000 },
            { name: 'burst', limit: 500, perMs: 60_000 },
        ],
        maxConcurrency: 10,
        minRetryAfterMs: 60_000,
    };
}
```

### A.3 API module: a client that is not the Requester (Salesforce on jsforce)

Salesforce signals its 24-hour limit with a 403. On `next` the queue worker
halts that error at once. The module calls the exported classifier around its
own client. The response has no reset time, so the policy sets a probe interval
(open question 18). The same error code also means too many concurrent
long-running requests, which clears in seconds. Salesforce documents no field
that tells the two apart, so the module reads the message. A message that
contains "concurrent" is a short concurrency wait, and any other message is
the daily limit. The module only throws. The queue worker and the default
handler of section 3 do the rest, the message of section 5 included.

```js
const { classifyRateLimit, RateLimitError } = require('@friggframework/core');

class Api extends OAuth2Requester {
    static rateLimit = {
        scope: 'entity',                                  // one org, one 24 h budget
        windows: [{ name: 'daily', rollingMs: 24 * 60 * 60_000 }],
        classify({ body }) {
            if (body?.errorCode !== 'REQUEST_LIMIT_EXCEEDED') return null;
            if (/concurrent/i.test(body.message ?? '')) {
                return { reason: 'concurrency', waitMs: 30_000, source: 'static' };
            }
            return { reason: 'daily', waitMs: 60 * 60_000, source: 'static' };
        },
    };

    async withLimits(call) {
        try {
            return await call();
        } catch (err) {
            const hint = classifyRateLimit(Api.rateLimit, {
                status: err.statusCode,
                body: { errorCode: err.errorCode, message: err.message },
                headers: {},
            });
            if (!hint) throw err;
            throw new RateLimitError({ hint, module: this.name, cause: err });
        }
    }

    query(soql) {
        return this.withLimits(() => this.conn.query(soql));
    }
}
```

### A.4 API module: declares nothing

A module with no `static rateLimit` still gets the default parsers. So a 429
with `Retry-After` waits as the header says. A 429 with no hint keeps the
fixed `backOff` ladder of 1, 3, 10, 30, 60 and 180 s, and then goes back to
SQS, as today.

### A.5 Requester: the throttled branch

See `_detectThrottle` and `_hintedRetryDelayMs` in
`modules/requester/requester.js` (phase 1). They replace the combined 429 and
5xx condition of the ladder at `requester.js:276-284`. `_detectThrottle` runs
`classify`, the parsers and the policy through `resolveRateLimitHint`.
`_hintedRetryDelayMs` sleeps when the wait fits the budget, and throws
`RateLimitError` when it does not. A hinted retry calls `_rawRequest` again
with the same `attempt`. The 5xx ladder stays as it is.

### A.6 Requester: a built-in parser and the budget

See `parseRetryAfter` in `modules/requester/rate-limit/parsers.js`, and
`inProcessBudgetMs` and `computeWaitMs` in
`modules/requester/rate-limit/policy.js`. The Requester passes
`invocationMaxInProcessWaitMs()`, the value that the caller set (section 2), to
`inProcessBudgetMs`.

### A.7 `RateLimitError`

See `errors/rate-limit-error.js`. `FetchError.create()` builds an instance of
the class that it is called on, so `RateLimitError.create()` returns a
`RateLimitError`. The error keeps the `waitMs` that the Requester computed, and
sets `retryAt` to now plus that wait. Without a `waitMs`, it takes the time
from the hint. With no time at all, both stay undefined. It also sets
`scopeKey` and `module`.

### A.8 Queue worker: the halt rule

See `createQueueWorker` in `handlers/backend-utils.js` (phase 2). The halt
condition for a 4xx other than 408 and 429 also requires `!error.isRateLimited`.

### A.9 Queue worker: the deferral tiers

See `defer`, `_deferWithDelay`, `_deferWithSchedule` and
`_deferWithVisibility` in `core/Worker.js`, and `queues/queue-deferral.js`
(phase 2). The default handler of section 3 runs these tiers. Each record runs
in its own `runMessageScope` callback, so a `return` there ends only that
record.

### A.10 Integration queue handlers

A queue handler checks the last attempt first, then rethrows. The
`RATE_LIMITED` handler is optional. Without it, the default handler defers the
message and writes the message of section 5.

```js
this.events = {
    SYNC_PAGE: { handler: this.onSyncPage.bind(this) },
    RATE_LIMITED: { handler: this.onRateLimited.bind(this) },   // optional
};

async onSyncPage({ data, delivery }) {
    try {
        await this.syncPage(data);
    } catch (error) {
        if (delivery?.isLastAttempt) {                // friggframework/frigg#653
            return this.failRun(data.processId, error);
        }
        throw error;                                  // a RateLimitError becomes a RATE_LIMITED event
    }
}

async onRateLimited({ data }) {                       // data is the RATE_LIMITED event
    if (data.reason === 'monthly') {
        await this.failRun(data.message.data.processId, data);
        return 'drop';                                // SQS deletes the message
    }
    // no value: the default handler defers to retryAt and writes the message
}
```

### A.11 `RATE_LIMITED` message for a UI

The UI shows `retryAt` in the user's local time, for example "Limit reached.
The next refresh is at 20:00 your time. We continue then."

```json
{
  "code": "RATE_LIMITED",
  "module": "hubspot",
  "reason": "daily",
  "retryAt": "2026-09-26T23:00:00Z",
  "actions": [
    { "type": "RETRY_WHEN_READY" },
    {
      "type": "LINK",
      "label": "API usage limits",
      "url": "https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines"
    }
  ]
}
```
