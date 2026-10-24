---
description: >-
  Frigg 2.0 is the integration backend for people and their agents: three ways
  to define an integration on one runtime, connections that agents use without
  seeing a credential, two app profiles, production defaults, and more than one
  host.
---

# What's New in Frigg 2.0

**Frigg 2.0 is the integration backend for people and their agents.** Each
person and each organization connects their own accounts once. People, your
product, and the agents working for them then use those connections through
one versioned API, and nobody outside Frigg ever holds the credential.

Frigg 2.0.1 is the first stable 2.x release. Install `^2.0.1`. Do not use
`^2.0.0`, which can resolve to a deprecated 2024 build of
`@friggframework/core`.

{% hint style="warning" %}
2.0 has breaking changes. If you run a 1.x app, read
[Migrating from 1.x to 2.0](../guides/migrating-to-2.0.md) before you upgrade.
{% endhint %}

2.0 is built on five ideas:

1. [Three ways to define an integration, one runtime](#1-three-ways-to-define-an-integration-one-runtime)
2. [Connections agents can use without seeing a credential](#2-connections-agents-can-use-without-seeing-a-credential)
3. [Two app profiles: product and operations](#3-two-app-profiles-product-and-operations)
4. [Production by default](#4-production-by-default)
5. [More than one host](#5-more-than-one-host)

{% hint style="info" %}
**We run it ourselves.** Left Hook, the company that maintains Frigg, runs
both profiles on 2.0. One is an internal agent tool server with hundreds of
tools, where every person's connections live in Frigg instead of in shared
environment variables (the operations profile, on Netlify). The other is a
product where customers' integrations are built from a catalogue or by chat
and validated by Frigg (the product profile, on AWS). 2.0.1 ships when both
run on a published `next` prerelease.
{% endhint %}

## 1. Three ways to define an integration, one runtime

An integration can be code, a validated JSON document, or an entry in your
app's catalogue. All three install, list, route, run, and log the same way.

### In code

A class that extends `IntegrationBase` with a `static Definition` works as it
did in every 2.0 prerelease. 2.0.1 adds `defineIntegration`, which builds that
class from one object
([ADR-054](https://github.com/friggframework/frigg/pull/669)):

```javascript
const { defineApp, defineIntegration, use } = require('@friggframework/core');

const DealAlerts = defineIntegration({
    name: 'deal-alerts',
    version: '1.0.0',
    display: { label: 'Deal alerts in Slack', category: 'Notifications' },
    modules: { crm: use(hubspot), chat: use(slack) },
    on: {
        'crm.deal.changed': async ({ deal }, { modules: { chat }, config }) => {
            /* post to config.channel */
        },
    },
    triggers: { digest: { every: '1d', handler: sendDigest } }, // ADR-055
});

module.exports = defineApp({ name: 'my-app', integrations: [DealAlerts] });
```

`defineIntegration` returns an `IntegrationBase` subclass, so everything that
reads `Definition` today works with it.

### As a document

An integration can also be a JSON document
([ADR-063](https://github.com/friggframework/frigg/pull/692)). It declares
modules, settings, syncs, and workflows. It has no HTTP or script step:
every step is either a built-in step or a capability
(`<module>.<object>.<verb>`) that the module's capability manifest declares.

```json
{
  "schemaVersion": "0.1",
  "id": "pipedrive-hubspot",
  "version": "1.0.0",
  "display": { "label": "Pipedrive ⇄ HubSpot people", "category": "CRM" },
  "modules": {
    "pipedrive": { "module": "pipedrive", "version": "^2.1" },
    "hubspot": { "module": "hubspot", "version": "^3" }
  },
  "syncs": [{
    "id": "people",
    "source": "pipedrive.person",
    "target": "hubspot.contact",
    "direction": "two_way",
    "identity": { "match": [{ "source": "emails[0].value", "target": "properties.email", "transform": "lowercase", "key": "email" }] },
    "mapping": [{ "source": "first_name", "target": "properties.firstname", "transform": "trim" }],
    "backfill": { "trigger": "userAction", "pageSize": 100 },
    "ongoing": { "mode": "webhook" },
    "default": "on"
  }]
}
```

This is abridged from `examples/pipedrive-hubspot.definition.json`. That
example also subscribes the webhook in `lifecycle.onInstall`.

* **Validated twice.** Frigg checks a document against the JSON Schema and
  then checks its references. Each capability must exist in a manifest, and
  each manifest method must exist on the real API module. Run
  `npm run validate:definitions --workspace @friggframework/core` in CI.
* **Published as immutable versions.** `POST /admin/integrations/versions`
  publishes a version. A published version never changes. Frigg refuses a
  different document at the same version, and a version whose semver bump is
  smaller than its changes. Each installation pins a version and a checksum.
  `GET`/`POST /api/integrations/:integrationId/upgrade` plans and applies an
  upgrade.
* **Installed like code.** A published id is an integration type. Install it
  with `POST /api/integrations` and `config: { type: '<id>' }`. It lists,
  routes, and logs under its own name. When code and a document share a name,
  code wins.
* **Code can embed a document.**
  `extendIntegrationClass(MyIntegration, { definition, manifests })` adds a
  document's syncs and workflows to a code class. A `code` step with
  `ref: "#methodName"` calls a method on that class.

### From a catalogue

`GET /api/integration-definitions` lists the latest published version of each
definition your app offers. Workspaces can publish their own definitions with
`POST /api/integration-definitions`. Other workspaces never see them.

### What a definition can do

* **Workflows** run on a webhook, a schedule, a user action, or a synced
  record. Steps include `map`, `branch`, `foreach`, `links.find`, and
  `links.upsert`. `delay` (`for: '2h'`) pauses a run, and `approval` waits for
  a person. A person approves or rejects with
  `POST /api/integrations/:integrationId/runs/:runId/decision`. Every run is
  stored and listed at `GET /api/integrations/:integrationId/runs`.
* **A sync engine.** A sync has a source, a target, a direction (one-way or
  `two_way`), identity matching, a field mapping, a backfill, and ongoing
  updates by webhook or by polling.
* **Recurring triggers** ([ADR-055](https://github.com/friggframework/frigg/pull/669)).
  `Definition.triggers` takes `every: '15m'` or a five-field `cron` with a
  `timezone`. With `configurable: true`, each installation picks its own
  interval. One shared tick runs every trigger, so Frigg does not create a
  schedule per installation.
* **Previews and dry runs.** `previewWorkflow()` runs a workflow against
  recorded calls and returns what it would send, without calling any API.
  `previewSurface()` renders an integration's UI as Slack blocks, a HubSpot
  card, or HTML.

## 2. Connections agents can use without seeing a credential

### Management API v2

([ADR-053](https://github.com/friggframework/frigg/pull/668), #671)

* Every route lives under `/api/v2/*`. Errors share one shape, and every
  response carries `Frigg-API-Version: 2`. A resource that does not exist and
  one owned by someone else return the same `404`.
* `GET /api/meta` needs no authentication. It returns the API versions, their
  status, their OpenAPI documents, and feature flags such as `entityProxy`.
* Entities never return credential fields. `GET /api/v2/credentials` returns
  credentials with their secrets masked.
* `GET`/`POST /api/v2/authorize` handles single-step and multi-step
  authorization.
* **v1 still works, but it is frozen and deprecated.** Every v1 response
  carries `Deprecation` and `Link` headers, and each v1 call is logged and
  counted. v1 will not be removed before core 3.0. When nothing uses v1, set
  `managementApi: { v1: false }`. See the
  [API reference](../reference/api-reference.md) for the v1 to v2 table.

### Who is calling

* **Adopter tokens** (#678). Your product or your agent host signs a JWT and
  sends it as `Authorization: Bearer <token>`. Turn it on with
  `user.authModes.adopterJwt: true` and `user.jwtConfig` (`jwksUri` or
  `secret`, `issuer`, `audience`). Frigg finds or creates the user and the
  organization named in the token's claims (`sub` and `org_id` by default).
* **Organization memberships** (#681). A person can belong to several
  organizations. Each request acts in one active organization: the token's
  `org_id` claim or the `x-frigg-apporgid` header.
* **Organization roles** (#683). Members can use the organization's
  connections. Creating, changing, or deleting them needs a role listed in
  `user.orgAdminRoles` (default `['ADMIN']`).
* **Bearer tokens resolve to their owner** (#691, merged). A Frigg bearer
  token now acts as the user who owns it.

### Whose connection it is

([ADR-056](https://github.com/friggframework/frigg/pull/670), #682)

* Every entity has a scope: `individual` (one person), `organization` (shared
  by the organization), or `global` (shared by the whole app).
* The default follows `user.primary`: `organization` when it is
  `'organization'`, otherwise `individual`. Existing apps keep their behavior.
  You can set a scope per module binding, per integration
  (`Definition.ownership`), per entity type, or for the whole app
  (`appDefinition.ownership`), and you can let the caller choose from an
  `allow` list.
* Lists filter by `?scope=` and `?owner=me|org`, and each item says what the
  caller may do with it (`access`).
* Credentials are scoped through their entities (#684). Frigg refuses to
  delete a credential that another organization still uses.
* **App-level entity registry** (ADR-059, #679).
  `appDefinition.entities: { <moduleName>: { definition, scope, proxy } }`
  lets people connect a module that no integration uses yet. For example, a
  person can connect an account only so an agent can use it.
* **Attach and detach** (#689, merged).
  `addEntitiesToIntegration` and `removeEntitiesFromIntegration` change the
  connections on an existing integration.

### The entity proxy

([ADR-052](https://github.com/friggframework/frigg/pull/668), #671, #685, #690)

`POST /api/v2/entities/:entityId/proxy` calls the connected account's API
with the stored credential. The caller sends a method and a path. Frigg adds
the credential, refreshes the token if needed, and returns the response. The
caller never sees the token, which is what lets you hand a connection to an
agent.

```text
POST /api/v2/entities/7/proxy
{ "method": "GET", "path": "/crm/v3/objects/contacts", "query": { "limit": 10 } }
```

* **Off by default and denied by default.** Turn it on with
  `managementApi.proxy.enable: true`. Each API module lists the methods and
  paths it allows in `proxy.allow`, and the app can narrow that list per
  module.
* **The host always comes from the module.** Frigg refuses absolute URLs,
  `..`, encoded separators, and credential headers. A module that spans
  several hosts declares named `proxy.baseUrls`, and the request picks one by
  name (`"base": "docs"`), never by URL (#690).
* **Scopes.** `managementApi.proxy.scopes` (default `['individual']`) decides
  whose connections the proxy may use. Add `'organization'` to allow shared
  ones. `'global'` is never allowed (#685).
* Every call is audited as `frigg.api.proxy.request`. Upstream 429s keep
  `Retry-After`.

## 3. Two app profiles: product and operations

([ADR-056](https://github.com/friggframework/frigg/pull/670))

| | Product | Operations |
| --- | --- | --- |
| Who adopts | A software company building integrations for its customers | A company, a household, or one person automating its own work |
| Tenancy | Many customer organizations in one shared deployment, each isolated | One organization |
| Who connects accounts | Each customer and each of their users | Each member connects their own, and the organization shares some |
| Typical auth | Adopter JWT from the product | Staff login, or adopter JWT from an internal tool |

Both profiles use the same runtime and the same Management API. The difference
is configuration: the user model, the default entity scope, and which scopes
the proxy allows.

## 4. Production by default

* **Encryption fails closed** (#663). Every deployed stage encrypts sensitive
  fields, `dev` included. A deployed function with no key refuses to start
  with `EncryptionConfigurationError`. Set
  `encryption: { fieldLevelEncryptionMethod: 'kms' }`, or provide `AES_KEY_ID`
  and `AES_KEY`. Only local runs (`frigg start`, tests) skip encryption. To
  store a deployed stage in plaintext on purpose, set
  `fieldLevelEncryptionMethod: 'none'`. Frigg then logs a warning on every
  cold start.
* **Module credentials are encrypted too** (#680). Fields an API module lists
  in `encryption.credentialFields` are now encrypted. Before 2.0.1 they were
  silently stored in plaintext. Reads decrypt only values that have the exact
  ciphertext shape, so stored URLs that contain colons are no longer mistaken
  for ciphertext.
* **A scaffold that works and costs almost nothing idle** (#639). `frigg init`
  writes a backend that installs, starts, and deploys. It has no VPC and no
  NAT gateway, uses your own PostgreSQL through `DATABASE_URL`, and encrypts
  with KMS. Idle, it costs about $1 a month for the KMS key.
* **`frigg validate`** (#666,
  [ADR-051](https://github.com/friggframework/frigg/pull/666)). It checks your
  app definition against a schema that now matches what the runtime reads. It
  reports each error with a JSON pointer and a hint. `frigg build` and
  `frigg deploy` run it first and stop on errors.
* **osls 4** ([ADR-050](https://github.com/friggframework/frigg/pull/664)).
  Deploys move to oss-serverless 4. The CLI needs Node.js 22.13 or later, or
  Node.js 24. Lambda functions stay on `nodejs22.x`.
* **Rate limits that wait instead of fail** (ADR-049, #656–#658, if merged).
  An API module declares `static rateLimit`. The requester honours
  `Retry-After`. A queue message that hits a long limit goes back on the queue
  at its retry time instead of failing. When the wait is too long, the
  integration records a warning the user can see.

## 5. More than one host

* **AWS by default.** Lambda, SQS, KMS, and EventBridge Scheduler, generated
  from your app definition.
* **Netlify as a second provider**
  ([ADR-028](https://github.com/friggframework/frigg/pull/644), #686). Set
  `provider: 'netlify'` in the app definition. `frigg build`, `frigg deploy`,
  and `frigg start` then use Netlify Functions, background functions for
  queues, and a scheduled function for recurring work. `frigg doctor`,
  `repair`, and `generate-iam` stay AWS-only.

## Under the hood

* **Your database.** A Prisma data layer behind repositories runs the same
  code on PostgreSQL, MongoDB, and Amazon DocumentDB. Choose the engine with
  `database.<engine>.enable` or `DB_TYPE`. `frigg db:setup` generates the
  client and applies the schema.
* **Operations tooling.** `frigg doctor`, `frigg repair`, and
  `frigg generate-iam`. SSM offload for large environments (#625). Structured
  JSON logs (#654). Opt-in OpenTelemetry and usage counters (#622). Health
  endpoints at `/health`, `/health/detailed`, `/health/live`, and
  `/health/ready`.
* **Admin work inside your VPC.** Admin scripts (#517) and reports with
  `live`, `recorded`, and `snapshot` run modes (#628), both behind
  `x-frigg-admin-api-key`.
* **Connections that stay up.** Concurrent 401s share one token refresh
  (#636). A 401 gets a grace retry (#623). The existing `refresh_token` is kept
  when a provider omits it. Integrations record why a credential failed (#634).
  Config and process metrics update atomically (#614, #638).
* **Less plumbing.** Integration extensions (`Definition.extensions`),
  per-account webhooks, one-time jobs with `createSchedulerCommands()`,
  `delivery.isLastAttempt` (#653), `queryMappings` (#651), and `frigg auth`
  for testing a module's auth locally.
* **Hexagonal architecture.** Handlers call use cases, and use cases call
  repositories. AWS SDK v3, esbuild bundles, and a Prisma Lambda layer.

## Breaking changes at a glance

* **Mongoose is gone.** Data access runs on Prisma. Core no longer exports
  `mongoose`, the Mongoose models, `connectToDatabase`, `createFriggBackend`,
  `ModuleManager`, `Auther`, or `IntegrationFactory`.
* **You pick the database explicitly.** Set `database.postgres.enable`,
  `database.mongoDB.enable`, or `database.documentDB.enable`, or set
  `DB_TYPE`. `DATABASE_URL` is the connection string only.
* **Integration classes use `static Definition`.** It replaces the 1.x
  `static Config`, `static Options`, and `static modules`. Events go in
  `this.events`.
* **One `User` model** with a `type` field replaces the `IndividualUser` and
  `OrganizationUser` discriminators.
* **New integration statuses.** Integrations start in `IN_CREATION` and pass
  through `IN_DELETION`.
* **Encryption fails closed in every deployed stage, `dev` included.** A
  deployed function without a key refuses to start. Opt out only with
  `fieldLevelEncryptionMethod: 'none'`. `BYPASS_ENCRYPTION_STAGE` is no longer
  read (#663).
* **Module credential fields are encrypted on write** (#680). Existing rows
  stay readable and are encrypted the next time they are written.
* **The v1 Management API is deprecated.** It still works and is frozen. v1
  responses carry `Deprecation` headers. v1 `POST /api/integrations` now
  checks that the caller owns every entity (#671, #682).
* **New tables and columns.** Organization memberships and `organizationId`
  on entities and integrations come with migrations. Run `frigg db:setup` or
  apply them with `/admin/db-migrate` (#681, #682).
* **The app definition is validated.** Unknown keys and retired values stop
  `frigg build` and `frigg deploy`. `database.postgres.management` takes
  `discover`, `managed`, or `use-existing`, and `vpc.management` takes
  `use-existing` instead of `existing`. Set `user.usePassword` and
  `user.authModes` explicitly, because their schema defaults changed (#666).
* **Node.js 22.13+ or 24, with osls 4.** Deploys use oss-serverless 4 and
  `infrastructure.js` instead of the Serverless Framework and a hand-written
  `serverless.yml` (ADR-050). AWS SDK v3 replaces v2.

## Requirements

| Requirement | Frigg 2.0.1 |
| --- | --- |
| Node.js | 22.13 or later, or 24 |
| npm | 10 or later |
| Database | PostgreSQL, MongoDB (replica set), or Amazon DocumentDB |
| Host | AWS (Lambda `nodejs22.x`, SQS, KMS, EventBridge Scheduler) or Netlify |
| Deploy tool | `osls` 4 (installed with `@friggframework/devtools`) on AWS |
| Encryption | A KMS key or AES keys for every deployed stage |

## What's next

These items are not part of 2.0.1:

* **Two-way sync in one file.** A `defineIntegration` sync with conflict
  rules, built on the sync engine
  ([ADR-054](https://github.com/friggframework/frigg/pull/669),
  [ADR-044–047](https://github.com/friggframework/frigg/pull/648)).
* **Profile-aware scaffolding and default UIs.** ADR-056 proposes
  `frigg init --profile product|operations` and a default UI for each
  profile.
* **Capabilities as MCP tools**: a typed statement of what an app,
  integration, or API module can do
  ([ADR-020](../architecture-decisions/020-capabilities.md)).
* **An agent harness and integration templates**
  ([ADR-025](../architecture-decisions/025-agent-harness.md),
  [ADR-023](../architecture-decisions/023-integration-templates.md)).
* **Admin routes for `global` entities.** The tenant API refuses to create
  them.

See the [Roadmap](../roadmap/page-1.md) and the
[ADR index](../architecture-decisions/README.md).

## Start or upgrade

* **New app:** install the CLI with
  `npm install -g @friggframework/devtools@^2.0.1`, then run
  `frigg init my-app`, `frigg install <module>`, and `frigg start`.
* **Existing 1.x app:** follow
  [Migrating from 1.x to 2.0](../guides/migrating-to-2.0.md).
