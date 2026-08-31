# ADR-014: One Numbered ADR Register

**Status**: Accepted
**Date**: 2026-07-04
**Deciders**: Sean Matthews, Daniel Klotz

## Context

Frigg has **two** bodies of architecture decision records with **two** conventions:

1. `docs/architecture-decisions/` — a **numbered** register (`001`–`013`) with a `README.md` index,
   a template, and a `Status / Date / Deciders` header. A chronological decision log with stable
   IDs used for cross-reference ("per ADR-006").
2. `docs/architecture/ADR-*.md` — **12 name-slugged** docs (`ADR-PLUGINS`, `ADR-CAPABILITIES`,
   `ADR-EXTENSIONS-TAXONOMY`, `ADR-ONTOLOGY`, `ADR-AGENT-HARNESS`, `ADR-EVALS`, …). A forward-looking,
   cross-linked design cluster with a `Status / Date / **Author**` header, no index, and links that
   point at each other by name (`./ADR-PLUGINS.md`).

Two folders, two header shapes (`Deciders` vs `Author`), two naming schemes, and no single place
that lists every decision. A reader can't tell where "all Frigg architecture decisions" live, and
the two schemes can drift further apart with every addition.

## Decision

Consolidate into **one numbered register** at `docs/architecture-decisions/`, with **one exact
structure**. Numbered does not mean nameless — every ADR keeps a descriptive title.

1. **One location.** `docs/architecture-decisions/`. `docs/architecture/` is retired for ADRs.
2. **One filename convention.** `NNN-kebab-title.md` (e.g. `015-extensions-taxonomy.md`).
3. **One heading.** `# ADR-NNN: Human Readable Title` — number *and* name.
4. **One metadata block.** `**Status**` / `**Date**` / `**Deciders**` (map the named set's
   `Author` → `Deciders`). Normalize the few early ADRs (001–004) that use the `## Status` heading
   form to the same bold block.
5. **One section set.** Context / Decision / Consequences (Positive / Negative / Neutral) /
   Alternatives Considered / Related — per the register's existing template.
6. **One index.** `README.md`'s table is the single source of truth and lists every ADR.
7. **Status is preserved on move** — a `Proposed` doc stays `Proposed`; consolidation is not
   acceptance.

### Fold-in plan (the 12 named ADRs)

`git mv` each into the register with a number + slug, preserving history, then rewrite the
cross-links (`./ADR-PLUGINS.md` → `./016-plugins.md`, etc.). Proposed assignment — grouped by the
cluster's own reading order (taxonomy parent first), adjustable:

| New | From | Title |
|---|---|---|
| 015 | ADR-EXTENSIONS-TAXONOMY | Extensions Taxonomy |
| 016 | ADR-PLUGINS | Plugins |
| 017 | ADR-CORE-EXTENSIONS | Core Extensions |
| 018 | ADR-INTEGRATION-EXTENSIONS | Integration Extensions |
| 019 | ADR-API-MODULE-EXTENSIONS | API Module Extensions |
| 020 | ADR-CAPABILITIES | Capabilities |
| 021 | ADR-ONTOLOGY | Ontology |
| 022 | ADR-ARTIFACTS | Artifacts |
| 023 | ADR-INTEGRATION-TEMPLATES | Integration Templates |
| 024 | ADR-GLOBAL-ENTITIES | Global Entities |
| 025 | ADR-AGENT-HARNESS | Agent Harness |
| 026 | ADR-EVALS | Evals |

Execution steps:
1. `git mv docs/architecture/ADR-X.md docs/architecture-decisions/0NN-x.md` (history preserved).
2. Update each moved file: `# ADR-0NN: Title` heading, `Author` → `Deciders`, keep Status/Date.
3. Rewrite intra-cluster links to the new `0NN-slug.md` paths.
4. Add all rows to `README.md`; keep the table ordered by number.
5. Optionally leave short redirect stubs at the old `docs/architecture/ADR-*.md` paths for one
   release so external/inbound links don't 404, then remove.

*(Non-ADR files under `docs/architecture/`, if any, stay put — only `ADR-*.md` move.)*

## Consequences

### Positive
- One place, one structure — nothing gets lost, and "all decisions" is a single index.
- Stable numeric IDs for every decision; descriptive titles retained.
- New contributors learn one template.

### Negative
- A one-time churn PR that renames 12 files and rewrites their cross-links.
- Any external links to `docs/architecture/ADR-*.md` break unless redirect stubs are kept.

### Neutral
- Numbers get assigned in a logical block rather than strictly by original authoring date; original
  `Date` fields are preserved in each file.

## Amendment (2026-08-31): claiming a number

The original decision created one register but no way to **claim** a number. Every author picks
`max + 1` at authoring time, which is only correct if no one else is doing the same — and in practice
several were. At the time of this amendment the register had eight collisions across six open PRs, four
of them against numbers already merged to `next`: three different decisions were all titled `ADR-027`,
and a fourth reused `ADR-010`. Nothing catches this, because each PR is internally consistent and only
collides with branches its author cannot see.

**Numbers are claimed at PR-open time, and uniqueness is enforced by CI — not assigned at merge.**

Authoring does not change. Pick the next free number, name the file `NNN-kebab-title.md`, write the
`# ADR-NNN:` heading and cross-link by number as before. A workflow on any PR touching
`docs/architecture-decisions/**` computes the taken set as *numbers on `next`* ∪ *numbers claimed by
every other open PR*, and fails with the conflict and the next free number when they overlap. It re-runs
on every push and when `next` moves, so if two PRs open simultaneously and both pass, the second to
rebase goes red before it can merge.

### Why not assign the number at merge time

Deferring assignment sounds tidier and is worse in practice:

- The file is named wrong for the entire review. Reviewers read `draft-foo.md` / `ADR-XXX` and cannot
  cite it in review comments or link it from other PRs.
- Cross-ADR links cannot be written until the number exists, so a cluster of related ADRs (this register
  has three such clusters) has to be link-patched after the fact.
- Someone has to perform the rename plus link rewrite at every merge — which is exactly the manual
  reconciliation this amendment exists to stop, just relocated and made recurring.

Enforcing at PR-open keeps the number stable from first commit and moves detection from *after merge*
to *before review*. The cost is a rename when CI reports a conflict, which is cheap because it is a
document, and rarer because the check names the next free number.

### Numbers are not recycled

A number that has appeared on `next` is permanent, even if that ADR is later superseded or deprecated.
A number that has only ever existed in an unmerged branch is not yet claimed and may be reassigned — that
is what let this reconciliation close the 028-030 gap rather than leave holes in the sequence.

## Alternatives Considered
- **Keep both, add an index that spans them.** Rejected: still two structures/locations to learn;
  the drift problem remains.
- **Everything name-slugged, drop numbers.** Rejected: loses stable cross-reference IDs and the
  chronological log; ADR-005/006-style references already exist in code and PRs.
- **Renumber strictly by original date.** Rejected: scatters the interlinked extensions cluster
  across the sequence; logical grouping reads better and dates are retained in-file.

## Related
- [ADR register index](./README.md)
- The 12 named ADRs currently under `docs/architecture/ADR-*.md`
