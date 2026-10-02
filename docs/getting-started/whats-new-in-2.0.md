---
description: >-
  Frigg 2.0 is the production foundation: your choice of database, real
  operations tooling, admin work inside your VPC, and integrations that stay
  connected.
---

# What's New in Frigg 2.0

Frigg 2.0 is the production foundation for native integrations. You run it on
PostgreSQL, MongoDB, or DocumentDB. You deploy, check, and repair it with one
CLI. You run admin scripts and reports inside your own VPC. Your integrations
refresh tokens, retry, and record their state without losing writes.

Frigg 2.0.1 is the first stable 2.x release. Install `^2.0.1`. Do not use
`^2.0.0`, which can resolve to a deprecated 2024 build of
`@friggframework/core`.

{% hint style="warning" %}
2.0 has breaking changes. If you run a 1.x app, read
[Migrating from 1.x to 2.0](../guides/migrating-to-2.0.md) before you upgrade.
{% endhint %}

## Breaking changes at a glance

* **Mongoose is gone.** Data access runs on Prisma. Core no longer exports
  `mongoose`, the Mongoose models, `connectToDatabase`, `createFriggBackend`,
  `ModuleManager`, `Auther`, or `IntegrationFactory`.
* **You pick the database explicitly.** Set `database.postgres.enable`,
  `database.mongoDB.enable`, or `database.documentDB.enable` in your app
  definition, or set `DB_TYPE`. `DATABASE_URL` is the connection string only.
  Frigg throws at startup if neither tells it the engine.
* **Integration classes use `static Definition`.** The 1.x `static Config`,
  `static Options`, and `static modules` are replaced by one `Definition` with
  `name`, `version`, `display`, `modules`, and `routes`. Events go in
  `this.events`.
* **One `User` model.** The `IndividualUser` and `OrganizationUser`
  discriminators are replaced by a `User` model with a `type` field.
* **New integration statuses.** Integrations start in `IN_CREATION` and pass
  through `IN_DELETION` on teardown. Code that filters on status must handle
  both.
* **Deployed stages always encrypt.** A function running in AWS Lambda
  encrypts sensitive fields on every stage, `dev` included, and refuses to
  start without a key (`EncryptionConfigurationError`). Set
  `encryption: { fieldLevelEncryptionMethod: 'kms' }`, or provide `AES_KEY_ID`
  and `AES_KEY`. Only local runs (`frigg start`, tests) skip encryption. To
  store a deployed stage in plaintext on purpose, set
  `fieldLevelEncryptionMethod: 'none'`.
* **Node.js 22, AWS SDK v3, and osls.** Lambda functions run on `nodejs22.x`.
  Deploys use oss-serverless (`osls`) instead of the Serverless Framework.

## Requirements

| Requirement | Frigg 2.0 |
| --- | --- |
| Node.js | 22 or later |
| npm | 10 or later |
| Database | PostgreSQL, MongoDB (replica set), or Amazon DocumentDB |
| Cloud | AWS (Lambda `nodejs22.x`, SQS, KMS, EventBridge Scheduler) |
| Deploy tool | `osls` (installed with `@friggframework/devtools`) |

## 1. Run it on your database

Frigg 2.0 stores data through Prisma behind repository interfaces. The same
integration code runs on PostgreSQL, MongoDB, and Amazon DocumentDB.

```javascript
// backend/index.js
const Definition = {
    name: 'my-app',
    integrations: [HubSpotIntegration],
    database: { postgres: { enable: true } }, // or mongoDB / documentDB
    encryption: { fieldLevelEncryptionMethod: 'kms' }, // or 'aes'
};
module.exports = { Definition };
```

* `DATABASE_URL` holds the connection string. `frigg db:setup` checks it,
  generates the Prisma client, and runs migrations (PostgreSQL) or `db push`
  (MongoDB).
* Field-level encryption runs inside a Prisma client extension. Repositories
  and your code see plain values. Credentials, mappings, password hashes, and
  tokens are encrypted at rest with AWS KMS or AES. The `dev`, `test`, and
  `local` stages skip encryption.
* PostgreSQL deployments get `/admin/db-migrate` endpoints to check and apply
  schema migrations. `POST /admin/db-migrate/resolve` marks a failed migration
  as applied or rolled back (#627).

## 2. Operate it in production

* **`frigg doctor`** checks a deployed CloudFormation stack. **`frigg repair`**
  imports orphaned resources and reconciles drift. **`frigg generate-iam`**
  writes a deployment IAM stack scoped to your app definition. `frigg deploy`
  runs `doctor` after each deploy unless you pass `--skip-doctor`.
* **Stay under the 4 KB Lambda environment limit** (#625). Mark a variable
  with `environment: { MY_SECRET: 'ssm' }` and Frigg stores it in SSM
  Parameter Store and loads it at cold start. `frigg ssm push` uploads the
  values, and `frigg deploy` runs it for you. `lambda.scopedEnvironment: true`
  gives each function only the variables it uses. See
  [ADR-027](../architecture-decisions/027-ssm-parameter-offload-and-env-scoping.md).
* **Structured JSON logs** (#654). Every record is one redacted JSON line with
  `requestId`, `integrationId`, and OpenTelemetry `trace_id`/`span_id` when a
  span is active. Use `this.logger` in integrations and API modules. Set
  `logging: { level, retentionInDays }` in the app definition to control
  `FRIGG_LOG_LEVEL` and CloudWatch retention. See [Logging](../guides/LOGGING.md).
* **OpenTelemetry and usage tracking** (#622). Deployed stages export nothing
  until you set `telemetry.exporter` (`otlp`, `honeycomb`, `datadog`, or
  `console`). Handler dispatch and API module requests are traced with no
  code. Call `this.telemetry.span()` and `this.telemetry.count()` for your own
  spans and counters. Declare `Definition.usage` on an integration and Frigg
  keeps durable counters such as `records.synced` and `api.requests` in a
  `UsageCounter` table. Reports and scripts read them through
  `frigg.usage.getTotalsByDimension()` and `frigg.usage.getTimeSeries()`. See the
  [telemetry guide](https://github.com/friggframework/frigg/blob/next/packages/core/telemetry/README.md).
* **Health endpoints**: `/health`, `/health/detailed` (includes an encryption
  round trip), `/health/live`, and `/health/ready`.
* **Large dependency trees.** Set `lambda.keepNestedNodeModules: true` when a
  package needs its own nested `node_modules` in the Lambda bundle (#645).

## 3. Admin work inside your VPC

**Admin scripts** (#517) run maintenance code in your deployed app, with the
same VPC, KMS, and database access as your integrations. Add
`adminScripts: [MyScript]` to the app definition and Frigg provisions the
router, executor Lambda, and queue.

* A script extends `AdminScriptBase` and reads data through
  `this.context.commands`. `this.context.instantiate(integrationId)` gives it a
  live integration to call external APIs.
* `POST /admin/scripts/{name}` runs it in `sync` mode (inside the API call) or
  `async` mode (queued, up to 15 minutes). Every run is stored as an
  `AdminScriptExecution` record.
* `queueScript()` chains follow-up scripts. With
  `admin: { enableScheduling: true }`, `PUT /admin/scripts/{name}/schedule`
  creates an EventBridge schedule.

**Reports** (#628) are admin operations whose output is the payload. A report
extends `ReportBase` and you register it with `reports: [MyReport]`. Set
`admin: { includeBuiltinReports: true }` to add the built-in `integrations`
report.

* Run modes: `live` returns the result inline, `recorded` stores an execution
  you poll, and `snapshot` stores a run in a named series for trends.
* `POST /api/v2/reports/{name}/run` starts a run. CSV, PDF, and ZIP output goes
  to a private S3 bucket and comes back as a signed URL.
* Scripts, reports, and `/admin/db-migrate` all use the
  `x-frigg-admin-api-key` header, checked against `ADMIN_API_KEY`.

See [ADR-005](../architecture-decisions/005-admin-script-runner.md),
[ADR-010](../architecture-decisions/010-reporting-as-admin-operation.md), and
the [admin scripts README](https://github.com/friggframework/frigg/blob/next/packages/admin-scripts/README.md).

## 4. Integrations that stay connected

* **One refresh per expired token** (#636). When many requests on one module
  get a 401 at once, they share a single refresh. A newer credential that
  another Lambda already stored is adopted instead of refreshed again.
* **Grace retry on 401** (#623). Requesters retry a 401 up to three times, even
  without a refresh token, before they invalidate the credential.
* **Refresh tokens are kept.** When a provider's refresh response omits
  `refresh_token`, `OAuth2Requester` keeps the one it has.
* **Clear failure records.** When credentials fail, the integration records an
  "Authentication Error" message with the module and status code, then moves
  to `ERROR` (#634). A successful re-auth moves it back to `ENABLED`.
  `FetchError` messages keep the sanitized cause (#659).
* **No lost writes.** `this.patchConfig(patch)` merges config atomically in the
  database (#614). `updateProcessMetrics` writes counters atomically, so
  concurrent workers no longer overwrite each other (#638).
* **Safe lifecycle.** A failing `ON_DELETE` handler no longer blocks uninstall
  (#615). Re-authorizing reuses the existing integration instead of creating
  a duplicate (#613).

## 5. Build faster

* **Integration extensions.** An API module can ship a webhook receiver,
  signature check, and queue dispatch. You bind it with `Definition.extensions`
  and write only the handler method. See the
  [extensions guide](https://github.com/friggframework/frigg/blob/next/packages/core/integrations/EXTENSIONS.md).
* **Per-account webhooks.** Set `webhooks: true` on an integration Definition
  and implement `onWebhook`.
* **One-time scheduled jobs.** `createSchedulerCommands()` schedules a future
  event onto an integration's queue through EventBridge Scheduler. Use it for
  webhook renewals and delayed work.
* **Final-attempt signal** (#653). Queue handlers receive
  `delivery.isLastAttempt`, so you can close out a run before SQS moves the
  message to the dead-letter queue.
* **`queryMappings`** (#651). Filter, sort, and page an integration's mappings
  inside the database instead of loading every row. It requires the
  `IntegrationMapping.mapping` field to be excluded from encryption.
* **`frigg auth`** tests an API module's OAuth2 or API-key flow locally and
  saves the credentials: `frigg auth test`, `list`, `get`, and `delete`.

## 6. Under the hood

* **Hexagonal architecture.** Handlers call use cases. Use cases call
  repositories. Repositories talk to the database and AWS. Each layer is
  tested on its own, and each database has its own repository adapter.
* **oss-serverless.** `frigg build` and `frigg deploy` run
  `osls --config infrastructure.js`. Your `infrastructure.js` calls
  `createFriggInfrastructure()`, which builds the stack from your app
  definition and discovers your VPC, subnets, and KMS keys.
* **AWS SDK v3** everywhere. See the
  [SDK v3 and osls guide](../reference/aws-sdk-v3-osls-migration.md).
* **esbuild and a Prisma Lambda layer** keep function bundles small. The layer
  ships only the Prisma runtime client.

## 7. What's next

These items are on the roadmap. They are not part of 2.0.

* **Capabilities**: a typed statement of what an app, integration, or API
  module can do, exposed to agents as MCP tools
  ([ADR-020](../architecture-decisions/020-capabilities.md)).
* **Agent harness and integration templates**: a structured runtime for agents
  that build integrations, and reusable integration starting points
  ([ADR-025](../architecture-decisions/025-agent-harness.md),
  [ADR-023](../architecture-decisions/023-integration-templates.md)).
* **Fenestra** as a spec format that capabilities can point to.
* **Multi-step authorization** and shared entities.

See the [Roadmap](../roadmap/page-1.md) and the
[ADR index](../architecture-decisions/README.md).

## Start or upgrade

* **New app:** install the CLI with
  `npm install -g @friggframework/devtools@^2.0.1`. Then run
  `frigg init my-app`, `frigg install <module>`, and `frigg start`.
* **Existing 1.x app:** follow [Migrating from 1.x to 2.0](../guides/migrating-to-2.0.md).

{% hint style="info" %}
If `frigg init` fails with "Backend template not found", upgrade
`@friggframework/devtools` to the latest 2.x release and run it again.
{% endhint %}
