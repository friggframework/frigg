---
name: frigg
description: "Core reference and entry point for the Frigg integration framework: what Frigg is, hexagonal architecture and the golden rule, the integration definition pattern, the frigg CLI (install, start, build, deploy, doctor, repair, ui, generate-iam), AWS infrastructure (domain builders, scheduler, VPC, osls), field-level encryption, the Admin Script Runner (admin scripts, sync/async execution, chaining, scheduling), telemetry & usage tracking (OpenTelemetry, this.telemetry, Definition.usage, frigg.usage.*), the monorepo layout, and anti-patterns. Use when working in a Frigg project or repo (friggframework packages, IntegrationBase, infrastructure.js), understanding Frigg's architecture, configuring infrastructure/VPC/encryption/telemetry, adding observability or usage counters, or running frigg CLI commands. Links to the focused companion skills: frigg-api-modules, frigg-management-api, frigg-user-actions, and frigg-development-best-practices."
---

# Frigg Integration Framework Expert

Frigg is an opinionated **integration framework** for building direct/native integrations between software products and external partners. It runs serverless (AWS Lambda) on your own cloud accounts (no vendor lock-in), with the goal of spinning up integrations in minutes and deploying to production in a day.

This is the **core reference**. For focused tasks, use the companion skills below.

## Related Frigg skills

- **bootstrap-frigg-integration** — creating an integration from scratch end-to-end (project → modules → integration class → sync → deploy); the runbook that ties the skills below together.
- **frigg-api-modules** — building and auth-testing API modules (module structure, requester base classes, `requiredAuthMethods`, `frigg auth`).
- **frigg-management-api** — authenticating to and calling a deployed app's HTTP API (x-frigg headers vs JWT, endpoint reference).
- **frigg-user-actions** — provisioning an integration and executing actions end-to-end (entities → integration → INITIAL_SYNC).
- **frigg-extensions** — Tier 3 integration extensions: reusable handler bundles (webhooks/cards/workers) consumed via `Definition.extensions`.
- **frigg-scheduled-jobs** — one-time deferred jobs via EventBridge Scheduler (`createSchedulerCommands`); webhook renewals, delayed tasks.
- **frigg-development-best-practices** — developing the framework itself (iteration loop, TDD, canary, command system, Delegate pattern).

### References in this skill

- **[references/infrastructure.md](references/infrastructure.md)** — domain builders, infra composer, AWS discovery, scheduler builder, health domain, VPC, osls, `frigg doctor`/`repair`. Read for deployment/infra work.
- **[references/security-encryption.md](references/security-encryption.md)** — field-level encryption architecture, env config, encrypted-field registry. Read when handling sensitive data.

## Architecture

Frigg uses **hexagonal architecture** (Ports & Adapters) with strict layer separation:

```
Adapter Layer (Handlers/Routers)   → HTTP request/response; ONLY calls use cases
        ↓
Application Layer (Use Cases)      → business logic, orchestration, workflow coordination
        ↓
Infrastructure Layer (Repositories)→ pure DB ops (CRUD) + external API calls; NO business logic
        ↓
External Systems                   → Database, AWS, third-party APIs
```

> **The Golden Rule: Handlers ONLY call Use Cases, NEVER Repositories directly.**

Layer responsibilities:
- **Repositories** — atomic operations only; return raw data; thin DB/API wrapper; no orchestration, no business rules.
- **Use Cases** — contain business logic and validation; orchestrate repository calls; use dependency injection; avoid "god" use cases; never touch the DB directly or handle HTTP.
- **Handlers/Adapters** — call use cases; HTTP concerns only; map domain errors to HTTP errors; stay thin (<50 lines).

## Integration Pattern

API Modules are reusable connectors accessed via `await this.{moduleName}.api.{method}()` (automatic token management + retry/error handling). To build or auth-test a module, use the **frigg-api-modules** skill.

```javascript
const { IntegrationBase } = require("@friggframework/core");

class MyIntegration extends IntegrationBase {
  static Definition = {
    name: "my-integration",
    version: "1.0.0",
    display: { label: "My Integration", description: "Syncs data", category: "CRM" },
    modules: {
      hubspot: require("@friggframework/api-module-hubspot"),
      salesforce: require("@friggframework/api-module-salesforce"),
    },
    routes: [{ path: "/sync", method: "POST", event: "SYNC_CONTACTS" }],
  };

  constructor() {
    super();
    this.events = {
      SYNC_CONTACTS: { handler: this.syncContacts },
    };
  }

  async syncContacts() {
    const contacts = await this.hubspot.api.getContacts();
    return await this.salesforce.api.createContacts(contacts);
  }
}

module.exports = MyIntegration;
```

## Admin scripts

Operational/maintenance scripts run in the hosted environment via the **Admin Script Runner** (`@friggframework/admin-scripts`). Enable by adding a non-empty `adminScripts: [MyScript]` to the app definition (that provisions the router + executor Lambdas + SQS queue); add `admin: { enableScheduling: true }` to also provision EventBridge Scheduler resources.

A script extends `AdminScriptBase` with a static `Definition` (name, version, `inputSchema`, `config.timeout`, `config.requireIntegrationInstance`) and an `async execute(params)`. It runs behind `/admin/scripts/*` (auth: `x-frigg-admin-api-key` = `ADMIN_API_KEY`):

- **Execute** `POST /admin/scripts/{name}` with `{ mode: 'sync' | 'async', params }` — sync runs in the router Lambda (~30s API cap); async (default) queues to SQS and runs in the executor Lambda (15-min budget). Also: `GET /admin/scripts[/{name}]`, `POST .../validate`, `GET .../executions[/{id}]`, and `GET|PUT|DELETE .../schedule`.
- Every run persists an **`AdminScriptExecution`** record (`state`: `PENDING → RUNNING → COMPLETED`/`FAILED`, plus input/output/metrics/logs).
- Inside `execute`, scripts use the injected **`context`** — never repositories directly: `context.commands.{users,credentials,entities,integrations}` (each returns data or a never-throw `{ error, reason, code }`), `context.instantiate(integrationId)` for a live integration instance (requires `config.requireIntegrationInstance: true`), and `context.log(level, msg, data)`.
- **Scheduling** (`admin.enableScheduling`) creates real EventBridge schedules from `PUT .../schedule` (`SCHEDULER_PROVIDER=aws`). Locally the adapter is an in-memory no-op — scheduled *firing* only works on AWS.

### Script chaining

`context.queueScript(name, params)` / `context.queueScriptBatch(entries)` enqueue follow-up scripts as **async continuations** (trigger `QUEUE`, `parentExecutionId` set to the queuing execution, so lineage is queryable).

- **When to use it:** work that won't fit one execution — beat the 15-min executor cap by paging/resuming; fan out one child per item/batch; isolate per-item failures; stage pipelines (A queues B with its output). For small bounded work, or when you need the result in the response, just use one sync/async execution.
- **Caveats:** fire-and-forget (you don't get the child's result back — correlate via `parentExecutionId`); at-least-once delivery, so **make child scripts idempotent**; and there is **no depth guard**, so keep continuation targets terminal or a self-queuing script fans out unbounded.

## Telemetry & Usage (ADR-011)

Vendor-neutral OpenTelemetry (traces + metrics) plus durable per-integration
usage counters. **No-op by default** (zero cold-start cost; loads no OTel until an
exporter is configured), and framework seams (handlers, API-module requests,
`ON_WEBHOOK`) are **auto-instrumented** — usage rides for free.

```javascript
// App definition: turn on export + declare a North Star (both optional)
const Definition = {
  telemetry: {
    exporter: { type: "otlp", endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }, // none|console|otlp|honeycomb|datadog
    northStar: { default: { name: "records.synced" } },
  },
};

// Integration Definition: opt into durable usage counters
static Definition = { name: "hubspot", usage: { canonical: ["records.synced", "api.requests"] } };

// Integration code: custom metrics/spans (this.telemetry is auto-tagged with integration_type)
await this.telemetry.span("delta_sync", async () => {
  this.telemetry.count("records.synced", batch.length, { entity: "contact" }); // explicit-only counters
});

// Read the durable usage store (reporting reads the same store — never an APM)
await frigg.usage.getTotalsByDimension({ metric: "records.synced", groupBy: "integrationType", since });
await frigg.usage.getTimeSeries({ metric: "records.synced", integrationType: "hubspot", from, to, bucket: "day" });
```

- **Canonical counters**: `api.requests`, `user_actions`, `webhooks.received` (auto); `records.synced`, `workflows.invoked` (explicit via `this.telemetry.count`). Declare in `Definition.usage.canonical` to persist + compare across types; `custom` keys compare within a type.
- **Cardinality rule**: high-cardinality ids (integrationId, userId, url) ride span baggage / bus context — NEVER metric labels (bounded to integration_type/event/status/method/module).
- **Sampling**: `telemetry.sampleRatio` (0..1, default 1) sets the fraction of **traces** exported (a cost knob) — whole-trace + parent-based, and **not** applied to usage counters (they stay exact). Not error-aware; for keep-all-errors use collector tail-sampling.
- Public tap: `getTelemetry().on("metric", cb)`. Full guide: `packages/core/telemetry/README.md`.

## CLI Commands

```bash
# API modules
frigg install                # no arg -> interactive picker (searches npm @friggframework/api-module-*)
frigg install hubspot        # install a named module + generate integration file (run inside an existing backend)

# Local development
frigg start                  # local server (serverless-offline). Opts: --stage, --verbose
frigg db:setup               # Prisma generate + migrations

# Build / deploy (uses osls internally)
frigg build                  # local build (skips AWS discovery)
frigg build --production     # build with AWS discovery
frigg deploy --stage prod    # Opts: --force, --skip-doctor

# Infrastructure health (needs AWS — see references/infrastructure.md)
frigg doctor [stackName]     # health check on a deployed CF stack
frigg repair <stackName>     # fix drift / import orphaned resources
frigg generate-iam           # generate deployment IAM CloudFormation stack

# Auth testing (see the frigg-api-modules skill)
frigg auth test <module>     # test a module's OAuth2 / API-key flow

# Management UI — dev mode serves the Vite frontend at http://localhost:5173
frigg ui                     # API server port via --port (default 3210)
```

### Project Setup

There is no one-command scaffold. Start a project by either:

- Cloning `friggframework/example-frigg-applications` and adapting an example, or
- Hand-rolling: `npm init`, `npm install @friggframework/core`, write an `index.js` app definition (see [Quick Reference](#quick-reference)), then `frigg install <module>`.

## Anti-Patterns to Avoid

**Integration**: don't bypass the lifecycle (always extend `IntegrationBase`); don't hardcode credentials (use OAuth flows + encryption); don't ignore VPC config; don't skip webhook signature validation; don't create custom infrastructure (use provided builders); don't override or wrap api-modules unless explicitly asked — the standard api-module is the source of truth.

**Architecture**: don't put business logic in handlers; don't call repositories from handlers; don't put orchestration in repositories; don't mix concerns in one file; don't skip dependency injection; don't create "god" use cases.

**Development**: don't assume data structures are always consistent (add null checks); don't make quick fixes without finding root cause; don't update one monorepo package without checking the others; don't skip the full test suite for both databases.

**Telemetry**: don't import a vendor/OTel SDK in integration code (use `this.telemetry.*`); don't put high-cardinality ids (integrationId, userId, urls) on metric labels (they belong on span baggage / bus context); don't expect a canonical usage counter to populate unless it's declared in `Definition.usage`.

## Quick Reference

**Monorepo layout** (most framework code lives under `packages/core/`; `database`, `encrypt`, `integrations`, `errors`, etc. are subdirectories of `core/`, NOT top-level packages):

```
packages/
├── core/                  # the framework
│   ├── integrations/      # IntegrationBase
│   ├── handlers/  user/  credential/  modules/  token/  associations/
│   ├── database/  encrypt/  errors/  assertions/  logs/  types/
│   ├── queues/  syncs/  websocket/  lambda/  infrastructure/
│   └── prisma-mongodb/  prisma-postgresql/
├── devtools/
│   ├── frigg-cli/         # CLI (install, start, build, deploy, ui, doctor, repair, generate-iam, auth)
│   ├── infrastructure/    # IaC: domains/ (networking, security, database, parameters, integration, scheduler, health, shared)
│   └── management-ui/     # Vite web UI
├── serverless-plugin/     # Frigg serverless plugin
└── schemas/  eslint-config/  prettier-config/  test/  ui/

api-module-library/        # pre-built API modules (separate repo)
```

**Integration Definition**:

```javascript
static Definition = {
    name, version,
    display: { label, description, category },
    modules: { service1: definition, service2: definition },
    routes: [{ path, method, event }]
};
```

**Event handler**: `this.events = { EVENT_NAME: { handler: this.handlerMethod } }`

**API access**: `await this.{moduleName}.api.{method}()`

## Key Resources

- Docs: https://docs.friggframework.org
- Framework repo: https://github.com/friggframework/frigg/tree/next
- API Module Library: https://github.com/friggframework/api-module-library/tree/next
- Community Slack: https://friggframework.org/#contact
- Commands README: `packages/core/application/commands/README.md`
- Encryption Guide: `packages/core/database/encryption/README.md`
- Telemetry & Usage Guide: `packages/core/telemetry/README.md` (+ usage store: `packages/core/usage/README.md`)
