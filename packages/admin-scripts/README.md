# @friggframework/admin-scripts

Admin Script Runner for Frigg — write and run operational/maintenance scripts inside your deployed Frigg app, with VPC/KMS-secured database access through the same Frigg commands your integrations use, sync or async (queued) execution, dry-run validation, and optional cron scheduling via AWS EventBridge Scheduler.

Typical use cases:

-   **Healing scripts** — repair broken integration state (e.g. corrupted config).
-   **Recurring maintenance** — refresh webhooks/subscriptions before they expire.
-   **Operational tasks** — OAuth token refresh, integration health checks, one-off data backfills. (You write these — none ship built-in.)

> Admin scripts are a **high-privilege** surface. Every endpoint is protected by an admin API key (`x-frigg-admin-api-key`), scripts run in your private VPC subnets, and every execution is tracked in the `AdminScriptExecution` table. Never expose the admin API key to browsers or end users.

---

## Installation

```bash
npm install @friggframework/admin-scripts
```

Then register scripts in your app definition (`backend/index.js`):

```javascript
const {
    Definition: HubSpotIntegration,
} = require('./src/integrations/HubSpotIntegration');
const {
    AttioHealingScript,
} = require('./src/admin-scripts/AttioHealingScript');

const Definition = {
    name: 'my-frigg-app',
    integrations: [HubSpotIntegration],

    // Admin scripts (optional)
    adminScripts: [AttioHealingScript],

    admin: {
        enableScheduling: true, // provision EventBridge Scheduler resources
    },
};

module.exports = { Definition };
```

At deploy time the framework's `AdminScriptBuilder` provisions the SQS queue, the router + worker Lambdas, and (when `enableScheduling` is set) the EventBridge Scheduler group and IAM role. At runtime the router/worker load this app definition and register your scripts into the script registry.

---

## Writing a script

Extend `AdminScriptBase`, declare a static `Definition`, and implement `execute(params)`. The execution context is injected for you and available as `this.context`.

```javascript
const { AdminScriptBase } = require('@friggframework/admin-scripts');

class AttioHealingScript extends AdminScriptBase {
    static Definition = {
        name: 'attio-healing',
        version: '1.0.0',
        description: 'Repairs corrupted Attio integration config',
        source: 'USER_DEFINED',

        // JSON Schema — validated on /validate and before every execution
        inputSchema: {
            type: 'object',
            required: ['integrationId'],
            properties: {
                integrationId: { type: 'string' },
                dryRun: { type: 'boolean', default: false },
            },
        },

        config: {
            timeout: 300000, // ms; sync mode is capped (see below)
            requireIntegrationInstance: true, // needs this.context.instantiate()
        },

        // No schedule here — a script is a capability. An admin activates a
        // recurring run at runtime via PUT /admin/scripts/:name/schedule.

        display: { category: 'maintenance' },
    };

    async execute(params) {
        const { integrationId } = params;

        this.context.log('info', 'Starting Attio healing', { integrationId });

        // Read persisted data through Frigg commands (never repositories).
        // Commands return the data on success, or an { error, reason } object
        // on failure — check `.error` yourself.
        const integration =
            await this.context.commands.integrations.findIntegrationById(
                integrationId
            );
        if (integration.error) {
            throw new Error(
                `Integration ${integrationId} not found: ${integration.reason}`
            );
        }

        // Call the live integration when you need to hit an external API.
        // Modules are attached to the instance by their own name (from the
        // module's getName(), e.g. `instance.attio`) and each module's `.api`
        // is its authenticated client. Iterate `instance.modules` if you don't
        // want to hard-code a module name. The methods on `.api` are defined by
        // that specific API module.
        const instance = await this.context.instantiate(integrationId);
        await instance.attio.api.refreshEntityConfig(); // example — use your module's real method

        this.context.log('info', 'Healing complete', { integrationId });
        return { healed: true, integrationId };
    }
}

module.exports = { AttioHealingScript };
```

### The execution context (`this.context`)

| Member                       | Description                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `log(level, message, data?)` | Records a structured log entry (`level`: `debug`/`info`/`warn`/`error`). Logs are persisted to the execution's `results.logs`. |
| `commands.users`             | User commands (`findIndividualUserById`, `createUser`, `updateUser`, …).                                                       |
| `commands.credentials`       | Credential commands (`findCredential`, `updateCredential`, …); secrets decrypted transparently.                               |
| `commands.entities`          | Entity/module commands (`findEntityById`, `findEntitiesByUserId`, …).                                                          |
| `commands.integrations`      | Integration reads (`findIntegrationById`, `listIntegrations({ type, status })`).                                               |
| `instantiate(integrationId)` | Returns a hydrated integration instance for calling external APIs. Requires `config.requireIntegrationInstance: true`.         |
| `queueScript(name, params?)` | Enqueue another script as a follow-up (tracked as a child of the current execution).                                           |
| `queueScriptBatch(entries)`  | Enqueue many follow-up scripts at once.                                                                                        |
| `getExecutionId()`           | The current `AdminScriptExecution` record id.                                                                                  |

Commands return **plain, decrypted data** on success (field-level encryption is handled transparently) or an `{ error, reason, code }` object on failure — scripts check `.error` themselves. Scripts have no direct repository access; all database interaction goes through the command layer.

---

## HTTP API

All routes are mounted under `/admin` and require the `x-frigg-admin-api-key` header.

| Method   | Path                                             | Description                                      |
| -------- | ------------------------------------------------ | ------------------------------------------------ |
| `GET`    | `/admin/scripts`                                 | List registered scripts                          |
| `GET`    | `/admin/scripts/{name}`                          | Get a script's details/schema                    |
| `POST`   | `/admin/scripts/{name}`                          | Execute a script (`sync` or `async`)             |
| `POST`   | `/admin/scripts/{name}/validate`                 | Validate input against the schema (no execution) |
| `GET`    | `/admin/scripts/{name}/executions`               | List recent executions (`?status=`, `?limit=`)   |
| `GET`    | `/admin/scripts/{name}/executions/{executionId}` | Get one execution                                |
| `GET`    | `/admin/scripts/{name}/schedule`                 | Get the effective schedule                       |
| `PUT`    | `/admin/scripts/{name}/schedule`                 | Create/update a schedule override                |
| `DELETE` | `/admin/scripts/{name}/schedule`                 | Remove the schedule override                     |

### Execute a script

**Async (default)** — queued to SQS, returns immediately with an execution id to poll:

```bash
curl -X POST https://<your-app>/admin/scripts/attio-healing \
  -H "x-frigg-admin-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "params": { "integrationId": "abc123" }, "mode": "async" }'

# 202 Accepted
# { "executionId": "665f...", "status": "QUEUED", "scriptName": "attio-healing" }
```

**Sync** — runs inline and returns the result. Only for fast scripts: in a deployed environment, sync is rejected (`400 SYNC_TIMEOUT_TOO_LONG`) when the script's `config.timeout` exceeds the API Lambda budget (~25s). Use `async` for anything longer.

```bash
curl -X POST https://<your-app>/admin/scripts/attio-healing \
  -H "x-frigg-admin-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "params": { "integrationId": "abc123" }, "mode": "sync" }'

# 200 OK
# { "executionId": "...", "status": "COMPLETED", "output": { ... }, "metrics": { "durationMs": 812 } }
```

Invalid input is rejected up front:

```bash
# 400 Bad Request → { "error": "Invalid input: Missing required parameter: integrationId", "code": "INVALID_INPUT" }
```

### Validate without executing

```bash
curl -X POST https://<your-app>/admin/scripts/attio-healing/validate \
  -H "x-frigg-admin-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "params": { "integrationId": "abc123" } }'

# { "status": "VALID", "preview": { ... }, "message": "Validation passed. ..." }
```

### Poll an execution

```bash
curl https://<your-app>/admin/scripts/attio-healing/executions/665f... \
  -H "x-frigg-admin-api-key: $ADMIN_API_KEY"

curl "https://<your-app>/admin/scripts/attio-healing/executions?status=FAILED&limit=20" \
  -H "x-frigg-admin-api-key: $ADMIN_API_KEY"
```

---

## Scheduling

Scripts don't declare a schedule — a script is a capability. An admin activates a recurring run at runtime via `PUT .../schedule`, which persists the schedule and provisions it in EventBridge. The **effective** schedule is therefore either the runtime override (DB) or none — there is no code-defined default that fires on its own.

```bash
# Enable a daily 6am UTC run
curl -X PUT https://<your-app>/admin/scripts/attio-healing/schedule \
  -H "x-frigg-admin-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true, "cronExpression": "cron(0 6 * * ? *)", "timezone": "UTC" }'

# Inspect / remove
curl https://<your-app>/admin/scripts/attio-healing/schedule -H "x-frigg-admin-api-key: $ADMIN_API_KEY"
curl -X DELETE https://<your-app>/admin/scripts/attio-healing/schedule -H "x-frigg-admin-api-key: $ADMIN_API_KEY"
```

Scheduling requires `admin.enableScheduling: true` in the app definition (so the EventBridge Scheduler group, IAM role, and env vars are provisioned). In a deployed environment the router refuses to fall back to the in-memory local scheduler, returning `503 SCHEDULER_NOT_CONFIGURED` if the provider isn't wired.

---

## Script chaining

Long or fan-out work can enqueue follow-up scripts. Continuations are tracked with `parentExecutionId` so you can trace the lineage:

```javascript
async execute(params) {
    const ids = await this.getWorkBatch();
    await this.context.queueScriptBatch(
        ids.map((integrationId) => ({ scriptName: 'attio-healing', params: { integrationId } }))
    );
    return { queued: ids.length };
}
```

---

## Execution modes & reliability

-   **Sync** (`mode: 'sync'`) — runs in the API Lambda, result returned in the response. Capped by the API timeout.
-   **Async** (`mode: 'async'`, default) — queued to SQS and run by the worker Lambda (15-min budget). The SQS queue has a redrive policy (up to 3 receives) to a dead-letter queue, so a crashed invocation is retried at the infrastructure level. There is no application-level per-script retry — model idempotency accordingly.

Every execution is persisted as an `AdminScriptExecution` record with its `state` (`PENDING` → `RUNNING` → `COMPLETED`/`FAILED`), input, output, metrics, and logs.

---

## Environment variables

| Variable                           | Set by                             | Purpose                                                                    |
| ---------------------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| `ADMIN_API_KEY`                    | **Operator** (SSM/Secrets Manager) | Shared admin API key checked by the auth middleware. Required.             |
| `ADMIN_SCRIPT_QUEUE_URL`           | `AdminScriptBuilder`               | SQS queue URL for async execution.                                         |
| `SCHEDULER_PROVIDER`               | `AdminScriptBuilder` (`'aws'`)     | Scheduler adapter type. Falls back to `local` only outside AWS (dev/test). |
| `ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN` | `AdminScriptBuilder`               | Worker Lambda ARN that EventBridge Scheduler invokes.                      |
| `ADMIN_SCRIPT_SCHEDULE_GROUP`      | `AdminScriptBuilder`               | EventBridge Scheduler group name.                                          |
| `SCHEDULER_ROLE_ARN`               | `AdminScriptBuilder`               | IAM role EventBridge assumes to invoke the worker.                         |

You must provision `ADMIN_API_KEY` yourself (e.g. via SSM Parameter Store or Secrets Manager) — the builder does not generate it.

---

## Local development

Without AWS, the scheduler uses an in-memory `LocalSchedulerAdapter` (schedules do not persist across restarts) and async execution needs a queue URL. Set `ADMIN_API_KEY` in your local env to exercise the endpoints.

---

## Architecture

See [ADR-005: Admin Script Runner Service](../../docs/architecture-decisions/005-admin-script-runner.md) for the full design (layering, security model, scheduling, and validation). The package follows Frigg's hexagonal architecture: HTTP handlers → `ScriptRunner` (application) → command layer → repositories, with the scheduler as a swappable port (`SchedulerAdapter` → AWS/local adapters).
