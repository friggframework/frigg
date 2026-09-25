# Logging in an Integration

This guide shows how to log from integration code and API modules with the
Frigg logger (ADR-048). The reference for the record format, redaction,
levels and deployment is [Logging](./LOGGING.md). This guide is the "how do I
use it" part.

## The rules in short

1. Use `this.logger`. Never use `console.*` in new code.
2. The message is fixed text. Ids, counts and names go into fields.
3. Give each record an `eventName`: `integration.<name>.<action>`.
4. Pass an error as `{ error }`. Log an error one time, where you handle it.
   If you rethrow, do not log: the framework logs it at the boundary.
5. Do not log tokens, bodies or personal data. Log keys, counts and lengths.

## Where the logger comes from

| Code | Logger | Name | Ids on every record |
|---|---|---|---|
| Integration class (extends `IntegrationBase`) | `this.logger` | `integration.<Definition.name>` | `integrationId`, `integrationType`, `userId`, `version` |
| API module `Api` class (extends `OAuth2Requester`, `ApiKeyRequester`, …) | `this.logger` | `module.<moduleName>` | `entityId`, `credentialId` |
| Other files in your app (helpers, mappers, use cases) | `getLogger(name)` | the name you give | only the scope ids (see the next table) |

```js
const { getLogger } = require('@friggframework/core');

// One logger per file, at module scope. getLogger returns the same
// instance for the same name, and a module-scope logger keeps working
// after test resets.
const log = getLogger('integration.hubspot.mapper');
```

You never pass the ids yourself. The integration logger reads them for each
record, so a logger that you use before the integration is hydrated still
gets the ids after hydration.

### Ids that the framework adds

The framework opens a scope around each entry point. Every record written
inside the scope gets these fields, from any logger:

| Entry point | Fields from the scope |
|---|---|
| HTTP route, user action, form, OAuth callback (`createHandler`) | `requestId`, `handlerName`, `method`, `route`, `invocation` |
| Webhook receipt (`createHandler`) | same as HTTP |
| Queue job (`Worker`, `QUEUE` events) | `requestId`, plus `messageId`, `receiveCount`, `processId`, `integrationId`, `integrationEvent` from the message |
| Integration event (`this.send(event)`: `USER_ACTION`, `CRON`, `QUEUE`, `WEBHOOK`) | `integrationEvent` |
| Inside a telemetry span (`this.telemetry.span(...)`) | `trace_id`, `span_id`, `trace_flags` |

So a query by `requestId` finds every record of one invocation, and a query
by `processId` finds every record of one sync across queue messages.

## Writing a record

```js
async processContactBatch({ data }) {
    this.logger.info('Contact batch started', {
        eventName: 'integration.hubspot.batch_started',
        batchSize: data.contacts.length,
    });
    // ...
}
```

On stdout this is one JSON line (shown here on several lines):

```json
{
  "timestamp": "2026-09-24T14:07:37.123Z",
  "level": "INFO",
  "message": "Contact batch started",
  "logger": "integration.hubspot",
  "appName": "acme-integrations",
  "stage": "prod",
  "requestId": "8f1c2d3e-4b5a-4c6d-9e8f-0a1b2c3d4e5f",
  "messageId": "2e9d7c61-5b4a-4f3e-8d2c-1b0a9f8e7d6c",
  "processId": "66f1c2a9b8e7d6c5b4a3f301",
  "integrationId": "66f1c2a9b8e7d6c5b4a3f201",
  "integrationType": "hubspot",
  "integrationEvent": "PROCESS_BATCH",
  "eventName": "integration.hubspot.batch_started",
  "batchSize": 100
}
```

### The message

Keep the message fixed, so a query can group all records of one kind.

```js
// Wrong: a new message for each contact, and the id is not a field
this.logger.warn(`Contact ${contact.id} skipped: ${error.message}`);

// Right
this.logger.warn('Contact skipped', {
    eventName: 'integration.hubspot.contact_skipped',
    externalId: contact.id,
    error,
});
```

### `eventName`

- Use `integration.<name>.<action>` in integration code and
  `module.<name>.<action>` in an API module. `<action>` is snake_case and
  says what happened: `batch_started`, `contact_skipped`, `webhook_ignored`.
- The prefix is the logger name, so you can write
  `` `${this.logger.name}.contact_skipped` ``.
- Give an `eventName` to every `WARN` and above, and to each lifecycle
  `INFO` that somebody will query or alert on.
- An `eventName` is part of your contract with the people who run the
  integration. Do not rename it without a reason: alerts and dashboards use
  it.

### Fields

- Fields go at the top level of the record, next to the framework fields.
- Use camelCase, as the framework does.
- Values can be strings, numbers, booleans, arrays and plain objects. The
  logger also handles `Error`, `Date`, `URL`, `Headers`, `Buffer`, `Map` and
  `Set`.
- Some keys are reserved. The logger removes them from the top level and
  lists them in `droppedKeys`: `status`, `type`, `source`, `service`, `env`,
  `host`, `time`, `record`, `severity`, `tenantId`, `errorType`,
  `errorMessage`, `stackTrace`. Use `statusCode` for an HTTP status and
  `recordType` for a type.
- A field with the same name as a scope or binding field loses. For example,
  a call-site `integrationId` is dropped, because the logger already has it.
  Do not pass ids that the logger adds.
- `body`, `rawBody`, `payload` and `response` are dropped at `INFO` and above.
  Log `Object.keys(body)` or `body.length` instead.

## Choosing the level

| Level | Use it when | Integration examples |
|---|---|---|
| `TRACE` | Step-by-step detail. Off everywhere by default. | Each page of a paginated fetch |
| `DEBUG` | Detail that helps you fix a problem. Off in production. | The field keys of a mapped record; which branch a webhook took |
| `INFO` | A lifecycle fact that somebody wants to see in production. | Sync started or finished with counts; webhook subscription renewed |
| `WARN` | Something went wrong, you handled it, and the work continues. | One contact skipped; a rate limit hit and retried; a webhook for an unknown object ignored |
| `ERROR` | The operation failed and you do not rethrow. | A batch failed and you mark the process as failed yourself |
| `FATAL` | The process cannot continue. You almost never need it in an integration. | — |

`INFO` in production costs money for each line. Log one record per batch or
per sync, not one per item. Log per item at `DEBUG`, or only the items that
fail (`WARN`).

## Errors

**Log an error one time, at the place that decides what happens next.**

- **You handle the error and continue:** log it (`WARN`, or `ERROR` if the
  operation failed) with `{ error }`, and do not rethrow.
- **You cannot handle it:** do not log. Throw, and add context with `cause`.
  `createHandler`, the express error middleware, `Worker` and the DLQ
  processor log the error one time, with all the ids.

```js
// Handle and continue: log
for (const contact of data.contacts) {
    try {
        await this.hubspot.api.upsertContact(contact);
    } catch (error) {
        this.logger.warn('Contact skipped', {
            eventName: 'integration.hubspot.contact_skipped',
            externalId: contact.id,
            error,
        });
    }
}

// Cannot handle: throw with cause, no log
try {
    await this.hubspot.api.createWebhook(subscription);
} catch (error) {
    throw new Error('Webhook subscription failed', { cause: error });
}
```

- Put the error in the `error` field. `this.logger.error('Sync failed',
  error)` also works (the logger moves it to `error`), but `{ error }` is the
  standard form.
- The logger writes the error as `{ type, message, code, status, stack,
  cause }`, redacted. The `cause` chain is kept to 3 levels. Other own
  properties of the error (for example axios `config`, `request`,
  `response`) are not written, because they often hold tokens.
- A `FetchError` from an API module already has a safe message:
  `GET https://api.hubapi.com/crm/v3/objects/contacts?limit=REDACTED 429`.
  Read the status with `error.statusCode` and the body with `error.body`
  (both are still there, but not written to the log).
- In a queue job, an error you throw makes the message return to SQS. The
  `Worker` logs `frigg.worker.record_failed` at `WARN` for each retry. After
  the last retry, the DLQ processor logs `frigg.queue.dlq.message_failed` at
  `ERROR`. A `HaltError` stops the retries and logs
  `frigg.worker.record_halted` at `ERROR`.

## Ids that you learn later

The scope has the ids that exist when the entry point starts. For an id that
you learn during the work, for example a new `processId`, use `child()` or a
field.

```js
async startSync() {
    const syncProcess = await this.processCommands.createProcess({
        userId: this.userId,
        integrationId: this.id,
        name: 'hubspot-contact-sync',
        type: 'CRM_SYNC',
    });
    const log = this.logger.child({ processId: syncProcess.id });

    log.info('Sync started', { eventName: 'integration.hubspot.sync_started' });
    // ... every record from `log` now carries processId
}
```

- `child(bindings)` copies the values at the time of the call.
- `child(() => bindings)` reads them again for each record. Use it when the
  value can change: `this.logger.child(() => ({ cursor: this.cursor }))`.
- Queue messages that you send later carry the `processId` in the body, so
  the records of those jobs get it from the message scope.

## Secrets, payloads and personal data

The logger redacts every record. It removes the values of keys such as
`access_token`, `password`, `apiKey`, `authorization`, `cookie`, `signature`
and your module's `credentialFields`. It keeps only the names of headers,
replaces URL query values with `REDACTED` and scrubs Bearer tokens, JWTs,
connection strings and long key-shaped strings in text.

Redaction is a safety net, not a permission:

- **Do not log a token and trust the logger.** A token in an unusual shape,
  for example a short key in plain text, can pass.
- **Personal data is not redacted.** Email addresses, names and phone numbers
  are written as they are. Log an external id, not the person.
- **Log the shape of a payload, not the payload.**

```js
// Wrong
this.logger.debug('Webhook received', { body: event.body });

// Right
this.logger.debug('Webhook received', {
    eventName: 'integration.hubspot.webhook_received',
    objectType: payload.objectType,
    eventCount: payload.events.length,
    dataKeys: Object.keys(payload),
});
```

## Detail that costs time to build

The logger drops a record below the level before it reads any field. When the
fields cost time to build, check the level first:

```js
if (this.logger.isLevelEnabled('debug')) {
    this.logger.debug('Mapping built', {
        eventName: 'integration.hubspot.mapping_built',
        fieldCount: Object.keys(mapped).length,
        unmappedFields: findUnmapped(source, mapped),
    });
}
```

## API modules

In an API module, the `Api` class has `this.logger` from `Requester`. When
the module runs inside an integration, the records carry `entityId` and
`credentialId`.

```js
class Api extends OAuth2Requester {
    async listContacts({ after } = {}) {
        const response = await this._get({
            url: `${this.baseUrl}/crm/v3/objects/contacts`,
            query: { after, limit: 100 },
        });
        this.logger.debug('Contacts page fetched', {
            eventName: 'module.hubspot.contacts_page_fetched',
            count: response.results.length,
            hasMore: Boolean(response.paging?.next),
        });
        return response;
    }
}
```

The `Requester` already logs:

- a failed request at `DEBUG` (`module.<name>.request_failed`, with the
  method, the redacted URL, `statusCode` and header names), and
- token refresh steps at `DEBUG` and a completed refresh at `INFO`.

Do not log these again. A failed request throws a `FetchError`; handle or
rethrow it as the Errors section says.

## Setting the level

The default is `INFO` in a deployed stage and `DEBUG` in a local run.

Set the level per app in the app definition:

```js
const appDefinition = {
    name: 'acme-integrations',
    logging: { level: 'info', retentionInDays: 30 },
    integrations: [HubSpotIntegration],
};
```

- `level` sets `FRIGG_LOG_LEVEL` on every deployed function when it is not
  `info`.
- `retentionInDays` sets how long CloudWatch keeps the logs. Without it, log
  groups never expire, so set it in every app.
- To debug a deployed stage, change `FRIGG_LOG_LEVEL` on the function in the
  Lambda console (the next deploy sets it back), or deploy with a different
  `logging.level`. `DEBUG` in production can hold more data than you want to
  keep.

### Locally, with `frigg start`

| You set | Local handlers log at |
|---|---|
| Nothing | `DEBUG` (the local default) |
| `logging.level` in the app definition | that level, `info` included |
| `FRIGG_LOG_LEVEL` in the shell or in `.env` | that level; it wins over `logging.level` |

```bash
FRIGG_LOG_LEVEL=warn frigg start
```

serverless-offline passes only `AWS_*` shell variables to handlers, so
`frigg start` puts the shell `FRIGG_LOG_LEVEL` into the function
environment for you. This happens only for the local run: a deploy never
reads `FRIGG_LOG_LEVEL` from the shell.

Details: [Deployment: the `logging` block](./LOGGING.md#deployment-the-logging-block).

## Reading the logs

Locally, the output is JSON. Pipe it to `jq`:

```bash
frigg start | jq -R 'fromjson? | select(.logger | startswith("integration.")) | {level, message, eventName, integrationId}'
```

With `osls offline`, handlers run in worker threads, and lines can mix. Use
`--useInProcess` when you pipe the output.

In CloudWatch Logs Insights:

```
# Everything for one integration in the last hour
fields @timestamp, level, message, eventName
| filter integrationId = "66f1c2a9b8e7d6c5b4a3f201"
| sort @timestamp asc

# Skipped contacts per integration
filter eventName = "integration.hubspot.contact_skipped"
| stats count() by integrationId

# One sync across all its queue messages
fields @timestamp, level, message, messageId, receiveCount
| filter processId = "66f1c2a9b8e7d6c5b4a3f301"
| sort @timestamp asc
```

More queries: [Reading logs](./LOGGING.md#reading-logs).

## Testing

Assert on log records, not on console spies.

### Setup

Add the Frigg setup file to your Jest config:

```js
// jest.config.js
module.exports = {
    setupFilesAfterEnv: ['@friggframework/core/logs/jest-logger-setup.js'],
};
```

Before each test, it installs a memory sink and sets the level to `TRACE`, so
no JSON reaches the test output. It also registers the
`toContainNoSecretWindow` matcher.

### Asserting a record

```js
const { createMemorySink } = require('@friggframework/core');

describe('processContactBatch', () => {
    let sink;

    beforeEach(() => {
        sink = createMemorySink();
    });

    it('logs a skipped contact and continues', async () => {
        integration.hubspot.api.upsertContact = jest
            .fn()
            .mockRejectedValueOnce(new Error('Invalid email'))
            .mockResolvedValue({});

        await integration.processContactBatch({
            data: { contacts: [{ id: '901' }, { id: '902' }] },
        });

        expect(sink.records).toContainEqual(
            expect.objectContaining({
                level: 'WARN',
                eventName: 'integration.hubspot.contact_skipped',
                externalId: '901',
            })
        );
        expect(integration.hubspot.api.upsertContact).toHaveBeenCalledTimes(2);
    });
});
```

- `createMemorySink()` replaces the sinks until the next reset. The records
  are frozen plain objects, the same as the stdout line.
- Assert by `eventName`, not by message text.
- To prove that a token does not leak, use a fake secret of 16 characters or
  more and check every record:

```js
const fakeToken = 'ZqB7kTestOnlyToken4Hn2Kd8Ws';
// ... run the code with fakeToken in the credential or the error
expect(sink.records).toContainNoSecretWindow([fakeToken]);
```

## Moving existing integration code to the logger

Existing `console.*` calls keep working. Move them when you change the code
around them:

1. Replace `console.log/info/warn/error` with `this.logger.<level>`. Choose the
   level from the table above, not from the old console method.
2. Make the message fixed text, and move the values into fields.
3. Add an `eventName`.
4. Replace `console.error('...', error)` followed by `throw error` with only
   the throw (add `cause` for context).
5. Replace `debug(...)`, `initDebugLog(...)` and `flushDebugLog(...)` with
   `this.logger.debug(...)`, nothing, and a throw or one boundary log.
6. In the tests, replace the console spy with a memory sink.

```js
// Before
console.log(`[HubSpot] synced ${count} contacts for ${this.id}`);

// After
this.logger.info('Contacts synced', {
    eventName: 'integration.hubspot.contacts_synced',
    count,
});
```

## A complete example

A contact sync that fans out to queue jobs:

```js
const {
    IntegrationBase,
    QueuerUtil,
    createProcessCommands,
    getLogger,
} = require('@friggframework/core');

const mapperLog = getLogger('integration.hubspot.mapper');

function toTargetContact(contact) {
    if (!contact.properties?.email) {
        mapperLog.debug('Contact has no email', {
            eventName: 'integration.hubspot.contact_without_email',
            externalId: contact.id,
        });
    }
    return { externalId: contact.id, email: contact.properties?.email };
}

class HubSpotIntegration extends IntegrationBase {
    static Definition = {
        name: 'hubspot',
        version: '1.0.0',
        modules: { hubspot: 'hubspot', target: 'target' },
    };

    constructor(params) {
        super(params);
        this.processCommands = createProcessCommands();
        this.events = {
            INITIAL_SYNC: { type: 'USER_ACTION', handler: this.startSync.bind(this) },
            PROCESS_BATCH: { handler: this.processBatch.bind(this) },
        };
    }

    async startSync() {
        const syncProcess = await this.processCommands.createProcess({
            userId: this.userId,
            integrationId: this.id,
            name: 'hubspot-contact-sync',
            type: 'CRM_SYNC',
        });
        const log = this.logger.child({ processId: syncProcess.id });

        let pages = 0;
        let after;
        do {
            const page = await this.hubspot.api.listContacts({ after });
            await QueuerUtil.send(
                {
                    event: 'PROCESS_BATCH',
                    integrationId: this.id,
                    processId: syncProcess.id,
                    data: { contacts: page.results },
                },
                process.env.HUBSPOT_QUEUE_URL
            );
            pages += 1;
            after = page.paging?.next?.after;
        } while (after);

        log.info('Sync batches queued', {
            eventName: 'integration.hubspot.sync_queued',
            pages,
        });
    }

    async processBatch({ data }) {
        let skipped = 0;
        for (const contact of data.contacts) {
            try {
                await this.target.api.upsertContact(toTargetContact(contact));
            } catch (error) {
                skipped += 1;
                this.logger.warn('Contact skipped', {
                    eventName: 'integration.hubspot.contact_skipped',
                    externalId: contact.id,
                    error,
                });
            }
        }

        this.logger.info('Batch processed', {
            eventName: 'integration.hubspot.batch_processed',
            count: data.contacts.length,
            skipped,
        });
    }
}
```

What each record carries without extra code:

- `startSync` runs in the HTTP scope: `requestId`, `route`, the integration
  ids, `integrationEvent: 'INITIAL_SYNC'`, and `processId` from the child
  logger.
- `processBatch` runs in the queue scope: `requestId`, `messageId`,
  `receiveCount`, `processId` from the message body, the integration ids and
  `integrationEvent: 'PROCESS_BATCH'`.
- The `listContacts` DEBUG records carry `entityId` and `credentialId` of the
  HubSpot module.
- If `processBatch` throws, the `Worker` logs `frigg.worker.record_failed` with
  the same ids, and the message returns to SQS.

## Common mistakes

| Mistake | What happens | Do this |
|---|---|---|
| `console.log(...)` | A text line: no ids, no redaction, no level filter | `this.logger.info(...)` |
| Values inside the message | The message cannot group; values are not fields | Fixed message, values in fields |
| `status: 429` | Dropped (reserved key), listed in `droppedKeys` | `statusCode: 429` |
| Log, then rethrow | The same error appears two or three times | Throw with `cause`; the boundary logs |
| `{ body: event.body }` at `INFO` | Dropped; at `DEBUG` it is written | Log keys or counts |
| One `INFO` per item in a big batch | Large CloudWatch cost, noisy queries | One `INFO` per batch; per item at `DEBUG` or only failures at `WARN` |
| Passing `integrationId` yourself | Dropped, because the logger already has it | Leave it out |
| Logging an email address | Personal data in the logs, not redacted | Log the external id |

## A custom Lambda handler

Handlers made with `createHandler`, and the framework's queue and webhook
handlers, open the scope for you. If you write your own raw Lambda handler,
open it with `runInvocationScope`, so its records get `requestId` and the
logger flushes before the function ends:

```js
const { runInvocationScope, getLogger } = require('@friggframework/core');

const log = getLogger('integration.hubspot.cleanup');

exports.handler = (event, context) =>
    runInvocationScope(
        { requestId: context.awsRequestId, handlerName: 'hubspot-cleanup' },
        async () => {
            log.info('Cleanup started', { eventName: 'integration.hubspot.cleanup_started' });
            // ...
        },
        { context }
    );
```
