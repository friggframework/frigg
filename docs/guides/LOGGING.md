# Logging

Frigg writes one redacted JSON record per line to stdout. Every record has the
same field set and the correlation ids of ADR-011. The decision is
[ADR-048](../architecture-decisions/048-structured-logging.md). This guide
tells you how to write, read and test logs.

## Quick start

In an integration or an API module, use `this.logger`. It already has its name
and its ids:

```js
async processContactBatch({ data }) {
    this.logger.info('Contact batch started', {
        eventName: 'integration.hubspot.batch_started',
        batchSize: data.contacts.length,
    });
}
```

In core, get a named logger one time per module:

```js
const { getLogger } = require('../logs');
const log = getLogger('frigg.core.sync');

log.warn('Sync skipped', { eventName: 'frigg.core.sync.skipped', processId });
```

- The message is first. Keep it fixed text, so a query can group it. Put ids
  and counts into fields.
- A logger has `trace`, `debug`, `info`, `warn`, `error`, `fatal(message,
  fields?)`, `child(bindings)` and `isLevelEnabled(level)`.
- `child(bindings)` adds fields to each record. Give a function to read the
  values per record: `log.child(() => ({ processId: this.processId }))`.
- The logger never throws. It never uses `console.*`.

## The record

One record, shown on several lines (stdout has it on one line):

```json
{
  "timestamp": "2026-09-23T14:07:37.123Z",
  "level": "WARN",
  "message": "Contact skipped",
  "logger": "integration.hubspot",
  "appName": "acme-integrations",
  "stage": "prod",
  "requestId": "8f1c2d3e-4b5a-4c6d-9e8f-0a1b2c3d4e5f",
  "messageId": "2e9d7c61-5b4a-4f3e-8d2c-1b0a9f8e7d6c",
  "integrationId": "66f1c2a9b8e7d6c5b4a3f201",
  "integrationType": "hubspot",
  "integrationEvent": "PROCESS_BATCH",
  "eventName": "integration.hubspot.contact_skipped",
  "externalId": "901",
  "error": {
    "type": "FetchError",
    "message": "PUT https://api.hubapi.com/crm/v3/objects/contacts/901?hapikey=REDACTED 429",
    "status": 429
  }
}
```

### Field reference

| Field | Type | Source | When present |
|---|---|---|---|
| `timestamp` | string | logger, RFC 3339 UTC with milliseconds | always |
| `level` | string | `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL` | always |
| `message` | string | call site; an `Error` becomes its sanitized message, other values become `[non-string message]` plus `value` | always |
| `logger` | string | `getLogger(name)`: `frigg.<area>`, `integration.<name>`, `module.<name>` | always |
| `appName` | string | `FRIGG_STACK` | when set |
| `stage` | string | `STAGE` | when set |
| `requestId` | string | invocation scope, from `context.awsRequestId` | inside `createHandler` and the DLQ processor |
| `handlerName` | string | the `eventName` option of `createHandler` | inside `createHandler` |
| `method`, `route`, `routeKey` | string | the HTTP event | HTTP invocations |
| `invocation` | object | the redacted event summary: `{ source, method, route, routeKey, queryKeys, headerNames }` for HTTP, `{ source, recordCount }` for SQS, else `{ source }` | inside an invocation scope |
| `messageId`, `receiveCount` | string, number | message scope, from the SQS record | inside `Worker.run` and the DLQ processor |
| `processId`, `integrationId`, `integrationEvent` | string | message scope (the message body), or the integration context | when known |
| `integrationType`, `userId`, `version` | string | the ADR-011 integration context | when known |
| `entityId`, `credentialId` | string | `Module` bindings | in API module records |
| `eventName` | string | call site: the `logger` name, then `.<action>` | required for `frigg.*` at `WARN` and above, and for framework lifecycle `INFO` |
| `trace_id`, `span_id`, `trace_flags` | string (hex) | the active OTel span | inside a span only |
| `error` | object | `{ type, message, code, status, stack, cause }`, sanitized | when a call site passes `error` |
| `droppedKeys` | string[] | logger | when the logger removed a field (see Precedence) |

Call-site fields go next to these, at the top level.

### Rules the logger applies

- **Precedence.** Required, resource and trace fields win, then scope fields,
  then `child()` bindings, then call-site fields. A key that loses goes to
  `droppedKeys`. So a call site cannot replace `requestId` or `level`.
- **Reserved keys.** The logger never writes `tenantId`, `type`, `time`,
  `record`, `errorType`, `errorMessage`, `stackTrace`, `service`, `env`,
  `host`, `source`, `status` or `severity` at the top level. They go to
  `droppedKeys`. Use `statusCode` for an HTTP status. Nested keys such as
  `error.status` and `invocation.source` are fine.
- **Payloads.** `body`, `rawBody`, `payload` and `response` are dropped at
  `INFO` and above. Log counts or keys instead.
- **Caps.** A string is cut at 2,048 characters after redaction. Object depth
  is 6 (`[Depth]`), `cause` depth is 3. A record is at most 16 KB: the logger
  drops call-site fields largest first, then `error.stack`, then
  `error.cause`. It always writes the record.
- **Null.** `null` and `undefined` fields are left out.

### Redaction

Redaction runs inside the logger for every record. Call sites carry no
redaction duty, but redaction is a backstop, not a permission: do not log a
token and trust the logger.

- Keys that end in `token`, `secret`, `password`, `apikey`, `privatekey`,
  `signature`, `authorization` or `cookie` (case, `-` and `_` ignored), plus
  `hashword` and the encryption registry fields, get `[REDACTED]`.
- A `headers` object becomes its names. URLs lose userinfo, and each query
  value becomes `REDACTED`.
- Strings are scrubbed: Bearer and Basic credentials, JWTs, credentialed
  connection strings, `client_secret=`/`code=`/`signature=` pairs, long
  base64 and hex runs become `[REDACTED:<len>]`. A key that ends in
  `sha256`, `hash`, `digest` or `checksum` keeps its hex value.
- An `Error` at any depth goes through the error serializer.

The rules cover credentials, not personal data. Use `DEBUG` in production
only for a limited time.

### Stability rule

The record contract is public. Queries, subscription filters and sinks read
it. A release can **add** a field. A **rename or removal** of a field needs a
core major version. Records carry no schema version: the core version that
the app deploys defines the schema.

## Levels and `FRIGG_LOG_LEVEL`

| Level | Meaning | Frigg examples |
|---|---|---|
| `TRACE` | Step detail. Off by default. | Requester backoff |
| `DEBUG` | Diagnostics, redacted payloads. | OAuth callback steps |
| `INFO` | Lifecycle facts. | Handler entry; status changed |
| `WARN` | Handled. The system continues. | SQS retry; inbound 4xx; config fallback |
| `ERROR` | The operation failed. | Unhandled 5xx; halt; DLQ |
| `FATAL` | The process cannot continue. | Invalid config at INIT |

**Log an error one time, at the boundary that decides its outcome.** Inner
layers throw with `cause` and do not log. `createHandler`, the express error
middleware, `Worker.run` and the DLQ processor are the boundaries.

`FRIGG_LOG_LEVEL` sets the minimum level. The logger drops a record below it
before it reads any field.

- Default `INFO`. A local run (`STAGE=local`, or `IS_OFFLINE` = `true` or `1`)
  defaults to `DEBUG`.
- Case and spaces do not matter. An empty value counts as unset. An unknown
  value means `INFO`, and the logger writes one `frigg.logger.invalid_level`
  WARN.
- When `AWS_LAMBDA_LOG_LEVEL` is also set, the less verbose level wins, with
  one `frigg.logger.level_conflict` WARN when they differ.
- `DEBUG_VERBOSE=1` means `DEBUG` while `FRIGG_LOG_LEVEL` is unset (legacy).
- The logger reads the level one time, at the first record, and never from
  SSM.

Build expensive detail only when it is written:

```js
if (this.logger.isLevelEnabled('debug')) {
    this.logger.debug('Mapping built', { fields: Object.keys(mapped) });
}
```

## Reading logs

### Locally with `jq`

`fromjson?` skips lines that are not JSON (CLI output, legacy `console.*`
lines):

```bash
frigg start | jq -R 'fromjson? | select(.level == "ERROR")'
frigg start | jq -R 'fromjson? | {level, logger, eventName, requestId, route}'
FRIGG_LOG_LEVEL=warn frigg start | jq -R 'fromjson? | .level' | sort | uniq -c
```

`osls offline` runs handlers in worker threads, so the JSON lines of several
workers can reach the pipe out of order. Use `--useInProcess` when you pipe to
`jq`.

### CloudWatch Logs Insights

The fields need no parse step:

```
fields @timestamp, level, message, eventName, error.message
| filter integrationId = "66f1c2a9b8e7d6c5b4a3f201"
| filter level in ["WARN", "ERROR"]
| sort @timestamp desc
```

```
# Everything one invocation wrote
fields @timestamp, level, logger, message
| filter requestId = "8f1c2d3e-4b5a-4c6d-9e8f-0a1b2c3d4e5f"
| sort @timestamp asc
```

```
# Failure counts per event name
filter level = "ERROR"
| stats count(*) by eventName
| sort count(*) desc
```

```
# One queue message across retries
fields @timestamp, receiveCount, message, eventName
| filter messageId = "2e9d7c61-5b4a-4f3e-8d2c-1b0a9f8e7d6c"
```

### Subscription-filter patterns

JSON filter patterns match the record fields directly:

```
{ $.level = "ERROR" }
{ $.level = "ERROR" || $.level = "FATAL" }
{ $.eventName = "frigg.queue.dlq.message_failed" }
{ $.logger = "integration.hubspot" && $.level = "WARN" }
```

## Destinations

stdout is the source of truth. On AWS, ship logs **out of process** first.
That keeps the send, its credential and its failures out of the invocation:

1. Lambda log delivery to Amazon Data Firehose (then to S3 or a vendor).
2. A CloudWatch Logs subscription filter (patterns above) to a Lambda,
   Firehose or Kinesis.
3. A vendor Lambda extension.
4. An OpenTelemetry collector layer.

An **in-process destination sink** (ADR-048 §11) is not public yet. The
internal sink interface exists (the stdout and `memory` sinks use it), and
`runInvocationScope` already flushes sinks against the invocation deadline.
These rules wait for the first real destination, and ship with it:

- the destination contract `{ name, minLevel, translate(record), send(batch, { signal }) }`;
- `appDefinition.logging.sinks` registration and its schema entry;
- one buffer per sink, at most 1,000 records or 1 MB, with drop counts;
- one flush per sink at a time; abort and drop at the deadline, no retry in a
  later invocation;
- the fixed stderr lines `frigg.logger.sink_failed` and
  `frigg.logger.sink_disabled`, never with the error message or the URL;
- disable a sink after 3 failed flushes in a row;
- raise a `minLevel` that is less strict than the effective level, with one
  warning.

An in-process sink in a VPC needs an egress path.

## Deployment: the `logging` block

```js
const appDefinition = {
    logging: { level: 'info', retentionInDays: 30 },
};
```

- **No block, no change.** Without `logging`, devtools emits no
  `LoggingConfig`, no retention and no `FRIGG_LOG_LEVEL`, and
  `frameworkVersion` stays as it is.
- **`level`** (`trace` … `fatal`, all lower or all upper case):
  - Devtools sets `provider.logs.lambda` to
    `{ logFormat: 'JSON', applicationLogLevel: <LEVEL>, systemLogLevel: 'INFO' }`
    for every function. Do not set a function-level `logs` block: it
    replaces the provider block, it does not merge with it.
  - A level other than `info` also sets the literal `FRIGG_LOG_LEVEL=<LEVEL>`
    on every function. It wins over `environment: { FRIGG_LOG_LEVEL: true }`,
    and it also applies under `frigg start` (a local run without it
    defaults to `DEBUG`).
  - Setting a level raises `frameworkVersion` to `>=3.58.0`, the first osls
    version with `LoggingConfig`. An unknown level fails the build.
- **`retentionInDays`** sets `provider.logRetentionInDays` for every Lambda
  log group. Allowed values are the CloudWatch list (1, 3, 5, 7, 14, 30, 60,
  90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288,
  3653). Any other value fails the build before CloudFormation starts. The
  deployment IAM policy grants `logs:DeleteRetentionPolicy`, so you can
  remove the setting later.
- **`format`** accepts only `json`.
- **SSM offload:** `FRIGG_LOG_LEVEL`, `AWS_LAMBDA_LOG_LEVEL`,
  `AWS_LAMBDA_LOG_FORMAT`, `OTEL_FLUSH_TIMEOUT_MS`, `DEBUG_VERBOSE` and
  `PRISMA_LOG_LEVEL` are read at INIT, so they never move to SSM.
- **`frigg init`** writes `logging: { level: 'info', retentionInDays: 30 }`
  for new apps.

## Testing

`jest-logger-setup.js` (registered in `packages/core/jest.config.js`) installs
a memory sink before each test, sets the level to `TRACE`, and fails a test
that wrote a `frigg.*` WARN or above with no `eventName`. No JSON reaches the
test output.

Assert on records, not on console spies:

```js
const { createMemorySink } = require('@friggframework/core');

it('skips a contact', async () => {
    const sink = createMemorySink(); // replaces the sinks until the next reset
    await integration.processContactBatch({ data });
    expect(sink.records).toContainEqual(
        expect.objectContaining({
            level: 'WARN',
            eventName: 'integration.hubspot.contact_skipped',
        })
    );
});
```

- `createMemorySink()` installs itself as the only sink.
  `createMemorySink({ install: false })` gives a sink to pass to
  `resetLoggerForTests({ level, sinks })`.
- `resetLoggerForTests()` re-reads the env on the next record. Pass `sinks`,
  or it installs the stdout sink.
- Records in the sink are deep-frozen, and `JSON.stringify(record)` equals the
  stdout line.
- To prove that no secret leaks, core tests use
  `expect(sink.records).toContainNoSecretWindow(secrets)` (registered by the
  setup file; the fixtures are in `packages/core/logs/__fixtures__/`). Use
  fake secrets of 16 characters or more.

A test outside `packages/core` can add the same setup file:
`setupFilesAfterEnv: ['@friggframework/core/logs/jest-logger-setup.js']`.

## Migrating from `debug`, `initDebugLog`, `flushDebugLog`

The three functions are deprecated shims for one major version. They write
records on the `frigg.legacy` logger and keep no module state:

| Old | Now | Use instead |
|---|---|---|
| `debug(...args)` | one `DEBUG` record; the first string is the message (`util.format` when it has a `%` directive), the rest goes to `args` | `this.logger.debug(message, fields)` |
| `initDebugLog(eventName, event)` | nothing inside an invocation scope; else one `DEBUG` record with the redacted `invocation` | nothing: `createHandler` opens the scope |
| `flushDebugLog(error)` | one `ERROR` record, `eventName: 'frigg.legacy.error'`, no replay of debug lines | log one time at the boundary, or throw with `cause` |

Records below the effective level are not kept for a later flush. Set
`FRIGG_LOG_LEVEL=debug` to see debug records.

## Migrating a call site

Adoption is incremental: new code uses the logger, and existing
`console.*` calls move when someone touches them. Until then a log group has
JSON and text lines, and the text lines have no correlation ids and skip
redaction.

1. Get the logger: `this.logger` in an integration or an API module,
   `getLogger('frigg.<area>')` in core (one per module, at module scope).
2. Pick the level from the table above, not from the old console method.
3. Make the message fixed text. Move ids, counts and names into fields.
4. Give each `frigg.*` record at `WARN` and above, and each lifecycle `INFO`,
   an `eventName`: the logger name, then `.<action>`.
5. Pass an error as `{ error }`. Do not log and rethrow; the boundary logs.
6. Do not log bodies, headers or tokens at `INFO`. Log keys or lengths
   (`dataKeys`, `bodyLength`).
7. In the test, replace the console spy with a memory sink and assert by
   `eventName`. Keep `expect(consoleSpy).not.toHaveBeenCalled()` so the old
   call cannot come back.

```js
// Before
console.log(`[Frigg] authorized userId=${userId} entityId=${entityId}`);

// After
log.info('Entity authorized', {
    eventName: 'frigg.integrations.authorized',
    userId,
    entityId,
});
```
