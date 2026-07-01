---
description: >-
  The headline changes in Frigg 2.0 — a Prisma-based data layer, AWS SDK v3,
  smaller Lambda bundles, a reporting API, and namespaced integration
  extensions.
---

# What's New in Frigg 2.0

Frigg 2.0 is a foundational release. The biggest change is under the hood: the
data layer moves from Mongoose to **Prisma**, which lets a single Frigg codebase
run on **PostgreSQL, MongoDB, or DocumentDB** without changing your integration
code. Alongside it, the AWS integration was modernized to **AWS SDK v3**, Lambda
bundles shrank dramatically, and a new **reporting API** exposes integration
health.

{% hint style="warning" %}
2.0 contains **breaking changes**. If you are upgrading an existing app, read
[Migrating from 1.x to 2.0](../guides/migrating-to-2.0.md) before you start.
{% endhint %}

## Highlights

### Multi-database data layer (Prisma)

Frigg's persistence layer is now built on Prisma instead of Mongoose. The same
application code runs against different databases, selected by your connection
string:

* **PostgreSQL** — `postgresql://user:pass@host:5432/dbname`
* **MongoDB** — `mongodb://host:27017/dbname`
* **DocumentDB** — MongoDB-compatible endpoint

You configure the backend through a single **`DATABASE_URL`** environment
variable; Frigg infers the database engine from the URL scheme. The old separate
Mongo connection variables are gone.

Field-level encryption is now handled transparently by a **Prisma client
extension** — encrypted fields (credentials, mappings, hashed passwords, tokens)
are encrypted on write and decrypted on read without application-level
encrypt/decrypt calls. Encryption remains backed by AWS KMS or local AES‑256‑GCM.

### AWS SDK v3 and smaller bundles

All AWS service clients (SQS, KMS, Lambda, API Gateway Management, SSM) moved to
the modular **AWS SDK v3**. Combined with an esbuild-based bundling pipeline and
a minimal Prisma runtime layer, deployed Lambda artifacts are substantially
smaller than in 1.x. Deployment uses the **`osls`** (oss-serverless) CLI in place
of the legacy Serverless Framework binary; commands are otherwise the same
(`osls deploy --stage dev`).

See [AWS SDK v3 & oss-serverless migration](../reference/aws-sdk-v3-osls-migration.md)
for details.

### Integrations reporting API

A new read-only endpoint reports deployment-wide integration health:

```
GET /api/v2/reports/integrations
```

It returns totals plus breakdowns by status and by integration type (with
human-readable labels), and per-integration counts (modules, errors, mapped
records). It is gated by a dedicated API key sent in the
`x-frigg-reporting-api-key` header (validated against the `REPORTING_API_KEY`
environment variable), so it can be safely consumed by dashboards and monitoring
without exposing the Management API.

{% hint style="info" %}
The report reads **no** encrypted fields — it returns counts and status only.
{% endhint %}

### Namespaced integration extensions

Integration extensions (custom routes and event handlers attached to an
integration) are now **namespaced under their binding key**:

```
/api/{integration-name}-integration/{bindingKey}{route.path}
```

This makes it impossible for two extensions on the same integration to collide
on the same path, and each binding gets its own dedicated handler. Extensions
also gain a **`useDatabase`** flag (default `false`) so a database-free receiver
(e.g. a lightweight webhook acknowledgement) can skip the Prisma layer entirely
and start faster.

{% hint style="warning" %}
Because extension route URLs changed, **existing webhook registrations that point
at extension routes must be updated** at the provider. See the migration guide.
{% endhint %}

### CLI

The `frigg` CLI gains operational commands, including:

* `frigg doctor [stackName]` — health-check a deployed stack
* `frigg repair <stackName>` — reconcile infrastructure drift
* `frigg db:setup` — provision the database schema and generate the Prisma client
* `frigg generate-iam` — generate least-privilege IAM CloudFormation
* `frigg auth test|list|get|delete` — test and manage API-module credentials locally

### Security

The 2.0 dependency tree was audited and hardened — the production dependency set
of the published packages clears `npm audit --omit=dev`. Runtime requirements are
now **Node.js ≥ 22** and **npm ≥ 10**.

## Requirements

| Requirement | 2.0 |
| ----------- | --- |
| Node.js | ≥ 22 |
| npm | ≥ 10 |
| Database | PostgreSQL, MongoDB, or DocumentDB (via `DATABASE_URL`) |
| Deploy CLI | `osls` (oss-serverless) |

## Upgrading

Existing Frigg apps should follow the
[1.x → 2.0 migration guide](../guides/migrating-to-2.0.md). New apps get 2.0 by
default when you scaffold with the latest `frigg` CLI.
