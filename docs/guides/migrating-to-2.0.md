---
description: >-
  Upgrade an existing Frigg 1.x application to 2.0 — the Prisma data layer, AWS
  SDK v3, Node 22, and the breaking changes you need to account for.
---

# Migrating from 1.x to 2.0

Frigg 2.0 changes the data layer (Mongoose → Prisma), the AWS SDK (v2 → v3), and
the minimum runtime (Node 22). This guide walks through upgrading an existing
app. Read it end-to-end before starting, and upgrade in a branch you can roll
back.

{% hint style="danger" %}
Back up your database before migrating. The data-model changes are structural
(see [Data model changes](#data-model-changes)), so a restore point is your
safety net.
{% endhint %}

## Before you begin

{% hint style="info" %}
**Scaffolding moved to the `frigg` CLI.** `create-frigg-app` is retired in 2.0.
Use `frigg init` for new apps and the `frigg` CLI for the full lifecycle
(`install`, `start`, `build`, `deploy`, `db:setup`, `doctor`, `repair`).
{% endhint %}

* **Node 22+ / npm 10+.** Bump your local and CI runtimes. `nvm install 22`.
* **Pick your database.** 2.0 runs on PostgreSQL, MongoDB, or DocumentDB. If you
  were on MongoDB in 1.x you can stay on MongoDB; you can also take this
  opportunity to move to PostgreSQL.
* **Read the** [**AWS SDK v3 & oss-serverless reference**](../reference/aws-sdk-v3-osls-migration.md)
  if you have custom infrastructure or handler code that calls AWS directly.

## Step 1 — Update dependencies

Update your Frigg packages to 2.0 and install Prisma peers:

{% code overflow="wrap" %}
```bash
npm install @friggframework/core@^2.0.0 @friggframework/devtools@^2.0.0
npm install @prisma/client prisma
```
{% endcode %}

Frigg declares `@prisma/client` and `prisma` as **optional peer dependencies**,
so install the pair explicitly in your app.

## Step 2 — Switch to a single DATABASE_URL

2.0 uses one connection variable and infers the engine from the URL scheme.
Replace your 1.x Mongo connection variables with:

{% tabs %}
{% tab title="PostgreSQL" %}
```bash
DATABASE_URL="postgresql://user:password@host:5432/your_db"
```
{% endtab %}

{% tab title="MongoDB / DocumentDB" %}
```bash
DATABASE_URL="mongodb://host:27017/your_db"
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
Encryption still requires your KMS key (or local AES key) configuration exactly
as in 1.x — only the database connection variable changed.
{% endhint %}

## Step 3 — Generate the Prisma client and schema

Provision the schema and generate the client for your chosen database:

```bash
frigg db:setup --stage dev
```

Under the hood this runs the Prisma generate/push for the database implied by
your `DATABASE_URL`. (The raw npm scripts — `prisma:generate`,
`prisma:push:mongo`, `prisma:migrate:postgres` — are also available if you need
finer control.)

## Step 4 — Replace direct Mongoose usage

If your integration or app code imported Mongoose models or called
`mongoose.*` directly, that code must move to the Frigg data access layer /
Prisma. Frigg's own models are now Prisma-backed and exposed through the core
repositories and commands — prefer those over reaching into the database:

* Look up individual users linked to an organization with
  `findIndividualUsersByOrganizationId` (new in 2.0) rather than querying user
  discriminators.
* Use `createFriggCommands()` factories for user, integration, and process
  operations instead of raw model queries.

{% hint style="warning" %}
User "discriminators" (`IndividualUser` / `OrganizationUser`) are gone. There is
now a **single `User` model with a `type` enum** (`INDIVIDUAL` / `ORGANIZATION`).
Any runtime checks that relied on separate Mongoose model classes must switch to
checking `user.type`.
{% endhint %}

## Step 5 — Update AWS SDK calls (if you have custom code)

If you call AWS services directly in custom handlers, migrate from AWS SDK v2 to
v3:

{% code title="Before (v2)" %}
```javascript
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
await sqs.sendMessage(params).promise();
```
{% endcode %}

{% code title="After (v3)" %}
```javascript
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const client = new SQSClient({});
await client.send(new SendMessageCommand(params));
```
{% endcode %}

When inspecting AWS errors, check both `error.statusCode` and
`error.$metadata?.httpStatusCode`.

## Step 6 — Re-point extension webhook registrations

If you use integration extensions with routes (e.g. inbound webhooks), the route
URLs are now namespaced under the binding key:

```
Old: /api/{integration}-integration/webhooks
New: /api/{integration}-integration/{bindingKey}/webhooks
```

Update the callback URL at each provider to the new namespaced path and
re-verify. Some providers sign the full URL, so stale registrations will fail
until re-pointed.

If an extension receiver does not touch the database, set `useDatabase: false`
(the new default) on the extension or binding to skip the Prisma layer and
improve cold-start time.

## Step 7 — Deploy with osls

Deployment now uses the `osls` (oss-serverless) CLI. Commands are unchanged in
shape:

```bash
osls deploy --stage dev
```

Run `frigg doctor` after deploying to validate the stack, and `frigg repair` to
reconcile any drift.

## Data model changes

The relational/Prisma schema normalizes several structures that were nested
arrays under Mongoose. Notably, sync and entity association data now live in
dedicated tables/collections (e.g. `DataIdentifier`, `Association`,
`AssociationObject`) rather than embedded arrays. Any custom queries that read
nested arrays directly must be updated to the new shape. See
[Data Model](../reference/data-model.md) for the current schema.

Process updates should use the race-safe `applyProcessUpdate(processId, ops)`
path rather than read-modify-write `update()`, which is clobber-prone under
concurrent workers.

## @friggframework/ui consumers

If your frontend uses `@friggframework/ui`, the API adapter methods for
authorization were renamed to support multi-step auth. For example
`getAuthorizeRequirements(...)` becomes `getModuleAuthorizationRequirements(...)`
and `authorizeEntity(...)` becomes `submitModuleAuthorization(...)`. Review the
UI library reference for the full adapter surface before upgrading the frontend.

## Automated migration tooling

An automated data-migration command (importing from a `create-frigg-app` 1.x
project, with backup, dry-run, validation, and rollback) is **designed but not
yet shipped** — see
[ADR-004: Migration tool design](../architecture-decisions/004-migration-tool-design.md).
Until it lands, follow the manual steps above and migrate data with your
database's native tooling.

## Checklist

* [ ] Node 22+ / npm 10+ locally and in CI
* [ ] `@friggframework/*` on `^2.0.0`, `@prisma/client` + `prisma` installed
* [ ] `DATABASE_URL` set (scheme matches your database)
* [ ] `frigg db:setup` run; Prisma client generated
* [ ] Direct Mongoose usage replaced with Frigg repositories/commands
* [ ] `user.type` checks replace discriminator class checks
* [ ] Custom AWS SDK v2 calls upgraded to v3
* [ ] Extension webhook URLs re-pointed and re-verified
* [ ] Deployed with `osls`; `frigg doctor` clean
