# ADR-048: Structured Logging

**Status**: Proposed  
**Date**: 2026-09-23  
**Deciders**: Daniel Klotz, Sean Matthews

## Context

This document is written in ASD-STE100 Simplified Technical English.

### Terms used in this document

- **Record** means one log entry: one JSON object on one line.
- **Port** means a Frigg-owned interface. An adapter implements it.
- **Provider adapter** means the ADR-028 code that connects core to one
  host, for example AWS Lambda or Netlify.
- **Sink** means an output target of the logger: the stdout sink, the
  `memory` sink in tests, or a destination sink (§11).
- **Destination** means a log service outside the Frigg process, for
  example Datadog, Better Stack or an OTel collector.
- **Bindings** means the fields that a child logger adds to each record.
- **Composition root** means the code that builds objects and injects their
  dependencies.
- **Boundary** means the code that decides an outcome: respond, retry, halt
  or move to the DLQ.
- **Halt** means an error with `isHaltError`. The worker discards the
  message and does not retry it.
- **Scope** means the correlation context in `AsyncLocalStorage` (ALS).
- **Hop** means a transfer of work to another invocation (SQS, scheduler).
- **INIT** means the Lambda init phase, before the first invocation.
- **Raw handler** means a Lambda handler that does not use `createHandler`.
- **Shim** means a deprecated export that calls the new logger.
- **RIC** means the Lambda Node.js runtime interface client.
- **Bus** (event bus) means `TelemetryEventBus`, the synchronous telemetry
  event stream.
- **OTel** means OpenTelemetry. **OTLP** is the OTel wire protocol.
- **Floor** means a minimum, for example the lowest supported version.
- **Working name** means a temporary name. The implementation PR can change
  it.
- **Lean** means the preferred answer to an open question.
- **Ack** and **DLQ** have their ADR-031 meanings. **North Star** has its
  ADR-011 meaning. **SSM** and **offload** have their ADR-027 meanings.
- `011:29-30` means ADR-011, lines 29-30. A bare `:<lines>` means those
  lines of the file cited just before it.

### Current state (on `next`, AST count)

Core logs only through direct `console.*` calls: 309 in `packages/core`
production code and 29 in `packages/admin-scripts/src`. The core calls are
`log` 186, `error` 85, `warn` 33, `debug` 3 and `info` 2. No call writes JSON
or reads a correlation context. Two unrelated loggers exist: the debug buffer
(`logs/logger.js:6-48`) and `EncryptionLogger`, the only code that reads a
level (`encryption/logger.js:21`). ADR-011 names a "telemetry/logger
abstraction" (`011:29-30`). `TelemetryService` has no log method, and core
has no OTel logs dependency.

| Finding | Evidence |
|---|---|
| Each 5xx or failed `testAuth` dumps the raw event, with headers, cookies, OAuth code and password. | `create-handler.js:167,193`; `app-handler-helpers.js:31-33`; `module.js:98-106` |
| `FetchError` and node-fetch messages hold the URL query, and dev adds the body. | `fetch-error.js:42-47,55`; node-fetch `lib/index.js:273` |
| `span.recordException(err)` exports the raw error text. | `otel-telemetry.js:153-157` |
| Two user-repository paths can log a plaintext `hashword`. | `user-repository-documentdb.js:294-299,335-340` |
| The STAGE predicates disagree. | `fetch-error.js:43`; `telemetry-config.js:21-24` |
| Devtools sets no `LoggingConfig` and no retention, so logs never expire. | `base-definition-factory.js:175-221` |
| The DLQ processor acks each message, so its line is the only trace. | `dlq-processor.js:35-61` |
| The documented `DEBUG=frigg:*` and `LOG_LEVEL` are never read. | `packages/core/README.md:111-113` |
| Ad-hoc logging PRs recur. #634 found no cause for 22% of `ERROR` integrations. | #528, #529, #530, #535, #537, #540, #578; #634 |

### Constraints

- The no-op telemetry path loads zero `@opentelemetry` modules
  (`telemetry-service.test.js:6-21`).
- The env cap is 4 KB per function (`027:9-20`). Module-load code gets SSM
  values only through the INIT preload (`offload-utils.js:25-30`). The
  offload blocklist holds exact names only (`:35-72`), so it does not cover
  a new `FRIGG_*` variable.
- Core imports no provider code (ADR-028, ADR-029). The #545 Netlify adapter
  reuses `@friggframework/core/logs`.
- Lambda can freeze the container at return and lose an async write
  (`create-handler.js:188`).
- No behavior change on upgrade (`027:151-152`). ADR-031 argues an exception
  (`031:237-240`).
- External code imports `debug`, `initDebugLog` and `flushDebugLog`
  (`packages/core/index.js:81,177-180`): api-module-library linear and
  unbabel-projects, the devtools auther tester, and #545.

## Decision

**One Frigg-owned logger port in core writes one redacted JSON record per line
to stdout. Every record carries the same field set and the ADR-011 correlation
ids.**

### 1. A logger port, sibling of `TelemetryService`

- **API** (working names). `getLogger(name)` returns a logger with `trace`,
  `debug`, `info`, `warn`, `error`, `fatal(message, fields?)`,
  `child(bindings)` and `isLevelEnabled(level)`. The message is first.
- **Leaf module.** The logger lives in `packages/core/logs/`, with lazy,
  never-throw state and its own test reset. It loads no telemetry module and
  never uses the event bus. The telemetry modules log through it, so a logger
  in `telemetry-runtime.js` makes a require cycle (`telemetry-runtime.js:8-9`).
  `getTelemetry()` also loads the app definition (`:18-22`).
- **Span context.** A new zero-OTel port method, `getActiveSpanContext()`
  (working name): NoOp returns `null`, OTel returns the active span context.
  `bindTelemetryContext` forwards it. `getTelemetry()` registers its service
  with the logger, and the logger calls the method only if it exists.
- **Consumers.** `IntegrationBase` gets `this.logger` next to
  `this.telemetry` (`integration-base.js:62-65`), with bindings read per
  record. `Requester` takes an injected `logger` with a singleton fallback
  (`requester.js:63-66`). An API module that calls it raises its core floor
  or uses `this.logger?.`. `Module` binds `entityId` and `credentialId` on
  its `Requester` logger (`module.js:31-32`). `IntegrationBase` cannot bind
  them, because one integration has more than one entity. Composition roots
  inject the logger into use cases.
- **Packages covered.** In: core, admin-scripts, the provider adapters, and
  API modules through `Requester`, with a lint rule in api-module-library.
  Out: CLI output (over 500 `frigg-cli` calls are UX) and the browser UIs.
- **Examples.** See [Usage examples](#usage-examples).

### 2. Output format

- **JSON only.** The logger has one output format in every stage, local
  runs included. It writes one JSON object per line, with all fields
  top-level, to stdout (fd 1) with `fs.writeSync`. It retries a bounded
  number of times on `EAGAIN` and on a partial write.
- The logger does not use `console.*`, because the RIC nests objects under
  `message`. A direct write skips the RIC prefix, so the logger adds
  `requestId`.
- The logger never throws. On its own failure, it writes one fixed stderr
  line (`frigg.logger.write_failed`) with no record data. A sink never logs
  through the logger.
- Tests use the `memory` sink and assert on records, not on console spies.
  `memory` is not an output format.
- Core ships no transport, worker thread or network sink. A destination
  connects through a destination sink (§11).

### 3. The record contract

| Group | Fields | Rule |
|---|---|---|
| Required | `timestamp` | RFC 3339, UTC, milliseconds |
| | `level` | `TRACE` to `FATAL`, upper-case |
| | `message` | Always a string |
| | `logger` | `frigg.<area>`, `integration.<name>` or `module.<name>` |
| Resource | `appName`, `stage` | `FRIGG_STACK`, `STAGE` |
| Invocation | `requestId` | From the provider adapter (AWS `context.awsRequestId`) |
| | `messageId`, `processId`, `executionId`, `method`, `route` | When known |
| | `invocation` (working name) | The §6 event summary, nested |
| Integration | `integrationId`, `integrationType`, `userId`, `version` | ADR-011 set, verbatim |
| | `entityId`, `credentialId` | When known. `Module` binds both (§1) |
| | `integrationEvent` | For example, `ON_WEBHOOK` |
| Event | `eventName` | The `logger` namespace, then `.<action>` |
| Trace | `trace_id`, `span_id`, `trace_flags` | OTel names, hex, with a span only |
| Error | `error` | `{ type, message, code, status, stack, cause }` |

- **Event names.** Each `frigg.*` record at `WARN` and above has an
  `eventName`, and so does each framework lifecycle `INFO` record. It maps to
  the OTel `EventName`. The free-text `eventName` option of `createHandler`
  logs as `handlerName`, a working name (`create-handler.js:134`).
- **Casing.** Frigg fields are camelCase (`integration-base.js:245-255`).
  Trace fields keep the stable OTel names, so collectors need no mapping. An
  unsampled span still has ids, and `trace_flags` tells the cases apart.
- **Reserved keys.** The logger never emits `tenantId`, `type`, `time`,
  `record`, `errorType`, `errorMessage` or `stackTrace` (Lambda), or
  `service`, `env`, `host`, `source` or `status` (Datadog), or `severity`
  (GCP). A destination sink maps the record to these keys (§11). A Datadog
  pipeline must remap `version`.
- **Stability.** The record contract is public from the first release that
  contains PR A. Queries, subscription filters and sinks read it. All
  working names in this table are final before PR A merges. After that, a
  release can add a field. A rename or a removal needs a core major
  version. ADR-011 makes its counter registry additive (`011:210-212`) but
  does not cover renames, so this ADR adds the major-version rule. Records
  carry no schema version. A consumer learns the schema from the core
  version that the app deploys.
- **Precedence.** Required, resource and trace fields win, then scope, then
  child bindings, then call-site fields. A losing key goes to `droppedKeys`
  (working name). The initial caps are 2,048 characters per string, 16 KB
  per record, object depth 6 and `cause` depth 3. The contract has about 25
  fields, far below the 200 that CloudWatch Logs Insights discovers.

**Rule: high-cardinality ids belong on logs, never on metric labels.** This
extends the ADR-011 Cardinality note (`011:132-137`) from traces to logs.

### 4. Levels and the error rule

| Level | Meaning | Frigg examples |
|---|---|---|
| `TRACE` | Step detail. Off by default. | Requester backoff; Prisma `query` |
| `DEBUG` | Diagnostics, redacted payloads. | OAuth callback steps |
| `INFO` | Lifecycle facts. | Handler entry; status changed |
| `WARN` | Handled. The system continues. | SQS retry; `skipRecord`; inbound 4xx; config fallback |
| `ERROR` | The operation failed. | Unhandled 5xx; halt; DLQ |
| `FATAL` | The process cannot continue. | Invalid config at INIT |

**Log an error one time, at the boundary that decides its outcome.** Inner
layers throw and do not log. They wrap with `cause` only when the serializer
sanitizes the inner type, or else throw a fresh error (`oauth-2.js:378-396`).
Today one failed queue message writes its stack twice
(`backend-utils.js:276-279`, `Worker.js:64`).

- **Queue.** `Worker.run` is the boundary. A message that goes back to SQS
  logs `WARN` with `receiveCount`. The DLQ processor logs the `ERROR`.
- **Halt.** A halt discards the message with no retry, so it logs `ERROR`. A
  permanent outbound 4xx becomes a halt (`backend-utils.js:285-301`). An
  intentional discard logs `WARN`, the ADR-031 "plus a log line"
  (`031:164`; `backend-utils.js:193-228,266-274`).
- **Cause, not status.** A missing `ADMIN_API_KEY` is `ERROR`
  (`admin-auth.js:42-43`). Client 401s are `WARN`, not `console.error`
  (`admin-auth.js:54,63`, `health.js:78`). A failed health probe logs
  `WARN`, not `console.log` (`health.js:115,138`).
- **Metrics.** With ADR-011, the counter is the rate and the log is the
  occurrence.
- **One exception.** `Requester` writes one `DEBUG` record at the throw
  site: the method, the sanitized URL, the status and the header names.

### 5. Configuration

- **One new env var.** `FRIGG_LOG_LEVEL` (default `INFO`). A local run
  (`STAGE=local` or `IS_OFFLINE`) defaults to `DEBUG`, because
  `frigg start` uses `STAGE=dev` (`frigg-cli/index.js:109`).
- **Threshold.** The level is a minimum. The logger writes a record only
  when its level is the same or more severe, and drops it before it
  serializes anything. An unknown value means `INFO`, and the logger warns
  one time.

  | `FRIGG_LOG_LEVEL` | Writes |
  |---|---|
  | `TRACE` | All six levels |
  | `DEBUG` | `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL` |
  | `INFO` (default) | `INFO`, `WARN`, `ERROR`, `FATAL` |
  | `WARN` | `WARN`, `ERROR`, `FATAL` |
  | `ERROR` | `ERROR`, `FATAL` |
  | `FATAL` | `FATAL` |

- The logger reads it one time, at INIT, never from SSM, and ignores case.
  Add it to `FRAMEWORK_ENV_BLOCKLIST` (`offload-utils.js:35-72`).
- When `AWS_LAMBDA_LOG_LEVEL` is set, the less verbose level wins. The
  logger warns one time when the two differ.
- `EncryptionLogger` already reads `FRIGG_LOG_LEVEL` with the same level
  names (`encryption/logger.js:8-21`), and it becomes a child logger.
  `DEBUG_VERBOSE=1` means `DEBUG` until the shims go.
- **Prisma** uses event mode. `PRISMA_LOG_LEVEL` still selects the events
  (`prisma.js:100-102`). `query` is `TRACE` with no `params`, and `info` is
  `DEBUG`. `errorFormat` becomes `'colorless'`, with no ANSI codes
  (`prisma.js:103`).
- Delete the stale docs (`packages/core/README.md:111-113,1016-1017`,
  `packages/core/CLAUDE.md:663-664`, `environment-config.schema.json:302-309`,
  `phase2-integration-guide.md:280`) and the unused `PRISMA_QUERY_LOGGING`.

### 6. Redaction by construction (normative)

Redaction runs inside the logger for every record in every sink. Call sites
carry no redaction duty. The rules cover credentials, not personal data, so
use `DEBUG` in production only for a limited time.

**The logger MUST:**

1. Run one pipeline: normalize, serialize, drop keys, scrub strings, cap,
   write. A scrub runs before a cut, so a cut never hides a secret.
2. Send each `Error` at any depth to the error serializer. Reduce `URL`,
   `Headers` and `Buffer` to safe forms. Never call an unknown `toJSON`.
3. Serialize known shapes through allow-lists:
   - **Event summary**: method, route, status, query keys and header names;
     the `summarizeLambdaEvent` SQS fields; or only `source`. Never a body.
     It goes under `invocation`, so its `source` and `status` never reach the
     top level (§3 Reserved keys).
   - **Error**: `type`, `message`, `code`, `status`, `stack`, `cause`, and
     no own properties (`fetch-error.js:10,72`). The stack header comes from
     the sanitized message. `cause` and `AggregateError.errors` recurse,
     with a cycle guard.
   - **Prisma error**: `type`, `code` and the last paragraph of a validation
     message. The full message shows argument values.
   - **URL**: no userinfo, and each query value becomes `REDACTED`. This is
     stricter than the OTel `url.query` guidance.
   - **OAuth callback params**: no `code`, `code_verifier` or `state` value
     (`process-authorization-callback.js:30-31,74-93`).
4. Drop denylisted string values at any depth. A key is normalized: lower
   case, with no `-` or `_`. It matches when it is `hashword` or ends with
   `token`, `secret`, `password`, `apikey`, `privatekey`, `signature`,
   `authorization` or `cookie`. The encryption registry adds its leaf names
   (`encryption-schema-registry.js:17-40,133-153`). A `headers` object
   becomes its names (`api-key.js:15,29`). `code` and `data` stay.
5. Scrub each string, including `message`, `stack` and `cause`. A
   `scheme://` substring goes through the URL serializer. A JSON or
   `k=v&k=v` string is parsed and walked, or becomes `[unparsed:<len>]`.
   The patterns are Bearer and Basic credentials, JWTs, credentialed
   connection strings (`workers/db-migration.js:68-84`), `client_secret=`,
   `code=` and `signature=` pairs, and base64 runs of 40 or more characters.
   A match becomes `[REDACTED:<len>]`. Logger-owned fields are exempt. This
   supersedes `EncryptionLogger._sanitize` (`encryption/logger.js:29-38`).
6. Replace a subtree deeper than 6 with `[Depth]`. Over 16 KB, drop
   call-site fields first. Put a non-string message into `error` or `value`.
7. Drop `body`, `rawBody`, `payload` and `response` at `INFO` and above.
   The DLQ processor logs an unparsed body as its length and SHA-256
   (`dlq-processor.js:25,50`).

The ADR-034 exact list is necessary but not sufficient. In a probe of #643,
it leaked the `x-frigg-*` keys, cookies, the OAuth `code` and `id_token`.

**The framework MUST:**

8. Build the `FetchError` message from the method, the sanitized URL and the
   status, in every stage (`fetch-error.js:42-47,55`). `response` becomes
   non-enumerable, and `statusCode` stays (`oauth-2.js:428-443`).
9. Wrap a node-fetch error in a sanitized `FetchError` at the `Requester`
   boundary (`requester.js:386-390`).
10. Give `span.recordException` and `setStatus` the serialized error
    (`otel-telemetry.js:153-157`). Span URLs keep `_sanitizeUrl`
    (`requester.js:76-85`), which North Star matching reads.
11. Rethrow a sanitized surrogate after a boundary logs, because the Lambda
    runtime writes a rethrown error itself (`create-handler.js:238-239`).

### 7. Correlation scope

- **One ambient context.** Extend the telemetry store and change `run` to
  merge, not replace (`telemetry-context.js:16-20`). An inner `undefined`
  keeps the outer value, and an explicit `null` replaces it with `null`.
  The record omits `null` values.
- **Logger keys.** `requestId`, `method`, `route`, `messageId`, `processId`
  and the event summary live in a separate nested object of the store.
  `mergeTelemetryContext` and baggage skip it, so the semver-stable bus
  payload does not change.
- **Invocation scope.** One helper, `runInvocationScope` (working name),
  opens the scope and runs a bounded flush. `createHandler` opens it before
  `create-handler.js:148`. The DLQ processor uses it too. The provider
  adapters and the other raw handlers (two db-migration, four admin-scripts)
  adopt it incrementally (§13).
- **Message scope.** The SQS `records` array (`create-handler.js:99-120`)
  never enters the invocation scope. `Worker.run` and the DLQ processor open
  one scope per message (`Worker.js:27-66`). It reads the Frigg ids that the
  body carries, for example `processId` (`create-handler.js:105-109`).
- **Framework scopes only.** `instrumentHandler` merges the integration ids
  (`instrument-handler.js:73-83`). Developer code gets no scope API. It
  passes an id that it learns late as a call-site field, or binds it with
  `child()`. All records of one invocation share `requestId`, so a query
  joins them. No code mutates the store, because `Promise.all` branches
  share it.
- **Trace link.** Boundaries open no span, so their records have no
  `trace_id`. The handler and `Requester` spans get `requestId` and
  `messageId` attributes (`instrument-handler.js:35-39`).
- **Hops.** Correlation across SQS, EventBridge and webhook hops is a
  requirement. A send carries only the body (`Worker.js:84-96`,
  `queuer-util.js`). An ADR-011 follow-up decides the mechanism. Until then,
  senders log the returned `messageId`, and logs correlate by `processId`,
  `messageId` and `integrationId`.

### 8. Replace the debug buffer

- Remove the module-global raw-event buffer (`logs/logger.js:6-48`). Keep
  `debug`, `initDebugLog` and `flushDebugLog` as deprecated shims for one
  major version. No shim writes module-global state.
- `debug(...args)` takes the first string as the message. `initDebugLog`
  does nothing in a scope, which has the redacted summary. With no scope, it
  writes that summary as one `DEBUG` record. `flushDebugLog(err)` writes one
  `ERROR` record with the error and the summary.
- The express 5xx path (`app-handler-helpers.js:31-33`) and the
  `createHandler` catch (`create-handler.js:192-239`) log one time, at
  `ERROR` with the request summary. A handled `Module.testAuth` failure
  logs `WARN`.

### 9. Three channels, one vocabulary

- **Operational logs**: this ADR, to stdout.
- **Admin execution logs** (ADR-005, ADR-010): `AdminScriptContext.log`
  stores `data` verbatim with no cap (`admin-script-context.js:140-149`).
  It keeps persisting, through §6 and with a cap. Persisted and returned
  errors use the serializer (`script-runner.js:130-134,154-157`). Each entry
  mirrors to `frigg.admin.script` with `executionId`. Its `data` mirrors only
  at `DEBUG`.
- **User-facing messages**: the Integration message arrays MUST NOT hold raw
  error text (`integration-base.js:902-917` shows the pattern). `addError`
  (`:618-624`) and `delete-integration-for-user.js:100-110` break this
  today. Logs never replace these messages (PR #634).
- **Levels.** The admin log uses the six names. Other values become `INFO`.

### 10. Relationship to OpenTelemetry

This ADR amends ADR-011 for the logs signal. ADR-011 names one abstraction
(`011:34`) and OTel as the logs substrate (`011:29-30`). This ADR adds a
second port and keeps logs off the OTel SDK. The record is not the
"proprietary format" of `011:241`, because a collector converts it to OTLP:
the `telemetryapi` receiver and a `transform` processor. An optional OTLP
sink is one more destination sink (§11), in its own package. It maps the
record to an OTLP LogRecord and exports it in `send`, so it needs no Logs
API. It waits until the OTel JS logs SDK and exporter packages are stable.
The seven `[Frigg][telemetry]` and `[Frigg][usage]`
warns move to the logger. This is safe, because the logger never calls the
bus.

### 11. Log destinations (sinks)

The stdout sink stays the source of truth. Each destination connects
through a destination sink. Core owns the buffer, the flush and the failure
rules, so a destination supplies only the translation and the send.

```js
// A destination (illustrative, working names)
const datadog = {
    name: 'datadog',
    minLevel: 'WARN',
    translate: (record) => ({ ...record, status: record.level }),
    send: (batch, { signal }) =>
        fetch(DATADOG_INTAKE_URL, {
            method: 'POST',
            headers: { 'DD-API-KEY': process.env.DD_API_KEY },
            body: JSON.stringify(batch),
            signal,
        }),
};

// App definition
logging: { level: 'INFO', sinks: [datadog] },
```

- **Contract.** A destination supplies `name`, `minLevel`,
  `translate(record)` and `send(batch, { signal })`. Core does the rest.
- **Input.** `translate` gets the final record after the §6 pipeline:
  plain JSON data, deep-frozen. `JSON.stringify(record)` equals the stdout
  line. A sink never sees the raw call-site arguments. It adds only constant
  fields from its own config.
- **stdout stays on.** A destination sink never replaces the stdout sink.
  Only tests swap stdout for `memory`.
- **Level.** A sink `minLevel` is the same as or stricter than the
  effective level (§5). A missing `minLevel` means the effective level. The
  logger raises a less strict value to the effective level and warns one
  time. Case does not matter.
- **Buffer.** Core keeps one buffer for each sink in the process, not in
  the scope. It holds at most 1,000 records or 1 MB (working values). When
  it is full, core drops the new record and counts it. One flush of a sink
  runs at a time, and it sends every buffered record.
- **Flush.** `runInvocationScope` flushes in its `finally`. PR A moves
  `flushTelemetry` and `flushUsageRollup` there (`create-handler.js:240-247`).
  The usage rollup runs first, with no bound (`create-handler.js:26-58`).
  This reverses today's order, which flushes telemetry first
  (`create-handler.js:242-247`). Then telemetry and all sinks run in parallel
  against one deadline: `flushTimeoutMs` (`create-handler.js:139`), with
  `OTEL_FLUSH_TIMEOUT_MS` or 500 ms as its default (`:14-18`). The deadline
  never passes the remaining invocation time. With no destination sink, the
  flush adds no wait.
- **Deadline.** At the deadline, core aborts `send` through the
  `AbortSignal`, drops the unsent batch and counts it. It never retries the
  batch in a later invocation. A late rejection never becomes an unhandled
  rejection. stdout still has every record.
- **Why each invocation.** With no registered Lambda extension, the runtime
  gets no shutdown time, and core cannot require an extension. So a sink
  sends at the end of each invocation and needs no teardown. ADR-017 open
  question 3 (`017:114`) stays open for other extensions.
- **Failures.** A sink error never reaches the handler and never logs
  through the logger. Core writes one fixed stderr line,
  `frigg.logger.sink_failed`, with the sink name, the error `type` and
  `code`, and the drop count. It never writes the error message or the URL,
  because a URL path can hold a token. After 3 failed flushes in a row
  (working value), core disables the sink for the life of the process and
  writes `frigg.logger.sink_disabled`.
- **No logging code in a sink.** `send` uses its own HTTP client, never
  `Requester` or other core code that logs.
- **Translation.** The sink sets vendor keys that the logger never emits,
  for example Datadog `status` and `service`, or GCP `severity` (§3
  reserved keys).
- **Credentials.** A sink reads its credential from `process.env` at send
  time, never at module load and never as a literal in `logging.sinks`.
  Devtools also loads the app definition at build time. The deploy supplies
  the value through SSM offload (ADR-027) or Secrets Manager. ADR-038 and
  ADR-039 can replace this source when they are accepted.
- **Registration.** `appDefinition.logging.sinks` copies the declaration
  shape of `telemetry.subscribers`: an array, validated like
  `resolveSubscribers` (`telemetry-config.js:70-88`). It does not use the
  bus. `loadAppDefinition` must return `logging`, which it drops today
  (`app-definition-loader.js:33-62`). `runInvocationScope`, not the logger,
  reads the list one time for each cold start and registers it (§1 leaf
  rule), so the raw handlers get sinks too. Core skips a sink with a
  duplicate name or a missing member, and warns one time.
- **Before registration.** A record written before the first scope opens,
  INIT records included, goes to stdout only. So an alert on an INIT
  `FATAL` reads the stdout log group.
- **ADR-017.** Core extensions do not exist in code yet: core loads only
  integration extensions (`integration-base.js:720`). This ADR proposes an
  optional `logSink` member for the ADR-017 extension contract
  (`017:58-75`). When ADR-017 ships, core adds each `logSink` to the same
  list.
- **On AWS, prefer out-of-process shipping.** By default, Lambda sends
  stdout to CloudWatch Logs. It can also deliver logs to Amazon S3 or Amazon
  Data Firehose. Out-of-process shipping keeps the send, the credential and
  its failures out of the invocation. The central guide
  (`docs/guides/LOGGING.md`, §13) recommends these first: Firehose delivery,
  a subscription filter, a vendor Lambda extension or an OTel collector
  layer. Devtools v1 adds none of them. An in-process sink in a VPC needs an
  egress path.
- **Timing.** PR A builds the internal sink interface that the stdout and
  `memory` sinks use. The destination contract, the public `logging.sinks`
  registration and its schema entry ship with the first real destination.
  A real sink then tests the contract before it becomes public.

### 12. Deployment (devtools, opt-in)

The provider adapter owns the AWS settings (ADR-028). An absent
`appDefinition.logging` changes nothing.

- `level` sets `FRIGG_LOG_LEVEL` and `provider.logs.lambda`: `logFormat:
  'JSON'`, the upper-case `applicationLogLevel`, and `systemLogLevel:
  'INFO'`. Devtools emits the env var only when it is not the default,
  because `FRIGG_*` stays global (`027:130`).
- Until the Phase 0 checks pass (Open question 3), devtools emits no
  `provider.logs.lambda` and no `frameworkVersion` floor: Lambda stays on
  `Text` and `FRIGG_LOG_LEVEL` filters in process. One constant in
  `logging-config.js` turns the block on.
- `retentionInDays` sets `provider.logRetentionInDays`.
- Raise the `osls` floor from `^3.40.1` to `>=3.58.0`, the first version with
  `LoggingConfig` (`packages/devtools/package.json:64`,
  `frigg-cli/package.json:29`). A function-level `logs` replaces the
  provider block (osls `compile/functions.js:655-657`).
- `frigg init` sets `logging: { level: 'info', retentionInDays: 30 }` for
  new apps. The template is not in this repo (`backend-first-handler.js:18`).
- In `app-definition.schema.json:622-640`, add `fatal` and
  `retentionInDays`, and accept any case. Restrict `format` to `json`, so a
  definition that sets `format: 'json'` stays valid. The schema also lacks
  `telemetry` (`:676`).

### 13. Sequencing

| PR | Content |
|---|---|
| 0: spike | The Open question 3 checks. On a failure, keep the Lambda `Text` log format. |
| A: foundation | Port, internal sink interface, pipeline, config, scope, shims, §6 items 8-11 with the fix for the `init.body` mutation (`fetch-error.js:16-19`), guards, and the central guide `docs/guides/LOGGING.md` (field reference, levels, query cookbook, destination options) |
| B: security call sites | 5xx, `createHandler` catch, `testAuth`, `oauth-2`, `hashword`, websocket body, messages, DLQ body as length and SHA-256 |
| Devtools | Opt-in block, osls floor, schema. After PR A, because JSON at `INFO` drops the `console.debug` replay. |
| Incremental | Not scheduled. New code uses the logger. Existing call sites (queue, use cases, routers, scheduler, db-migration, telemetry, `EncryptionLogger`, Prisma, admin-scripts, raw handlers) move when someone changes them. |
| First destination | When needed: the destination contract, the public `logging.sinks` registration, its schema entry and the first destination package (§11) |

The #643 redaction becomes the shim summary, and ADR-034 security
requirement 4 points here. #540 is superseded: its OAuth-callback steps
become redacted `DEBUG` records. PR A does not wait for the stale draft #549.
File the api-module-library leaks there (`next` @48ea8647):
`stripe/api.js:52` (refresh token), `deel/definition.js:15` (OAuth code) and
`frontify/api.js:250` (raw response).

### 14. Enforcement

Deterministic checks, in the style of ADR-043 §5 (open PR #646):

- **Lint.** `no-console: error` in `packages/core/logs/.eslintrc.json`,
  with an override for the stdout sink file. Ban `process.stdout.write`
  there, outside the stdout sink. The rest of core and admin-scripts keep
  the shared `warn` (`packages/eslint-config/index.js:33`), because
  adoption is incremental (§13).
- **Lint in CI.** The Linter step runs only when Tests pass
  (`frigg-ci.js.yml:58-65`). Tests on `next` fail today, so lint does not
  run. A lint step that runs when Tests fail is a separate change.
- **Redaction suite.** Fixtures include a `Requester` `FetchError` with
  `?api_key=` and `Authorization`, and an HTTP API v2 event with
  `x-frigg-api-key`, cookies and an OAuth `code`. They also cover each other
  §6 vector, from node-fetch errors to cause chains. Each goes through
  every sink, span events and the admin store. No 8-character window of a
  secret appears, and the sanitized record exists
  (`parameters-to-env.test.js:412-420`).
- **Guards.** The logger loads no `@opentelemetry`, telemetry or
  third-party module, and `packages/core/index.js` loads no `@opentelemetry`
  module (extend `telemetry-service.test.js:6-21`). Required fields exist,
  and call sites cannot replace context fields. A `frigg.*` `WARN` with no
  `eventName` fails. Nested scopes keep usage attribution.
- **Sinks.** A test sink gets only redacted, deep-frozen records. A sink
  that throws, hangs or rejects late does not change the handler result,
  pass the deadline or cause an unhandled rejection. A sink that always
  fails keeps a bounded buffer and is disabled after 3 flushes. A failing
  sink with a token in its URL path writes no token to stderr.

## Usage examples

The examples use the working names of §1. They show daily use and add no
rules.

### Integration code

```js
async processContactBatch({ data }) {
    this.logger.info('Contact batch started', {
        eventName: 'integration.hubspot.batch_started',
        batchSize: data.contacts.length,
    });
    for (const contact of data.contacts) {
        try {
            await this.target.api.upsertContact(contact);
        } catch (error) {
            this.logger.warn('Contact skipped', {
                eventName: 'integration.hubspot.contact_skipped',
                externalId: contact.id,
                error,
            });
        }
    }
}
```

The call site writes no ids. The scopes of §7 add them. The logger writes
the `WARN` record on one line. Here it is on several lines:

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
  "processId": "66f1c2a9b8e7d6c5b4a3f2e1",
  "integrationId": "66f1c2a9b8e7d6c5b4a3f201",
  "integrationType": "hubspot",
  "userId": "66f1c2a9b8e7d6c5b4a3f0aa",
  "version": "1.2.0",
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

`hapikey` is a query key, so its value is `REDACTED` (§6 item 3).

### The error rule

```js
// Wrong: the boundary logs the same error again
} catch (error) {
    this.logger.error('Sync failed', { error });
    throw error;
}

// Right: the boundary writes one record. FetchError is a safe cause (§4).
} catch (error) {
    throw new Error('Contact sync failed', { cause: error });
}
```

### API module code

```js
async listDeals(params) {
    const res = await this._get({ url: this.URLs.deals, query: params });
    this.logger.debug('Deals page fetched', {
        count: res.results.length,
        hasMore: Boolean(res.paging?.next),
    });
    return res;
}
```

### Framework code in core

```js
class CreateSyncProcessUseCase {
    constructor({ processRepository, logger = getLogger('frigg.core.sync') }) {
        this.processRepository = processRepository;
        this.logger = logger;
    }

    async execute({ integrationId }) {
        const process = await this.processRepository.create({ integrationId });
        const log = this.logger.child({ processId: process.id });
        log.info('Sync process created', {
            eventName: 'frigg.core.sync.process_created',
        });
        return process;
    }
}
```

Only core code calls `getLogger`. The name sets the `logger` field and the
`eventName` prefix (§3). In integrations and API modules, `this.logger`
already has its name. The id that the code learns late goes on through
`child()` (§7).

### Debug detail that costs time to build

```js
if (this.logger.isLevelEnabled('debug')) {
    this.logger.debug('Mapping built', { fields: Object.keys(mapped) });
}
```

### Tests

```js
const sink = createMemorySink(); // working name, replaced at test reset
await integration.processContactBatch({ data });
expect(sink.records).toContainEqual(expect.objectContaining({
    level: 'WARN',
    eventName: 'integration.hubspot.contact_skipped',
}));
```

### Reading logs

On a local run, the level is `DEBUG` (§5). `fromjson?` skips the CLI lines
that are not JSON:

```bash
frigg start | jq -R 'fromjson? | select(.level == "ERROR")'
```

In CloudWatch Logs Insights, the fields need no parse step:

```
fields @timestamp, level, message, eventName, error.message
| filter integrationId = "66f1c2a9b8e7d6c5b4a3f201"
| filter level in ["WARN", "ERROR"]
| sort @timestamp desc
```

### Habits that change

| Today | With this ADR |
|---|---|
| `console.log(...)` | A lint error in runtime packages (§14) |
| Ids inside the message text | Ids as fields. The message stays fixed, so a query groups it |
| Payloads at `INFO` | The logger drops `body`, `payload` and `response` (§6 item 7). Log counts or keys |
| Log, then rethrow | Throw with `cause`. The boundary logs one time (§4) |
| Log a token and trust redaction | Redaction is a backstop, not a permission |

## Consequences

### Positive

- Framework records in every Frigg app have one shape, and one central
  guide (`docs/guides/LOGGING.md`) describes them. A person who debugs or
  monitors a Frigg app does not need the conventions of each repo.
- Records link to database objects by id (`integrationId`, `processId`,
  `entityId`, `credentialId`, `executionId`). A tool can trace a record to
  its rows.
- After the first destination ships, a new destination is one sink that
  translates and sends the record, with no core change.
- One record shape for all code that logs through the port. Logs Insights
  finds top-level fields with no parse step.
- Records through the logger and span exception events carry no secret.
- An operator can follow one invocation or one message across its records
  by `requestId`, `messageId`, `processId` and `integrationId`.
- Level filtering works in the process on every provider, with no new
  dependency.
- New apps get a log retention period. Existing apps can set one.

### Negative

These upgrade changes are exceptions to the ADR-027 bar. A maintainer ratifies
the whole list before PR A merges, as for ADR-031 (`031:237-240`):

| Change on upgrade | Switch |
|---|---|
| JSON lines replace text | None |
| `FetchError` loses the query and dev detail | None (security) |
| `debug()` stops the replay on error | `FRIGG_LOG_LEVEL=DEBUG` |
| A halt logs `ERROR`, not `WARN` (`create-handler.js:225`) | None |
| Admin logs persist redacted (`005:68`) | None (security) |
| The Prisma error text changes (`prisma.js:103`) | None |
| `FRIGG_LOG_LEVEL=DEBUG` now applies to all of core | Set `INFO` |
| An existing `appDefinition.logging` block takes effect (`LoggingConfig`, retention) | Remove the block |
| `createHandler` rethrows a sanitized surrogate (name, message, `statusCode`, `code`), so `instanceof`, custom properties and `cause` are gone | None (security) |
| `FetchError` messages drop `statusText` (`METHOD url status`) | Read `error.response.statusText` |
| A nested `withContext` merges: an inner `undefined` id keeps the outer value in the bus payload (§7) | Pass `null` to clear an id |
| `IntegrationBase.addError()` stores a fixed message with the integration id, not the caller's error text | Read the `integration.<name>.error_recorded` record |
| `DeleteIntegrationForUser` stores a fixed message and throws a new `Error` with the old one as `cause` | Read `error.cause` |
| The OAuth2 "Token refresh failed" line moves from `console.error` to `DEBUG` | `FRIGG_LOG_LEVEL=DEBUG` |
| `appDefinition.logging.format` accepts only `json` in the schema | Remove `format` |
| `database/config.js` no longer exports the unused `PRISMA_QUERY_LOGGING` | None |

- Local runs also write JSON. A developer reads raw lines or pipes them to
  a JSON viewer, for example `jq`.
- No format restores today's text. A call site that moves to the logger
  changes its output, and its tests change with it
  (`integration-base-receive-notification.test.js:131-133`).
- Adoption is incremental, so log groups mix text and JSON with no end
  date. The text lines carry no correlation ids and skip redaction.
  API-module calls, adopter code and libraries bypass the logger.
- Deployed `dev` loses the raw dumps. JSON adds bytes. `writeSync` blocks,
  and it drops a record after the retries.
- Frigg owns redaction code with edge cases (cycles, `BigInt`, getters).
- An in-process sink adds up to the flush deadline to each invocation,
  drops the records that it cannot send in time, and can send personal data
  from `DEBUG` records to a third party.
- `DEBUG` in production can store personal data with no expiry.
- An id that code learns late, for example a new `processId`, is only on
  the records that name it. A query joins the others by `requestId`.
- Boundary records have no trace ids. A null inner id can change usage
  attribution (`usage-rollup-subscriber.js:59-63`).
- The casing is mixed: `trace_id` next to camelCase Frigg fields.

### Neutral

- ADR-011's "superseding ad-hoc console logging" (`011:230`) gets a
  mechanism.

## Alternatives Considered

- **pino as the default engine.** Rejected. It adds 13 packages and about
  38 ms of local require time, and it writes async. Its case-sensitive,
  one-level redaction needs a wrapper. The port allows a pino adapter later.
- **AWS Powertools, winston or bunyan.** Rejected. Powertools has no OTel ids
  and no redaction, and it leaked axios headers in a probe. Winston is the
  heaviest option. Bunyan has had no release since 2021.
- **The OTel Logs SDK now.** Rejected. It is 0.x "Development", with
  breaking changes in 2026.
- **Logs on `TelemetryService` or the event bus.** Rejected. The bus is
  semver-stable and synchronous (`telemetry-event-bus.js:7-21`), and
  telemetry logs its own failures, so the path can recurse.
- **A logger plugin type (ADR-016).** Rejected. The default needs no package.
  A destination is optional, so under ADR-015 it is an extension, not a
  plugin. Until ADR-017 ships, it registers as a sink (§11).
- **Destinations as ADR-017 hooks.** Rejected. ADR-017 hooks are async
  handlers on named runtime events (`017:66-69`), not a channel for each
  record. A hook for each record adds an await to every record and can
  recurse through code that logs.
- **`console.*` with objects on the RIC.** Rejected. The RIC nests fields
  under `message`, and it works only on AWS.
- **A second, human-readable format.** Rejected. One format keeps one
  contract and one test surface. Lambda filters levels only on JSON lines.
  A JSON viewer serves local reading.
- **Keep text with bracket prefixes.** Rejected. 60% of calls have no
  prefix, and Logs Insights finds no fields in text.
- **CloudWatch data protection only.** Rejected. It works only on AWS and
  costs money.
- **Keep the debug buffer.** Rejected. It holds raw events with no bound.
- **A redaction duty per call site.** Rejected. One miss in about 338 sites
  leaks. #540 drifted from header values to a prefix to names.
- **A separate logger ALS.** Rejected. It adds a second context to sync.
- **A public scope API (`withLogContext(fields, fn)`).** Rejected. It wraps
  the rest of a function in a callback. Framework scopes already carry the
  ids, and `requestId` joins the rest. An in-place setter is not safe:
  `Promise.all` branches share the store.

## Open questions

1. **Which mechanism carries correlation across a hop?** Lean: `traceparent`
   and `requestId` in SQS `MessageAttributes`, in an ADR-011 follow-up.
2. **A per-invocation `DEBUG` buffer, flushed on error?** Lean: not in v1.
3. **What must a dev stack prove before the logger ships?** Lean: fd 1
   writes survive the freeze and keep their order next to RIC lines. A
   16 KB line stays one event. JSON mode passes and filters direct lines.
   Managed Instances capture fd 1 with no interleaving. Also measure pino
   INIT cost if someone proposes a pino adapter. Under ADR-043, this ADR
   merges as `Accepted`, and PR A owns these checks.
4. **Per-logger levels (`FRIGG_LOG_LEVELS`, working name)?** Lean: not now.

## Related

- [ADR-011](./011-integration-telemetry-and-usage-tracking.md): amended.
- [ADR-027](./027-ssm-parameter-offload-and-env-scoping.md): the upgrade bar.
- [ADR-005](./005-admin-script-runner.md): the admin execution log.
- [ADR-010](./010-reporting-as-admin-operation.md): admin-store isolation.
- [ADR-012](./012-database-schema-migrations.md): "credential-safe" logs.
- [ADR-014](./014-consolidate-adr-register.md): the filing rules.
- [ADR-016](./016-plugins.md): a sink is not a plugin type (Alternatives).
- [ADR-017](./017-core-extensions.md): amended. An extension can export
  `logSink`, which joins the §11 sink list.
- [ADR-018](./018-integration-extensions.md): the shadowed-handler warn.
- [ADR-031](./031-concurrent-oauth-credential-refresh.md): the ack log line.
- [ADR-042](./042-in-process-single-flight-token-refresh.md): ALS precedent.
- Open PR #644: ADR-028 and ADR-029 (provider adapter), ADR-038 and ADR-039
  (secrets, sink credentials).
- Open PRs #641, #644: ADR-032 Integration Deletion (the message arrays).
- Open PRs #643, #644: ADR-034 API-Key Login (the denylist floor).
- Open PR #646: ADR-043 ADR Lifecycle — One Register, No RFC Tier (§14).
- Open PR #648: ADR-044 and ADR-047 (retry, halt, `skipRecord` levels).
- Key code: `packages/core/logs/logger.js`,
  `packages/core/core/create-handler.js`, `packages/core/core/Worker.js`,
  `packages/core/telemetry/telemetry-context.js`,
  `packages/core/errors/fetch-error.js`.
- Raw handlers: `dlq-processor.js:35`, `workers/db-migration.js:143`,
  `routers/db-migration.js:326`, `admin-script-router.js:403`,
  `report-router.js:419`, `script-executor-handler.js:176`,
  `report-executor-handler.js:183`.
- Tests: `telemetry-service.test.js`, `parameters-to-env.test.js:412-420`,
  `requester.telemetry.test.js:64-77`, `logs/logger.test.js`.
- Numbering note: #644 and its source PRs claim 028, 029 and 032–041, #646
  claims 043, and #648 claims 044–047. No branch has an ADR at 048 or
  higher. 048 is the first free integer.
