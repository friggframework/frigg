# Architecture Decision Record: Frigg Agent Harness

**Status**: Proposed
**Date**: 2026-05-25
**Author**: Sean Matthews

## Context

[ADR-INTEGRATION-CAPABILITIES](./ADR-INTEGRATION-CAPABILITIES.md) gives Frigg integrations a structured way to declare what they do. [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) gives Frigg a way to capture *what an agent needs to know* in scoped, pinnable, override-aware YAML layers. Together they describe two structured surfaces that an agent can read instead of crawling code.

Neither ADR specifies how the agent **receives** that content. The capability declaration sits on a static field; the ontology layers compile to an XML-tagged block. Both are dormant until something puts them in front of the agent.

This is the wiring ADR. It defines the **Frigg Agent Harness** — a small Node package that, at session start, runs the capability resolver and the ontology compiler against the current repo and injects both into the agent's context as an XML-tagged system-prompt overlay. The harness also propagates the same pinned content to any subagents the parent spawns, so a phase-executor agent and the orchestrator agent share one consistent view of the codebase's capabilities and conventions for the duration of a task.

Without the harness, the capability declaration and the ontology layers are valuable but inert artifacts. With the harness, every Claude Code session in a Frigg repo opens with the right scoped context already in front of the model — and stays consistent across subagents.

This ADR is the lightest of the four. The substantive design lives in the capability and ontology ADRs; this one is integration plumbing plus a few discipline rules (pinning, subagent propagation, failure modes).

## Decision

Ship `@friggframework/harness` from `packages/harness/` in the Frigg monorepo. The harness has three responsibilities:

1. **Session-start injection** — read the repo's harness configuration, run the capability resolver and the ontology compiler, render the result as XML-tagged blocks, and emit them as a Claude Code SessionStart-hook system-prompt overlay.

2. **Task pinning + state** — on first run for a task, record the resolved ontology version + capability tree hashes to local task state (a small JSON file under `.frigg-harness/`). Subsequent runs within the same task reuse the pinned versions; mid-task drift is impossible.

3. **Subagent propagation** — provide a templating helper that orchestrator agents use when spawning subagents, so the subagent's prompt includes the parent's pinned ontology + capability block. A phase-executor agent that starts with one block finishes with the same one.

A fourth, optional responsibility:

4. **MCP server fallback** — for agents that don't run inside Claude Code (e.g. CLI tools, CI agents, IDE integrations), the harness exposes the same content as an MCP server. The agent reads capabilities and ontology via `mcp__frigg-harness__get_capabilities()` and `mcp__frigg-harness__get_ontology()` tool calls instead of receiving them in the system prompt. Same content, different transport.

The harness is Node-based, shipped from the same monorepo as the rest of the framework. It depends on `@friggframework/core` (for `resolveCapabilities`), `@friggframework/ontology` (for `compileContext`), and the shared `@freyaframework/friction` package (see [Shared friction pipeline](#shared-friction-pipeline) below).

### Lifecycle taxonomy

The harness's touchpoints map onto the 9-phase agent lifecycle Freya specifies in [their ADR-008](https://github.com/lefthookhq/freya/blob/main/docs/adr/008-harness-hooks-layer.md). Adopting that taxonomy as the conceptual model gives every Frigg concern an obvious home and aligns with the substrate we co-own — but Frigg's harness does *not* implement its own runtime. Most phases resolve to either a Claude Code hook or a skill convention.

| Phase | What it covers | How Frigg implements |
|---|---|---|
| `pre_turn` (parent) | Ontology + capability injection at session start | Claude Code SessionStart hook → emits the `<FRIGG-HARNESS-CONTEXT>` block |
| `pre_turn` (subagent) | Same block inherited by spawned subagents | Claude Code SubagentStart hook — the central infrastructure decision in this ADR |
| `pre_context` | Last chance to mutate context before LLM call | Folded into SessionStart in Frigg's model — the harness builds the full block once at session start; Claude Code owns the rest of context assembly |
| `pre_llm` / `post_llm` | Per-LLM-call wrap (budget, caching, etc.) | Not implemented by Frigg's harness; defer to Claude Code's native LLM observability |
| `pre_tool` / `post_tool` | Per-tool-call wrap (capability invariant checks, friction emission on untyped tool output) | Implemented as **port decorators** in adopter integration code (see decorator-vs-hook framing below), not as new Claude Code hooks |
| `pre_capture` | Validation pass before output is finalized | The recommended validation subagent pattern from [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) — invoked by skills at high-stakes decision points, not a global hook |
| `post_capture` | Friction emission, telemetry | Direct API calls from skills / handlers into the shared friction pipeline |
| `post_turn` | Cleanup, audit | Claude Code Stop hook if needed; minimal in v1 |

**Decorators vs hooks** (also borrowed from Freya ADR-008):

- **Decorators wrap ports.** Structural concerns that belong on the port itself — e.g. a capability invariant check that wraps an integration's tool execution, or input sanitization on Frigg's `Api` classes. JavaScript/TypeScript wrapping patterns over `IntegrationBase` / `Api`.
- **Hooks punctuate the lifecycle.** Cross-cutting concerns that need a specific phase but don't belong on any one port — ontology block injection, the validation pass, friction emission. These are Claude Code hooks where the lifecycle exposes them, skill conventions everywhere else.

The two compose orthogonally: a `pre_tool` decorator validates the call shape; a (hypothetical) `pre_tool` hook would emit telemetry around the same call. Frigg's v1 uses decorators for per-tool concerns and Claude Code hooks only at the two boundaries the lifecycle actually exposes (`pre_turn` parent + subagent).

### Shared friction pipeline

Friction emission and ontology PR proposals (per [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md)) ship as a **shared `@freyaframework/friction` package** consumed by both Frigg and Freya (decided 2026-05-26). Frigg's harness depends on the package and invokes its API at `post_capture` / `post_tool` touchpoints. The detailed surface — what Frigg consumes in v1, what it defers, and the non-negotiable guardrails — lives in ADR-ONTOLOGY-LAYERS to keep all friction discussion in one place.

---

## Architecture

```
.claude/settings.json                  ← adopter configures SessionStart hook
        │
        ▼
@friggframework/harness/bin/session-start   ← entry point
        │
        ├─► reads ./frigg-harness.config.js
        ├─► detects active integration (current branch / cwd / explicit task)
        ├─► resolveCapabilities(IntegrationClass)   ← from @friggframework/core
        ├─► compileContext({ domains, task, maxTokens })   ← from @friggframework/ontology
        ├─► renders XML-tagged block
        ├─► writes pinned state to .frigg-harness/state.json
        └─► emits the block on stdout (Claude Code reads it as system-prompt overlay)
```

### Configuration

Each Frigg repo (framework or adopter) declares a `frigg-harness.config.js` at the root:

```js
// frigg-harness.config.js
module.exports = {
    // Where the ontology layers live. Local path, git+https://..., or HTTP archive.
    // Adopter repos typically pin to a published ontology version.
    ontologyRoot: 'git+https://github.com/friggframework/frigg@v0.3.1#ontology',

    // Domains to compile. Drives layer selection; not every layer applies to every task.
    domains: ['integrations', 'vendor/quo'],

    // Token budget for the compiled context block.
    // Higher = more comprehensive; lower = leave room for task content.
    maxTokens: 2500,

    // How to detect the active integration for capability resolution.
    // Options:
    //   - 'auto-from-branch'  — parse current git branch for an integration name
    //   - 'auto-from-cwd'     — match cwd against backend/src/integrations/*
    //   - explicit: { type: 'class', path: './backend/src/integrations/PipedriveIntegration.js' }
    //   - 'none'              — framework repo or non-integration work
    activeIntegration: 'auto-from-cwd',

    // Optional: task scope override. Pulled from .frigg-harness/state.json by default.
    // Used by `frigg-harness new-task <task-key>` to start a fresh pinning.
    task: null,
};
```

Sensible defaults exist for every field; a minimal config is one line (`module.exports = { ontologyRoot: 'git+https://...' }`).

### Active integration detection

Single-integration adopter repos: trivial — `activeIntegration: 'auto-from-cwd'` matches the only file under `backend/src/integrations/`.

Multi-integration repos like `lefthookhq/quo--frigg`: the harness inspects, in order:
1. Explicit `activeIntegration` in config (highest priority).
2. Current git branch name — if it matches `(feature|fix|claude)/<vendor>-<rest>`, treat `<vendor>` as the active integration (e.g. `claude/pipedrive-add-resync-action` → `PipedriveIntegration`).
3. Current working directory — if cwd is under `backend/src/integrations/<Name>/` or files in cwd are mostly about one integration, infer it.
4. If none of the above resolve, fall back to "no active integration" and emit only the ontology block; the agent sees the L1–L2 context without a specific capability tree.

The detection is a heuristic; the override (`activeIntegration: { type: 'class', path: '...' }`) is always available when the agent is doing genuinely cross-integration work.

Framework repo (`friggframework/frigg`): typically `activeIntegration: 'none'` — the agent works on framework code, not integration code. The ontology block carries L1 + L2 only.

### What the agent receives

A single XML-tagged block with two sub-blocks, prepended to the session's system prompt:

```xml
<FRIGG-HARNESS-CONTEXT
    contentVersion="frigg-ontology@v0.3.1"
    frameworkVersion="@friggframework/harness@0.2.0"
    compiledAt="2026-05-25T15:33:01Z"
    blockHash="sha256:7f8a..."
    task="pipedrive-add-resync-action">

  <ONTOLOGY domains="integrations,vendor/quo" maxTokens="2000">
    <!-- compiled L1+L2+L3 layers from @friggframework/ontology -->
    <!-- LOCKED-CONSTRAINT entries clearly framed -->
    <!-- retrieve_from pointers rendered as natural-language fetch instructions -->
  </ONTOLOGY>

  <CAPABILITIES integrationClass="PipedriveIntegration">
    <!-- resolved capability tree from Frigg.resolveCapabilities(PipedriveIntegration) -->
    <!-- inherited capabilities marked with their source class -->
    <!-- override / extend / disinherit applied -->
    <!-- backedBy spec refs + implementedBy pointers rendered as instructions -->
  </CAPABILITIES>

</FRIGG-HARNESS-CONTEXT>
```

The agent reads this block once at session start and refers back to it as the canonical answer to "what is this repo and what does this integration do." The `retrieve_from` pointers and `implementedBy` pointers tell the agent where to fetch live content when the block alone is insufficient.

### Task pinning

The first time the harness runs for a new task, it writes `.frigg-harness/state.json`:

```json
{
    "taskKey": "pipedrive-add-resync-action",
    "startedAt": "2026-05-25T15:30:00Z",
    "ontologyVersion": "frigg-ontology@v0.3.1",
    "ontologyResolvedRef": "git+https://github.com/friggframework/frigg@a1b2c3d#ontology",
    "capabilityClassHash": "sha256:9c2d...",
    "blockHash": "sha256:7f8a..."
}
```

On subsequent runs within the same task — including subagent invocations — the harness reads the pinned state and reuses the resolved ontology ref and capability class hash. The compiled block hash should match; if it doesn't, something changed underneath the task (e.g. someone modified the integration's Definition or the ontology layers).

**Hash-mismatch policy** (see [Open question 2](#open-questions)): default is `warn-and-recompile`. The harness emits a warning that's surfaced to the agent and proceeds with a fresh compile. A stricter mode (`throw-on-mismatch`) is available for tasks where mid-task drift is dangerous (e.g. multi-phase refactors). A laxer mode (`silent-recompile`) is for tasks that genuinely want to absorb concurrent edits.

Task boundary is explicit: `frigg-harness new-task <task-key>` writes a fresh state.json and triggers re-resolve. Without that command, the task continues with the pinned versions until manually advanced.

### Subagent propagation

When an orchestrator agent spawns a subagent (e.g. via Claude Code's Agent tool), the parent's pinned context must flow through. The harness provides a Node helper:

```js
const { spawnSubagentPrompt } = require('@friggframework/harness');

const childPrompt = spawnSubagentPrompt({
    role: 'phase-executor',
    task: 'implement-resync-handler',
    inheritFrom: parentTaskKey,                  // pulls pinned state from parent
    // ... domain-specific task content
});
// childPrompt now has the FRIGG-HARNESS-CONTEXT block prepended,
// with the same blockHash as the parent's. The subagent reads the same content.
```

For Claude Code, this is wrapped into a thin Bash helper (`frigg-harness spawn-subagent`) that orchestrator skills invoke as part of the Agent tool prompt-construction.

The principle: **subagents inherit the parent's pinned versions; they never re-pin.** A new pin happens only at task boundary, declared explicitly. A subagent that wants different scope (different domains, different task key) is not really a subagent of the same task — it's a sibling task and should be spawned with `frigg-harness new-task`.

### MCP server fallback

For agents outside Claude Code (CI agents, IDE integrations, custom Anthropic SDK loops), the harness exposes the same content via MCP:

```
mcp__frigg-harness__get_capabilities(integrationClass?)
    → { capabilities: [...], inheritedFrom: '...', hash: '...' }

mcp__frigg-harness__get_ontology({ domains, task, maxTokens })
    → { block: '<ONTOLOGY>...</ONTOLOGY>', contentVersion, hash }

mcp__frigg-harness__pin_task({ taskKey, ontologyVersion?, ... })
    → { state: { ... } }

mcp__frigg-harness__resolve_pointer({ ref })
    → { content: '...' }    // dereferences a retrieve_from URI
```

Same content; pull-based rather than push-based. Useful when the consuming agent's transport doesn't support system-prompt overlays.

[ADR-EVALS](./ADR-EVALS.md) tests both modes — SessionStart-injection ("push") and MCP-server ("pull") — to determine which produces better task accuracy at given model capability.

---

## Failure modes

Several discipline rules cover what happens when the harness misbehaves:

1. **Config missing or invalid.** Harness emits a one-line warning to stderr ("frigg-harness: no config found, running with framework defaults") and proceeds with minimal context — L1 only, no capabilities. The agent sees a system-prompt note about the degraded state.

2. **Ontology root unreachable.** If `git+https://...@<ref>` fails to clone (network, auth, missing ref), the harness reads the most-recently-cached version from `.frigg-harness/cache/` and emits a stale-cache warning. If no cache exists, falls back to L1 framework defaults.

3. **Capability resolver fails.** If `resolveCapabilities(IntegrationClass)` throws (e.g. invalid Definition, broken inheritance), the harness emits an error block that the agent surfaces — `<HARNESS-ERROR>capability resolution failed: ...</HARNESS-ERROR>`. The session proceeds without a capability tree; the agent must fall back to reading source.

4. **Block exceeds budget.** The compiler enforces the token budget by dropping lowest-priority entries first. If even the locked-constraints set exceeds budget, the harness emits a hard error — locked content cannot be elided.

5. **Subagent context propagation fails.** If the helper can't read `.frigg-harness/state.json`, it logs a warning and the subagent runs without the inherited block. The orchestrator agent should detect this from the subagent's reply (which won't reference the pinned context) and decide whether to retry or proceed.

Discipline: **degraded operation is preferred over hard failure** for everything except locked-content overflow. The harness's job is to improve agent task accuracy when it works, not to block tasks when it doesn't.

---

## Consequences

### Positive

- **Adopters get agent-ready Frigg out of the box.** Install `@friggframework/harness`, add one line to `frigg-harness.config.js`, set up the SessionStart hook in `.claude/settings.json`, and every session in that repo opens with scoped capabilities + ontology in context.
- **Subagent consistency.** Phase-executor subagents inherit the orchestrator's pinned context. The mid-task-drift failure mode (different subagents reading different ontology versions) is impossible.
- **Adopter-extensible.** Adopters can author their own L3 ontology entries (vendor backstory) and have them compiled in via the same harness. No fork required.
- **Eval-measurable.** The harness has on/off conditions ([ADR-EVALS](./ADR-EVALS.md) eight-condition matrix). The "harness contributes meaningful lift" claim is testable.
- **Two transports for two consumer kinds.** Claude Code consumers get push (SessionStart system-prompt overlay). MCP consumers get pull (tool calls). Same content; different access pattern.
- **Failure is graceful.** Missing config, unreachable ontology root, broken capability declaration — none block the session. Degraded mode emits a warning and proceeds.

### Negative

- **Yet another dev dependency.** Adopter repos add `@friggframework/harness` + the `.claude/settings.json` hook + the `frigg-harness.config.js` file. Adoption friction.
- **Hash-mismatch ergonomics.** Default `warn-and-recompile` is the right choice for most tasks, but tasks that span long sessions and absorb intermediate commits will accumulate warnings. Mitigation: stricter modes available; tooling shows hash diff so the agent can decide.
- **Active integration detection is heuristic.** In a multi-integration repo, the branch-name + cwd heuristic will sometimes pick the wrong integration. Mitigation: explicit `activeIntegration` override always works.
- **Coupling to Claude Code SessionStart-hook surface.** If the hook contract changes upstream, the harness needs updating. Mitigation: small surface (a script that outputs to stdout), unlikely to break.
- **Subagent propagation is a convention, not enforcement.** An orchestrator agent that doesn't call `spawnSubagentPrompt` will spawn a child with no inherited context. We can document the convention; we cannot prevent its violation. Mitigation: the framework's own orchestrator skills use the helper; adopters follow the pattern.

### Neutral

- The harness is `@friggframework/harness`, a separate npm package. Not bundled into `@friggframework/core`; adopters who don't yet use it carry no extra weight.
- `.frigg-harness/state.json` is gitignored. State is per-developer-checkout, not shared across the team — matching the per-task discipline (different team members work on different tasks).
- The XML-tagged block format is an implementation detail; the harness can re-render in other formats if eval results suggest something better.

---

## Alternatives considered

### Alternative 1 — Manual context injection per session

Adopters paste capability + ontology content into each session by hand, or rely on a long `CLAUDE.md` that accumulates everything.

**Rejected.** Doesn't scale across tasks (every task gets the same monolithic context regardless of scope), doesn't pin (so mid-task drift is possible), doesn't propagate to subagents. The capability and ontology ADRs only pay off if their content reliably reaches the agent's context. Manual injection is a regression to the CLAUDE.md baseline.

### Alternative 2 — Run capability resolver and ontology compiler at every tool call

Embed the harness into every framework operation; refresh the agent's view of capabilities and ontology continuously.

**Rejected.** Inconsistent with the pinning discipline from [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md): "pin at task start, never refresh mid-task." Continuous refresh introduces exactly the drift the pinning was designed to prevent. Compile-once-at-session-start + re-verify hashes is the right level of strictness.

### Alternative 3 — MCP server only, no SessionStart hook

Skip the system-prompt overlay; agents always fetch capabilities and ontology via MCP tool calls.

**Rejected** as the *only* mode, accepted as a *secondary* mode. Two reasons:

1. Agents at lower capability tiers don't reliably fetch context on their own initiative. Push-into-system-prompt guarantees the content is in front of the model; pull-via-tool-call hopes the model knows to ask. The eval will quantify this gap.
2. Tool calls have latency; the system-prompt overlay is free at session start.

For Claude Code, SessionStart-injection is the primary mode. The MCP server is the fallback for environments that don't support system-prompt overlays.

### Alternative 4 — Build the harness as a framework feature, not a separate package

Fold `@friggframework/harness` into `@friggframework/core` as a sub-module that core exports.

**Rejected.** The harness is dev-time tooling, not runtime; adopters whose teams don't yet use agentic Frigg development shouldn't carry the dependency surface (which transitively includes `@friggframework/ontology`, the YAML parser, the git clone helper, etc.). Separate package keeps `@friggframework/core` slim.

---

## Implementation phases

### Phase 1 — Package skeleton + config

- Create `packages/harness/` in the Frigg monorepo. Publish as `@friggframework/harness`.
- Author the config schema and parser (`frigg-harness.config.js` shape).
- Implement active-integration detection (auto-from-branch, auto-from-cwd, explicit override).
- Implement `.frigg-harness/state.json` reader / writer.

### Phase 2 — SessionStart hook

- Implement `bin/session-start` — the script Claude Code's SessionStart hook calls.
- Wire to `Frigg.resolveCapabilities(IntegrationClass)` from `@friggframework/core` and `compileContext()` from `@friggframework/ontology`.
- Render the `<FRIGG-HARNESS-CONTEXT>` XML block; emit on stdout.
- Document the `.claude/settings.json` configuration adopters add to enable the hook.

**Gate**: ADR-INTEGRATION-CAPABILITIES Phase 1 (resolver) and ADR-ONTOLOGY-LAYERS Phase 2 (compiler) both shipping.

### Phase 3 — Task pinning + hash-mismatch policy

- Pinning state structure; first-run vs subsequent-run paths.
- Hash-mismatch detection at session-start; default `warn-and-recompile` policy with configurable strictness.
- `frigg-harness new-task <task-key>` command for explicit task-boundary transitions.

### Phase 4 — Subagent propagation

- `spawnSubagentPrompt({ role, task, inheritFrom })` helper.
- Documentation for orchestrator skills (in the dev toolkit) on how to use it.
- Reference invocation pattern wired into the existing `frigg-create-integration` skill in the dev toolkit.

### Phase 5 — MCP server fallback

- Build the MCP server transport with the four tool calls (`get_capabilities`, `get_ontology`, `pin_task`, `resolve_pointer`).
- Document setup for environments outside Claude Code (CI agents, IDE integrations).
- Eval ([ADR-EVALS](./ADR-EVALS.md)) tests the two transports' relative effectiveness.

### Phase 6 — Failure-mode tests + observability

- Test each failure mode (missing config, unreachable ontology root, broken capability declaration, budget overflow, propagation failure).
- Add minimal telemetry: log block hash, content version, capability class, task key per session-start. Used by adopter teams to spot adoption gaps and stale ontology pins. No remote telemetry by default; adopter opt-in.

### Phase 7 — Eval integration

- The harness on/off, MCP-vs-SessionStart, hash-mismatch-policy variations all become conditions in the [ADR-EVALS](./ADR-EVALS.md) matrix.
- First canonical eval run validates that the harness produces meaningful task-accuracy lift over the baseline (no harness, no ontology, no capabilities).

---

## Open questions

1. **SessionStart-hook vs MCP — which to default to?** Plan is to ship both, with SessionStart as the primary in Claude Code. The eval will quantify which produces better outcomes; we may revise the default.

2. **Hash-mismatch default policy.** `warn-and-recompile` is the proposed default. `throw-on-mismatch` is safer but breaks long sessions; `silent-recompile` is permissive but hides drift. Decide before Phase 3 ships.

3. **Multi-integration repo detection precision.** The branch-name + cwd heuristic will misfire occasionally. Should the harness emit a "detected integration: X — confirm or override" message at session start, requiring the agent to acknowledge before continuing? Adds friction but eliminates silent misfires.

4. **State.json scope: per-checkout or per-task?** Currently per-checkout, gitignored. Alternative: per-task with a `tasks/` subdirectory under `.frigg-harness/`, so a developer working on two parallel tasks doesn't lose pin state when switching branches. Lean: per-checkout in v1; add per-task if branch-switching during long tasks becomes common.

5. **Telemetry retention.** Local-only by default. Should adopter teams be able to opt into shared telemetry that surfaces "which ontology entries are referenced most often" / "which capabilities are most-touched"? Valuable for ontology maintenance; sensitive (could leak adopter task details). Defer to a separate ADR if/when there's demand.

6. **Subagent propagation enforcement.** The helper is a convention. Should the framework's orchestrator skills lint-check that any Agent-tool invocation calls the helper, refusing to spawn an un-inherited subagent? Heavy-handed; lean: doc + sample, not enforcement.

7. **Block format evolution.** XML-tagged today. The compiler can re-render in alternative formats. The harness should accept a `--block-format=xml|markdown|json` flag so eval conditions can compare. Land in Phase 2.

8. **Compile cost.** A full compile + capability resolution at session start is ~500ms in the prototype. Acceptable; cache the compiled block by `(ontologyVersion, capabilityClassHash, taskKey)` so repeat runs in the same task are near-instant. Land caching in Phase 3 alongside pinning.

---

## References

### Related ADRs

- [ADR-INTEGRATION-CAPABILITIES](./ADR-INTEGRATION-CAPABILITIES.md) — Defines `resolveCapabilities()`, the function the harness calls to get the integration's capability tree.
- [ADR-ONTOLOGY-LAYERS](./ADR-ONTOLOGY-LAYERS.md) — Defines `compileContext()`, the function the harness calls to get the L1–L3 ontology block. Also defines the pinning discipline this ADR enforces.
- [ADR-EVALS](./ADR-EVALS.md) — The eight-condition matrix that measures whether the harness (in either transport) lifts task accuracy. Harness-on / harness-off is one of the three independent variables.
- [ADR-EXTENSIONS](./ADR-EXTENSIONS.md) — The Tier 3 extension contract and Artifact category that the capability declaration cross-references.

### Code (target locations after implementation)

- `packages/harness/` — `@friggframework/harness` package root.
- `packages/harness/bin/session-start` — SessionStart-hook script.
- `packages/harness/src/active-integration.js` — auto-detection heuristics.
- `packages/harness/src/state.js` — `.frigg-harness/state.json` reader / writer.
- `packages/harness/src/render.js` — XML block renderer.
- `packages/harness/src/mcp-server.js` — MCP server fallback transport.

### Claude Code integration

- `.claude/settings.json` SessionStart-hook configuration — documented in the harness package README and seeded by the `frigg-create-integration` skill in the dev toolkit.

### Conversation references

- The May 22–25, 2026 design conversation on `claude/frigg-integration-overhaul-57VHW` that produced this ADR set.
