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
- **Short wait** means a wait that fits in the time the current invocation
  has left. **Long wait** means any other wait.
- **Defer** means to put a queue message back so that it runs after the wait,
  without counting a failed receive.
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

Add rate-limit awareness to Frigg core, devtools and the API modules. An API
module declares its limits and how to read a throttled response. The Requester
waits in process for a short wait. For a long wait it throws a typed error with
`retryAt`. The queue worker defers the message to `retryAt` instead of spending
a delivery. #653 stays the fallback when no hint exists.

The [appendix](#appendix-code-sketches) shows code sketches for each part.
They are illustrative. The implementation PRs can change names and
signatures.

### 1. The API-module contract

An API module can declare a static policy. All fields are optional.

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
  need the body (a 403 limit code, a 200 `THROTTLED`, a `policyName`). It
  returns a hint or `null`.
- **Resolution order:** `classify`, then the parsers in order, then the
  static policy, then the fixed `backOff`.
- **Modules that do not use the Requester** (for example a module on jsforce)
  call the exported `classifyRateLimit()` around their own client.

### 2. Requester

- On a throttled response, the Requester computes the wait as the larger of
  the hint, `minRetryAfterMs` and `backOff[attempt]`, plus jitter.
- **Short wait:** the Requester sleeps in process when the wait fits the
  budget: the smaller of a policy cap and the time left in the invocation
  minus the request timeout. `Worker.run` puts the deadline
  (`context.getRemainingTimeInMillis()`) in `AsyncLocalStorage`, the same
  mechanism as `requester.js:17`.
- **Long wait:** the Requester throws `RateLimitError`, which extends
  `FetchError`. It keeps `statusCode` and adds `isRateLimited`, `retryAt`,
  `reason`, `policy`, `scopeKey`, `module` and `hints`.
- **A module that declares nothing keeps today's behaviour**, with the same
  calls and the same delays.

### 3. Queue worker: defer instead of redeliver

- `backend-utils.js` does not halt an error with `isRateLimited`, whatever its
  status.
- `Worker.run` defers a record that failed with `RateLimitError`:
  - **Wait up to 900 s:** send the same body again with `DelaySeconds` and a
    `_frigg.deferrals` counter, then report the record as a success. The new
    message starts at receive count 1.
  - **Wait over 900 s:** schedule the same body with the one-time scheduler
    at `retryAt`. Devtools provisions the scheduler when any module declares
    `rateLimit`.
  - **No scheduler provisioned:** call `ChangeMessageVisibility` to `retryAt`
    (at most 12 h after the receive) and report the record as a failure. This
    uses one delivery and needs the new IAM action.
- **Cap:** `maxDeferrals` and `maxDeferredMs`. Past the cap, or for a 429
  with no hint, the worker rethrows as today, and #653 `isLastAttempt` is the
  fallback.
- **Order:** send (or schedule) first, then acknowledge. Delivery stays at
  least once, so handlers stay idempotent as today.
- **ADR-047:** when the orchestrator exists, a long wait becomes an
  orchestrator event (`RATE_LIMITED`, `retryAt`) and the orchestrator
  schedules the next tick. This section is the interim mechanism for plain
  queue workers.

### 4. Run state

The worker writes `Process.context.rateLimit` with `applyProcessUpdate`:
`{ status: 'WAITING', retryAt, reason, module, deferrals }`. The next
successful dispatch of that process clears it. A UI can then show "waiting
for the provider limit until 23:00 UTC" instead of a run that looks stuck.

### 5. User-facing message

A new `RATE_LIMITED` delegate goes from the module to `IntegrationBase`, on the
same path as `CREDENTIAL_INVALIDATED` (`module.js:210`,
`integration-base.js:857`). It records one standard, client-safe message:

```js
{
    code: 'RATE_LIMITED',
    module, reason,
    retryAt,                 // ISO UTC; the UI shows local time
    scheduled: true,
    actions: [
        { type: 'RETRY_WHEN_READY' },
        { type: 'LINK', label, url },   // from module userHints
    ],
}
```

The module owns the provider-specific text and links. `classify` can drop a
link that does not apply, for example a paid limit increase that a public app
cannot buy.

### 6. Pacing (phase 2)

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

### 7. Phasing

| PR | Scope | Files |
|---|---|---|
| 1 (core, opt-in) | Parsers, `static rateLimit`, honour `Retry-After` and `minRetryAfterMs`, the budget cap, `RateLimitError`, the halt exemption. No queue change: the error still rethrows. | `modules/requester/requester.js`, `modules/requester/rate-limit/*`, `errors/rate-limit-error.js`, `errors/index.js`, `handlers/backend-utils.js`, `packages/core/CLAUDE.md` |
| 2 (core + devtools) | Defer in `Worker.run`, run state, the scheduler switch, the IAM action. | `core/Worker.js`, `queues/queuer-util.js`, `handlers/backend-utils.js`, `devtools/.../integration-builder.js`, `scheduler-builder.js`, `base-definition-factory.js`, `docs/guides/INTEGRATION-PATTERNS.md` |
| 3 (api-module-library) | Policies and classifiers: HubSpot (`policyName`, `X-HubSpot-RateLimit-*`), Salesforce (403 `REQUEST_LIMIT_EXCEEDED`, `limitInfo`), Pipedrive (`x-ratelimit-*`). | each module's `api.js` and tests |
| 4 (core) | The `RATE_LIMITED` delegate, the message shape, the `RETRY_WHEN_READY` action. | `modules/module.js`, `integrations/integration-base.js` |
| 5 (core + devtools) | Pacing 2a, then 2b. | `modules/requester/rate-limit/*`, `integration-builder.js` |

### 8. Testing

- **Parsers:** table tests for seconds, HTTP-date, ISO, epoch s and ms,
  delta, IETF, bad input, past times and very large values.
- **Requester:** an injected `fetch` with fake timers. It waits for
  `Retry-After`, not for `backOff`. A long wait throws `RateLimitError` with
  `retryAt`. A module that declares nothing makes the same calls with the
  same delays. The 5xx path does not change. The skipped live-mock tests
  (`requester.test.js:48,58`) are replaced.
- **Worker:** `aws-sdk-client-mock` checks `DelaySeconds`, the scheduler, the
  visibility fallback, the cap, and that a 403 limit is not halted.
- **Devtools:** when no module declares `rateLimit`, the rendered template
  does not change, byte for byte.
- **API modules:** recorded fixtures of real throttled responses.

## Consequences

### Positive

- A provider that says when to call again gets called then: no fixed ladder,
  no 30-minute redelivery.
- Daily and monthly limits no longer send work to the DLQ. A run waits,
  shows why, and continues.
- Provider knowledge lives in the API module, once, for every integration
  that uses it.
- Limits that are not 429 stop being halted.
- The user gets one standard message with the reset time and the provider's
  options.
- Modules that declare nothing behave exactly as today.

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
  needs pacing (phase 2).

### Neutral

- #653 `isLastAttempt` stays the fallback for providers with no hint, and
  for failures that are not limits (5xx, timeouts).
- The Salesforce module keeps jsforce and calls `classifyRateLimit()` itself.
- When ADR-047 lands, section 3 moves into the orchestrator.

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

## Related

- [ADR-031](./031-concurrent-oauth-credential-refresh.md): concurrent OAuth
  refresh; rejected a DynamoDB lease table.
- [ADR-042](./042-in-process-single-flight-token-refresh.md): in-process
  single flight with `AsyncLocalStorage`.
- ADR-047 (friggframework/frigg#648): orchestrator/worker queue pattern.
- [ADR-048](./048-structured-logging.md): the log fields for throttled calls
  and deferrals.
- friggframework/frigg#653: `delivery.isLastAttempt` for queue handlers.
- friggframework/frigg#633: declarative queue tuning.

## Open Questions

1. Is honouring `Retry-After` on by default for every module, or opt-in per
   module? Lean: on by default. It only shortens or lengthens a wait that
   already happens.
2. What is the default cap for an in-process wait: 60 s, or 5 min?
3. Is it acceptable that a deferral sends a new message (receive count
   restarts) instead of changing visibility? Is the scheduler an acceptable
   dependency for waits over 15 min?
4. What maximum total deferral time applies before the run fails and the
   user is told?
5. Run state: a reserved `context.rateLimit` key, or a framework state
   `RATE_LIMITED` in the ADR-047 state machine?
6. Where does `rateLimitedUntil` live: on the entity (a migration) or in a
   separate table?
7. Who owns app-wide limits (`scope: 'app'`)? Does a monthly quota pause the
   integration instead of scheduling it?
8. Is the message shape a schema change, or a JSON body in the existing
   message field? Who owns the hint text and its translation?

## Appendix: Code Sketches

These sketches show the proposed API. They are illustrative, not final.

### A.1 API module: headers and a body reason (HubSpot-style)

The 10-second window comes from the provider docs. The body tells which
limit was hit, so `classify()` turns a daily limit into a wait until the
reset.

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
                return { reason: 'daily', retryAt: nextMidnight('UTC'), source: 'body' };
            }
            return { reason: 'burst', waitMs: 10_000, policy: body?.policyName, source: 'body' };
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

Salesforce signals its 24-hour limit with a 403. Today the queue worker halts
that error at once. The module calls the exported classifier around its own
client. The response has no reset time, so the policy sets a probe interval.

```js
const { classifyRateLimit, RateLimitError } = require('@friggframework/core');

class Api extends OAuth2Requester {
    static rateLimit = {
        scope: 'entity',                                  // one org, one 24 h budget
        windows: [{ name: 'daily', rollingMs: 24 * 60 * 60_000 }],
        classify({ body }) {
            if (body?.errorCode !== 'REQUEST_LIMIT_EXCEEDED') return null;
            return { reason: 'daily', waitMs: 60 * 60_000, source: 'static' };
        },
    };

    async withLimits(call) {
        try {
            return await call();
        } catch (err) {
            const hint = classifyRateLimit(Api.rateLimit, {
                status: err.statusCode,
                body: { errorCode: err.errorCode },
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

No change: the same calls, the same fixed backoff, the same redelivery.

```js
class Api extends ApiKeyRequester {
    static requestTimeoutMs = 30_000;
    // no rateLimit: backOff [1, 3, 10, 30, 60, 180] s, then SQS redelivery, as today
}
```

### A.5 Requester: the throttled branch

This branch replaces the fixed ladder at `requester.js:276-284`.

```js
const policy = this.constructor.rateLimit;

if (isThrottled(response, policy)) {                  // 429, or classify() returns a hint
    const hint = await resolveRateLimitHint(policy, response, {
        attempt,
        backOff: this.backOff,
        now: Date.now(),
    });                                               // classify → parsers → policy → backOff
    const waitMs = Math.max(hint.waitMs, policy?.minRetryAfterMs ?? 0) + jitter(hint.waitMs);

    if (waitMs <= inProcessBudgetMs(policy, this.requestTimeoutMs) && attempt < this.backOff.length) {
        clearRequestTimer();
        await sleep(waitMs);
        return this._rawRequest(url, options, attempt + 1);
    }

    throw await RateLimitError.create({
        resource: encodedUrl,
        init: options,
        response,
        hint,
        module: this.name,
    });
}
```

### A.6 Requester: a built-in parser and the budget

```js
function parseRetryAfter(value, now = Date.now()) {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) {
        return { waitMs: seconds * 1000, source: 'header' };
    }
    const at = Date.parse(value);                     // HTTP-date or ISO timestamp
    if (Number.isNaN(at)) return null;
    return { retryAt: new Date(at), waitMs: Math.max(0, at - now), source: 'header' };
}

function inProcessBudgetMs(policy, requestTimeoutMs) {
    const left = invocationDeadline() - Date.now() - requestTimeoutMs; // set by Worker.run
    return Math.min(policy?.maxInProcessWaitMs ?? 60_000, left);
}
```

### A.7 `RateLimitError`

```js
class RateLimitError extends FetchError {
    constructor({ hint, module, ...fetchErrorArgs }) {
        super(fetchErrorArgs);
        this.name = 'RateLimitError';
        this.isRateLimited = true;
        this.retryAt = hint.retryAt ?? new Date(Date.now() + hint.waitMs);
        this.reason = hint.reason;                    // burst | daily | monthly | concurrency
        this.policy = hint.policy;
        this.source = hint.source;                    // header | body | static | backoff
        this.module = module;
    }
}
```

### A.8 Queue worker: the halt rule

```js
const status = error.statusCode;
if (
    status && status >= 400 && status < 500 &&
    status !== 408 && status !== 429 &&
    !error.isRateLimited                              // new: a 403 limit is not a halt
) {
    error.isHaltError = true;
}
```

### A.9 Queue worker: defer in `Worker.run`

A deferred record counts as handled, so SQS does not count a failed receive.
The worker sends first and acknowledges after. If the Lambda stops between
the two, SQS delivers the original again, so delivery stays at least once.

```js
// inside run(), per record
} catch (error) {
    const outcome = error.isRateLimited ? await this.defer(record, error) : null;
    if (outcome === 'acked') continue;                // re-sent or scheduled
    if (outcome !== 'failed' && error.isHaltError) continue;
    batchItemFailures.push({ itemIdentifier: record.messageId });
}

async defer(record, error) {
    const body = JSON.parse(record.body);
    const deferrals = (body._frigg?.deferrals ?? 0) + 1;
    const waitMs = error.retryAt.getTime() - Date.now();
    if (deferrals > MAX_DEFERRALS || waitMs > MAX_DEFERRED_MS) return null;   // rethrow path, #653

    const next = { ...body, _frigg: { ...body._frigg, deferrals } };
    await recordRateLimitWait(body.data?.processId, error, deferrals);         // context.rateLimit

    if (waitMs <= 900_000) {
        await this.send({ ...next, QueueUrl: this.queueUrl }, Math.ceil(waitMs / 1000));
        return 'acked';
    }
    if (this.scheduler) {
        await this.scheduler.scheduleOneTime({
            scheduleName: `defer-${record.messageId}`,
            scheduleAt: error.retryAt,
            queueResourceId: this.queueArn,
            payload: next,
        });
        return 'acked';
    }
    await this.changeVisibility(record, Math.min(waitMs, 12 * 60 * 60_000));
    return 'failed';                                  // back at retryAt, one delivery used
}
```

### A.10 Integration queue handler

Nothing is required. The handler keeps rethrowing, and core defers. #653
still covers failures that are not limits, and limits with no hint.

```js
async onSyncPage({ data, delivery }) {
    try {
        await this.syncPage(data);
    } catch (error) {
        if (error.isRateLimited) throw error;         // core defers it to retryAt
        if (delivery?.isLastAttempt) {                // friggframework/frigg#653
            return this.failRun(data.processId, error);
        }
        throw error;
    }
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
  "scheduled": true,
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
