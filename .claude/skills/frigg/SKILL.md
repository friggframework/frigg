---
name: frigg
description: "Expert guidance on the Frigg integration framework: building serverless integrations, API modules, hexagonal architecture, field-level encryption, AWS infrastructure, the Management API, and the frigg CLI. Use whenever working in a Frigg project or repo (friggframework packages, IntegrationBase, api-module-*, infrastructure.js), creating or debugging integrations, building or authenticating API modules (frigg auth), calling the Management API, running frigg CLI commands (install, start, build, deploy, doctor, repair, ui, generate-iam, auth), or configuring Frigg infrastructure, VPC, scheduler, or encryption. Covers Frigg best practices and anti-patterns."
---

# Frigg Integration Framework Expert

Frigg is an opinionated **integration framework** for building direct/native integrations between software products and external partners. It runs serverless (AWS Lambda) on your own cloud accounts (no vendor lock-in), with the goal of spinning up integrations in minutes and deploying to production in a day.

## References

Load the relevant file when the task calls for it — keep this body lean:

- **[references/api-modules.md](references/api-modules.md)** — API module structure, auth requester base classes (OAuth2/ApiKey/Basic), required module definition, JSON Schema forms. Read when building or modifying an API module.
- **[references/auth-testing.md](references/auth-testing.md)** — `frigg auth` CLI: testing OAuth2/API-key flows, what it tests, saved credentials in tests, troubleshooting. Read when authenticating or testing a module.
- **[references/infrastructure.md](references/infrastructure.md)** — domain builders, infra composer, AWS discovery, scheduler (builder + command API), health domain, VPC, osls, `frigg doctor`/`repair`. Read for deployment/infra/scheduling work.
- **[references/security-encryption.md](references/security-encryption.md)** — field-level encryption architecture, env config, encrypted-field registry. Read when handling sensitive data.
- **[references/management-api.md](references/management-api.md)** — full HTTP endpoint reference for a deployed app (auth, users, health, authorization/entities, integrations, DB migration, OAuth redirect, response codes). Read when calling a running Frigg app.
- **[references/development.md](references/development.md)** — fast iteration loop, TDD expectations, canary workflow, command system, Delegate pattern, debugging. Read when developing the framework itself.

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

## API Modules

API Modules are reusable connector packages defining how to connect to a third-party system. In an integration they are accessed through one consistent pattern:

```javascript
await this.{moduleName}.api.{method}()
// e.g.
const contacts = await this.hubspot.api.getContacts();
await this.salesforce.api.createLeads(contacts);
```

This gives automatic token management, built-in retry/error handling, and a consistent interface across every integration. For module structure, auth base classes, and how to build one, see [references/api-modules.md](references/api-modules.md).

## Integration Pattern

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

# Auth testing (see references/auth-testing.md)
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

**Monorepo layout** (`packages/` has many top-level packages — `core`, `database`, `encrypt`, `integrations`, etc. are siblings, NOT nested under `core/`):

```
packages/
├── core/              # IntegrationBase, handlers, user, credential, modules, queues, syncs, workflows, lambda
├── devtools/
│   ├── frigg-cli/     # CLI (install, start, build, deploy, ui, doctor, repair, generate-iam, auth)
│   ├── infrastructure/# IaC: domains/ (networking, security, database, parameters, integration, scheduler, health, shared)
│   └── management-ui/ # Vite web UI
├── database/  encrypt/  integrations/  errors/  assertions/  logs/  schemas/  types/  serverless-plugin/  ui/

api-module-library/    # pre-built API modules (separate repo)
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
