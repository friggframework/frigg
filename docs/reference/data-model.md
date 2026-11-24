# Data Model

Frigg keeps its bookkeeping in a handful of tables. This page lists them. You rarely touch them directly, because Frigg's repositories read and write them for you.

## How data is stored

| | |
| --- | --- |
| ORM | [Prisma](https://www.prisma.io/) 6 (`@prisma/client` and `prisma` are peer dependencies of `@friggframework/core`) |
| Default database | PostgreSQL (what `frigg init` scaffolds) |
| Also supported | MongoDB, and AWS DocumentDB through the MongoDB client |
| Connection | The `DATABASE_URL` environment variable |
| Schemas | `packages/core/prisma-postgresql/schema.prisma` and `packages/core/prisma-mongodb/schema.prisma` in the Frigg repo. Both define the same models. |
| Schema changes | PostgreSQL uses Prisma migrations (shipped in `prisma-postgresql/migrations`). MongoDB uses `prisma db push`. `frigg db:setup` runs the right one for you. |

Frigg doesn't use Mongoose.

Which schema Frigg loads depends on the `database` block of your app definition: `postgres.enable`, `mongoDB.enable` or `documentDB.enable`. If more than one is enabled, PostgreSQL wins, then MongoDB, then DocumentDB. A `DB_TYPE` environment variable overrides the app definition; Frigg's migration handlers set it.

## Models

| Model | What it holds |
| --- | --- |
| `User` | An app user (individual or organization; see `UserType`). |
| `Token` | Authentication tokens with an expiry, stored hashed. |
| `Credential` | Tokens and auth data for one connection to an external API, kept in a `data` JSON field. |
| `Entity` | The authorizing account behind a connection (for example "this HubSpot portal"). Points at a `Credential` and records `moduleName` and `externalId`. |
| `Integration` | An integration instance linking entities, with its config and `IntegrationStatus`. |
| `IntegrationMapping` | Key/value mappings an integration stores for itself. |
| `Sync`, `DataIdentifier` | Records used by sync-style integrations to match objects across systems. |
| `Association`, `AssociationObject` | Links between objects across entities (see `AssociationType`). |
| `Process` | Tracks long-running operations such as CRM syncs, data migrations and bulk jobs. |
| `State` | Generic JSON state storage. |
| `WebsocketConnection` | API Gateway WebSocket connections. |
| `AdminScriptExecution`, `ScriptSchedule` | Admin script runs (with `AdminScriptExecutionState`) and their schedules. |
| `UsageCounter` | Per-integration usage metrics, counted per time window. Deliberately not linked to users or integrations. |

The schema files are the source of truth for fields and relations. On PostgreSQL, IDs are auto-incrementing integers. On MongoDB they're ObjectIds.
