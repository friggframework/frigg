---
description: >-
  Frigg 2.0 is the integration backend for people and their agents: a Prisma
  data layer, production defaults, a CLI that scaffolds, validates, and deploys,
  and a runtime that keeps connections up.
---

# What's New in Frigg 2.0

**Frigg 2.0 is the integration backend for people and their agents.** You get one data layer for PostgreSQL, MongoDB, and DocumentDB; a CLI that scaffolds, validates, and deploys; and a runtime that keeps connections healthy under load. Typed capabilities and agent-ready connections are in review for a later 2.0.x — see [In review](#in-review-not-in-201-yet).

Frigg 2.0.1 is the first stable 2.x release. Install `^2.0.1`. Do not use `^2.0.0`, which can resolve to a deprecated 2024 build of `@friggframework/core`.

{% hint style="warning" %}
2.0 has breaking changes. If you run a 1.x app, read [Migrating from 1.x to 2.0](../guides/migrating-to-2.0.md) before you upgrade.
{% endhint %}

## Define integrations in code

A class that extends `IntegrationBase` with a `static Definition` declares its modules, routes, and events. Events go in `this.events`.

* **Integration extensions** (`Definition.extensions`) bind an API module's ready-made routes, events, and queue dispatch.
* **Per-account webhooks** with `Definition.webhooks: true`.
* **One-time jobs** with `createSchedulerCommands()`.
* **Mappings** you can claim atomically (`createMapping`, #674) and query by content (`queryMappings`, #651).
* **Entities added to or removed from a live integration** (#689).
* **`delivery.isLastAttempt`** on queue handlers, so a run can fail cleanly on its last try (#653).

## Production by default

* **A scaffold that works and costs almost nothing idle** (#639). `frigg init` writes a backend that installs, starts, and deploys. It has no VPC and no NAT gateway, uses your own PostgreSQL through `DATABASE_URL`, and encrypts with KMS.
* **`frigg validate`** (#666). It checks your app definition against a schema that matches what the runtime reads, and reports each error with a JSON pointer and a hint. `frigg build` and `frigg deploy` run it first.
* **SSM offload** for large environments, with per-function env scoping (#625).

## Operations

* **Structured JSON logs** (#654), with `trace_id` and `span_id` inside an OTel span.
* **Opt-in OpenTelemetry traces and metrics** and usage counters (#622).
* **Health endpoints** at `/health`, `/health/detailed`, `/health/live`, and `/health/ready`.
* **`frigg doctor`, `frigg repair`, and `frigg generate-iam`.**
* **Admin scripts** (#517) and **reports** with `live`, `recorded`, and `snapshot` run modes (#628), behind `x-frigg-admin-api-key`. Admin queues are created locally on `frigg start` (#675).

## Connections that stay up

* Concurrent 401s on one API module share one token refresh (#636).
* A 401 gets a grace retry (#623). The existing `refresh_token` is kept when a provider omits it.
* Integrations record why a credential failed (#634).
* Config and process metrics update atomically (#614, #638).

## Under the hood

* **Your database.** A Prisma data layer behind repositories runs the same code on PostgreSQL, MongoDB, and Amazon DocumentDB. Choose the engine with `database.<engine>.enable` or `DB_TYPE`. `frigg db:setup` generates the client and applies the schema.
* **Hexagonal architecture.** Handlers call use cases, and use cases call repositories. AWS SDK v3, esbuild bundles, and a Prisma Lambda layer.
* **Hosts.** AWS (Lambda `nodejs22.x`, SQS, KMS, EventBridge Scheduler) deployed, and local with `frigg start`.

## Breaking changes at a glance

* **Mongoose is gone.** Data access runs on Prisma. Core no longer exports `mongoose`, the Mongoose models, `connectToDatabase`, `createFriggBackend`, `ModuleManager`, `Auther`, or `IntegrationFactory`.
* **You pick the database explicitly.** Set `database.postgres.enable`, `database.mongoDB.enable`, or `database.documentDB.enable`, or set `DB_TYPE`. `DATABASE_URL` is the connection string only.
* **Integration classes use `static Definition`.** It replaces the 1.x `static Config`, `static Options`, and `static modules`.
* **One `User` model** with a `type` field replaces the `IndividualUser` and `OrganizationUser` discriminators.
* **New integration statuses.** Integrations start in `IN_CREATION` and pass through `IN_DELETION`.
* **The app definition is validated.** Unknown keys and retired values stop `frigg build` and `frigg deploy`. `database.postgres.management` takes `discover`, `managed`, or `use-existing`, and `vpc.management` takes `use-existing` instead of `existing`. Set `user.usePassword` and `user.authModes` explicitly, because their schema defaults changed (#666).
* **Node.js 22 or later.** AWS SDK v3 replaces v2.

## Requirements

| Requirement | Frigg 2.0.1 |
| --- | --- |
| Node.js | 22 or later |
| npm | 10 or later |
| Database | PostgreSQL, MongoDB (replica set), or Amazon DocumentDB |
| Host | AWS (Lambda `nodejs22.x`, SQS, KMS, EventBridge Scheduler); local with `frigg start` |
| Deploy tool | `osls` (installed with `@friggframework/devtools`) |

## In review, not in 2.0.1 yet

These items have open pull requests or proposed ADRs. They are not on `next` and may change:

* `defineIntegration` and one-file integrations (ADR-054, #703); recurring triggers (ADR-055, #694); integration definitions as data (ADR-063).
* Management API v2, the entity proxy, entity scopes, and app profiles (ADR-052, 053, 056, 059; #671, #679, #681, #682, #684, #685, #690).
* Encryption that fails closed in deployed stages (#663) and encrypted module credential fields (#680).
* osls 4 (ADR-050, #704).
* Rate limits that wait instead of fail (ADR-049, #656–#658).
* Netlify as a second host (#686).
* Capabilities, an agent harness, and integration templates (ADR-020, 025, 023).

See the [Roadmap](../roadmap/page-1.md) and the [ADR index](../architecture-decisions/README.md).

## Start or upgrade

* **New app:** install the CLI with `npm install -g @friggframework/devtools@^2.0.1`, then run `frigg init my-app`, `frigg install <module>`, and `frigg start`.
* **Existing 1.x app:** follow [Migrating from 1.x to 2.0](../guides/migrating-to-2.0.md).
