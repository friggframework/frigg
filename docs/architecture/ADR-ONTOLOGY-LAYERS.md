# Architecture Decision Record: Frigg Ontology Layers

**Status**: Proposed
**Date**: 2026-05-25
**Author**: Sean Matthews

## Context

[ADR-INTEGRATION-CAPABILITIES](./ADR-INTEGRATION-CAPABILITIES.md) gives Frigg integrations a structured way to declare what they do (`static Definition.capabilities` with pointer discipline). That declaration is the *what*: a graph of capabilities, primitives, surfaces, and bindings into the code.

The *why* — and the surrounding context an agent or new developer needs in order to reason about a change — lives elsewhere today. Some of it is in the framework's `CLAUDE.md`. Some is in markdown docs scattered across `docs/`. Some is in Slack threads and design conversations. Some is institutional knowledge that's never been written down. None of it is structured, scoped, or pinnable per task.

This produces specific failure modes for agent-driven integration work, observed across the May 22–25 design conversation that produced this ADR set:

- **CLAUDE.md grows monotonically.** Frigg's existing `CLAUDE.md` is ~34 KB and growing. Every domain, every gotcha, every architectural rule competes for attention in the same flat document. An agent receives all of it on every session, regardless of whether the task touches encryption, the integration router, or the test harness.
- **Reading discipline is implicit.** The Slack thread on `PipedriveIntegration`'s `/settings` routes surfaced a rule — *"for a user-consumed capability, prefer existing Frigg default-surface primitives over declaring new routes"* — that is nowhere written down. The rule exists in Sean Matthews's head and in the heads of two other core contributors. An agent (or a new contributor) has no way to find it short of building the wrong shape and being corrected in code review.
- **Vendor-specific knowledge has no home.** Pipedrive's v2 API state, HubSpot's portalId conventions, Salesforce managed-package constraints, Slack's rate-limit tiers — these affect every integration decision but live in scattered docs, commit messages, and chat history.
- **Pointer-into-code knowledge is unstable.** A note saying *"the canonical CRM integration pattern is in `<adopter-repo>/backend/src/base/BaseCRMIntegration.js`"* is useful until the file moves. There's no maintained registry of "where to look for X."

This ADR proposes a **four-layer ontology model** for stratifying knowledge by *scope of applicability*, plus an in-house compiler that renders task-scoped subsets into XML-tagged natural-language blocks for agent context injection. The layers are:

- **L1 — Universal non-obvious facts.** Things true regardless of who's reading; only included when an agent might not know them at frontier capability.
- **L2 — Frigg-context reading discipline.** How to read a Frigg repo: where things live, what naming conventions mean, which existing primitives to reach for before declaring new ones. The Slack thread rule lives here.
- **L3 — Vendor and domain knowledge.** Per-platform context: Pipedrive's v2 API is upcoming, HubSpot's portalId conventions, Salesforce managed-package constraints, Slack's rate-limit tiers. The canonical home for L3 entries is the relevant api module in `@friggframework/api-module-library` (see [Module-exported ontology](#module-exported-ontology)); integration projects compose what their installed modules export.
- **L4 — Instance, live-read.** Pointers into the actual codebase (file paths, capability references, Definition entries) and into instance state (this tenant's config, this Process's current state, this PR's review status). Almost no inline content — agents follow the pointers and read live.

Layers compose: more-specific overrides less-specific for non-locked content; `locked_constraints` accumulate across layers and survive overrides. The compiler reads YAML layer files, walks the layers requested for a task, applies overrides, and emits an XML-tagged block sized to a token budget.

The downstream goal is the same as [ADR-INTEGRATION-CAPABILITIES](./ADR-INTEGRATION-CAPABILITIES.md): agent-driven integration work that's accurate, scoped, and verifiable. [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) wires the compiler into a SessionStart hook so the right block is in front of the agent automatically. [ADR-EVALS](./ADR-EVALS.md) measures whether having it actually lifts task accuracy.

## Decision

Adopt the four-layer ontology model. Implement a small Node-based compiler shipped from the Frigg monorepo as `@friggframework/ontology`.

### Layer model

Knowledge is stratified by **scope of applicability**, not by subject matter:

| Layer | Question | Examples |
|---|---|---|
| **L1** | Is this helpful to anyone, regardless of what they do — and not obvious to a frontier-capability agent? | "API in this domain usually means HTTP/JSON, not RPC/SOAP/GraphQL." "Webhooks may arrive duplicated; handlers must be idempotent." "OAuth refresh-token responsibility belongs to the framework, not the integration code." |
| **L2** | Is this specific to working in a Frigg repo? | "To enumerate an integration's capabilities, read its static Definition and resolve via prototype chain." "For a user-consumed capability, prefer existing default-surface primitives over declaring new routes." "DDD/Hexagonal architecture is non-negotiable: handlers call use cases, use cases call repositories, never bypass." |
| **L3** | Is this specific to a vendor / platform / domain we work in? | "Pipedrive v2 API is upcoming; v1 uses cursor pagination on `/persons` and offset on `/deals`." "HubSpot's portalId is the inbound webhook routing identifier; the core primitive is `findIntegrationByEntityExternalId`." "Slack's tier-2 rate limit on `conversations.history` is ~20/min/workspace; back off aggressively." |
| **L4** | Is this specific to this codebase, this user, this task, this session? | `retrieve_from` pointers to actual files, capabilities, database state, PR state. Almost no inline content. |

### Authoring discipline

Each layer is a directory of YAML files. Each file conforms to a canonical schema (`OntologyLayer`):

```yaml
# Optional: cross-domain / cross-layer references pulled in at compile time.
# Parent-chain imports (L4 → L3 → L2 → L1) are implicit.
imports:
  - integrations
  - vendor/hubspot

entities:
  IntegrationDefinition:
    description: >
      A Frigg integration's static Definition object declares the integration's
      identity, modules, capabilities, and wiring. See ADR-INTEGRATION-CAPABILITIES
      for the capability sub-block shape.
    constraints:
      - Always declare capabilities on `static Definition.capabilities`, never on
        `this.capabilities` in the constructor.
      - Use imperative verbs in constraints. Every constraint must start with one of:
        always, avoid, check, do, ensure, follow, keep, must, never, prefer, require,
        set, use.
    locked_constraints:
      - Never claim behavioral facts about implementation in a capability's
        description field — descriptions are purpose, not behavior. Locked
        constraints survive all layer overrides.
    retrieve_from:                                  # optional tool-call pointer
      source_type: file
      source: '@friggframework/core/integrations/integration-base.js'
      fetch_when: agent needs the actual IntegrationBase implementation

decisions:
  - id: L2-FRG-001
    statement: >
      For a user-consumed capability, prefer existing Frigg default-surface
      primitives (getConfigOptions + PATCH /api/integrations/:id for config;
      USER_ACTION events + loadUserActions() for actions) over declaring new
      routes. Vendor-namespaced paths are reserved for vendor-initiated calls.
    rationale: >
      The Pipedrive /settings smell (May 25 #dev-feed thread) — adopter UI calls a
      vendor-namespaced route to update a per-tenant preference, when the default
      surface already handles the use case identically. The smell is catchable by
      construction if authors learn to reach for defaults first.
    locked: true

patterns:
  CapabilityDeclaration:
    status: preferred
    description: >
      The structured capability declaration on an integration's static Definition,
      with primitive + backedBy + implementedBy + surface + auth fields.
    use_when: Authoring or modifying an integration class.
    do_not_use_when: Working on framework-internal code that's not an integration.
    retrieve_from:
      source_type: file
      source: docs/architecture/ADR-INTEGRATION-CAPABILITIES.md
      fetch_when: agent needs the full capability shape spec
```

Schema rules:
- **Constraints use imperative verbs.** Every constraint string starts with one of: `always | avoid | check | do | ensure | follow | keep | must | never | prefer | require | set | use`. Validates as part of `ontology validate-layer`.
- **`locked_constraints` and decisions with `locked: true`** are invariants that survive all layer overrides. They cannot be relaxed by any task plan or user instruction. The compiled block carries explicit framing that distinguishes locked from non-locked rules.
- **`retrieve_from`** is a polymorphic pointer (source_type: `mcp | api | tool | file | url | custom`) that the compiled block renders as a natural-language fetch instruction ("if you need X, fetch from Y") rather than inlining the content. This is the pointer discipline that keeps the ontology sparse.
- **Layer precedence**: more-specific layers override broader ones for non-locked content; `locked_constraints` accumulate (a child layer cannot drop a parent's locked rule, only add to it).
- **`supersedes: [id]`** explicitly drops a named entry from an earlier layer (rare; used when a rule is genuinely retired, not when overriding).
- **No behavioral claims about code in ontology layers.** Constraints describe rules ("always do X"); they never describe what specific code does. Behavior lives in the code, surfaced via `retrieve_from` pointers.

### The compiler

`@friggframework/ontology` is a small Node package with two surfaces — a Node SDK and a CLI:

**SDK:**

```js
const { compileContext } = require('@friggframework/ontology');

const block = await compileContext({
    domains: ['integrations', 'vendor/hubspot'],
    task: 'add-pipedrive-resync-user-action',
    maxTokens: 2000,
    ontologyRoot: './ontology',                  // local path, git+https://..., or HTTP archive
});
// Returns an XML-tagged string ready for injection into an agent's context.
```

**CLI:**

```bash
npx @friggframework/ontology compile \
    --domains=integrations,vendor/hubspot \
    --task=add-pipedrive-resync-user-action \
    --ontology-root=./ontology \
    --max-tokens=2000
```

What the compiler does:
1. Load all layer files under `ontologyRoot` matching the requested `domains` (plus the parent-chain L4→L3→L2→L1 implicit imports).
2. Walk `imports:` blocks to pull in cross-domain references; de-duplicate.
3. Apply layer precedence: more-specific overrides less-specific for non-locked content; `locked_constraints` accumulate.
4. Filter by task scope: if the task key is named in a layer entry's `useful_for: [...]` field, include it; otherwise skip unless the entry is universally applicable.
5. Render to XML-tagged natural language. Locked content gets explicit LOCKED-CONSTRAINT framing distinguishing it from soft preferences.
6. Compress to fit `maxTokens` by dropping lowest-priority entries first (priority = `locked > pattern > entity > decision > nice-to-have`).
7. Stamp a header: `content_version` (the ontology version pinned for this task), `framework_version` (the `@friggframework/ontology` version), `compiled_at`, `block_hash`. Consumers cache by `block_hash` and detect upstream changes by comparing hashes after refresh.

The compiler is **~300 LOC Node**: YAML parsing (existing `js-yaml`), schema validation (existing `ajv`), the override / locking / precedence walker (custom, small), the XML renderer (string concatenation), the `git+https://...@<ref>` clone-and-cache helper for remote ontology roots, plus the source adapters described next.

### Source adapters

Ontology content originates in many places — YAML files committed in the repo, markdown docs in `docs/`, Google Docs and Notion pages owned by a product team, README content in upstream api modules, even live API introspection (e.g. fetching a HubSpot object schema and converting it to entity facts). The compiler does not require all content to be transcribed into YAML by hand.

Each source has an **adapter** that converts the source's native shape into a canonical ontology record:

| Source type | Adapter behavior | Use |
|---|---|---|
| `yaml` | Pass-through (the native authoring format). | Hand-authored entries, the default. |
| `md` | Parse markdown front-matter + headings; map sections to entity / decision / pattern shapes. | Existing prose docs we want to surface without re-authoring. |
| `gdoc` / `notion` | Fetch via API + adapter; convert blocks to entries. | Knowledge owned outside git (product teams, sales). |
| `github` | Fetch a file or directory from a remote repo at a pinned ref; treat as `yaml` or `md`. | Pulling vendor ontology fragments from upstream api modules. |
| `live` | Introspect a live source at compile time (API call, database query); convert response to a frozen entry for the compiled block. | Captures facts about *this tenant's* state into L4 at session start. |

Each entry may carry a `source:` block describing where it originated:

```yaml
source:
  type: github
  pointer: https://github.com/friggframework/api-module-library/tree/main/packages/hubspot/ontology
  ref: v1.2.0
```

External pointers (`source.type` ≠ `yaml`) are dereferenced and normalized to the canonical record shape at compile time, so the compiled block remains deterministic and the `block_hash` covers the dereferenced content. The on-the-fly conversion is the responsibility of the source adapter — it must produce something the schema validator accepts.

**`source` and `retrieve_from` are distinct.** `source` is *authoring-time* metadata: where this entry's content lives, who owns it, how to refresh it. `retrieve_from` is *runtime* metadata for the agent: where to fetch live for this fact during work. An entry may have both — e.g. an entry authored from a Google Doc (`source.type: gdoc`) that points the agent at a live API call when it needs current data (`retrieve_from.source_type: api`).

### Module-exported ontology

API modules in `@friggframework/api-module-library` (and adopter-private equivalents) are the natural home for vendor- and API-specific knowledge — they already encapsulate the vendor's HTTP client, auth, and capabilities. Each api module also exports an **ontology fragment** at its package root:

```
@friggframework/api-module-hubspot/
├── package.json
├── src/
└── ontology/
    └── vendor/hubspot.yaml
```

At compile time, the ontology compiler walks `node_modules/@friggframework/api-module-*/ontology/` (and the equivalent path for adopter-private namespaces) and merges each module's fragment into the project compile. Integration projects gain vendor knowledge by installing the module; no per-project re-authoring is required.

Module-exported ontology is **L3 by default** (vendor / platform). Modules may also export L1 fragments where a vendor surfaces a genuinely universal pattern (e.g. an OAuth idiom that's broadly applicable). L2 stays with the framework; L4 stays with the integration project. Adopter-side ontology shrinks to the truly project-specific (multi-tenant policy, custom auth wiring, this-product's terminology) and to overrides of module-shipped entries.

This mirrors the capability-export pattern from [ADR-INTEGRATION-CAPABILITIES](./ADR-INTEGRATION-CAPABILITIES.md) and [ADR-EXTENSIONS](./ADR-EXTENSIONS.md): the api module is the canonical home for everything vendor-specific, and downstream consumers compose what the module exports. Vendor knowledge accumulates as a community deliverable rather than fragmenting across adopter repos.

### Session protocol

[ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) calls `compileContext` at session start and injects the resulting block into the agent's context. Two discipline rules:

1. **Pin at task start.** Record the resolved tag/sha in task state (e.g. `@v0.3.1`) and reuse it for every compile during the task. The harness records this and passes it to every subagent invocation.
2. **Never refresh mid-task.** Changing the ontology version mid-task invalidates the agent's working assumptions. A phase-executor that started with one compiled block should finish with the same one. Refresh happens at task boundaries.

Between tasks, the harness checks for a newer version and decides whether to adopt. Patch/minor bumps auto-adopt; major bumps (locked-rule changes, entry removals) surface for review via `ontology diff`.

### Validation subagent pattern (recommended)

Engineers building agent harnesses or skills that act on the compiled ontology should wire up a **validation pass** at high-stakes decision points: before irreversible actions, after generating a multi-step plan, after synthesizing a workflow. The pattern:

1. Spawn a subagent with the same compiled ontology block the parent agent received (the [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) SubagentStart hook makes this automatic — the subagent inherits the parent's pinned block).
2. Hand it the parent agent's plan, proposed action, or generated output as material to review.
3. Instruct the subagent explicitly: *"Review the input against the ontology block. Flag every constraint, locked rule, or pattern preference that the input violates or is at risk of violating. If the input is consistent with the ontology, say so explicitly. If the ontology is ambiguous or doesn't cover the case, flag that too — do not fill the gap from your own priors."*

The validation pass is a recommendation, not a mandate. Cost: one extra subagent invocation per checkpoint. Benefit: catches ontology violations the parent agent missed and surfaces ambiguity the parent agent papered over. Engineers calibrate frequency to the stakes — every plan for irreversible actions, periodic spot-checks for routine work, skip entirely for low-risk read-only tasks.

The validation subagent's findings feed into the friction-capture loop described next.

### Friction capture and ontology evolution

The ontology improves over time only if there is a mechanism to capture where it failed — entries that were ambiguous in context, rules that didn't generalize, gaps the agent had to fill from priors, cases where two layers' guidance pulled in opposite directions. Without that feedback, the ontology rots the way long-form docs rot: the people writing know what they meant, the people reading don't, and the gap goes silent.

**Friction sources:**
- Validation subagent flags (per the recommended pattern above): every "ambiguous," "not covered," or "conflict with another rule" emission.
- Agent self-reports during work: explicit instruction in the compiled block tells the agent to surface friction inline rather than silently route around it.
- Code review: reviewers tag PR comments with an ontology-friction label when they catch a violation the agent didn't catch.
- Post-mortems on miss-cases from [ADR-EVALS](./ADR-EVALS.md): every eval miss is a friction signal.

Friction is captured by tooling that lives alongside the ontology (specific tool TBD; see [Open question 9](#open-questions)). Each capture records: which entry (if any) was implicated, what the agent was trying to do, the nature of the friction (ambiguity / conflict / gap / staleness), what the agent did instead, and a free-text note. Captures are durable, queryable, and tied back to the ontology version in use at the time.

**The backlog of captured friction is the maintenance trigger.** Rather than "someone notices the ontology is wrong and edits it," the loop is: agent encounters friction → tool logs it → reviewer triages the backlog → high-signal items become ontology edits. This is the explicit mechanism that addresses the maintenance concern in [Consequences → Negative](#negative) — prior ontology authoring work has shown a pattern where seed content commits but ongoing edits stall; the friction loop is the named defense against that pattern.

The friction loop is what turns a static doc into an evolving artifact. It is also what justifies investing in the higher-density layers (L3, L4) at all — those layers are sustainable only when there is a low-friction way to update them as the world changes.

### Relationship to integration capabilities

This ADR and [ADR-INTEGRATION-CAPABILITIES](./ADR-INTEGRATION-CAPABILITIES.md) are complementary, not overlapping:

| Concern | Lives in | Why |
|---|---|---|
| What an integration **does** (capability graph) | `static Definition.capabilities` per ADR-INTEGRATION-CAPABILITIES | The Definition is the canonical artifact every integration has; capabilities are presence-and-pointer facts about the integration |
| **How to read** a Frigg repo (conventions, naming, where things live) | L2 ontology | Reading discipline, not facts about any specific integration |
| **Why** Frigg uses pattern X (rationale, locked constraints, design history) | L1–L3 ontology, with `locked: true` for invariants | Decisions and their rationale; not implementation facts |
| **What** Vendor X is and why it matters (platform context) | L3 ontology | Vendor-specific knowledge that affects multiple integrations against the same vendor |
| **Where** the actual code is (file paths, line numbers, capability refs) | L4 ontology with `retrieve_from` pointers, or directly in capability declarations | Live-read pointers; never inline content that can drift |

Capabilities are the canonical *what does this integration do*; ontology layers are the canonical *what does an agent need to know in order to work on it*. The harness compiles both together at session start, and subagents inherit both.

A subtle relationship: an integration's L4 ontology entries are mostly thin pointers to its capabilities. *"For this project's CRM integrations, the capability set lives in `static Definition.capabilities` on each `*Integration.js` file under `backend/src/integrations/`; resolve via `Frigg.resolveCapabilities(IntegrationClass)`."* The L4 ontology doesn't duplicate the capabilities — it teaches the agent how to find them.

---

## Consequences

### Positive

- **Knowledge scopes correctly.** Universal rules go to L1, framework conventions to L2, vendor backstory to L3, instance pointers to L4. Agents receive only the layers relevant to the task. The CLAUDE.md-grows-monotonically failure mode goes away.
- **Reading discipline becomes capturable.** The Slack thread rule about default-surface preference has a home (L2). New rules surface from code review, get written down once, and apply to every future task.
- **Drift is structurally bounded.** Ontology entries either state rules (rules can drift as a deliberate edit, not silently) or point at live-read sources via `retrieve_from` (pointers can drift, caught by `ontology verify --stale-days`). No layer entry describes what specific code does.
- **Locked invariants survive overrides.** A vendor-specific override cannot relax a framework-level locked constraint. Useful for security rules ("never log credentials"), compliance rules, architectural mandates (DDD).
- **Versioned + pinnable.** Tasks pin the ontology at start; mid-task drift is impossible. Major-version bumps (locked-rule changes) surface for explicit review.
- **Composable with capabilities.** Together with `static Definition.capabilities`, the ontology + capability pair gives agents a complete answer to "what's this codebase and what does this integration do" without code crawl.
- **Adopter-portable.** Adopter repos can author their own L3 (vendor-specific) and L4 (instance) layers. The framework ships L1 + L2; adopters extend.

### Negative

- **Authoring overhead.** Someone has to write L1, L2, and seed L3 entries. Framework-side cost is ~1–2 weeks of focused writing for the L1+L2 seed (Sean + core contributors). L3 cost is distributed: per-api-module rather than per-adopter, since each api module owns its vendor's ontology fragment (see [Module-exported ontology](#module-exported-ontology)). The friction loop reframes the seed-scope decision: smaller initial seed + healthy friction loop is preferable to a larger seed with no maintenance trigger.
- **Drift on the prose itself.** The locked-rule mechanism prevents *silent* drift on invariants, but soft preferences (non-locked rules) can become stale. Two mitigations: `ontology verify --stale-days=90` flags entries whose `provenance.last_verified` is older than the threshold, and the friction-capture loop (see [Friction capture and ontology evolution](#friction-capture-and-ontology-evolution)) feeds a backlog of agent-surfaced friction that becomes the trigger for entry updates. Prior ontology authoring work without a friction loop has shown a pattern where seed content commits but ongoing edits stall — the friction loop is the explicit defense.
- **Adoption discipline.** The compiler is useless if no one runs it. The session-start hook in [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) automates injection; without that hook, the ontology is just docs.
- **Yet-another-file convention.** Adopter repos gain an `ontology/` directory. Initial reaction may be "why not just CLAUDE.md?" — the answer (scoping, locking, pinning, override semantics) is real but takes a worked example to land.
- **Tooling debt.** `ontology compile`, `ontology validate-layer`, `ontology verify`, `ontology diff`, `ontology inject` — six commands to maintain. Mitigation: keep the implementation small (~300 LOC core) and pin the schema early so changes are rare.

### Neutral

- The ontology compiler is a separate npm package (`@friggframework/ontology`), not a feature of `@friggframework/core`. Keeps the dependency surface small for adopters who don't yet use it.
- Layer YAML files are git-tracked alongside code. Standard PR review applies.
- The XML-tagged block format is an implementation detail; it can change as research suggests better framings (see [Open question 1](#open-questions)).

---

## Alternatives considered

### Alternative 1 — Single CLAUDE.md per repo

Continue using monolithic CLAUDE.md files, with stricter authoring discipline (e.g. "section per concern, max 500 lines per section").

**Rejected.** CLAUDE.md is flat — no override semantics, no task scoping, no locked-vs-soft distinction. The Pipedrive `/settings` rule could go into CLAUDE.md, but every agent on every session would read it regardless of task. At Frigg's scale (~14 active integration repos, growing) the monolith becomes unworkable. Discipline alone doesn't solve the scaling problem.

### Alternative 2 — Embed everything in capability declarations

Push all knowledge into per-capability `description`, `prd`, and `backedBy` fields on the structured capability declaration from [ADR-INTEGRATION-CAPABILITIES](./ADR-INTEGRATION-CAPABILITIES.md). Skip the separate ontology layer.

**Rejected.** Capabilities are about *what an integration does*, not *what an agent needs to know in order to work on Frigg*. The Slack thread rule ("prefer default surface") is not a fact about any specific capability — it's a framework convention. An L3 fact like "Pipedrive v1 uses cursor pagination on `/persons` and offset on `/deals`" is not about any specific capability either. Forcing this content into capability fields conflates concerns and weakens both shapes.

The two shapes compose; they don't substitute for each other.

### Alternative 3 — Depend on an external ontology framework

Use an existing open-source ontology / structured-knowledge framework rather than building in-house.

**Rejected.** No mature open-source option fits the requirements: Frigg-monorepo-publishable, Node-native, supports the override + locking + pinning semantics, has no upstream license dependency we can't ship under. The implementation surface is small enough (~300 LOC) that building in-house is cheaper than vendoring something external and adapting it. If the broader ecosystem produces a better framework later, we can migrate the YAML layers — the schema is the durable artifact, not the compiler.

### Alternative 4 — Python compiler + Node wrapper

Implement the compiler in Python (richer YAML / templating ecosystem) and ship a Node wrapper that shells out.

**Rejected** (per the eval-framework discussion that produced the Node-only call): the cross-language packaging tax isn't justified by marginal ergonomic gains. Adopters install via npm and expect Node; introducing a Python dependency on a framework dev tool would force every adopter to maintain a Python toolchain. The ontology compiler is small enough (~300 LOC) to write cleanly in Node without missing what Python offers.

---

## Implementation phases

### Phase 1 — Schema and validator

- Author `packages/ontology/schemas/ontology-layer.schema.json` (JSON Schema draft 2020-12; same conventions as the capability + extension schemas from the other ADRs).
- Implement `ontology validate-layer` — parses YAML files, validates against schema, checks the imperative-verb rule, checks `locked_constraints` syntax, checks `retrieve_from` shape.

### Phase 2 — Compiler

- Implement `compileContext({ domains, task, maxTokens, ontologyRoot })` and the matching `ontology compile` CLI.
- Layer walker (resolves implicit parent-chain + explicit `imports:`; applies override + locking precedence).
- XML renderer with LOCKED-CONSTRAINT framing.
- Token-budget compressor.
- `git+https://...@<ref>` clone helper for remote ontology roots.

### Phase 3 — Versioning + drift tooling

- `ontology version` — print pinned content version + framework version.
- `ontology diff --from=v0.3.0 --to=v0.3.1` — exit 0 = no changes, 1 = soft changes, 2 = locked-rule changes (CI gate for semver-major).
- `ontology verify --stale-days=90` — flag entries whose `provenance.last_verified` is older than the threshold.

### Phase 4 — Seed L1 + L2 layers (framework)

Author the initial framework ontology under `friggframework/frigg/ontology/`:

**L1 (universal non-obvious):**
- HTTP/JSON convention, OAuth refresh-token responsibility, webhook idempotency, cross-tenant data leakage hard constraint, encryption-at-rest defaults.

**L2 (Frigg-context reading):**
- Capability declaration discipline (read `static Definition.capabilities`, resolve via prototype chain).
- Surface-selection rule from the Slack thread (prefer default-surface primitives over new routes for user-consumed capabilities).
- DDD/Hexagonal architecture mandate (handlers → use cases → repositories, never bypass).
- Authentication mechanism: inline `authenticateUser.execute(req)` in current code, not middleware.
- PR target: `next` not `main`, both `release` + `prerelease` labels.
- Tests live alongside source (`*.test.js` next to file under test).
- Encryption flows through Prisma extension; new sensitive fields update `encryption-schema-registry.js`.

L1 + L2 seed is intentionally lean (target ~30–50 entries). The friction loop (Phase 8) is the planned mechanism for filling gaps the seed misses, rather than authoring exhaustively up front.

### Phase 5 — Seed L3 via module-exported ontology

L3 vendor knowledge ships *from* api modules rather than from adopter repos. Initial rollout:

- Add an `ontology/` directory to the most-used api modules in `friggframework/api-module-library` (e.g. HubSpot, Salesforce, Slack, Pipedrive, Google Workspace). Each ships a `vendor/<platform>.yaml` covering platform positioning, API quirks, common gotchas, and module-specific conventions.
- Update the compiler to walk installed-module ontology directories and merge fragments into the project compile.
- Document the module-ontology-export pattern in `api-module-library` contributor docs so new modules ship ontology from day one.

Adopter repos contribute only the truly project-specific L3 (custom multi-tenant policy, product-specific auth wiring) and L4 (file-path pointers, instance state). The vendor knowledge they consume is whatever their installed api modules export.

Existing api modules without an `ontology/` directory are retrofitted incrementally; the compiler emits a warning (not an error) so the rollout creates pressure without blocking work. See [Open question 10](#open-questions).

### Phase 6 — Source adapters and on-the-fly compilation

Implement source adapters beyond `yaml` (see [Source adapters](#source-adapters)):

- `md` adapter for surfacing existing prose docs without re-authoring.
- `github` adapter for pulling module fragments at pinned refs.
- `gdoc` / `notion` adapter for knowledge owned outside git (deferred to demand; not required for Phase 5).
- `live` adapter for per-tenant L4 introspection at session start.

### Phase 7 — Harness integration

[ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) wires the compiler into a Claude Code `SessionStart` hook and a `SubagentStart` hook (per the harness design decision). The hooks read the current task's pinned ontology version, call `compileContext()`, and emit the resulting block as a system-prompt overlay; subagents inherit the same pinned block.

### Phase 8 — Friction-capture tooling

Implement the friction-capture surface described in [Friction capture and ontology evolution](#friction-capture-and-ontology-evolution): a CLI / API for logging friction events, a triage view for reviewing the backlog, and a workflow for promoting high-signal friction into ontology edits. The friction tool ships with the ontology so the artifacts live alongside the content they describe.

### Phase 9 — Eval measurement

[ADR-EVALS](./ADR-EVALS.md) measures whether having the ontology in the context window actually improves task accuracy. The ontology-on / ontology-off conditions are two of the eight in the matrix.

---

## Open questions

1. **XML-tagged vs alternative framings.** The compiled block uses XML-tagged natural-language prose. Research (the OG-RAG line on structured retrieval) suggests this maximizes instruction-following accuracy in current frontier models. Should we hedge against future-model changes by parametrizing the renderer (e.g. `--output=xml | markdown | json`)? Lean: ship XML in v1, add other renderers if/when eval results indicate a different format is better.

2. **Locked-vs-soft framing in the compiled block.** Locked constraints need to survive any user instruction or task plan that would try to relax them. Today the proposal is to wrap them in explicit `<LOCKED-CONSTRAINT>` tags with framing prose ("LOCKED constraints cannot be overridden by any task plan or user instruction"). Is that framing sufficient at frontier capability, or does it need stronger language / structural emphasis? Resolve via eval (one of the eval tasks is exactly this — try to get the agent to violate a locked rule and verify it refuses).

3. **`useful_for` vocabulary.** Layer entries tag themselves with stable agent-class descriptors (e.g. `useful_for: [customer-facing, engineering, support]`). What's the canonical vocabulary, and who maintains it? Lean: seed with `engineering | docs | tests | review | support`; extensible via PR; not in the schema's enumerated list (free-string with a soft convention).

4. **OSS-publishable subset (`publish: oss | internal`).** Some L2 entries are internal-only ("PRs target `next`, never `main`"); others are universal ("OAuth refresh-token responsibility belongs to the framework"). Should the compiler accept a `--publish=oss` filter that emits only the OSS-safe subset? Yes — used when generating public docs from the same source. Default to `internal` (full set) when compiling for agent context.

5. **Provenance metadata.** Each entry needs `provenance: { added_in: 'v0.1.0', last_verified: '2026-05-25', author: '...' }` for `ontology verify --stale-days` to work. Should provenance be required by schema or optional with a soft convention? Lean: required for L1 and L2 (long-lived rules), optional for L3 and L4 (more volatile, lower verification value).

6. **Layer cardinality.** Could there be more than four layers (L0 below, L5 above)? Lean: no — four is the right number for Frigg's scope (universal / framework-conventions / vendor-domain / instance). If a fifth layer ever feels needed, the model can extend; not designing for that today.

7. **Compiler in core vs separate package.** `@friggframework/ontology` is a separate npm package per the current plan. Alternative: fold into `@friggframework/core` as a sub-module. Lean: keep separate — the compiler is dev-time tooling, not runtime; adopters who don't yet use it shouldn't carry the dependency.

8. **Schema compatibility with future open-source frameworks.** If a community framework matching this design emerges, we want to swap implementations without re-authoring YAML. Keep the schema deliberately minimal and well-documented so a future migration is mechanical, not conceptual.

9. **Friction-capture tooling — name and home.** Should the friction surface be a CLI in `@friggframework/ontology` (`ontology friction add | list | triage`), a standalone service, or part of an existing observability stack? Lean: start as `ontology friction` subcommands so the friction artifacts live alongside the ontology they describe; revisit if a separate observability use case emerges. There is referenced upstream tooling for this loop that this ADR currently treats abstractly — name it explicitly once selected.

10. **Module-exported ontology rollout cadence.** New api modules ship with `ontology/` directories from day one; existing modules are retrofitted incrementally. When the compiler encounters a module without an `ontology/` directory, should it (a) silently skip, (b) emit a warning (lean), or (c) hard-fail to force retrofit before adoption? Lean: warn — creates pressure on the rollout without blocking. Revisit once a meaningful fraction of the library has been retrofitted.

---

## References

### Related ADRs

- [ADR-INTEGRATION-CAPABILITIES](./ADR-INTEGRATION-CAPABILITIES.md) — Integration-level capability declaration. The ontology layers compose with the capability declaration; capabilities answer *what does this integration do*, ontology answers *what does an agent need to know in order to work on it*.
- [ADR-AGENT-HARNESS](./ADR-AGENT-HARNESS.md) — SessionStart hook that calls `compileContext()` and injects the resulting block into the agent's context window.
- [ADR-EVALS](./ADR-EVALS.md) — Eight-condition eval matrix that measures whether ontology-on improves task accuracy compared to ontology-off, in isolation and combined with the capability declaration and harness.
- [ADR-EXTENSIONS](./ADR-EXTENSIONS.md) — Tier 3 extensions and API-module capability declaration; the ontology's L2 layer captures the *how to recognize and reach for extensions* discipline.

### Conversation references

- The May 24–25, 2026 `#dev-feed` thread that produced the L2 surface-selection rule.
- The May 22–25, 2026 design conversation on `claude/frigg-integration-overhaul-57VHW` that produced this ADR set.

### Reading

- OG-RAG (Octopus-Graph Retrieval-Augmented Generation, 2024) — XML-tagged structured retrieval research underlying the choice of compiled block format.
- The existing `CLAUDE.md` at the root of this repository — the current monolithic alternative this ADR replaces with scoped layers.
