---
description: >-
  Frigg's core data model — the entities the framework persists, and how the
  2.0 Prisma-based layer runs the same schema across PostgreSQL, MongoDB, and
  DocumentDB.
---

# Data Model

Frigg persists a small, well-defined set of entities that represent users,
their authenticated connections, and the integrations built on top of them. As
of **2.0**, the data layer is built on **Prisma** behind Frigg's repository
abstraction, so the same model runs across **PostgreSQL, MongoDB, or
DocumentDB** — selected by your `DATABASE_URL` connection string.

{% hint style="info" %}
Upgrading from 1.x (Mongoose)? See
[Migrating from 1.x to 2.0](../guides/migrating-to-2.0.md). The connection is now
a single `DATABASE_URL`, and encryption is applied transparently by a Prisma
client extension.
{% endhint %}

## Core entities

| Model | Purpose |
| ----- | ------- |
| **User** | The authenticated principal. A single model with a `type` enum (`INDIVIDUAL` or `ORGANIZATION`) — replacing the 1.x Mongoose discriminators. |
| **Token** | Authentication token for a user/session. |
| **Credential** | Stored auth material for a connection (OAuth tokens, API keys). Sensitive fields are encrypted at rest. |
| **Entity** | A connected external account/workspace, tied to a Credential and a user. |
| **Integration** | An installed integration instance — links the user's entities and holds its config and status. |
| **IntegrationMapping** | Per-integration key/value mapping data (encrypted). |
| **Process** | Tracks long-running operations with state and metrics; supports parent/child hierarchies. |
| **Sync** | Sync run/state for an integration. |
| **DataIdentifier** / **Association** / **AssociationObject** | Normalized records that back sync and entity associations (previously embedded arrays under Mongoose). |
| **State** | Stateless CSRF/flow state (e.g. OAuth handshakes). |
| **WebsocketConnection** | Tracks active WebSocket connections. |

### Enums

* **UserType** — `INDIVIDUAL`, `ORGANIZATION`
* **IntegrationStatus** — the lifecycle status surfaced on each Integration (and aggregated by the [reporting API](api-reference.md)).

## Choosing a database

The engine is inferred from the `DATABASE_URL` scheme:

{% tabs %}
{% tab title="PostgreSQL" %}
```bash
DATABASE_URL="postgresql://user:password@host:5432/your_db"
```
Integer primary keys (`autoincrement()`); relations via join tables.
{% endtab %}

{% tab title="MongoDB / DocumentDB" %}
```bash
DATABASE_URL="mongodb://host:27017/your_db"
```
ObjectId primary keys (`@db.ObjectId`); many-to-many via ObjectId scalar lists.
{% endtab %}
{% endtabs %}

Generate the client and provision the schema with `frigg db:setup` (or the
`prisma:generate` / `prisma:push` / `prisma:migrate` npm scripts for finer
control).

## Encryption

Field-level encryption is transparent — the Prisma extension encrypts on write
and decrypts on read, so repositories and use cases work with plain data.
Encrypted fields include `Credential.data`, `IntegrationMapping.mapping`,
`User.hashword`, and `Token.token`. See
[Encryption and Security](encryption-and-security.md) for configuration (AWS KMS
or AES).

{% hint style="info" %}
The canonical schema lives in the repo at
`packages/core/prisma-postgresql/schema.prisma` and
`packages/core/prisma-mongodb/schema.prisma`. If the tables above and the schema
files ever disagree, the schema files are the source of truth.
{% endhint %}
