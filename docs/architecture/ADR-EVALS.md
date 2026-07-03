# Architecture Decision Record: Evals

**Status**: Proposed
**Date**: 2026-06-09
**Author**: Sean Matthews

## Context

The other ADRs in this set make value claims about capabilities, ontology, harness, and templates: an agent working on Frigg produces better output with them than without. Rolling adoption needs measurement, not intuition. This ADR specifies what to measure, how, and the falsification criteria that gate broader rollout.

A cheap precursor (single-task, three-arm, manual) exists internally and decides whether the canonical eval described here is worth building.

## Decision

Build an 8-condition factorial eval under `@friggframework/evals` that measures the three Frigg-side independent variables (capability declaration, ontology layers, agent harness) across a model ladder and a fixed task pack. Use [promptfoo](https://www.promptfoo.dev/) as the runner (Node-native, MIT, mature) with a custom Frigg-aware provider for the agent-in-sandbox loop.

### Hypothesis (falsifiable)

Each of `{capability declaration, ontology layers, agent harness}` independently improves agent task-completion accuracy on Frigg integration tasks at p < 0.05 over five canonical runs. All three combined achieve a composite score of at least 90% on the framework eval task set. The lift is preserved at Haiku-class models: Haiku in the all-three-enabled condition reaches at least 80% (90% aspirational).

### Eight-condition factorial matrix

|  | Capability | Ontology | Harness |
|---|---|---|---|
| **Baseline** | ✗ | ✗ | ✗ |
| **Cap only** | ✓ | ✗ | ✗ |
| **Ont only** | ✗ | ✓ | ✗ |
| **Harn only** | ✗ | ✗ | ✓ |
| **Cap + Ont** | ✓ | ✓ | ✗ |
| **Cap + Harn** | ✓ | ✗ | ✓ |
| **Ont + Harn** | ✗ | ✓ | ✓ |
| **All three** | ✓ | ✓ | ✓ |

With harness off but capability or ontology on, the content is provided via direct system-prompt prefix (no pinning, no subagent propagation) so the variable is isolated.

### Model ladder

| Model | Tier | Why |
|---|---|---|
| Claude Haiku 4.5 | Low (cost-sensitive) | Weak-model test. The design must work at this tier, not just at Opus. |
| Claude Sonnet 4.6 | Mid | Typical adopter agent tier |
| Claude Opus 4.7 | High | Upper bound on Claude capability today |
| GPT-5 | Cross-vendor frontier | Verifies the design is not accidentally Claude-specific |
| gpt-oss-120b | Open-weights | Generalizes to local and self-hosted runs (data-residency adopters) |

Canonical run cost: $50 to $150 (8 conditions x 5 models x 10 tasks = 400 runs, Opus and GPT-5 dominate). Iterative subset runs: under $5.

### Task pack (10 tasks at v1)

Three categories with locked counts:

| Category | Count | Operates on | Purpose |
|---|---|---|---|
| Generic / fixture | 5 | Synthetic `FixtureCRMIntegration` etc. shipped with `@friggframework/evals` | General lift independent of adopter codebase bias |
| Real-bug-derived | 3 | Mocked replays of bugs that actually surfaced (e.g. the Pipedrive `/settings` smell) | Verify the design catches real failure modes |
| Adversarial / constraint | 2 | Prompts asking the agent to violate a locked constraint | Verify locked ontology rules survive prompt pressure |

Each task ships: prompt, sandboxed fixture, golden diff, golden test suite. The specific task list lives in `packages/evals/tasks/` once implemented.

### Scoring rubric

Four dimensions, reported separately and combined:

| Dimension | Type | How |
|---|---|---|
| Correctness | Binary | Run golden test suite against agent diff |
| Locality | [0, 1] | `min(1, goldenDiffLines / agentDiffLines)` |
| Constraint adherence | Binary | Did the agent respect any locked constraints in scope? |
| Cost | Continuous | Total tokens and wall-time (reported, not pass/fail) |

Composite: `0.6 * correctness + 0.3 * locality + 0.1 * constraint`.

### Falsification criteria (pre-registered)

The eval gates broader rollout. The first canonical run after the implementation packages land must clear:

1. **All-three at Haiku composite at least 80%.** The weak-model promise.
2. **Capability-only at Sonnet lift of at least 15pp over baseline.** Capability's standalone value.
3. **Ontology-only at Sonnet lift of at least 10pp over baseline.** Ontology's standalone value.
4. **Harness-only at Sonnet lift of at least 10pp over baseline.** Harness's standalone value (delivery mechanism net of content).
5. **Monotonicity.** Adding any variable never decreases composite by more than 5pp.
6. **Locked-constraint adherence at least 95%** across 2 adversarial x 5 models x 4 conditions-with-ontology = 40 trials.

If 1 through 4 are missed by more than 5pp, rollout pauses and design, implementation, and prompt tuning are revisited.

If 5 or 6 are missed at all, rollout stops. A design that degrades when a variable is added, or that fails locked invariants under prompt pressure, has a deeper problem than tuning can fix.

## Architecture

```mermaid
flowchart LR
    subgraph H["The harness (what's being measured)"]
        FivePiece["agent + CLI +<br/>harness + templates +<br/>capabilities"]
    end
    subgraph E["@friggframework/evals"]
        Runner["promptfoo runner<br/>+ Frigg-aware provider"]
        Tasks["10 tasks<br/>(5 fixture, 3 real-bug, 2 adversarial)"]
        Rubric["correctness + locality +<br/>constraint + cost"]
    end
    subgraph Output["Per canonical run"]
        Matrix["8 conditions × 5 models × 10 tasks<br/>= 400 scored agent runs"]
        Pub["Published results<br/>(per-condition strip plots,<br/>pairwise tournament)"]
    end
    H -- "produces artifacts" --> Runner
    Runner -- "executes" --> Tasks
    Tasks -- "scored by" --> Rubric
    Rubric --> Matrix --> Pub
```

The harness is the loop being measured; the eval is the loop measuring it.

## Relationship to the precursor

The precursor is a cheap upstream check: three arms (Raw, Skill, Skill+Ontology+Validation+Friction), two tasks, three replications = 18 runs. It deconfounds nothing (Arm C is a bundle), but it produces signal cheaply about whether the canonical 8-condition matrix here is worth building. The kill criteria in the precursor map onto criteria 1, 2, 3 above. If the precursor fails them, this ADR's implementation pauses pending design revision.

## Cross-references

- [CAPABILITIES](./ADR-CAPABILITIES.md), [ONTOLOGY](./ADR-ONTOLOGY.md), [AGENT-HARNESS](./ADR-AGENT-HARNESS.md): the three variables under test
- [INTEGRATION-TEMPLATES](./ADR-INTEGRATION-TEMPLATES.md), [PLUGINS](./ADR-PLUGINS.md), [EXTENSIONS-TAXONOMY](./ADR-EXTENSIONS-TAXONOMY.md): additional pieces the harness composes. Tested as part of the harness condition rather than as independent variables (their lift is mechanistically tied to the harness wiring them in).

## Open questions

1. **Task selection finalization.** The v1 task list needs review for representativeness before the canonical run. Templates and artifacts coverage may need an 11th task.
2. **Judge model.** Non-Claude judge (GPT-5.1 primary) per Panickssery et al. on judge self-preference. Confirmed in the precursor design.
3. **Result publication cadence.** Run per major framework release? Per ADR-impacting PR? On a schedule? Lean: major release plus on-demand.
4. **Adopter SDK pattern.** Should `@friggframework/evals` expose a runner adopters can use against their Frigg apps to confirm the design lifts in their context? Lean: yes, in Phase 2 after the canonical run validates.
5. **Cross-model judge variance.** A sample of runs scored by Gemini 2.5 Pro for variance characterization.

## References

- METR's long-task variance work, SWE-bench Verified, Chatbot Arena pairwise framework: methodology grounding
