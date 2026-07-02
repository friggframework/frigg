---
description: >-
  How Frigg is structured — a layered, hexagonal (ports-and-adapters)
  architecture that decouples integration logic from databases and cloud
  infrastructure.
---

# Architecture

Frigg 2.0 is organized around **Domain-Driven Design (DDD)** and **hexagonal
(ports-and-adapters) architecture**. The goal is a codebase that is easy to
reason about, easy to test, and open to new backends — you write integration
logic once, and the framework swaps the database or cloud implementation
underneath it.

## The layers

Dependencies point inward: outer layers depend on inner ones, never the reverse.

```
Handlers / Adapters   HTTP, SQS, and Lambda entry points. Thin — parse the
      │               request, call a use case, format the response. No
      │               business logic, no direct database access.
      ▼
Use Cases             Application/business logic: orchestration, validation,
      │               decisions. Depend on repository interfaces (ports), not
      │               concrete implementations.
      ▼
Repositories (ports)  Interfaces for data access and external systems. Atomic
      │               operations only; no business rules.
      ▼
Adapters              Concrete implementations: Prisma (PostgreSQL / MongoDB /
                      DocumentDB), AWS services (KMS, SQS, Lambda), third-party
                      APIs.
```

**The golden rule:** handlers/adapters call **use cases**, never repositories or
business logic directly. `Handler → Use Case → Repository → External System`.

## Why this matters

Because the business logic talks to **ports** rather than a specific database or
cloud SDK, the concrete adapters become swappable. This is what makes 2.0's
headline capabilities possible:

* **Multiple databases** — the same integration code runs on PostgreSQL,
  MongoDB, or DocumentDB, chosen by `DATABASE_URL`. See
  [Data Model](data-model.md).
* **Provider-agnostic infrastructure** — the cloud provider sits behind an
  abstraction, with AWS as the first fully supported provider. See
  [AWS SDK v3 & oss-serverless migration](aws-sdk-v3-osls-migration.md).
* **Transparent encryption** — a Prisma client extension encrypts/decrypts
  sensitive fields at the infrastructure layer, so application code never
  handles ciphertext. See [Encryption and Security](encryption-and-security.md).
* **Testability** — use cases are tested with mocked repositories; repositories
  are tested against real backends; handlers are tested as thin adapters.

## System components

* **Backend** — a serverless microservice deployed via `oss-serverless`
  (infrastructure-as-code), running on AWS Lambda.
* **Frontend (optional)** — most adopters bring their own UI; `@friggframework/ui`
  provides starter components, and the Management UI is available for admin use.
* **Database** — Prisma-backed, multi-engine (see above).
* **Eventing** — integrations respond to several event types:
  * User interaction (API routes)
  * Webhooks (with HMAC signature validation)
  * Queues (AWS SQS via the QueueManager)
  * Scheduled tasks / CRON (EventBridge Scheduler)
  * Polling triggers
* **Cross-cutting** — logging, retry, and error handling are standardized across
  handlers and workers.

## Related reference

{% content-ref url="core-concepts.md" %}
[core-concepts.md](core-concepts.md)
{% endcontent-ref %}

{% content-ref url="data-model.md" %}
[data-model.md](data-model.md)
{% endcontent-ref %}

For the decisions behind this structure, see the
[Architecture Decision Records](../architecture-decisions/README.md) and
[The "Why" of Frigg Technical Decisions](../explanation/the-why-of-frigg-technical-decisions.md).
