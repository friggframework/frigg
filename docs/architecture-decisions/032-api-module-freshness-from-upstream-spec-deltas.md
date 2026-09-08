# ADR-032: API Module Freshness from Upstream Spec Deltas

**Status**: Proposed (targets the `next` line, where ADRs 001–031 and the spec-anchored module pattern live; drafted on branch `claude/marketplace-scraping-system-zlxasp`)
**Date**: 2026-09-08
**Deciders**: Sean Matthews

## Context

An API module is a hand-authored client (`api.js`) whose methods bind to specific upstream endpoints of one
provider. Upstream APIs move — vendors add, change, and remove operations continuously — but today nothing
tells us when a module has fallen behind its upstream. The evidence is in the repo layout itself:
`api-module-library/packages/` is split into `v1-ready/` and `needs-updating/`, and that split is maintained
**by hand** with no signal for *what* changed upstream or *how urgent* it is (as of 2026-09-08: `next` is
30 v1-ready / 23 needs-updating; `main` 19 / 25 — the numbers move, the manual process doesn't).

Two developments now make a deterministic freshness loop cheap:

1. **`next` already ships spec-anchored modules.** Several v1-ready modules (`fathom`, `gong`, `otter`,
   `quo`, `reevo`) carry a colocated `<module>.openapi.yaml` plus `tests/spec-sync.test.js`, which asserts
   *every `operationId` in the spec has a matching client method* (plus base-URL and auth-scheme checks).
   **That test is a ready-made freshness verifier** — feed it a newer spec and it names exactly the missing
   methods.
2. **An upstream extensibility-velocity scrape is being scoped** (business-os
   [`extensibility-velocity-graph-design.md`](../../../business-os/docs/reference/extensibility-velocity-graph-design.md)).
   It tracks each vendor's published API surface over time and emits a per-revision OpenAPI **diff**
   (`addedOps` / `removedOps` / `breakingCount`) — the exact input a module needs.

These meet at one seam: **a spec-anchored module's colocated spec and the upstream spec the scrape tracks are
the same artifact.** A new upstream revision and a module-freshness check can be the same event.

Field reconnaissance (thesis test, 2026-09) shows upstream spec availability varies and the loop must not
assume git-tagged history: `stripe/openapi` and `twilio/twilio-oai` publish dated, versioned specs (MIT);
`klaviyo/openapi` is MIT but keeps only the current `stable.json` (historic revisions live behind a
`revision` header, not as tags); HubSpot's spec collection is public-readable but **proprietary**. CC0
catalogs — [Jentic](https://github.com/jentic/jentic-public-apis) (CC0 1.0, ~6k specs, APIs.guru lineage)
and [APIs.guru](https://github.com/APIs-guru/openapi-directory) — can seed a spec for a vendor that
publishes none, but neither tracks upstream change cadence, so the diff/freshness layer stays ours.

## Decision

Adopt an **API Module Freshness loop**: upstream spec change → deterministic drift signal → issue + PR →
`spec-sync`-verified update. It is **maintenance/CI tooling, out of the module runtime** — no module import
or execution path changes.

The loop, for a spec-anchored module:

1. An **upstream-spec watcher** (fed by the velocity scrape, or by a direct per-vendor adapter) detects that
   the upstream revision is newer than the module's synced revision.
2. It **bumps the module's colocated `<module>.openapi.yaml`** to the upstream revision (or opens a proposal
   to). `spec-sync.test.js` now fails, enumerating the missing/changed `operationId`s — the coverage/breakage
   list, deterministically, no model.
3. **Action ladder**: (1) detect & flag — open a deduped GitHub issue with the diff + revision date and move
   the module `v1-ready/` → `needs-updating/`; (2) draft — scaffold the missing methods into `api.js` and
   open a draft PR; (3) verify — `spec-sync` + module tests green ⇒ back in sync.

Hand-written (non-spec-anchored) modules get rung 1 only, using the scrape's diff directly against `api.js`
call sites; promoting them to the colocated-spec pattern unlocks rungs 2–3.

## Architecture

- **`moduleSlug ↔ upstream source` registry** — the one new artifact: maps each module to its canonical
  product/API and the upstream spec source (repo/URL + revision scheme). Names already align
  (`stripe`, `hubspot`, `salesforce`, `asana`, `zoom`…), so seeding is near-mechanical.
- **Drift = `upstreamRevision > syncedRevision`** — `syncedRevision` recorded per module (e.g. in the
  colocated spec's `info.version` or a sidecar). Revision schemes differ (date, semver, git tag); the
  watcher normalizes per source (see availability note in Context).
- **Verifier = existing `spec-sync.test.js`** — no new verifier; the loop supplies newer specs to it.
- **Scaffolding = frigg@next codegen** (`frigg-cli` `generate-command`; management-ui `APIEndpointGenerator`)
  for rung 2, rather than new generation.
- **Seed = CC0 catalogs** (Jentic / APIs.guru) for vendors with no published spec.
- **Module-lag KPI** — days between an upstream (breaking) revision and the module's matching update;
  reportable per module and in aggregate.

## Consequences

- **Positive:** the manual `v1-ready` ↔ `needs-updating` split becomes a deterministic, prioritized,
  dated queue; module lag becomes measurable; spec-anchored modules get the full loop immediately.
- **Cost/limits:** full automation depends on the colocated-spec pattern spreading across the library;
  hand-written-only modules are detect/flag only. Upstream backfill quality is vendor-dependent (header-only
  and proprietary specs are harder than git-tagged ones). Breaking removals need a human call
  (deprecate vs delete), so rung 2 stays *draft* PRs, never auto-merge.
- **Alignment:** this reinforces the `next` direction (spec-anchored modules) rather than competing with it.

## Cross-references

- [ADR-019: API Module Extensions](./019-api-module-extensions.md) — the module producer surface this rides on
- [ADR-013: Integration Version Migrations](./013-integration-version-migrations.md) — versioning precedent for a changed upstream contract
- [ADR-025: Agent Harness](./025-agent-harness.md) — adjacent agent-surface work
- business-os: `extensibility-velocity-graph-design.md`, `opportunity-api-module-autofresh.md` (the loop's design + KPI)
- `next`: the `spec-sync.test.js` pattern on `fathom` / `gong` / `otter` / `quo` / `reevo`

## Open questions

- **Where does the watcher live?** A `frigg-cli` command run in CI, a standalone service, or the business-os
  scrape emitting a webhook into this repo? (Leaning: scrape owns detection; a `frigg-cli` command applies
  the bump + opens the PR, so the framework owns its own repo's writes.)
- **Who owns the `moduleSlug ↔ productSlug` registry** — frigg or business-os? (It's needed on both sides.)
- **Auto-bump the colocated spec, or propose the bump for review** before `spec-sync` runs?
- **`syncedRevision` storage** — reuse `info.version`, or a dedicated sidecar field per module?

## References

- Spec-anchored modules + `spec-sync.test.js` on `next` (api-module-library)
- [Jentic public APIs](https://github.com/jentic/jentic-public-apis) — CC0 1.0; [APIs.guru](https://github.com/APIs-guru/openapi-directory) — CC0
- Upstream spec sources observed: `stripe/openapi`, `twilio/twilio-oai` (MIT, versioned); `klaviyo/openapi` (MIT, latest-only); HubSpot public spec collection (proprietary)
