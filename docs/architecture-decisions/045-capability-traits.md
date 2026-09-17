# ADR-045: Capability Traits

**Status**: Proposed
**Date**: 2026-09-16
**Deciders**: Sean Matthews

## Context

[ADR-020](./020-capabilities.md) gives a Frigg `Definition` a structured statement of *what it can
do* — a named capability, a surface kind, a pointer to a spec, a pointer to an implementation. That
answers "does this module list contacts?"

It does not answer the questions a consumer actually needs before composing two modules:

- Can `crm.contact.list` filter by modification time, or must every run read everything?
- Does `crm.contact.upsert` accept a key *we* control, so writes are idempotent without us tracking
  what we already wrote?
- Are this provider's record IDs stable across an export/reimport?
- Does deleting emit an event, or does a record just stop appearing?
- What is the maximum batch size before the provider rejects the request?

Today an API module `Definition` answers none of it. The shape is auth-centric — `API`, `getName`,
`moduleName`, `modelName`, `requiredAuthMethods`, `env` — and stops there. Nothing about data
behaviour is declared anywhere.

So the knowledge lives in integration code as unstated assumptions. `quo--frigg` hardcodes a
`modifiedSince` delta path for its CRMs because someone checked once. `faulkners-nursery--frigg`
writes a bespoke create-vs-update decision because nobody established whether QBO could upsert.
Those assumptions are invisible, untested, and re-derived per integration.

### Why this matters beyond documentation

In a distributed system, the systems of record should own state. The ideal integration is a
stateless passthrough: read a change, write it, store nothing, and let both endpoints handle
identity and idempotency. Every byte Frigg persists about someone else's records is a replica that
drifts, a migration to write, and a privacy surface to defend.

Whether that ideal is reachable for a given pair of systems is **entirely determined by what those
systems can do**. If the destination upserts on a key we control and the source can tell us what
changed, we need no database. If neither is true, we need identity mapping, change hashes, and
possibly a shadow copy.

[ADR-044 §2](./044-sync-module-revitalization.md) defines exactly that ladder for sync and then
cannot implement it, because there is no way to ask a module what it supports. This ADR supplies
the missing layer, generically — sync is its first consumer, not its only one.

## Decision

Extend capability declarations with **traits**: a closed, versioned, machine-readable vocabulary
describing what a capability can do, distinct from what it is called.

`traits` is additive to the capability shape ADR-020 already defines — `surface`, `spec`,
`implementedBy`, `dependsOn` are unchanged and carried verbatim from its worked example:

```js
// @friggframework/api-module-hubspot/definition.js
const Definition = {
    API: Api,
    moduleName: config.name,
    // …auth-centric keys unchanged…
    capabilities: {
        'crm.contact.list': {
            surface: 'data-read',
            spec: { kind: 'openapi', ref: './specs/hubspot-openapi.yaml#/paths/~1crm~1v3~1objects~1contacts/get' },
            implementedBy: { kind: 'api-class-method', ref: 'HubSpotApi.listContacts' },
            traits: {
                'delta.modifiedSince': true,
                'read.pageMax': 100,
                'read.sortable': ['lastmodifieddate', 'createdate'],
                'identity.stable': true,
                'time.modifiedAt': 'properties.lastmodifieddate',
            },
        },
        'crm.contact.upsert': {
            surface: 'data-write',
            spec: { kind: 'openapi', ref: './specs/hubspot-openapi.yaml#/paths/~1crm~1v3~1objects~1contacts~1batch~1upsert/post' },
            implementedBy: { kind: 'api-class-method', ref: 'HubSpotApi.upsertContacts' },
            traits: {
                'write.upsertByExternalKey': 'idProperty',
                'write.batchMax': 100,
                'write.partialUpdate': true,
            },
        },
    },
};

module.exports = { Definition };
```

**A note on `surface`.** ADR-020's Decision prose glosses surfaces as *(sync, action, webhook, ui,
lifecycle, ai-inference, mcp-tool, config, cron)*, but its Open questions §3 gives the normative
initial set — `sync, data-read, data-write, action, webhook-source, webhook-sink, ui, lifecycle,
ai-inference, mcp-tool, config, cron` — which the worked example's `data-read` and `webhook-source`
conform to. The prose gloss is the stale one and should be brought in line. This ADR follows the
worked example and the Open questions enum. Traits are unaffected either way — they hang off the
capability regardless of how its surface is named.

### 1. Traits are a closed vocabulary, not free-form metadata

Free-form metadata cannot be negotiated over. The vocabulary is versioned, schema-validated, and
extended by PR — a typo is a build error, not a silent `undefined`.

First cut, grouped by concern:

| Group | Traits | Answers |
|---|---|---|
| **delta** | `modifiedSince`, `cursor`, `changeLog`, `none` | How do we learn what changed? |
| **events** | `webhook`, `webhook.replay`, `webhook.ordered`, `webhook.payloadComplete` | Can the provider push, and is the push trustworthy on its own? |
| **identity** | `stable`, `mutable`, `externalKeyWritable` | Can we rely on an ID, and can we attach our own? |
| **write** | `upsertByExternalKey`, `createOnly`, `partialUpdate`, `idempotencyKey`, `batchMax` | Can we write without tracking what we already wrote? |
| **time** | `modifiedAt`, `createdAt`, `clockSkewTolerance` | Is recency-based conflict resolution possible? |
| **read** | `pageMax`, `sortable`, `filterable`, `totalCount` | Can we fan out, and in what order? |
| **delete** | `soft`, `hard`, `emitsEvent`, `none` | Will we ever learn a record went away? |
| **rate** | `requestsPerWindow`, `windowSeconds`, `concurrent` | How hard can we push? |

### 2. `unknown` is a first-class value, and it is the default

A missing trait means *not declared*, never *not supported*. Consumers must treat `unknown` as the
conservative case — for sync, that means falling back to a higher storage tier, not assuming the
optimistic path. Silence degrades safely.

This matters because traits will be adopted incrementally across two dozen modules. A half-annotated
library must behave correctly, or nobody will finish the annotation.

### 3. Two authoring paths, one of which does not fork the vendor spec

**Inline**, on the Definition, as above — right for traits about how the *module* wrapped the API.

**Overlay**, for traits that describe the provider's own API surface. The
[OpenAPI Overlay Specification](https://spec.openapis.org/overlay/v1.0.0.html) reached a stable
1.0.0 and is designed for exactly this: an ordered list of actions that select nodes in a target
OpenAPI description by JSONPath and merge data into them. A Frigg overlay annotates a vendor's
published spec with `x-frigg-traits` without maintaining a fork:

```yaml
overlay: 1.0.0
info: { title: Frigg traits for HubSpot CRM, version: 1.0.0 }
actions:
  - target: $.paths['/crm/v3/objects/contacts'].get
    update:
      x-frigg-traits:
        delta.modifiedSince: true
        read.pageMax: 100
```

This is what keeps traits maintainable. Vendors ship OpenAPI; we ship the delta; their updates
don't clobber our annotations and ours don't fork their spec.

### 4. Negotiation is a pure function, owned here

```
negotiate(source.traits, destination.traits, requirements)
  → { satisfiable: true,  plan: {...} }
  | { satisfiable: false, reasons: [...], remedies: [...] }
```

Generic and consumer-agnostic. ADR-044 calls it to derive a storage tier; the
[Agent Harness](./025-agent-harness.md) calls it to know whether a proposed integration is possible
before scaffolding it; a dashboard calls it to explain why a sync is expensive. The *interpretation*
of the result belongs to each consumer. `remedies` is deliberately part of the contract — "this pair
requires Tier 2 storage because the source declares `delta.none`" is far more useful than a boolean.

### 5. Traits must be falsifiable

A module claiming `write.upsertByExternalKey` that cannot actually upsert will silently duplicate
every record. Declarations that cannot be checked will rot exactly like the copy-pasted module maps
catalogued in ADR-044.

Every trait in the vocabulary ships with a **conformance probe** — a small test executable against
a sandbox or recorded fixtures that verifies the claim. Probes run in the module's own test suite
and are scoreable by [Evals](./026-evals.md). A trait without a probe may be declared, but is
reported as `unverified` and consumers may choose to treat it as `unknown`.

### 6. Scope boundary

This ADR defines the vocabulary, the authoring paths, the negotiation signature, and the
verification requirement. It does **not** define what any consumer does with the answer. The sync
storage-tier ladder lives in ADR-044 §2. Future consumers bring their own interpretation.

## Consequences

### Positive

- Stateless-first becomes achievable rather than aspirational. The engine can *know* when it may
  store nothing, instead of defensively persisting a record per pair forever.
- Assumptions currently buried in integration code become declared, reviewable, and testable.
- Agents get a machine-readable answer to "can these two systems actually be synced, and at what
  cost," which is the question they currently answer by reading source and guessing.
- Overlays let traits track vendor specs without forking them, which is the difference between a
  living annotation set and a stale one.
- `remedies` turns "unsupported" into actionable guidance.

### Negative

- **Two dozen modules need annotating**, and the annotation is only as good as its probes. A
  half-hearted rollout produces confident-looking wrong answers, which is worse than no answers.
  `unknown`-as-default is the mitigation, but it only works if consumers honour it.
- Traits are a new API surface with its own versioning and deprecation burden.
- The vocabulary will be wrong on first contact. Some traits will prove unnecessary, and at least
  one important one is certainly missing. Versioning it from day one is the hedge.
- Probes need sandboxes or recorded fixtures, which not every provider makes easy.

### Neutral

- Overlaps with [Ontology](./021-ontology.md) L3, which also ships per-module knowledge. The split:
  ontology is prose conventions for agents; traits are structured facts for programs. They should
  cross-reference and may eventually share a manifest.
- Establishing that capabilities carry structured properties, not just identity, will invite other
  property sets. That is probably correct, and should go through the same closed-vocabulary
  discipline.

## Alternatives Considered

**Infer traits automatically from the vendor's OpenAPI.** Attractive — no authoring burden. Rejected
as the primary mechanism: specs routinely omit exactly what matters here. A `modifiedSince` query
parameter's *existence* does not tell you whether it filters on server receipt time or record
modification time, and idempotency semantics are almost never expressed in a schema. Inference is
worth building as a *draft generator* for a human or agent to confirm, not as the source of truth.

**Put it in the Ontology (ADR-021) L3 layer.** Modules already ship L3 fragments with conventions.
Rejected: ontology is prose compiled into agent context. Programs need typed values they can branch
on, and negotiation must not depend on interpreting English.

**Configure it per integration instead of per module.** Simplest, and matches what every existing
codebase does today. Rejected: it is the status quo, and the status quo produced five sync
implementations each re-deriving the same provider facts. Provider behaviour is a property of the
provider.

**Do nothing; always store everything.** Always correct, never optimal. Rejected because it
permanently forecloses stateless passthrough, forces a database on integrations that do not need
one, and makes Frigg carry replicas of customer data it has no reason to hold.

## Related

- [ADR-020: Capabilities](./020-capabilities.md) — the declaration this extends
- [ADR-044: Sync Module Revitalization](./044-sync-module-revitalization.md) — first consumer; its
  §2 storage-tier ladder is unimplementable without this
- [ADR-019: API Module Extensions](./019-api-module-extensions.md) — the api-module authoring story
  traits are declared alongside
- [ADR-021: Ontology](./021-ontology.md) — prose conventions to these structured facts
- [ADR-025: Agent Harness](./025-agent-harness.md) — consumes negotiation when planning integrations
- [ADR-026: Evals](./026-evals.md) — scores conformance probes
