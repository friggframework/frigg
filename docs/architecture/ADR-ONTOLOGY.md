# Architecture Decision Record: Ontology

**Status**: Proposed (simplification of [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md), now deleted)
**Date**: 2026-06-09
**Author**: Sean Matthews

## Context

When an agent reads a Frigg codebase to add or modify an integration, it needs more than the code itself — it needs the *conventions* and *locked constraints* that govern that codebase. "Routes go through capabilities, not raw HTTP handlers." "Field-level encryption is mandatory for credential fields." "API module vocabulary is provider-specific, core is platform-neutral." These rules don't live in any single file; they live in patterns across the repo, in PR review history, in the heads of senior contributors.

CLAUDE.md files capture some of this, but they're a single flat surface per repo. They don't compose across the framework / vendor / instance boundary, they don't version, they're hard to author against (no schema, no validator), and they're expensive to keep in sync.

The **Ontology** is Frigg's structured answer: layered, typed, versioned context that compiles on demand into the XML-tagged blocks an agent sees at session start.

## Decision

A Frigg ontology is a stack of four layers, each progressively more specific:

| Layer | Scope | Authored by | Examples |
|---|---|---|---|
| **L1 — Universal** | Cross-framework conventions | Cross-framework working group (with Freya) | "Capability declarations point at specs and implementations" / "Friction is captured to a shared `@freyaframework/friction` log" |
| **L2 — Framework** | Frigg conventions, locked constraints | Frigg core maintainers | "Routes ride [Capabilities](./ADR-CAPABILITIES.md), not raw handlers" / "Credentials use field-level encryption" / "Provider-vocabulary helpers belong in API Module Extensions" |
| **L3 — Vendor-domain** | Per-API-module conventions | API module authors (shipped with the module) | "HubSpot signature verification uses v3 URL-signing" / "Salesforce credential refresh requires `apiPropertiesToPersist` for sandbox vs prod" |
| **L4 — Instance** | This specific Frigg app | The adopter | "This app uses Aurora Postgres" / "Multi-tenant — every webhook receiver must look up portalId → integrationId" |

Layers compose bottom-up at session start; higher layers override or refine lower ones. The compiled result is a single XML-tagged context block (`<FRIGG-HARNESS-CONTEXT>...</FRIGG-HARNESS-CONTEXT>`) injected by the [Agent Harness](./ADR-AGENT-HARNESS.md).

### Module-exported ontology

Each API module ships its own L3 fragment alongside its Definition:

```javascript
// @friggframework/api-module-hubspot/ontology.yaml
version: 1
layer: L3
domain: hubspot
conventions:
  - id: hubspot.webhooks.signature
    rule: "Always verify x-hubspot-signature-v3 against the full URL + body before processing"
    rationale: "HubSpot's signature scheme includes the full URL, so any path change breaks verification"
  - id: hubspot.portalid.lookup
    rule: "Resolve portalId → integrationId via findIntegrationByEntityExternalId(portalId, 'hubspot')"
    rationale: "Cross-tenant routing guard — multiple integrations with the same portalId throws"
locked-constraints:
  - id: hubspot.oauth.scope.read
    rule: "OAuth requires 'oauth' scope minimum even for read-only flows"
```

When the harness compiles the L3 layer for a Frigg app that has the HubSpot API module installed, it pulls in `hubspot/ontology.yaml` (and any other module's ontology files). Modules manage their own conventions; the compiler aggregates.

## Architecture

```mermaid
flowchart BT
    subgraph L4["L4 — Instance"]
        I["adopter app's ontology<br/>(this repo's choices)"]
    end
    subgraph L3["L3 — Vendor-domain"]
        H["hubspot/ontology.yaml"]
        S["slack/ontology.yaml"]
        N["..."]
    end
    subgraph L2["L2 — Framework"]
        F["frigg/ontology.yaml<br/>(in core)"]
    end
    subgraph L1["L1 — Universal"]
        U["cross-framework ontology<br/>(shared with Freya)"]
    end
    U --> F
    F --> H & S & N
    H & S & N --> I
    I -- "compiled at session start" --> Block["&lt;FRIGG-HARNESS-CONTEXT&gt;<br/>compiled XML block<br/>injected into agent context"]
```

Composition is additive — each higher layer adds or overrides conventions from the layer below. Conflicts are resolved by higher-layer-wins with a `console.warn` from the compiler.

## Session protocol

At session start, the [Agent Harness](./ADR-AGENT-HARNESS.md):

1. Walks the four layers in order (L1 → L2 → L3 → L4)
2. Compiles them into a single ontology object
3. Renders the object as an XML-tagged block
4. Injects the block as part of the agent's system context

For a subagent spawn, the harness re-runs steps 3-4 (the compiled object is cached per session). Validation subagents get the same block; friction is logged against the block's version SHA.

## Validation subagent pattern

The recommended use of the ontology by an agent:

1. Agent reaches a decision point (e.g. designing a new webhook receiver)
2. Agent spawns a validation subagent with the ontology block + the proposed design
3. Validation subagent checks the design against L1–L4 conventions and locked constraints
4. Validation subagent returns findings; parent agent corrects or proceeds

This is one of the three interventions tested in the [Evals](./ADR-EVALS.md) precursor (per the eval plan at `lefthookhq/lefthook--dev-toolkit:evals/PLAN.md`).

## Friction capture and ontology evolution

When an agent encounters a question the ontology *should* have answered but didn't, it logs a friction event to the shared `@freyaframework/friction` package (cross-framework with Freya per [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md)). Friction events are triaged into PR proposals against the relevant ontology layer.

This is the bottom-up evolution mechanism: the ontology fills its own gaps from real agent traces rather than from anyone trying to enumerate every constraint up front.

## Cross-references

- [AGENT-HARNESS](./ADR-AGENT-HARNESS.md) — the harness compiles, injects, and propagates the ontology
- [CAPABILITIES](./ADR-CAPABILITIES.md) — capability naming and surface-kind conventions live in the L2 ontology
- [INTEGRATION-TEMPLATES](./ADR-INTEGRATION-TEMPLATES.md) — templates may declare their own ontology fragment for adopter-specific conventions
- [EVALS](./ADR-EVALS.md) — measures whether ontology injection improves agent output

## Open questions

1. **Ontology schema.** Is the YAML shape above the right schema? JSON Schema for validation, but YAML for authoring. Lean: yes.
2. **Versioning across layers.** L2 conventions can change as the framework evolves; L3 conventions can change as APIs evolve. How are L4 ontologies pinned against compatible L2/L3 versions? Lean: SemVer per layer; instance pins its supported range.
3. **Conflict resolution beyond higher-layer-wins.** What if L4 wants to *relax* a locked constraint from L2? Lean: not allowed for locked constraints; allowed for conventions with explicit override declaration.
4. **Compiler language.** Node (for portability with the rest of Frigg) or Python (richer YAML / JSON-Schema tooling)? Lean: Node.
5. **Source adapters beyond YAML.** Markdown frontmatter? Embedded in capability declarations? Lean: YAML primary; markdown supported via frontmatter for adopters who prefer prose.

## References

- [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) — the prior, longer version of this ADR (deleted in this rework)
- Freya ADR-008 / ADR-009 — the cross-framework patterns this ADR borrows from
- The L1–L4 layer model was inspired by similar tiering in domain-driven-design ontology work
