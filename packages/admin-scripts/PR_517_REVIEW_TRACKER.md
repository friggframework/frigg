# PR #517 Comment Tracker

## ✅ ADDRESSED - Ready to Reply

| # | File:Line | Original Comment | What We Did | Reply |
|---|-----------|------------------|-------------|-------|
| 1 | `admin-frigg-commands.js:15` | "I don't think this should even exist, we're just duplicating methods" | Renamed to `AdminScriptContext`, clarified as facade pattern | Renamed to `AdminScriptContext`. It's a facade - wraps repositories so scripts have one API instead of multiple imports. Open to discussing alternatives. |
| 2 | `admin-script-base.js:94` | "Commands should come via constructor" | Changed to constructor injection | Done. Context now passed via constructor, scripts access via `this.context`. |
| 3 | `admin-script-base.js:109` | "logging does not belong here" | Removed logging from base class | Removed. Scripts use `this.context.log()` which persists to admin process record. |
| 4 | `admin-script-base.js:54` | "I would rename to requireIntegrationInstance" | Already renamed | Done - already renamed in current code. |
| 5 | `admin-script-base.js:56` | "This is just a duplication of the static Definition" | Cleaned up display object | Cleaned up. `display` now only holds UI overrides (category, icon). Label/description fall back to top-level via static methods. |
| 6 | `schedule-management-use-case.js:1` | "A use case should have single entry point" | Already split in previous session | Already split into `UpsertScheduleUseCase`, `DeleteScheduleUseCase`, `GetEffectiveScheduleUseCase`. |
| 7 | `package.json:20` | "chai and sinon should slowly be pushed away" | Sinon removed in previous session | Sinon already removed. Will remove chai too. |

---

## 📝 NEEDS RESPONSE ONLY - No Code Change Required

| # | File:Line | Original Comment | Reply |
|---|-----------|------------------|-------|
| 8 | `admin-frigg-commands.js:160` | "this does not belong here" (queueScript) | queueScript enables self-queuing pattern (fan-out, pagination, retries). It's here so scripts don't need queue internals. Could move to separate utility if preferred. |
| 9 | `admin-script-base.js:39` | "why do we need the source?" | Distinguishes builtin vs user-defined scripts. UI can filter differently, builtins could have special handling. Could remove if not needed. |
| 10 | `admin-script-base.js:42` | "what's the idea with these schemas?" | Optional JSON Schema for validation/documentation. Could wire to OpenAPI or dynamic UI forms. Not critical for v1 - could remove and add later. |
| 11 | `admin-script-base.js:46` | "enabled property confusion" | Agreed the matrix is confusing. Intent: `schedule.enabled` controls auto-trigger independent of registration. Could simplify to just use presence in appDefinition. |
| 12 | `admin-script-base.js:52` | "Do we have retry logic in place already?" | Not yet - placeholder for Phase 2. Could remove until we build it. |
| 13 | `admin-script-base.js:81` | "What is the executionId?" | ID of AdminProcess record tracking this execution. Used to persist logs and update status. Created before script runs, passed to constructor. |
| 14 | `schedule-management-use-case.js:89` | "why save to database if EventBridge is source of truth?" | Database stores user's config override. EventBridge is execution engine. On deploy, we sync DB to EventBridge. Tracks user config vs code default. |

---

## 🔧 OUTSTANDING - Needs Code Changes

| # | File:Line | Original Comment | Task |
|---|-----------|------------------|------|
| 15 | `docs/architecture-decisions/005-admin-script-runner.md:71` | "What is 'frigg' in this parameter?" | Update ADR - rename `frigg` to `context` throughout |
| 16 | `package.json:22` | "We already use nock for http request mocking" | Remove msw if present, use nock consistently |
| 17 | `package.json:12` | "why mongoose?" | Check if mongoose needed or can be removed |
| 18 | `schedule-management-use-case.js:109` | "leaking AWS specifics" | Abstract behind SchedulerAdapter, remove EventBridge references from use case |
| 19 | `schedule-management-use-case.js:138` | "should not mention EventBridge here" | Same as above |
| 20 | `adapters/aws-scheduler-adapter.js:30` | "should not infer/guess/default any variable" | Remove defaults, require explicit config |
| 21 | `adapters/scheduler-adapter-factory.js:48` | "env var confusion, prefer appDefinition" | Move scheduler config to appDefinition |
| 22 | `script-runner.js:36` | "we should not assume default values" | Remove defaults, require explicit values |
| 23 | `dry-run-http-interceptor.js:1` | "I don't understand why this is needed" | Explain or remove - was for intercepting HTTP in dry-run mode |
| 24 | `dry-run-repository-wrapper.js:1` | "This is smelly" | Review/remove - was for wrapping repos in dry-run mode |
| 25 | `.github/workflows/release.yml:11` | "why do we need those?" | Check release workflow changes |

---

## ❓ NEEDS DISCUSSION - Architectural Decisions

| # | File:Line | Original Comment | Decision Needed |
|---|-----------|------------------|-----------------|
| 26 | `admin-script-base.js:39` | source field | Keep BUILTIN/USER_DEFINED or remove? |
| 27 | `admin-script-base.js:42` | inputSchema/outputSchema | Keep for future or remove for now? |
| 28 | `admin-script-base.js:46` | schedule.enabled | Simplify to just appDefinition presence? |
| 29 | `admin-script-base.js:52` | maxRetries | Remove placeholder or keep? |
