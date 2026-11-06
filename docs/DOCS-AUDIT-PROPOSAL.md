# Documentation Audit & Overhaul Proposal

**Date:** 2026-02-28
**Status:** Proposal
**Scope:** Full Frigg Framework documentation ecosystem

---

## Executive Summary

An automated audit of all documentation across the Frigg monorepo surfaced significant issues: **54 markdown files (~850KB)** scattered across packages, **212+ docs/ files** with broken links and empty stubs, **zero auto-generation tooling**, and several factual inaccuracies in core guidance files. This proposal categorizes every finding, recommends what to remove, what to rewrite, and where auto-generation can replace manual maintenance.

---

## Table of Contents

1. [Current State](#1-current-state)
2. [Critical Fixes (Do Now)](#2-critical-fixes-do-now)
3. [Files to Remove](#3-files-to-remove)
4. [Files to Rewrite](#4-files-to-rewrite)
5. [Structural Problems](#5-structural-problems)
6. [Auto-Generation Strategy](#6-auto-generation-strategy)
7. [Proposed New Documentation Architecture](#7-proposed-new-documentation-architecture)
8. [Implementation Phases](#8-implementation-phases)
9. [Appendix: Full File Inventory](#9-appendix-full-file-inventory)

---

## 1. Current State

### Documentation Platforms & Tooling

| Component | Status |
|-----------|--------|
| **GitBook** | Active — `.gitbook.yaml` points to `docs/`, `SUMMARY.md` has 150+ entries |
| **Auto-generation** | None — no TypeDoc, JSDoc config, or doc scripts in any `package.json` |
| **JSDoc coverage** | ~60% in `packages/core`, ~77% in `packages/devtools` |
| **TypeScript .d.ts** | 15 manually-maintained files in `packages/core/types/` |
| **CI/CD for docs** | None — no doc validation or generation in pipelines |

### Documentation Locations

| Location | Files | Size | Purpose |
|----------|-------|------|---------|
| `docs/` | 212+ | Large | GitBook-hosted user-facing docs |
| `CLAUDE.md` (root) | 1 | 34KB | AI assistant guidance |
| `packages/core/**/*.md` | 12 | ~300KB | Core package docs |
| `packages/devtools/**/*.md` | 19 | ~200KB | DevTools package docs |
| `packages/schemas/**/*.md` | 2 | ~18KB | Schema docs |
| Root-level `.md` files | 8 | ~250KB | Mixed (reports, guides, license) |
| `docs/api-modules/module-list/` | 60+ | Minimal | **Empty stubs** (headings only) |

### Key Finding: The API Module Docs Are Hollow

All 20 documented modules in `docs/api-modules/module-list/` contain **only placeholder headings with zero content**. Every `available-methods.md`, `configuration.md`, `getting-started.md`, and `supported-apis.md` is a 2-line file. This is the single biggest gap in the documentation.

---

## 2. Critical Fixes (Do Now)

These are factual errors or broken navigation that mislead developers today.

### 2.1 Broken GitBook Links on Landing Page

**File:** `docs/README.md` (lines 40-47)

Eight navigation links on the primary landing page resolve to `broken-reference`:
- Tutorials, How-To Guides, Reference, Explanation, API Modules, Contributing, Support, Roadmap

**Fix:** Rebuild using GitBook editor or rewrite as standard markdown links.

### 2.2 CLAUDE.md Factual Errors

| Error | Location | Documented | Actual | Fix |
|-------|----------|-----------|--------|-----|
| Node.js version | Root CLAUDE.md, core CLAUDE.md | `>=18` | `>=22` | Update both files |
| npm version | Root CLAUDE.md, core CLAUDE.md | `>=9` | `>=10` | Update both files |
| `frigg search` command | Root CLAUDE.md line 57 | Listed as available | **Does not exist** in CLI | Remove from docs |
| `--no-browser` flag | Root CLAUDE.md line 113 | Listed as available | **Not implemented** in code | Remove or implement |

### 2.3 URL Typo

**File:** `README.md` (root)
- Contains `friggramework.org` (missing "f" — should be `friggframework.org`)

### 2.4 Missing Referenced File

**File:** `docs/DANGER_ZONES.md` (line 370)
- References `docs/TECHNICAL_DEBT_ANALYSIS.md` which **does not exist**
- Either create the file or remove the reference.

### 2.5 ADR Index Out of Sync

**File:** `docs/architecture-decisions/README.md`
- Lists ADRs 001-005 only
- ADRs 006-009 exist as files but are **missing from the index table**

---

## 3. Files to Remove

These files are obsolete, temporary, or superseded. Recommend deleting or archiving to an `docs/_archive/` directory.

| File | Reason | Lines |
|------|--------|-------|
| `docs/STACKING_PROGRESS_BOOKMARK.md` | Temporary tracking doc — all 10 stacks marked complete (Oct 2025) | 233 |
| `docs/TESTING_GUIDE.md` | Superseded by `docs/TESTING.md` — unique Prisma examples should be merged first | 289 |
| `packages/devtools/management-ui/CLEANUP_SUMMARY.md` | Historical cleanup record, no ongoing value | ~200 |
| `packages/devtools/management-ui/src/tests/legacy-cleanup-analysis.md` | Historical analysis, no ongoing value | ~160 |
| `packages/core/database/models/readme.md` | Stub file — 57 bytes, just says "Readme" | 1 |
| `FRIGG_CLI_ANALYSIS_REPORT.md` (root) | Point-in-time analysis from 4 months ago, likely stale | ~900 |
| `docs/frigg-core/MANAGEMENT_UI_REFACTOR_STATUS.md` | Branch-specific merge analysis (Oct 2025), unclear if still relevant | 801 |

### API Module Stubs — Consolidate or Auto-Generate

The entire `docs/api-modules/module-list/` directory (60+ files) contains empty stubs. Additionally:
- `docs/api-module-library/` duplicates `docs/api-modules/` with a different structure
- 4 directories are misnamed: `hubspot-1` (Ironclad), `hubspot-2` (Linear), `hubspot-3` (MS Teams), `hubspot-4` (QBO)

**Recommendation:** Delete all empty stubs. Replace with auto-generated docs (see Section 6). Eliminate the duplicate `api-module-library/` vs `api-modules/` split — pick one canonical location.

---

## 4. Files to Rewrite

### 4.1 Misleading Titles / Stale Status

| File | Issue | Action |
|------|-------|--------|
| `docs/API_REDESIGN_COMPLETE.md` | Title says "COMPLETE" but Phase 5 shows 86/102 tests (84%) | Rename to reflect actual status, update test counts |
| `docs/MULTI_STEP_AUTH_MIGRATION_GUIDE.md` | Unclear if deployed to production | Add current deployment status |

### 4.2 Content Consolidation Candidates

These groups of files cover overlapping topics and should be merged:

**Group A: UI Library**
- `docs/UI_LIBRARY_UPDATES.md` (333 lines) — philosophy & approach
- `docs/UI_LIBRARY_V2_UPDATES.md` (1,359 lines) — implementation details
- **Action:** Merge into a single `docs/reference/ui-library.md`

**Group B: Multi-Step Auth**
- `docs/MULTI_STEP_AUTH_AND_SHARED_ENTITIES_SPEC.md` (1,289 lines)
- `docs/MULTI_STEP_AUTH_MIGRATION_GUIDE.md` (308 lines)
- `docs/IMPLEMENTATION_SUMMARY.md` (327 lines)
- `FORM_AUTH_IMPLEMENTATION_SUMMARY.md` (root, 11KB)
- `TESTING_AUTH_FLOWS.md` (root, 14KB)
- **Action:** Create an index doc linking these, or consolidate into a single reference guide

**Group C: CLI Documentation**
- `docs/CLI_ARCHITECTURE.md`
- `docs/CLI_IMPLEMENTATION_GUIDE.md`
- `docs/CLI_SPECIFICATION.md`
- `packages/devtools/frigg-cli/README.md` (1,289 lines — the most complete)
- `FRIGG_CLI_ANALYSIS_REPORT.md` (root, 35KB — stale analysis)
- **Action:** Make `packages/devtools/frigg-cli/README.md` the single source of truth. Archive or delete the rest.

### 4.3 Oversized Specialized Docs

| File | Size | Issue |
|------|------|-------|
| `packages/core/database/encryption/documentdb-encryption-service.md` | 110KB | Extremely detailed — possibly auto-generated. Review for relevance and trim. |

---

## 5. Structural Problems

### 5.1 No Single Source of Truth

Documentation is fragmented across 5+ locations with no clear hierarchy:
- `docs/` (GitBook) — user-facing but partially broken
- `CLAUDE.md` files (root, core, devtools) — AI guidance but also developer reference
- Package `README.md` files — package-specific but overlap with `docs/`
- Root-level `.md` files — ad-hoc reports and summaries
- `docs/api-modules/` + `docs/api-module-library/` — two competing empty structures

### 5.2 GitBook SUMMARY.md Drift

`docs/SUMMARY.md` (397 lines, 150+ entries) serves as the GitBook navigation but references paths that may not match actual content. The `broken-reference` links in `docs/README.md` suggest GitBook card formatting has degraded.

### 5.3 No Documentation Maintenance Process

- No "last reviewed" dates on documents
- No automated staleness detection
- No doc validation in CI/CD
- No ownership assignments for doc sections

---

## 6. Auto-Generation Strategy

### 6.1 What Exists Today

| Asset | Coverage | Notes |
|-------|----------|-------|
| JSDoc comments | 60-77% | Good baseline, especially in admin/utility code |
| TypeScript `.d.ts` | 15 files | Manually maintained in `packages/core/types/` |
| Module Definition pattern | 100% of modules | Standard `Definition` export with extractable metadata |
| JSON Schema validation | Available | `packages/schemas/schemas/api-module-definition.schema.json` |
| `auto` + `lerna` | Installed | Can drive CI-based doc generation |

### 6.2 Recommended: TypeDoc + Custom Module Generator

**Phase 1: TypeDoc for Core API Reference**

```bash
npm install --save-dev typedoc typedoc-plugin-markdown
```

TypeDoc can parse existing JSDoc comments and `.d.ts` files to generate markdown suitable for GitBook. This would auto-generate:
- Core package API reference (classes, methods, types)
- Module system reference (Requester classes, OAuth2, ApiKey, BasicAuth)
- Repository and Use Case interfaces

**Output:** `docs/reference/api/` — regenerated on each release.

**Phase 2: Custom API Module Doc Generator**

Build a script that parses each module's `Definition` export to auto-generate:

| Field | Source | Output |
|-------|--------|--------|
| Module name & slug | `Definition.moduleName` | README.md header |
| Auth type | `Definition.requiredAuthMethods` | configuration.md |
| Environment variables | `Definition.env` | configuration.md |
| Encrypted fields | `Definition.encryption` | configuration.md |
| OAuth scopes | `Definition.env.scope` | getting-started.md |
| Available methods | API class prototype | available-methods.md |
| Requester base class | Inheritance chain | supported-apis.md |

This replaces all 60+ empty stub files with real, always-current content.

**Phase 3: CI/CD Integration**

```yaml
# In GitHub Actions workflow
- name: Generate docs
  run: npm run docs:generate

- name: Validate docs
  run: npm run docs:validate

- name: Commit generated docs
  run: |
    git add docs/reference/api/ docs/api-modules/
    git diff --staged --quiet || git commit -m "docs: auto-generate API reference"
```

### 6.3 What NOT to Auto-Generate

Keep these as manually-authored content:
- Tutorials and getting-started guides
- Architecture decisions (ADRs)
- Integration pattern guides
- Conceptual explanations ("The Why of Frigg")
- CLAUDE.md files (AI context)
- DANGER_ZONES.md (institutional knowledge)

### 6.4 JSDoc Coverage Improvement

Current coverage is 60-77%. Target: **90%+ on public APIs**.

Priority files for JSDoc enhancement:
1. `packages/core/integrations/` — IntegrationBase and subclasses
2. `packages/core/modules/` — Requester classes (OAuth2, ApiKey, BasicAuth)
3. `packages/core/application/commands/` — friggCommands, schedulerCommands
4. `packages/core/database/` — repositories and Prisma extensions

### 6.5 Alternative Considered: Docusaurus / VitePress

Not recommended at this time because:
- Would require migrating away from GitBook (high effort, unclear ROI)
- 150+ existing GitBook entries would need restructuring
- GitBook's hosted platform is already integrated and working (minus the broken links)

Revisit if GitBook becomes a bottleneck or the framework moves to a docs-as-code model.

---

## 7. Proposed New Documentation Architecture

### 7.1 Simplified Structure

```
docs/
├── README.md                          # Landing page (fix broken links)
├── SUMMARY.md                         # GitBook navigation (rebuild)
├── getting-started/                   # Tutorials for new users
│   └── quick-start.md
├── tutorials/                         # Step-by-step learning
│   ├── quick-start/
│   └── advanced-tutorials/
├── guides/                            # How-to guides (manually authored)
│   ├── INTEGRATION-PATTERNS.md
│   ├── GLOBAL-ENTITIES-GUIDE.md
│   └── cooking-with-frigg.md
├── reference/                         # Reference material
│   ├── api/                           # AUTO-GENERATED from TypeDoc
│   │   ├── core/
│   │   ├── modules/
│   │   └── devtools/
│   ├── cli.md                         # Single CLI reference (from frigg-cli README)
│   ├── encryption.md
│   ├── webhooks.md
│   └── ui-library.md                  # Consolidated from 2 files
├── api-modules/                       # AUTO-GENERATED from module Definitions
│   ├── index.md                       # Module registry
│   └── <module-name>/                 # One dir per module
│       ├── README.md
│       ├── configuration.md
│       ├── available-methods.md
│       └── getting-started.md
├── architecture-decisions/            # ADRs (manually authored)
│   ├── README.md                      # Updated index (001-009)
│   └── 001-009 .md files
├── explanation/                       # Conceptual docs
├── contributing/                      # Contribution guides
├── support/                           # Support info
├── specs/                             # Feature specifications
│   ├── MULTI_STEP_AUTH_SPEC.md        # Consolidated auth spec
│   └── DEPLOY_DRY_RUN_SPEC.md
├── _archive/                          # Retired docs (not in GitBook nav)
│   ├── STACKING_PROGRESS_BOOKMARK.md
│   ├── TESTING_GUIDE.md
│   ├── MANAGEMENT_UI_REFACTOR_STATUS.md
│   └── CLI_ANALYSIS_REPORT.md
└── TESTING.md                         # Testing guide (keep as-is)
```

### 7.2 Key Changes

1. **Kill the dual module docs** — Remove `docs/api-module-library/`, keep only `docs/api-modules/`
2. **Auto-generate `docs/reference/api/`** — From TypeDoc + JSDoc
3. **Auto-generate `docs/api-modules/`** — From module Definition exports
4. **Archive, don't delete** — Move retired docs to `docs/_archive/`
5. **Consolidate overlapping content** — UI library (2→1), CLI (4→1), auth (5→2)
6. **Fix SUMMARY.md** — Rebuild to match new structure

---

## 8. Implementation Phases

### Phase 1: Critical Fixes (1-2 days)

- [ ] Fix 8 broken links in `docs/README.md`
- [ ] Fix CLAUDE.md errors (Node >=22, npm >=10, remove `frigg search`, remove `--no-browser`)
- [ ] Fix URL typo in root `README.md` (`friggramework.org`)
- [ ] Update ADR index (add 006-009)
- [ ] Create or remove `docs/TECHNICAL_DEBT_ANALYSIS.md` reference

### Phase 2: Cleanup & Consolidation (1 week)

- [ ] Create `docs/_archive/` and move retired files
- [ ] Delete empty API module stubs (`docs/api-modules/module-list/`)
- [ ] Delete duplicate `docs/api-module-library/` directory
- [ ] Rename misnamed directories (`hubspot-1` → `ironclad`, etc.) if keeping any
- [ ] Consolidate UI library docs (2 files → 1)
- [ ] Consolidate CLI docs (4 files → 1 reference in `packages/devtools/frigg-cli/README.md`)
- [ ] Create auth docs index linking the 3-5 related files
- [ ] Update `docs/SUMMARY.md` navigation
- [ ] Rename `API_REDESIGN_COMPLETE.md` to reflect actual status

### Phase 3: Auto-Generation Setup (1-2 weeks)

- [ ] Install TypeDoc + typedoc-plugin-markdown
- [ ] Configure TypeDoc for `packages/core` public API
- [ ] Add `docs:generate` npm script to root `package.json`
- [ ] Generate initial `docs/reference/api/` output
- [ ] Build custom script to parse module `Definition` exports
- [ ] Auto-generate `docs/api-modules/<module>/` from definitions
- [ ] Add `docs:validate` script for link checking

### Phase 4: CI/CD & Maintenance (1 week)

- [ ] Add GitHub Actions workflow for doc generation on `next` branch
- [ ] Add doc freshness check (warn on files not updated in 6+ months)
- [ ] Add "last reviewed" header to key documents
- [ ] Enhance JSDoc coverage to 90%+ on public APIs
- [ ] Document the doc maintenance process itself

---

## 9. Appendix: Full File Inventory

### Root-Level Markdown (8 files)

| File | Size | Last Modified | Verdict |
|------|------|---------------|---------|
| `CLAUDE.md` | 34KB | 2 weeks ago | **Keep** — fix errors noted in Section 2.2 |
| `README.md` | 20KB | 2 months ago | **Keep** — fix URL typo |
| `CHANGELOG.md` | 137KB | 4 months ago | **Keep** — auto-managed by `auto` |
| `LICENSE.md` | 1.1KB | 4 months ago | **Keep** |
| `FORM_AUTH_IMPLEMENTATION_SUMMARY.md` | 11KB | 4 months ago | **Consolidate** into auth docs |
| `TESTING_AUTH_FLOWS.md` | 14KB | 4 months ago | **Consolidate** into auth docs |
| `FRIGG_CLI_ANALYSIS_REPORT.md` | 35KB | 4 months ago | **Archive** — point-in-time snapshot |
| `api-module-library/README.md` | 920B | 4 months ago | **Keep** — redirect notice |

### docs/ Root-Level (16 files)

| File | Lines | Verdict |
|------|-------|---------|
| `README.md` | ~50 | **Fix** — broken GitBook links |
| `SUMMARY.md` | 397 | **Rebuild** — sync with new structure |
| `TESTING.md` | 616 | **Keep** — comprehensive and current |
| `TESTING_GUIDE.md` | 289 | **Archive** — superseded by TESTING.md |
| `DANGER_ZONES.md` | ~400 | **Keep** — fix missing file reference |
| `API_REDESIGN_COMPLETE.md` | 1,292 | **Rename** — status is not "complete" |
| `STACKING_PROGRESS_BOOKMARK.md` | 233 | **Archive** — temporary tracking doc |
| `UI_LIBRARY_UPDATES.md` | 333 | **Consolidate** with V2 updates |
| `UI_LIBRARY_V2_UPDATES.md` | 1,359 | **Consolidate** with updates |
| `MULTI_STEP_AUTH_AND_SHARED_ENTITIES_SPEC.md` | 1,289 | **Keep** — add index |
| `MULTI_STEP_AUTH_MIGRATION_GUIDE.md` | 308 | **Keep** — clarify status |
| `IMPLEMENTATION_SUMMARY.md` | 327 | **Keep** — add index |
| `CLI_ARCHITECTURE.md` | — | **Archive** — consolidate to CLI README |
| `CLI_IMPLEMENTATION_GUIDE.md` | — | **Archive** — consolidate to CLI README |
| `CLI_SPECIFICATION.md` | — | **Archive** — consolidate to CLI README |

### docs/api-modules/module-list/ (20 modules, 60+ files)

**ALL are empty stubs (2 lines each).** Verdict: **Delete all, replace with auto-generated.**

### docs/api-module-library/ (11 files)

Duplicates `api-modules/` with different structure. Verdict: **Delete — pick one canonical location.**

### docs/architecture-decisions/ (10 files)

| File | Status | Verdict |
|------|--------|---------|
| `README.md` | Missing ADRs 006-009 | **Fix** — update index |
| ADRs 001-009 | All exist | **Keep** |

### packages/core/**/*.md (12 files)

| File | Size | Verdict |
|------|------|---------|
| `CLAUDE.md` | 25KB | **Keep** — fix version numbers |
| `README.md` | 33KB | **Keep** |
| `CHANGELOG.md` | 8KB | **Keep** |
| `core/CLAUDE.md` | 23KB | **Keep** |
| `database/MONGODB_TRANSACTION_FIX.md` | 8.7KB | **Keep** |
| `database/encryption/README.md` | 24KB | **Keep** |
| `database/encryption/documentdb-encryption-service.md` | 110KB | **Review** — extremely large, trim if possible |
| `database/models/readme.md` | 57B | **Delete** — empty stub |
| `application/commands/README.md` | 13KB | **Keep** |
| `handlers/WEBHOOKS.md` | 18KB | **Keep** |
| `handlers/routers/HEALTHCHECK.md` | 12KB | **Keep** — contains valuable refactoring plan |
| `integrations/WEBHOOK-QUICKSTART.md` | 3.7KB | **Keep** |

### packages/devtools/**/*.md (19 files)

| File | Size | Verdict |
|------|------|---------|
| `README.md` | 2.5KB | **Keep** |
| `CHANGELOG.md` | 6KB | **Keep** |
| `LICENSE.md` | 1.1KB | **Keep** |
| `infrastructure/README.md` | 16KB | **Keep** |
| `infrastructure/ARCHITECTURE.md` | 16KB | **Keep** |
| `infrastructure/CLAUDE.md` | 18KB | **Keep** |
| `infrastructure/HEALTH.md` | 18KB | **Keep** |
| `frigg-cli/README.md` | 43KB | **Keep** — canonical CLI reference |
| `frigg-cli/auth-command/README.md` | 13KB | **Keep** |
| `frigg-cli/auth-command/CLAUDE.md` | 8.9KB | **Keep** |
| `frigg-cli/deploy-command/SPEC-DEPLOY-DRY-RUN.md` | 29KB | **Move** to `docs/specs/` |
| `management-ui/README.md` | 11KB | **Keep** |
| `management-ui/CLEANUP_SUMMARY.md` | 7.7KB | **Archive** |
| `management-ui/server/api-contract.md` | 5.8KB | **Keep** |
| `management-ui/src/tests/README.md` | 7.3KB | **Keep** |
| `management-ui/src/tests/legacy-cleanup-analysis.md` | 6.3KB | **Archive** |
| `management-ui/server/tests/README.md` | 5.6KB | **Keep** |
| `test/mock-api-readme.md` | 4.7KB | **Keep** |

### Other Packages (11 files)

All standard `README.md`, `CHANGELOG.md`, `LICENSE.md` — **Keep as-is.**

---

## Summary of Actions

| Action | Count | Effort |
|--------|-------|--------|
| **Fix immediately** (errors, broken links) | 9 items | 1-2 days |
| **Delete/Archive** | ~75 files | 1 day |
| **Consolidate** (merge overlapping) | 3 groups (~12 files → 3) | 2-3 days |
| **Rewrite/Rename** | 3 files | 1 day |
| **Auto-generate** (new tooling) | 60+ module docs + API ref | 1-2 weeks |
| **CI/CD setup** | 1 workflow | 1 week |

**Total estimated effort:** 3-4 weeks for full implementation across all phases.

---

*This proposal was generated via automated codebase audit on 2026-02-28. All file paths, line counts, and modification dates were verified against the repository at the time of analysis.*
