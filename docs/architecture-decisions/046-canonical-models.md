# ADR-046: Canonical Models

**Status**: Proposed
**Date**: 2026-09-16
**Deciders**: Sean Matthews

## Context

[ADR-044](./044-sync-module-revitalization.md) establishes canonical objects — a platform-neutral
record shape with per-module maps in and out. It leaves the canonical shapes themselves to whoever
writes the integration.

That is the same position every adopter starts from, and it is the expensive part. Deciding what a
"contact" is across HubSpot, Salesforce, Pipedrive and Zoho — which fields are universal, which are
provider skew, how lifecycle stages reconcile — takes longer than wiring the sync that consumes it.
Frigg currently ships 30 `v1-ready` API modules and zero canonical models to connect them.

Unified API vendors sell precisely this: one canonical schema per category, maintained centrally,
consumed through a hosted service. It is a real product category and the value is real.

It also has two structural limits.

**The catalog is closed and head-weighted.** Coverage concentrates on the largest providers in each
category, because that is where the addressable market is. An adopter integrating Aspire — the
landscaping-industry ERP behind `faulkners-nursery--frigg` — will not find it in any unified API,
and never will. The same is true of most vertical software. The long tail is not a gap in their
coverage; it is a consequence of their business model.

**The data transits a third party.** For accounting, HR and healthcare-adjacent categories that is
a procurement conversation, sometimes a blocking one.

Frigg already has the raw material for a different answer — API modules, canonical objects,
[Capability Traits](./045-capability-traits.md), [Ontology](./021-ontology.md) L3 fragments, the
[Agent Harness](./025-agent-harness.md), and [Evals](./026-evals.md). What is missing is the models
themselves and a story for modifying them.

## Decision

Ship canonical models as forkable packages, one per category, with agent-assisted extension as a
first-class path rather than an afterthought.

### 1. Category packages

```
@friggframework/canonical-crm         — Contact, Company, Deal, Activity
@friggframework/canonical-accounting  — Customer, Invoice, Payment, Item, Account
@friggframework/canonical-ticketing   — Ticket, Comment, User
@friggframework/canonical-hris        — Employee, Department, Employment
```

Each exports canonical `Sync` object definitions plus `moduleMap`/`reverseModuleMap` entries for the
modules in that category that Frigg already ships. A package is only released for a category with at
least two real provider maps — a canonical model derived from one provider is that provider's schema
with the names changed.

### 2. Forking is the supported path, not the failure path

Unified APIs treat schema divergence as a problem to absorb centrally. Here it is expected:

```js
const { ContactSync } = require('@friggframework/canonical-crm');

class MyContactSync extends ContactSync {
  static Config = ContactSync.extend({
    addKeys:    { territoryCode: { type: 'string' } },
    overrideMap: { hubspot: { territoryCode: (o) => o.properties.hs_territory } },
    removeKeys: ['fax'],
  });
}
```

Adopters own their fork outright. No upstream approval, no waiting on a vendor roadmap, no request
queue.

### 3. Skew is declared, not hidden

The interesting providers do not fit. Aspire's invoice carries a billing schedule where a deposit
and a final draw are *positions in a sequence*, not invoice types — the fact ADR-044 §6 resolves by
putting `classification` in the canonical model. A unified accounting schema has nowhere to put that,
so it would be dropped in translation and the integration would be wrong in a way nobody notices
until an invoice is short by a deposit.

Canonical models therefore support declared **skew**: provider-specific extensions carried alongside
the canonical fields, visible to maps that want them and ignorable by maps that do not.

```js
static Config = {
    name:    'InvoiceSync',
    keys:    ['number', 'date', 'amount', 'classification'],
    matchOn: ['number'],
    skew: {
        aspire: {
            keys:   ['billingScheduleSortOrder', 'opportunityId'],
            hashed: false,   // carried and preserved, but excluded from the change hash
        },
    },
};
```

`hashed: false` is the default and matters: skew that feeds `getHashData()` would let a
provider-specific field mark a record dirty for every *other* destination, reintroducing exactly the
cross-provider churn ADR-044 §7 removes for relationships. A model that cannot represent a provider
honestly should say so rather than round it off.

### 4. Agent-assisted authoring is the delivery mechanism

The hard part of adopting a canonical model is writing the map for a provider nobody has mapped. Each
canonical package ships:

- an **L3 ontology fragment** ([ADR-021](./021-ontology.md)) — the model's conventions, what each
  canonical field means, which are required, what skew is already declared;
- a **skill** — given a provider's API module and its [capability traits](./045-capability-traits.md),
  draft the `moduleMap` and `reverseModuleMap`, flag fields it could not place, and propose skew
  entries for what does not fit. Authored per **ADR-036 Skills**, which names the skill subtypes and
  their lifecycles, rather than inventing a shape here; the scope → build → adversarial-review flow
  it runs inside is **ADR-037 Agent Pipeline** (both land with #644);
- **fixtures and evals** ([ADR-026](./026-evals.md)) — sample provider payloads with expected
  canonical output, so a generated map is scored rather than trusted.

This is the part a hosted unified API cannot offer, because the work happens inside the adopter's
codebase against a provider the vendor has never seen. It is also the honest framing of what an
agent is good at: a well-specified mapping task with a scoreable output and a human reviewing the
diff — not autonomous schema design.

### 5. Positioning

Frigg's canonical models compete on axes the hosted model cannot follow:

| | Unified API vendors | Frigg canonical models |
|---|---|---|
| Coverage | Head of each category | Head shipped, long tail authorable |
| Schema control | Vendor-owned | Adopter-forkable |
| Provider skew | Normalized away | Declared and preserved |
| Data path | Through vendor infrastructure | Stays in adopter infrastructure |
| New provider | Vendor roadmap request | Agent-assisted, same day |

Not "better" — different, and honestly so. A team wanting one integration to twelve CRMs with no
engineering should buy a unified API. A team whose integration targets include software the vendor
has never heard of has no such option today.

## Consequences

### Positive

- The most expensive part of an integration ships in the box for common categories.
- The long tail becomes tractable — the case that has no vendor answer at all.
- Canonical models give the sync engine, capability traits, ontology, agent harness and evals a
  single concrete artefact to converge on; each was previously justified on its own.
- Adopter data never leaves adopter infrastructure.

### Negative

- **Maintenance is the whole game.** Canonical schema upkeep is where unified API vendors spend the
  bulk of their engineering, funded by subscription revenue. A half-maintained canonical CRM model
  is materially worse than none: it invites trust, then silently drifts from provider reality. This
  is the strongest argument against the ADR and it is not fully answered.
- Every canonical schema change is potentially breaking for every fork. Versioning and deprecation
  need to be settled before the first release, not after.
- The "80% model" trap: canonical fields cover the common case and every adopter needs part of the
  remaining 20%. Forking and skew are the mitigation, but if the majority of adopters fork heavily,
  the shared model was not earning its place.
- Competing publicly with funded vendors invites comparison on coverage breadth, which is the axis
  where this loses.

### Neutral

- Category boundaries are arbitrary at the edges. Is an invoice accounting or commerce? Both, with
  different shapes. Expect argument.
- Shipping canonical models makes Frigg opinionated about data modelling in a way it has not been.

## Alternatives Considered

**Ship no canonical models; document the pattern only.** Zero maintenance burden, and ADR-044 works
without them. Rejected: it leaves the most expensive work with every adopter and wastes the
compounding value of 23 existing modules.

**Ship one universal model rather than per-category packages.** Fewer packages, one vocabulary.
Rejected: a Contact and an Invoice share nothing but the word "record," and a universal model would
be either uselessly abstract or an accidental union of every category.

**Generate canonical models entirely from capability traits and specs.** Appealing given ADR-045.
Rejected as the primary path: the judgement in a canonical model — which differences are semantic
versus cosmetic — is exactly what specs do not encode. Generation is a drafting aid, which is what
§4 makes it.

**Partner with or wrap an existing unified API.** Instant head coverage. Rejected: it reintroduces
the third-party data path and the closed catalog, which are the two limits this ADR exists to
address. Worth revisiting as an optional adapter for adopters who want both.

## Related

- [ADR-044: Sync Module Revitalization](./044-sync-module-revitalization.md) — defines the canonical
  object mechanism these models populate
- [ADR-045: Capability Traits](./045-capability-traits.md) — what the authoring skill reads to draft
  a map
- [ADR-021: Ontology](./021-ontology.md) — the L3 fragment each canonical package ships
- [ADR-025: Agent Harness](./025-agent-harness.md) — runtime the authoring skill operates inside
- [ADR-026: Evals](./026-evals.md) — scores generated maps against fixtures
- [ADR-013: Integration Version Migrations](./013-integration-version-migrations.md) — precedent for
  the versioning problem forks create; the missing contract is tracked in [#647](https://github.com/friggframework/frigg/issues/647)
- **ADR-030 Integration Versioning** — the version *contract* ADR-013 defers to, drafted in
  [#620](https://github.com/friggframework/frigg/pull/620) and landing with #644. It is the ADR
  this one's versioning question actually belongs to.
