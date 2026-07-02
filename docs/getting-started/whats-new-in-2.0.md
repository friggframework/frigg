---
description: >-
  Frigg 2.0 is a ground-up architectural refactor — DDD and hexagonal
  architecture, a provider-agnostic abstraction layer, multi-database support,
  stronger integration schemas, improved routing, and a unified CLI.
---

# What's New in Frigg 2.0

Frigg 2.0 is a foundational release. The codebase was refactored end-to-end
around **Domain-Driven Design (DDD)** and **hexagonal architecture**, introducing
a clean abstraction layer that decouples integration logic from the
infrastructure underneath it. That one change unlocks most of the rest of 2.0:
**multiple database types today, a provider-agnostic foundation for multiple
clouds, and a much simpler surface for composing integrations, extensions, and
plugins.**

{% hint style="warning" %}
2.0 contains **breaking changes**. If you are upgrading an existing app, read
[Migrating from 1.x to 2.0](../guides/migrating-to-2.0.md) before you start.
{% endhint %}

## The big picture: a layered, hexagonal architecture

The framework now separates concerns into clear layers with dependencies
pointing inward:

```
Handlers / Adapters   → HTTP, SQS, Lambda events (thin; no business logic)
      ↓
Use Cases             → business logic, orchestration, validation
      ↓
Repositories (ports)  → data access & external systems behind interfaces
      ↓
Adapters              → Prisma (Postgres/Mongo/DocumentDB), AWS services, APIs
```

Because business logic now talks to **ports (interfaces)** rather than concrete
databases or cloud SDKs, the concrete implementations become swappable. This is
what makes the framework easier to reason about, far easier to test, and open to
new backends without rewriting integration code.

## Multi-database data layer

The persistence layer is built on **Prisma** behind the repository abstraction,
so the same application code runs against different databases, selected by your
connection string:

* **PostgreSQL** — `postgresql://user:pass@host:5432/dbname`
* **MongoDB** — `mongodb://host:27017/dbname`
* **DocumentDB** — MongoDB-compatible endpoint

You configure the backend through a single **`DATABASE_URL`** environment
variable; Frigg infers the engine from the URL scheme.

Field-level encryption is now handled transparently by a **Prisma client
extension** — encrypted fields (credentials, mappings, hashed passwords, tokens)
are encrypted on write and decrypted on read with no application-level
encrypt/decrypt calls, backed by AWS KMS or local AES‑256‑GCM.

## Provider-agnostic infrastructure

The cloud provider is now an abstraction rather than a hardcoded assumption,
laying the groundwork for multiple providers. **AWS is the first fully supported
provider**, and the AWS path was substantially modernized:

* **oss-serverless (`osls`)** replaces the legacy Serverless Framework as the
  infrastructure-as-code tool. Commands keep the same shape
  (`osls deploy --stage dev`).
* **AWS SDK v3** across all services (SQS, KMS, Lambda, API Gateway Management,
  SSM), plus an esbuild-based bundling pipeline and a minimal Prisma runtime
  layer — deployed Lambda artifacts are dramatically smaller than in 1.x.
* **Better deploy tooling** for diagnosing and fixing AWS stacks:
  `frigg doctor` (health-check a deployed stack), `frigg repair` (reconcile
  infrastructure drift), and `frigg generate-iam` (least-privilege IAM
  CloudFormation), alongside automatic discovery of existing VPC/subnet/KMS
  resources.

See [AWS SDK v3 & oss-serverless migration](../reference/aws-sdk-v3-osls-migration.md).

## Stronger integration & module schemas

Defining and building integrations is now backed by more solid, validated
schemas. A clearer, enforced contract for how integrations and API modules are
declared makes composition more predictable and catches misconfiguration earlier
instead of at runtime.

## Improved routing and easier extensions

Integration routing was reworked, and the **extension/plugin model** is cleaner:

* Extension routes are **namespaced under their binding key**
  (`/api/{integration}-integration/{bindingKey}{route.path}`), so two extensions
  on the same integration can no longer collide, and each binding gets its own
  handler.
* Extensions gain a **`useDatabase`** flag (default `false`) so a database-free
  receiver (e.g. a lightweight webhook acknowledgement) can skip the Prisma
  layer and start faster.

{% hint style="warning" %}
Because extension route URLs changed, **existing webhook registrations that point
at extension routes must be updated** at the provider. See the migration guide.
{% endhint %}

## A unified CLI (goodbye `create-frigg-app`)

Project scaffolding and lifecycle tooling are consolidated into the single
**`frigg`** CLI — `create-frigg-app` is retired. The CLI now covers the full
loop:

* `frigg init` — scaffold a new app
* `frigg install <module>` — add an API module
* `frigg start` — local development
* `frigg build` / `frigg deploy` — build and deploy (with `--skip-doctor`, etc.)
* `frigg db:setup` — provision the schema and generate the Prisma client
* `frigg doctor` / `frigg repair` / `frigg generate-iam` — operate AWS stacks
* `frigg ui` — launch the Management UI
* `frigg auth test|list|get|delete` — test and manage API-module credentials locally

## Integrations reporting API

A new read-only endpoint reports deployment-wide integration health:

```
GET /api/v2/reports/integrations
```

It returns totals plus breakdowns by status and by integration type (with
human-readable labels) and per-integration counts (modules, errors, mapped
records). It is gated by a dedicated key in the `x-frigg-reporting-api-key`
header (validated against `REPORTING_API_KEY`), so dashboards and monitoring can
consume it without touching the Management API.

{% hint style="info" %}
The report reads **no** encrypted fields — counts and status only.
{% endhint %}

## Security & requirements

The 2.0 dependency tree was audited and hardened — the production dependency set
of the published packages clears `npm audit --omit=dev`.

| Requirement | 2.0 |
| ----------- | --- |
| Node.js | ≥ 22 |
| npm | ≥ 10 |
| Database | PostgreSQL, MongoDB, or DocumentDB (via `DATABASE_URL`) |
| Deploy CLI | `osls` (oss-serverless) |

## What's next

2.0 is the platform the roadmap builds on — the abstraction layer is what makes
additional cloud providers, database backends, and richer extension/plugin
capabilities tractable. See the [Roadmap](../roadmap/page-1.md) for what's coming
(and to make suggestions), and tell us what you need via the
[community channels](../support/support.md).

## Upgrading

Existing apps should follow the
[1.x → 2.0 migration guide](../guides/migrating-to-2.0.md). New apps get 2.0 by
default when you scaffold with the latest `frigg` CLI.
