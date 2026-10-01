---
description: >-
  Upgrade a Frigg 1.x app to 2.0: Prisma instead of Mongoose, an explicit
  database choice, Definition-based integrations, Node.js 22, and osls.
---

# Migrating from 1.x to 2.0

This guide moves a Frigg 1.x app to 2.0. Read it once before you start. Do the
work on a branch, and test against a copy of your production data.

Frigg 2.0.1 is the first stable 2.x release. Install `^2.0.1`, never
`^2.0.0`: `@friggframework/core@2.0.0` is a deprecated 2024 build.

For what 2.0 adds, see [What's New in Frigg 2.0](../getting-started/whats-new-in-2.0.md).

{% hint style="danger" %}
Back up your database first. 2.0 uses a new schema and new collection names,
so plan the data move as a migration, not an in-place upgrade.
{% endhint %}

## What changes

| Area | 1.x | 2.0 |
| --- | --- | --- |
| Data access | Mongoose models exported from core | Prisma, behind repositories and `createFriggCommands()` |
| Database | MongoDB via `MONGO_URI` | PostgreSQL, MongoDB, or DocumentDB via `DATABASE_URL` plus an explicit engine |
| Users | `IndividualUser` and `OrganizationUser` discriminators | One `User` model with a `type` field |
| Integration class | `static Config`, `static Options`, `static modules` | One `static Definition` and `this.events` |
| Infrastructure | Hand-written `serverless.yml` | `infrastructure.js` generated from the app definition |
| Deploy tool | Serverless Framework | `osls` (oss-serverless), run by `frigg deploy` |
| AWS SDK | v2 (`aws-sdk`) | v3 (`@aws-sdk/client-*`) |
| Runtime | Node.js 18 | Node.js 22 (`nodejs22.x` on Lambda) |

## Step 1: Upgrade Node.js

Install Node.js 22 or later and npm 10 or later, locally and in CI
(`nvm install 22`).

## Step 2: Start from a 2.0 backend

The simplest path is a fresh 2.0 backend that you move your integrations into.

```bash
npm install -g @friggframework/devtools@^2.0.1
frigg init my-app
```

This writes `backend/index.js` (your app definition) and
`backend/infrastructure.js`. You do not edit `infrastructure.js`. It contains:

```javascript
const { createFriggInfrastructure } = require('@friggframework/devtools');
module.exports = createFriggInfrastructure();
```

{% hint style="info" %}
If `frigg init` fails with "Backend template not found", upgrade
`@friggframework/devtools` to the latest 2.x release and run it again.
{% endhint %}

To upgrade in place instead, install the 2.0 packages and the Prisma peers
(core lists them as optional peer dependencies, so install them yourself):

```bash
npm install @friggframework/core@^2.0.1 @friggframework/devtools@^2.0.1
npm install @prisma/client prisma
```

Then add the `infrastructure.js` above and delete your 1.x `serverless.yml`.
Move any custom resources from it into the app definition (`vpc`,
`encryption`, `ssm`, `environment`).

Update each `@friggframework/api-module-*` package to a version whose
`package.json` depends on `@friggframework/core` 2.x.

## Step 3: Choose the database

Frigg 2.0 does not guess the engine from the URL. Enable exactly one database
in the app definition:

```javascript
// backend/index.js
const Definition = {
    name: 'my-app',
    integrations: [HubSpotIntegration],
    database: { mongoDB: { enable: true } }, // or postgres / documentDB
    encryption: { fieldLevelEncryptionMethod: 'kms' }, // or 'aes'
};
module.exports = { Definition };
```

A `DB_TYPE` environment variable (`postgresql`, `mongodb`, or `documentdb`)
overrides the app definition. Frigg throws if it finds neither.

Replace `MONGO_URI` with `DATABASE_URL`. It is only the connection string.
Prisma needs MongoDB to run as a replica set.

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/frigg"
DATABASE_URL="mongodb://localhost:27017/frigg?replicaSet=rs0"
```

Keep your encryption keys. 2.0 reads the same variables as 1.x: `KMS_KEY_ARN`
for KMS, or `AES_KEY_ID` and `AES_KEY` for AES. The `dev`, `test`, and `local`
stages skip encryption.

## Step 4: Create the schema

```bash
frigg db:setup
```

This checks `DATABASE_URL`, generates the Prisma client, and runs migrations
(PostgreSQL) or `db push` (MongoDB and DocumentDB).

## Step 5: Port your integration classes

Replace `Config`, `Options`, and `modules` with one `Definition`. Map events
to handler methods in the constructor.

{% code title="1.x" %}
```javascript
class HubSpotIntegration extends IntegrationBase {
    static Config = { name: 'hubspot', version: '1.0.0', events: ['SEARCH_DEALS'] };
    static Options = new Options({ module: HubSpotModule, display: { /* ... */ } });
    static modules = { hubspot: HubSpotModule };

    async receiveNotification(notifier, event, object) {
        if (event === 'SEARCH_DEALS') return this.target.api.searchDeals(object);
    }
}
```
{% endcode %}

{% code title="2.0" %}
```javascript
const hubspot = require('@friggframework/api-module-hubspot');

class HubSpotIntegration extends IntegrationBase {
    static Definition = {
        name: 'hubspot',
        version: '1.0.0',
        display: { label: 'HubSpot', description: 'CRM sync', category: 'CRM' },
        modules: { hubspot: { definition: hubspot.Definition } },
        routes: [{ path: '/deals/search', method: 'POST', event: 'SEARCH_DEALS' }],
    };

    constructor(params) {
        super(params);
        this.events = { SEARCH_DEALS: { handler: this.searchDeals } };
    }

    async searchDeals({ data }) {
        return this.hubspot.api.searchDeals(data);
    }
}
```
{% endcode %}

* Call a module through its key: `this.hubspot.api`, not `this.target.api`.
* Replace `this.record.save()` and `markModified()`. Use
  `this.patchConfig(patch)` to merge keys and `this.updateConfig(config)` to
  replace the config. Both write to the database and update `this.config`.
* The default `onCreate()` validates config and sets `ENABLED` or
  `NEEDS_CONFIG`. If you override it, call `super.onCreate()`.
* Use `this.logger` instead of `console.log`. See
  [Logging in an Integration](./LOGGING-IN-INTEGRATIONS.md).

## Step 6: Replace direct database access

Core no longer exports `mongoose`, the Mongoose models (`UserModel`,
`IndividualUser`, `OrganizationUser`, `IntegrationModel`, `Token`, `State`),
`connectToDatabase`, `createFriggBackend`, `ModuleManager`, `Auther`, or
`IntegrationFactory`.

* Use `createFriggCommands({ integrationClass })` for users, credentials,
  entities, integrations, and processes.
* Check `user.type` (`INDIVIDUAL` or `ORGANIZATION`) instead of the
  discriminator class.
* Use `findIndividualUsersByOrganizationId` to list the members of an
  organization user.
* Handle the `IN_CREATION` and `IN_DELETION` integration statuses anywhere you
  filter or display status.

## Step 7: Move AWS SDK v2 calls to v3

Only custom code that calls AWS directly needs this.

```javascript
// 1.x: await new AWS.SQS().sendMessage(params).promise();
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
await new SQSClient({}).send(new SendMessageCommand(params));
```

See [AWS SDK v3 and oss-serverless](../reference/aws-sdk-v3-osls-migration.md).

## Step 8: Move your data

There is no automated 1.x data migration. The tool is designed in
[ADR-004](../architecture-decisions/004-migration-tool-design.md) but has not
shipped. Pick one path:

* **Fresh database.** Deploy 2.0 against an empty database and ask users to
  reconnect their accounts. This is the lowest-risk path.
* **Scripted copy.** Write a one-off script that reads the 1.x collections and
  writes the 2.0 models (`User`, `Credential`, `Entity`, `Integration`,
  `IntegrationMapping`). The schemas are in `packages/core/prisma-mongodb/` and
  `packages/core/prisma-postgresql/`. Check on staging that migrated
  credentials decrypt and refresh before you cut over.

## Step 9: Deploy and verify

```bash
frigg build --production
frigg deploy --stage dev
```

`frigg deploy` runs `osls` and then `frigg doctor`. After the deploy:

* Call `GET /health/detailed` and confirm the database and encryption checks
  pass.
* On PostgreSQL, call `GET /admin/db-migrate/status` with the
  `x-frigg-admin-api-key` header and apply pending migrations with
  `POST /admin/db-migrate`.
* If the deploy fails on the 4 KB Lambda environment limit, move large values
  to SSM with `environment: { KEY: 'ssm' }`. See
  [ADR-027](../architecture-decisions/027-ssm-parameter-offload-and-env-scoping.md).
* Run `frigg repair <stackName>` if `doctor` reports drift.

## If you ran a 2.0 prerelease

These changes affect apps built on earlier `2.0.0-next` releases. 1.x apps can
skip them.

* **Extension routes are namespaced.** Routes mount at
  `/api/{integration}-integration/{bindingKey}{path}`. Re-point every provider
  webhook registered at the old path. Extension receivers default to
  `useDatabase: false`.
* **The reporting key is retired.** `REPORTING_API_KEY` and
  `x-frigg-reporting-api-key` no longer work. Set `ADMIN_API_KEY` and send
  `x-frigg-admin-api-key`.
* **The integrations report moved.** `GET /api/v2/reports/integrations` is
  deprecated and is only deployed when you register `reports` or set
  `admin: { includeBuiltinReports: true }`. Call
  `POST /api/v2/reports/integrations/run` with `{ "mode": "live" }` instead.
* **Process updates are atomic.** `updateProcessMetrics` and the context
  updates in `updateProcessState` no longer read, modify, and write the whole
  record. No code change is needed.

## Checklist

* [ ] Node.js 22+ and npm 10+ locally and in CI
* [ ] `@friggframework/core` and `@friggframework/devtools` on `^2.0.1`, plus `prisma` and `@prisma/client`
* [ ] API modules on versions that depend on core 2.x
* [ ] `infrastructure.js` in place; `serverless.yml` removed
* [ ] `database.<engine>.enable` (or `DB_TYPE`) set, and `DATABASE_URL` replaces `MONGO_URI`
* [ ] Encryption keys carried over
* [ ] `frigg db:setup` run
* [ ] Integrations use `static Definition`, `this.events`, and `this.<module>.api`
* [ ] No imports of removed core exports; `user.type` checks in place
* [ ] Custom AWS calls on SDK v3
* [ ] Data plan chosen and tested on staging
* [ ] Deployed; `frigg doctor` clean; `/health/detailed` passes
