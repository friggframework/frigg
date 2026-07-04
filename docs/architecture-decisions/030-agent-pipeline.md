# ADR-030: Agent Pipeline

**Status**: Proposed
**Date**: 2026-09-27
**Deciders**: Sean Matthews

## Context

The [Agent Harness](./025-agent-harness.md) grounds a single agent's session with compiled ontology and capability context. The [Skills](./029-skills.md) layer lets agents preload adopter-specific knowledge and contracts. Neither addresses how multiple agents compose into a workflow with typed handoffs.

An adopter demonstrates a three-agent pipeline in production: a spec-author produces a spec, a build-engineer consumes that spec and implements the integration, an adversarial-reviewer refutes-by-default against a gold-standard exemplar. Each phase has its own model, tools, and role. The handoff between phases is a machine-checkable artifact validated against a JSON Schema.

The pattern is general to any repeated integration authoring flow that benefits from splitting scoping from building from reviewing. This ADR names the shape and cross-references the pieces that compose it.

## Decision

An **Agent Pipeline** is a sequence of sub-agents with typed handoffs. Each agent has a defined role, model tier, tool restriction, and preloaded skill set. The output of one phase is the input to the next, validated against a [Contract Skill](./029-skills.md) schema.

### Canonical three-phase pipeline

```
scope-author → build-engineer → adversarial-reviewer
```

| Phase | Role | Model | Tools | Preloaded skills |
|---|---|---|---|---|
| Scope | Author the spec from third-party API docs + adopter ontology | opus (creative discovery) | Read, Grep, Glob, WebFetch, Write, Bash | ontology, contract, recipe |
| Build | Implement the spec | sonnet (mechanical) | Read, Write, Edit, Bash, Grep, Glob | ontology, contract, recipe |
| Review | Refute the artifact meets the quality bar | opus (skeptical judgment) | Read, Grep, Glob, Bash (`disallowedTools: Write, Edit`) | ontology |

Model tiering is intentional. Scoping and adversarial review benefit from a stronger model because both require judgment. Building is mechanical once the spec exists and works well at a smaller model.

### The read-only adversary

The reviewer is structurally read-only via `disallowedTools: Write, Edit`. The reviewer cannot patch the artifact it critiques. The framework enforces this at spawn time.

Review calibration:

- Default to skeptical. A finding is "PASS" only if the reviewer genuinely could not refute it.
- Findings cite file:line or the spec field. Free-form judgment without an anchor is not a valid finding.
- Explicit `openQuestions` in the spec are NOT defects. They are the human-decision surface. The reviewer only raises a question if the spec should have answered it from the available API docs.
- Over-engineering and verbosity are penalized as hard as gaps. Speculative abstractions and unrequested config fail review.

### Typed handoffs

The output of each phase is validated against a [Contract Skill](./029-skills.md) schema:

- Scope → Build: `specs/<name>.spec.json` conforms to `spec.schema.json`
- Build → Review: the codebase diff plus the spec ID
- Review → Build (on refutation): a findings JSON conforming to `review.schema.json` with `{finding_id, file, line, category, severity, rationale}`

Contract skills ship the schemas alongside human-readable templates. Both are versioned with the adopter's skill package.

### EARS acceptance criteria

The spec declares acceptance criteria in [EARS](https://alistairmavin.com/ears/) form:

```json
{
  "acceptanceCriteria": [
    { "id": "AC-1", "statement": "WHEN a new contact is created in HubSpot THE SYSTEM SHALL upsert the corresponding destination CRM contact within 30 seconds" },
    { "id": "AC-2", "statement": "WHEN the third-party OAuth refresh fails THE SYSTEM SHALL mark the integration as ERROR and stop further sync attempts" }
  ]
}
```

The build agent tags each test with the matching `AC-n` id. The trace from requirement to test survives the pipeline and is grepped by the reviewer.

## Architecture

```mermaid
flowchart LR
    subgraph Scope["Scope phase (opus)"]
        S["spec-author"]
    end
    subgraph Build["Build phase (sonnet)"]
        B["build-engineer"]
    end
    subgraph Review["Review phase (opus, read-only)"]
        R["adversarial-reviewer"]
    end
    Docs["Third-party API docs<br/>+ adopter ontology"] --> S
    S -- "specs/*.spec.json<br/>(validates against<br/>spec.schema.json)" --> B
    B -- "diff + tests tagged AC-n" --> R
    R -- "refutation<br/>(review.schema.json)" -.-> B
    R -- "PASS" --> Ship["Merge → deploy"]
```

Adversarial-review refutations loop back to the build agent, which patches and re-submits. The pipeline terminates when the reviewer returns PASS.

## Shape (worked example)

Invoking the pipeline from the top-level agent or CLI:

```bash
$ frigg pipeline run integration --partner hubspot --name HubspotSync
Phase 1/3: Scoping
  → spec-author (opus) authoring specs/hubspot-sync.spec.json
  ✓ Spec validated against spec.schema.json (12 AC, 8 gotchas addressed)
Phase 2/3: Building
  → build-engineer (sonnet) implementing from spec
  ✓ Generated backend/src/api-modules/hubspot/ (api.js, definition.js)
  ✓ Generated backend/src/integrations/HubspotSyncIntegration.js
  ✓ Generated tests (12 tagged AC-1 through AC-12)
Phase 3/3: Reviewing (adversarial)
  → adversarial-reviewer (opus, read-only) via 3 lenses: correctness, gotchas, simplicity
  ✗ FAIL: AC-7 test missing rate-limit assertion; over-engineered retry helper (lens: simplicity)
Loop back to Phase 2:
  → build-engineer patching per review findings
  ✓ AC-7 test now asserts rate-limit backoff; retry helper removed
Phase 3/3: Reviewing (retry)
  ✓ PASS: all three lenses cleared
Pipeline complete. Ready to merge.
```

## Cross-references

- [AGENT-HARNESS](./025-agent-harness.md): each agent in the pipeline is grounded by the harness at spawn (compiled ontology + capabilities). The pipeline composes agents; the harness grounds them.
- [SKILLS](./029-skills.md): each agent preloads knowledge, contract, and recipe skills via `skills:` frontmatter
- [CAPABILITIES](./020-capabilities.md): the spec-contract schema is what a capability's `spec.ref` can point at when the capability is implemented by an agent-produced integration
- [ONTOLOGY](./021-ontology.md): the reviewer refutes against ontology-encoded conventions and locked constraints
- [APP-INIT](./028-app-init.md): the `agent-enabled` Project Template scaffolds a starter pipeline

## Open questions

1. **Pipeline runner.** Where does the pipeline orchestrator live? A `frigg pipeline` CLI command, a Claude Code agent workflow, an SDK API, or all three? Lean: CLI command that spawns agents in sequence.
2. **Retry ceiling.** How many review → build → review loops before human escalation? Lean: 3, configurable.
3. **Parallel review lenses.** The `adversarial-reviewer` reviews through one lens at a time. Should the framework run multiple lens instances in parallel and merge findings? Lean: yes, parallel, merged deterministically.
4. **Cross-adopter pipeline reuse.** Are pipelines adopter-specific or general (`frigg-integration-pipeline`)? Lean: start adopter-specific, generalize once three adopters converge on the same shape.
5. **Failure attribution.** If a review fails, does the framework attribute the failure to the build agent, the spec, or the ontology? Lean: attribute to the earliest phase whose artifact would need to change to resolve the finding.
6. **Human-in-the-loop points.** Where can (or must) a human intervene? Lean: after scoping (approve spec), after successful review (approve merge), never during a phase.

## References

- An adopter running the pattern in production ships `spec-author.md`, `build-engineer.md`, and `adversarial-reviewer.md` under `.claude/agents/` as the reference implementation.
- [EARS](https://alistairmavin.com/ears/): Easy Approach to Requirements Syntax; the acceptance criteria form.
- Anthropic's Claude Code sub-agent documentation.
