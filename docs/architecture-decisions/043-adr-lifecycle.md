# ADR-043: ADR Lifecycle — One Register, No RFC Tier

**Status**: Proposed
**Date**: 2026-09-12
**Deciders**: Sean Matthews, Daniel Klotz

## Context

ADR-014 gave us one register with one filename convention, one heading, one metadata block
and one index. Its amendment added number claiming and CI enforcement. Between them they
settle how an ADR is **filed**. Nothing settles how one is **decided**, and the register now
shows what that costs.

Measured on `next` at the time of writing, with 28 merged ADRs and 14 more unmerged across
nine open pull requests:

- **15 of 28 merged ADRs (54%) are still `Proposed`.** ADR-015 through ADR-026 are all dated
  2026-06-09 and have not moved in three months. ADR-004 has been `Proposed` since
  2025-01-25 — twenty months.
- **No ADR pull request has ever been approved by a human.** `reviewDecision` is empty on all
  nine. Every review on them is a bot (`graphite-app`, `cursor`, `claude`,
  `chatgpt-codex-connector`, `github-advanced-security`), all `COMMENTED`, none `APPROVED`.
- **The status vocabulary is already violated.** The register README defines four statuses —
  Accepted, Superseded, Deprecated, Proposed. ADR-018 is marked `Implemented`, which is not
  one of them.
- **The README points at a process that does not exist.** It describes `Proposed` as
  "Under discussion (use RFCs for new proposals)". There is no RFC directory, template or
  process anywhere in this repository.
- **Status no longer tracks reality.** ADR-031 is `Proposed` while an open PR implements half
  of it. Two merged ADRs carry `Deciders: TBD`.

`Proposed` has stopped carrying information. It means "merged" and nothing more, because
merging is the only event anyone performs and it changes no status. A reader — human or
agent — cannot tell from the register which decisions are in effect.

### Why not add an RFC tier

The obvious fix is the industry-standard two-tier split: an RFC explores a decision while it
is open, an ADR records it once made, and the ADR register stays a log of decisions actually
in effect. That is sound advice and we are rejecting it, for reasons specific to this repo.

1. **We just spent ADR-014 merging two documentation bodies into one.** `docs/architecture/`
   and `docs/architecture-decisions/` drifted apart precisely because there were two
   conventions, two header shapes and no single index. Introducing RFCs re-creates that
   shape: two registers, two numbering schemes, two places to look, and a new seam for
   documents to get stuck in. The reconciliation PR that followed ADR-014 had to resolve
   eight number collisions across six branches; the cost of a second tier is not theoretical.

2. **The RFC's job is already being done by the pull request.** An RFC exists to gather
   feedback before commitment. A draft PR carrying the ADR does exactly that, with review
   threads anchored to the actual text. Two of our open ADR PRs already work this way.

3. **Our constraint is deciding, not authoring.** The two-tier split assumes proposals
   outrunning alignment across teams that are not already in the loop. We have two named
   deciders and fourteen unreviewed ADRs. A second document tier adds authoring, which is
   the part that is already cheap, and does nothing for review, which is the part that is
   scarce. It would make the backlog worse.

4. **Agent readers make a single authoritative register more valuable, not less.** ADRs are
   increasingly read by coding agents as grounding for what the codebase decided and why.
   An agent cannot act on a document whose authority is ambiguous, and splitting the corpus
   into "proposals over here, decisions over there" doubles the ambiguity at exactly the
   moment we are pointing agents at it. ADR-021 (Ontology) and ADR-036 (Skills) already
   assume a single authoritative source of shared ground truth.

The failure we have is not "we lack a proposal stage." It is "nothing marks the moment a
proposal becomes a decision." That is fixable inside one register.

## Decision

**Keep one numbered register. Make merging the decision event. Make status mean something.**

### 1. The states

| Status | Meaning |
|---|---|
| `Proposed` | Open for decision. **Only valid on an unmerged PR.** |
| `Exploratory` | The decision is deliberately deferred pending research. May merge. Requires a *What would settle this* section. |
| `Accepted` | Decided and in effect. The default state of anything merged. |
| `Implemented` | Accepted, and the code that realises it has shipped. |
| `Superseded` | Replaced by a later ADR, which must be named. |
| `Deprecated` | No longer relevant. |

`Implemented` is added because it is already in use (ADR-018) and is the honest distinction
between a decision we hold and a decision that exists in the code. `Exploratory` is added
because we genuinely have one (ADR-030, Integration Versioning, whose own status line says
the decision is deliberately deferred) and calling that `Proposed` forever is how `Proposed`
lost its meaning.

### 2. The transitions, and what performs each one

```
  draft PR                merge ADR PR              merge the code PR
 (Proposed)  ──────────▶   (Accepted)    ──────────▶   (Implemented)
      │                         │
      │                         └──────▶ (Superseded) ── by a later ADR that names it
      └──▶ (Exploratory) ── merges as Exploratory, decision deferred
```

- **`Proposed` → `Accepted` is the merge of the ADR PR**, with at least one approving review
  from a named decider. There is no separate ceremony, and no status edit to forget.
- **`Accepted` → `Implemented` is performed by the code PR that ships it**, in the same
  commit as the code. The status is a by-product of work someone is already doing, not a
  chore that depends on someone remembering.
- **`Accepted` → `Superseded` is performed by the superseding ADR**, which must name the ADR
  it replaces, and must update that ADR's status in the same PR.

### 3. The rule that fixes the 54%

**An ADR does not merge as `Proposed`.** Merging is acceptance. If it is not ready to be
accepted it stays a draft PR, where it is still numbered, still reviewable and still linkable
— it is simply not yet in the register as a decision. If it is genuinely undecidable today it
merges as `Exploratory` with its open question stated.

This is the whole mechanism. It costs nothing, requires no new tooling beyond a check, and it
is what makes the register readable: everything merged is in effect, except the small,
explicitly labelled set that is not.

### 4. Deciders are named

`Deciders: TBD` is not acceptable on a merged ADR. The approving reviewer on the PR is the
minimum; a decision nobody is willing to be named for is not a decision.

### 5. Enforcement

The number check added with ADR-014's amendment already parses every ADR's front matter.
Extend it to fail a PR when:

- a **merged-bound** ADR has `Status: Proposed` (the rule in §3);
- an ADR has `Deciders: TBD`;
- a status is outside the vocabulary in §1;
- an ADR claims `Superseded` without naming its successor, or names a successor that does not
  exist;
- `website/roadmap/data/adrs.json` disagrees with the files it projects.

The direction of travel in agent-assisted development is that a decision is only real if a
deterministic check verifies compliance rather than trusting it. This is the cheap first step
on that path: the register keeps itself honest without anyone auditing it.

### 6. What the public page shows

`website/roadmap/index.html` renders the register onto a public "Where Frigg is headed" page,
including `Proposed` entries. Under §3 there will be no merged `Proposed` ADRs, so the page
becomes a list of decisions actually in effect plus a clearly-marked `Exploratory` set. No
change to the page is required — fixing the status semantics fixes the page.

## Consequences

### Positive

- Every merged ADR is a decision in effect. A reader — human or agent — can trust the
  register without cross-checking pull requests.
- The 54% `Proposed` backlog becomes a one-time cleanup rather than a permanent condition.
- Status changes ride along with work someone is already doing, so there is nothing to
  remember and nothing to schedule.
- The public roadmap page stops publishing unreviewed proposals as though they were direction.
- Agents reading the register get an unambiguous authority signal, which is the property that
  makes an ADR corpus usable as grounding at all.
- One register, one number, one place to look — the property ADR-014 bought, preserved.

### Negative

- A named approval is now required to merge an ADR. With two named deciders this is a real
  constraint, and the current backlog of fourteen unreviewed ADRs has to be worked through
  rather than merged in bulk.
- The 15 merged `Proposed` ADRs need a one-time pass to set a real status. Some are genuinely
  `Exploratory`, some are `Accepted` in practice, and a few may be `Deprecated`. That pass is
  a judgement call per ADR and cannot be automated.
- Draft PRs are now load-bearing. An ADR parked as a draft for months is invisible in the
  register, which is correct but means the PR list becomes the backlog view.
- `Implemented` depends on someone flipping it in the code PR. If that is skipped the ADR
  understates reality — a softer failure than today's, but still a failure.

### Neutral

- No new directory, template or numbering scheme. This constrains an existing register rather
  than adding a system.
- Existing ADRs are not rewritten. ADR-014's rules still govern filing; this governs only
  status and transitions.

## Alternatives Considered

- **Add an RFC tier (RFC for proposals, ADR for decisions).** The mainstream recommendation,
  rejected for the four reasons in Context: it re-creates the two-body split ADR-014 removed,
  duplicates what the PR already does, adds authoring where our constraint is deciding, and
  splits the corpus agents read. Worth revisiting if the number of people who need to be
  consulted — but are not already in the loop — grows past a handful.

- **Leave status advisory and rely on convention.** This is the current state. It produced a
  register where 54% of entries carry a status that no longer distinguishes anything.

- **Drop `Proposed` entirely; only merge decided ADRs.** Close to what is decided here, but it
  gives exploratory work nowhere to live. ADR-030 is a real counter-example: valuable to
  record, genuinely undecided. `Exploratory` keeps it in the register honestly.

- **Track lifecycle outside the repo (issues or a project board).** Splits the decision from
  the artefact, and is invisible to anything reading the repository — including agents, which
  is where this register is heading.

## Related

- [ADR-014: One Numbered ADR Register](./014-consolidate-adr-register.md) — filing rules, and
  the number-claiming amendment this builds on.
- [ADR-021: Ontology](./021-ontology.md), [ADR-036: Skills](./036-skills.md) — the agent-facing
  consumers that depend on an unambiguous authoritative register.
- [ADR register index](./README.md); `website/roadmap/data/adrs.json` (machine-readable
  projection); `.github/workflows/adr-number-check.yml` (existing enforcement).
