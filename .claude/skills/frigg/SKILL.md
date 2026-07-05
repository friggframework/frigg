---
name: frigg
description: "Core reference and entry point for the Frigg integration framework: what Frigg is, hexagonal architecture and the golden rule, the integration definition pattern, the frigg CLI (install, start, build, deploy, doctor, repair, ui, generate-iam), AWS infrastructure (domain builders, scheduler, VPC, osls), field-level encryption, the monorepo layout, and anti-patterns. Use when working in a Frigg project or repo (friggframework packages, IntegrationBase, infrastructure.js), understanding Frigg's architecture, configuring infrastructure/VPC/encryption, or running frigg CLI commands. Links to the focused companion skills: frigg-api-modules, frigg-management-api, frigg-user-actions, and frigg-development-best-practices."
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
