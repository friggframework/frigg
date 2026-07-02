---
layout:
  title:
    visible: true
  description:
    visible: false
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: false
---

# The "Why" of Frigg Technical Decisions

Years of integration development on Frigg and proto Frigg have sharpened our opinions for how we developed what we did. Well documented decisions are the goal for Frigg now and going forward. This section will contain those decisions, and any discussion about _why_ we built things the way we did. Conversely, it is also an open invite for disagreement and to change our collective minds.

## Why we refactored to DDD + hexagonal architecture in 2.0

Frigg 2.0 was a ground-up refactor around **Domain-Driven Design** and
**hexagonal (ports-and-adapters) architecture**. The motivation was simple: as
Frigg grew, integration logic had become entangled with specific infrastructure
— a single database (Mongoose/MongoDB) and a single cloud (AWS). That coupling
made the framework harder to reason about, harder to test, and closed to the
backends our users actually asked for.

By putting a layer of abstraction between the domain and the infrastructure, we
separated *what an integration does* from *what it runs on*. The payoffs:

* **Multiple database types** — the same code runs on PostgreSQL, MongoDB, or
  DocumentDB, because persistence now lives behind repository interfaces.
* **A provider-agnostic foundation** — the cloud provider is an adapter, not an
  assumption, which is what makes supporting additional clouds tractable over
  time (AWS is the first fully supported provider).
* **Easier extension and plugin building** — clear seams and stronger,
  validated schemas for how integrations are defined make composition
  predictable instead of ad hoc.
* **Confidence** — thin handlers, isolated use cases, and swappable adapters
  mean each layer is testable on its own.

For the concrete decisions behind the refactor, see the
[Architecture Decision Records](../architecture-decisions/README.md), and for how
the layers fit together, the [Architecture reference](../reference/architecture.md).

{% hint style="info" %}
New to 2.0? Start with [What's New in 2.0](../getting-started/whats-new-in-2.0.md).
{% endhint %}

