# OpenTentacles: Project Proposal

## AI-Native Integration Infrastructure for Autonomous Agents

**Status:** Proposal / Draft
**Date:** 2026-02-22
**Related:** [Frigg + AI Agent Integration Analysis](./frigg-ai-agent-integration-analysis.md)

---

## 1. What Is OpenTentacles?

OpenTentacles is a **separate open-source project** that wraps the [Frigg Framework](https://github.com/friggframework/frigg) into an AI-agent-native integration layer. It is not a rebrand of Frigg -- it is a **powersuit built on top of it**.

Where Frigg is an enterprise integration framework designed for human developers, OpenTentacles is the same infrastructure **reshaped for autonomous agents**. It gives AI agents like OpenClaw, Claude Code, and others the ability to:

1. **Discover** available integrations and API modules via MCP
2. **Build** new integrations by writing code into a local Frigg project
3. **Run** integrations locally with full webhook/queue/scheduler support
4. **Deploy** working integrations from local to cloud with a single command
5. **Learn** from repeated patterns and harden ad-hoc workflows into code

The metaphor: Frigg is the engine. OpenTentacles is what lets an AI agent drive it.

### Why "OpenTentacles"?

| Aspect | Reasoning |
|---|---|
| **"Open"** | Open-source, open protocol (MCP), open to any AI agent |
| **"Tentacles"** | Each integration is a tentacle reaching into an external system -- the agent grows more capable with each connection |
| **Visual identity** | Evocative, memorable, distinct from Frigg's Norse mythology branding |
| **Agent-first framing** | The name implies reach, adaptability, and autonomous extension -- exactly what an agent-driven integration layer does |

### The "Powersuit" Concept

OpenTentacles doesn't replace what agents already do well (reasoning, code generation, conversation). It augments them with capabilities they lack:

```
┌─────────────────────────────────────────────────────────────────┐
│ AI Agent (OpenClaw, Claude Code, Cursor, etc.)                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Agent's Native Abilities                                    │ │
│ │ - Reasoning, code generation, conversation                 │ │
│ │ - File editing, git operations, testing                    │ │
│ │ - Tool discovery via MCP                                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                         + (powersuit)                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ OpenTentacles Layer                                         │ │
│ │ - 40+ authenticated API modules (OAuth2, API keys, etc.)   │ │
│ │ - Webhook reception and event processing                   │ │
│ │ - Job queues and scheduled tasks                           │ │
│ │ - Local-to-cloud deployment pipeline                       │ │
│ │ - Integration scaffolding and lifecycle management         │ │
│ │ - Pattern recognition and workflow hardening               │ │
│ │ - Field-level encryption for credentials                   │ │
│ │ - Multi-tenant integration deployment                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                         ↕ (powered by)                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Frigg Framework (engine)                                    │ │
│ │ - IntegrationBase, Module system, Prisma ORM               │ │
│ │ - Infrastructure-as-code generation                        │ │
│ │ - Hexagonal/DDD architecture                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

The key property of a powersuit: **it extends itself**. An agent wearing OpenTentacles can build new integrations, which become new tentacles, which make the agent more capable of building further integrations. It's a self-amplifying loop.

---

## 2. Why a Separate Project (Not a Frigg Rebrand)

| Dimension | Frigg | OpenTentacles |
|---|---|---|
| **Primary user** | Human developers | AI agents |
| **Interface** | CLI + code + management UI | MCP tools + resources + prompts |
| **Getting started** | `npx create-frigg-app` | `npx opententacles init` → agent takes over |
| **Documentation** | Markdown docs for humans | Machine-readable manifests, `llms.txt`, `agents.json` |
| **Runtime** | AWS Lambda via serverless-offline | Local-first runtime with cloud graduation |
| **State** | Production-ready framework (v2.0) | New project, leveraging Frigg's stability |
| **Community** | Enterprise integration developers | AI agent developers, MCP ecosystem |
| **Release cadence** | Stable, production-focused | Fast iteration, experimental features |

### Benefits of Separation

1. **Frigg stays stable.** Enterprise users of Frigg don't see experimental AI-agent features in their dependency tree.

2. **OpenTentacles can move fast.** MCP is evolving rapidly (Tasks primitive, OAuth 2.1, Streamable HTTP). A separate project can track these changes without destabilizing Frigg core.

3. **Clean dependency direction.** OpenTentacles depends on Frigg. Frigg never depends on OpenTentacles. Changes flow one way.

4. **Different audiences, different messaging.** Frigg's docs talk about integration lifecycles and serverless deployment. OpenTentacles' docs talk about agent capabilities and MCP tools.

5. **Ecosystem play.** OpenTentacles can become the "integration arm" of the broader AI agent ecosystem, partnering with OpenClaw, Claude Code, and others without Frigg needing to brand itself as an AI product.

### What Frigg Gains

OpenTentacles drives adoption of Frigg's API modules and infrastructure. Every integration built by an agent through OpenTentacles is a Frigg integration under the hood. The relationship:

```
Developer discovers OpenTentacles → Agent builds integration
→ Integration uses Frigg modules → Developer deploys via Frigg infra
→ Developer learns Frigg → Developer builds more integrations directly
```

OpenTentacles is Frigg's growth engine for the agent era.

---

## 3. Repository Structure

```
opententacles/
├── packages/
│   ├── mcp-server/                    # Core: MCP server exposing Frigg as tools
│   │   ├── src/
│   │   │   ├── server.js              # MCP server instance (@modelcontextprotocol/sdk)
│   │   │   ├── tools/
│   │   │   │   ├── registry.js        # Dynamic tool registration from modules
│   │   │   │   ├── discovery.js       # frigg_list_modules, frigg_search_modules
│   │   │   │   ├── auth.js            # frigg_auth_connect, frigg_auth_status
│   │   │   │   ├── invoke.js          # frigg_invoke_method (direct API calls)
│   │   │   │   ├── scaffold.js        # frigg_create_integration
│   │   │   │   ├── runtime.js         # frigg_local_start, frigg_local_status
│   │   │   │   └── deploy.js          # frigg_deploy
│   │   │   ├── resources/
│   │   │   │   ├── module-catalog.js  # frigg://modules/*
│   │   │   │   ├── integrations.js    # frigg://integrations/*
│   │   │   │   └── recommendations.js # frigg://recommendations/*
│   │   │   ├── prompts/
│   │   │   │   ├── setup.js           # "Set up a new integration"
│   │   │   │   ├── debug.js           # "Debug an integration issue"
│   │   │   │   └── deploy.js          # "Deploy to production"
│   │   │   └── transports/
│   │   │       ├── stdio.js           # For local agents (OpenClaw, Claude Code)
│   │   │       ├── sse.js             # For web-based agents
│   │   │       └── streamable-http.js # Emerging standard
│   │   ├── bin/
│   │   │   └── opententacles-mcp.js   # CLI entry: npx @opententacles/mcp-server
│   │   └── package.json
│   │
│   ├── local-runtime/                 # Local integration runtime
│   │   ├── src/
│   │   │   ├── runtime.js             # Express server + integration engine
│   │   │   ├── local-queue.js         # In-process queue (SQS-compatible API)
│   │   │   ├── local-scheduler.js     # node-cron scheduler (EventBridge-compatible)
│   │   │   ├── webhook-tunnel.js      # cloudflared/ngrok tunnel manager
│   │   │   ├── hot-reload.js          # File watcher for dev-time code changes
│   │   │   └── health.js              # Runtime health monitoring
│   │   ├── docker-compose.yml         # Full stack: Postgres + Redis + runtime
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── recommendation-engine/         # Pattern detection + workflow hardening
│   │   ├── src/
│   │   │   ├── call-tracker.js        # Records MCP tool invocations
│   │   │   ├── pattern-detector.js    # Identifies repeated sequences
│   │   │   ├── vector-store.js        # Vectra (local) / RuVector (prod) adapter
│   │   │   ├── classifier.js          # LLM-backed pattern classifier
│   │   │   └── scaffold-generator.js  # Generates integration code from patterns
│   │   └── package.json
│   │
│   ├── module-manifests/              # Machine-readable API module documentation
│   │   ├── manifests/
│   │   │   ├── hubspot.json           # HubSpot module capabilities
│   │   │   ├── salesforce.json        # Salesforce module capabilities
│   │   │   ├── slack.json             # Slack module capabilities
│   │   │   └── ...                    # One per Frigg API module
│   │   ├── schema/
│   │   │   └── module-manifest.schema.json
│   │   ├── generator/
│   │   │   └── introspect.js          # Auto-generate manifests from module source
│   │   └── package.json
│   │
│   ├── cli/                           # OpenTentacles CLI
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.js            # opententacles init (creates Frigg app + MCP config)
│   │   │   │   ├── start.js           # opententacles start (local runtime)
│   │   │   │   ├── deploy.js          # opententacles deploy (cloud graduation)
│   │   │   │   └── manifest.js        # opententacles manifest (generate/validate)
│   │   │   └── index.js
│   │   ├── bin/
│   │   │   └── opententacles.js
│   │   └── package.json
│   │
│   └── create-opententacles-app/      # Project scaffolding
│       ├── templates/
│       │   ├── default/               # Standard Frigg app + OpenTentacles config
│       │   └── minimal/               # Bare minimum for agent-driven development
│       └── package.json
│
├── docs/
│   ├── llms.txt                       # AI-discoverable framework description
│   ├── agents.json                    # Multi-step workflow definitions
│   ├── getting-started.md             # For humans setting up OpenTentacles
│   ├── agent-guide.md                 # For agents: what tools are available
│   ├── architecture.md                # How OpenTentacles wraps Frigg
│   └── mcp-tools-reference.md         # Complete MCP tool catalog
│
├── examples/
│   ├── openclaw-hubspot-slack/        # OpenClaw builds a HubSpot→Slack integration
│   ├── claude-code-salesforce-sync/   # Claude Code builds a Salesforce sync
│   └── agent-driven-workflow/         # End-to-end agent workflow example
│
├── .mcp.json                          # MCP config for Claude Code developing ON this repo
├── llms.txt                           # Root-level AI discoverability
├── package.json                       # Monorepo root (npm workspaces)
├── LICENSE                            # MIT or Apache 2.0
└── README.md
```

### Package Dependency Graph

```
create-opententacles-app
    ↓ scaffolds project using
cli (@opententacles/cli)
    ↓ orchestrates
mcp-server (@opententacles/mcp-server)
    ├── ↓ uses tools from
    │   module-manifests (@opententacles/module-manifests)
    ├── ↓ tracks patterns via
    │   recommendation-engine (@opententacles/recommendation-engine)
    ├── ↓ controls
    │   local-runtime (@opententacles/local-runtime)
    └── ↓ all packages depend on
        @friggframework/core + @friggframework/api-module-*
```

---

## 4. Core Architecture

### 4.1 The MCP Server: Agent's Entry Point

The MCP server is the primary interface between agents and Frigg. It exposes everything through MCP's four primitives:

**Tools** (agent-callable functions):

| Tool | Description | Auth |
|---|---|---|
| `ot_list_modules` | Browse 40+ available API modules | No |
| `ot_search_modules` | Search modules by category/capability | No |
| `ot_module_info` | Get detailed module capabilities | No |
| `ot_auth_connect` | Start OAuth2/API-key auth flow | No |
| `ot_auth_status` | Check credential status for a module | Yes |
| `ot_invoke` | Call any API module method directly | Yes |
| `ot_scaffold` | Create a new integration from template | No |
| `ot_scaffold_from_pattern` | Create integration from detected pattern | No |
| `ot_start` | Launch local runtime | No |
| `ot_stop` | Stop local runtime | No |
| `ot_status` | Get runtime status, health, tunnel URL | No |
| `ot_logs` | Stream or tail runtime logs | No |
| `ot_webhook_test` | Simulate a webhook event | Yes |
| `ot_deploy` | Deploy to cloud (AWS Lambda) | Yes |
| `ot_deploy_status` | Check deployment status | Yes |
| `ot_recommendations` | Get workflow hardening suggestions | No |

**Resources** (agent-readable data):

| Resource URI | Description |
|---|---|
| `ot://modules` | Full module catalog |
| `ot://modules/{name}` | Module capabilities manifest |
| `ot://integrations` | Active integrations in current project |
| `ot://integrations/{id}/status` | Integration health and activity |
| `ot://credentials` | Credential status for all connected modules |
| `ot://recommendations` | Pending workflow hardening suggestions |
| `ot://docs/architecture` | Integration architecture patterns |
| `ot://docs/patterns` | Common integration pattern library |

**Prompts** (guided workflows):

| Prompt | Purpose |
|---|---|
| `setup_integration` | Step-by-step guide: discover modules → scaffold → auth → build |
| `debug_integration` | Diagnose why an integration isn't working |
| `deploy_to_production` | Pre-flight checks and deployment guide |
| `harden_workflow` | Convert ad-hoc API calls into a coded integration |

**Tasks** (long-running operations with progress):

| Task | Description |
|---|---|
| `deploy` | Cloud deployment with step-by-step progress |
| `scaffold` | Project scaffolding with file creation progress |
| `auth_oauth2` | OAuth2 flow waiting for browser callback |

### 4.2 The Local Runtime: Agent's Workbench

A standalone Node.js process that provides production-equivalent behavior locally:

```
┌────────────────────────────────────────────────────────┐
│ OpenTentacles Local Runtime                             │
│                                                         │
│  ┌──────────────┐  ┌────────────────────────────────┐  │
│  │ Express HTTP  │  │ MCP Server (stdio or SSE)      │  │
│  │ - REST APIs   │  │ - Agent tool invocation         │  │
│  │ - Webhooks    │  │ - Resource queries              │  │
│  │ - Health      │  │ - Pattern tracking              │  │
│  └───────┬──────┘  └───────────┬────────────────────┘  │
│          │                     │                        │
│  ┌───────▼─────────────────────▼────────────────────┐  │
│  │ Frigg Integration Engine                          │  │
│  │ - IntegrationBase lifecycle                       │  │
│  │ - Module hydration with credentials               │  │
│  │ - Event dispatching                               │  │
│  └───────┬─────────────────────┬────────────────────┘  │
│          │                     │                        │
│  ┌───────▼───────┐  ┌─────────▼─────────────────┐     │
│  │ Local Queue    │  │ Local Scheduler            │     │
│  │ (in-process)   │  │ (node-cron)                │     │
│  │ SQS-compat API │  │ EventBridge-compat API     │     │
│  └────────────────┘  └───────────────────────────┘     │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Database (Prisma)                                 │  │
│  │ - SQLite (zero-config) or Postgres                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Webhook Tunnel (cloudflared / ngrok)              │  │
│  │ - Public URL for external webhook delivery        │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

Key design principle: **every cloud service has a local equivalent**.

| Cloud Service | Local Equivalent | Compatibility |
|---|---|---|
| AWS Lambda | Express HTTP server | Same handler signatures |
| SQS | In-process EventEmitter queue | Same `send(message, queueUrl)` API |
| EventBridge Scheduler | node-cron | Same `scheduleJob()` API |
| API Gateway | Express router | Same route definitions |
| KMS encryption | AES encryption (local key) | Same Cryptor interface |
| Postgres (RDS) | SQLite or local Postgres | Same Prisma schema |

#### Frigg Is Already 99% Standalone

A codebase audit of Frigg's handler layer reveals that **almost everything is already pure Express/Node.js**. The Lambda coupling is limited to a single adapter function. Here's the current architecture:

```
                    Current Frigg Stack
                    ==================

createApp()                    ← Pure Express app factory
  ├── body-parser, cors        ← Standard Express middleware
  ├── health router            ← Pure Express router
  ├── auth router              ← Pure Express router
  ├── integration routers      ← Pure Express routers
  ├── webhook routers          ← Pure Express routers
  └── error handler            ← Pure Express middleware
        │
        ▼
createAppHandler()             ← Wraps Express app for Lambda
  └── serverless-http(app)     ← ⚡ ONLY Lambda coupling point
        │
        ▼
createHandler()                ← Lambda handler factory
  ├── secretsToEnv()           ← AWS Secrets Manager (optional)
  └── context.callbackWaitsForEmptyEventLoop  ← Lambda-specific
```

**The key insight**: Frigg's `createApp()` function (`packages/core/handlers/app-handler-helpers.js`) returns a standard Express application. The `serverless-http` wrapper at line 49 is the **only** point where Lambda enters the picture. Everything above it -- routers, middleware, business logic, database access -- is runtime-agnostic.

**What's already fully decoupled from AWS:**

| Layer | File | Status |
|---|---|---|
| Express app factory | `app-handler-helpers.js:createApp()` | Pure Express |
| All HTTP routers | `routers/health.js`, `auth.js`, etc. | Pure Express |
| Integration lifecycle | `IntegrationBase`, `IntegrationEventDispatcher` | No AWS dependency |
| Database layer | Prisma client (`database/prisma.js`) | Database-agnostic |
| Encryption | `Cryptor` with AES fallback | Works without KMS |
| Module loading | `load-installed-modules.js` | Pure Node.js `require()` |
| Middleware | body-parser, cors, Boom error handling | Pure Express |

**What needs local substitutes (minimal):**

| AWS Service | Local Substitute | Effort | Already Exists? |
|---|---|---|---|
| `serverless-http` wrapper | `app.listen(port)` | ~15 min | No (trivial) |
| SQS queues | In-process EventEmitter | Low | No |
| EventBridge Scheduler | node-cron | Low | Yes (`SCHEDULER_PROVIDER=mock`) |
| KMS encryption | AES encryption | None | Yes (`AES_KEY` env var) |
| Secrets Manager | Environment variables | None | Yes (already fallback) |

**The standalone runtime is essentially:**

```javascript
// This is all that's needed to run Frigg without Lambda
const { createApp } = require('@friggframework/core');
const { healthRouter, authRouter, integrationRouters } = require('./routers');

const app = createApp((app) => {
    app.use(healthRouter);
    app.use(authRouter);
    app.use(integrationRouters);
});

app.listen(3000, () => {
    console.log('OpenTentacles runtime on http://localhost:3000');
});
```

This means **Phase 2 effort is dramatically reduced** -- we're not building a local runtime from scratch, we're writing a thin wrapper around Frigg's existing Express application.

### 4.3 The Recommendation Engine: Agent's Memory

Tracks what agents do and learns from it:

```
Agent Session 1:                Agent Session 2:
  ot_invoke(hubspot, list)        ot_invoke(hubspot, list)
  ot_invoke(slack, postMessage)   ot_invoke(slack, postMessage)
        │                               │
        └───────────┬───────────────────┘
                    ▼
        ┌───────────────────────┐
        │ Call Tracker           │
        │ Records tool sequences │
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │ Pattern Detector       │
        │ Finds: hubspot.list →  │
        │   slack.postMessage    │
        │   (frequency: 2+)     │
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │ Vector Store           │
        │ Embeds & matches       │
        │ against known patterns │
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │ Recommendation         │
        │ "Create a hubspot →    │
        │  slack sync integration│
        │  with webhook trigger" │
        └───────────────────────┘
```

The recommendation engine creates a flywheel:

1. Agent uses API modules ad-hoc through MCP tools
2. Engine detects repeated patterns
3. Engine suggests hardening into a coded integration
4. Agent scaffolds the integration (pre-filled with logic from the pattern)
5. Integration runs deterministically (webhook/schedule/manual trigger)
6. Agent uses freed-up context for new work

This is the **graduation path** from "agent doing work" to "code doing work" -- and the agent drives both sides.

---

## 5. The Agent Experience

### 5.1 OpenClaw User Journey

```
User (via Telegram): "Connect my HubSpot to Slack so I get notified
                      about new deals in #sales"

OpenClaw:
  1. Discovers modules → ot_list_modules() → finds hubspot, slack
  2. Checks auth → ot_auth_status("hubspot") → not connected
  3. Connects HubSpot → ot_auth_connect("hubspot") → opens browser for OAuth
  4. Connects Slack → ot_auth_connect("slack") → opens browser for OAuth
  5. Scaffolds → ot_scaffold({ name: "hubspot-deal-alerts", modules: ["hubspot", "slack"] })
  6. Writes code → edits integration file with webhook handler:
     - onWebhook: on deal.creation → format message → slack.postMessage(#sales)
  7. Tests → ot_start() → ot_webhook_test("hubspot", { event: "deal.creation" })
  8. Verifies → ot_logs({ tail: 10 }) → sees "Posted to #sales: New deal..."

User: "Perfect, ship it"

OpenClaw:
  9. Deploys → ot_deploy({ stage: "prod" })
  10. Reports → "Deployed! HubSpot webhook registered, Slack notifications live."
```

Configuration in `openclaw.json`:

```json
{
    "mcpServers": {
        "opententacles": {
            "command": "npx",
            "args": ["@opententacles/mcp-server", "--project", "./my-app"],
            "env": {
                "DATABASE_URL": "file:./data/opententacles.db",
                "STAGE": "local"
            }
        }
    }
}
```

### 5.2 Claude Code User Journey

```
User: "I need a Salesforce integration that syncs contacts to our
       Postgres database every hour"

Claude Code:
  1. Reads ot://modules/salesforce → understands auth type, methods, schema
  2. Scaffolds → ot_scaffold({ name: "sf-contact-sync", modules: ["salesforce"] })
  3. Reads generated files, understands the integration structure
  4. Authenticates → ot_auth_connect("salesforce") → opens browser
  5. Explores data → ot_invoke("salesforce", "sobjects", "describe", { type: "Contact" })
  6. Writes sync logic in the integration file:
     - Scheduled job: every hour → fetch contacts → upsert to local DB
  7. Writes tests alongside the integration code
  8. Starts runtime → ot_start() → verifies health → ot_status()
  9. Runs tests → npm test
  10. User approves → ot_deploy({ stage: "prod" })
```

Configuration in `.mcp.json` (project root):

```json
{
    "mcpServers": {
        "opententacles": {
            "command": "npx",
            "args": ["@opententacles/mcp-server", "--project", "."],
            "env": {
                "DATABASE_URL": "file:./data/opententacles.db",
                "STAGE": "local"
            }
        }
    }
}
```

### 5.3 Self-Extending Behavior

The powersuit extends itself. An agent wearing OpenTentacles can:

1. **Build new integrations** that become available as tools to itself and other agents
2. **Generate module manifests** for API modules that don't have them yet (using introspection + the module's source code)
3. **Share patterns** between users via the vector store (opt-in), so one user's workflow becomes a recommendation for another
4. **Compose integrations** that chain multiple existing integrations together

Example of self-extension:

```
Day 1: Agent has 40 Frigg modules available
Day 2: Agent builds custom "internal-crm" integration → now has 41 "modules"
Day 3: Another agent queries ot://integrations → discovers "internal-crm" as a building block
Day 4: Second agent builds "internal-crm → slack" integration → 42 building blocks
```

Each new integration increases the system's capability for all agents.

---

## 6. Relationship to Frigg

### What OpenTentacles Uses from Frigg

| Frigg Component | How OpenTentacles Uses It |
|---|---|
| `IntegrationBase` | All generated integrations extend this class |
| API modules (`@friggframework/api-module-*`) | Installed as dependencies, exposed as MCP tools |
| Module system (`Module`, `Requester`) | Handles auth, token refresh, credentials |
| Prisma ORM layer | Database access for integrations and credentials |
| Encryption (`Cryptor`) | Field-level encryption for stored credentials |
| Infrastructure composer | Generates CloudFormation for cloud deployment |
| Integration router | REST API for integration management |
| Queue utilities | SQS interface (adapted for local queue in local runtime) |
| Scheduler service | EventBridge interface (adapted for local scheduler) |
| Event dispatcher | Routes events to integration handlers |

### What OpenTentacles Adds

| Component | Why Frigg Doesn't Have It |
|---|---|
| MCP server | Frigg targets human developers, not agent protocols |
| Module manifests (per-method) | Frigg's schema describes definition shape, not API methods |
| Local runtime | Frigg uses serverless-offline, sufficient for human dev |
| In-process queue | Frigg uses SQS directly |
| Recommendation engine | Not part of a traditional integration framework |
| `llms.txt` + `agents.json` | AI discoverability formats, new to the ecosystem |
| Webhook tunnel management | Not needed in serverless deployment |

### Versioning Strategy

OpenTentacles pins to Frigg's stable releases:

```json
{
    "dependencies": {
        "@friggframework/core": "^2.0.0",
        "@friggframework/api-module-hubspot": "^2.0.0",
        "@friggframework/api-module-slack": "^2.0.0"
    }
}
```

When Frigg releases a new version, OpenTentacles updates its dependency. When Frigg adds a new API module, OpenTentacles generates a manifest for it. The relationship is **consumer, not fork**.

---

## 7. Agent-Agnostic Design

While the concept originated around OpenClaw, OpenTentacles is deliberately **agent-agnostic**:

| Agent | Transport | Configuration |
|---|---|---|
| OpenClaw | stdio | `openclaw.json` → `mcpServers.opententacles` |
| Claude Code | stdio | `.mcp.json` → `mcpServers.opententacles` |
| Cursor | stdio | `.cursor/mcp.json` → `mcpServers.opententacles` |
| Windsurf | stdio | `.windsurf/mcp.json` → `mcpServers.opententacles` |
| Web-based agents | SSE | HTTP endpoint at configurable port |
| Custom agents | Streamable HTTP | HTTP endpoint for programmatic access |

The MCP standard ensures any compliant agent can use OpenTentacles without agent-specific code.

### Agent-Specific Optimizations (Optional)

While the core is agent-agnostic, OpenTentacles can include optional optimizations:

- **OpenClaw skill packages**: Pre-built skills that wrap common OpenTentacles workflows
- **Claude Code prompts**: MCP prompts tuned for Claude Code's edit/test/commit workflow
- **IDE agent hints**: Contextual tool descriptions optimized for IDE-based agents

These live in `packages/agent-adapters/` and are opt-in, never required.

---

## 8. Interop with Workflow Engines (Lobster, Temporal, Step Functions)

OpenTentacles provides **integration infrastructure** -- authenticated API calls, credential management, webhook ingestion, job queues, encryption. It does not provide **workflow orchestration** -- step sequencing, approval gates, retry policies, saga patterns. These are complementary concerns, and OpenTentacles is designed to work with external workflow engines rather than replacing them.

### 8.1 OpenClaw Lobster: The Personal Workflow Layer

[Lobster](https://github.com/openclaw/lobster) is OpenClaw's native workflow engine -- a typed, local-first pipeline shell written in TypeScript. It is **not** built on Temporal or any other existing orchestration platform. Key characteristics:

| Dimension | Lobster | OpenTentacles |
|---|---|---|
| **Core purpose** | Pipeline orchestration with approval gates | Authenticated API integration infrastructure |
| **Execution model** | Sequential pipeline steps with JSON piping | Express HTTP server with event dispatch |
| **State persistence** | File-based resume tokens in `~/.openclaw/` | Database-backed (Prisma) credential + integration state |
| **Determinism** | Constrained YAML grammar (pipelines are data) | Code-based (IntegrationBase classes) |
| **Human-in-the-loop** | First-class `approve` primitive (hard stop) | Not built-in (delegated to workflow layer) |
| **Retry logic** | None -- timeouts and output caps only | Frigg's event dispatcher handles retries |
| **Networking** | Local subprocess only | Full HTTP server with webhook tunnel |

Lobster's VISION.md self-describes as *"Temporal: But 80/20 version for personal workflows"* and *"Zapier for OpenClaw, but with approval checkpoints."* It achieves determinism through constrained pipeline definitions rather than Temporal-style event-sourced replay.

**Neither can do what the other does.** Lobster can't manage OAuth tokens or receive webhooks. OpenTentacles can't pause a multi-step workflow for human approval. Together they cover the full stack.

### 8.2 Complementary Architecture

An OpenClaw agent using both Lobster and OpenTentacles gets a layered system:

```
┌──────────────────────────────────────────────────────────┐
│ OpenClaw Agent                                            │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Lobster (Workflow Layer)                             │  │
│  │ - Pipeline sequencing and data flow                 │  │
│  │ - Approval gates (hard stop, resume with token)     │  │
│  │ - Cursor tracking (don't reprocess seen items)      │  │
│  │ - Timeout enforcement                               │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ calls                          │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │ OpenTentacles (Integration Layer)                   │  │
│  │ - OAuth2/API-key authentication                     │  │
│  │ - API module method invocation                      │  │
│  │ - Webhook reception and event routing               │  │
│  │ - Credential encryption and storage                 │  │
│  │ - Job queues and scheduled tasks                    │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ powered by                     │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │ Frigg Framework (Engine)                            │  │
│  │ - IntegrationBase, Module system, Prisma ORM        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Example: HubSpot deal alerts with human approval**

```yaml
# deal-alerts.lobster
name: hubspot-deal-alerts
steps:
  - name: fetch
    exec: ot_invoke hubspot deals.list --filter "amount>10000"
  - name: format
    stdin: $fetch.json
    exec: jq '.deals[] | {name: .name, amount: .amount, rep: .owner}'
  - name: approve
    stdin: $format.stdout
    approve: "Post these deals to #big-deals?"
  - name: notify
    condition: $approve.approved
    stdin: $format.stdout
    exec: ot_invoke slack chat.postMessage --channel big-deals
```

Lobster handles the flow: fetch → format → **approve** → notify. OpenTentacles handles the API calls: authenticated HubSpot query and Slack message post. The agent orchestrates neither -- both run deterministically from the pipeline definition.

### 8.3 Enterprise Workflow Engines (Temporal, Step Functions)

For production deployments that need distributed orchestration, OpenTentacles integrations can be called from enterprise workflow engines:

| Engine | Integration Pattern | Use Case |
|---|---|---|
| **Temporal** | Activities call Frigg API modules | Durable, distributed multi-system syncs with automatic retry |
| **AWS Step Functions** | Lambda steps use Frigg handlers | Serverless orchestration with visual workflow designer |
| **Bull/BullMQ** | Queue workers use Frigg modules | Redis-backed job processing with retry and backoff |

OpenTentacles doesn't compete with these engines. It provides the **integration primitives** they orchestrate. A Temporal activity that needs to call HubSpot's API can use a Frigg API module instead of hand-rolling HTTP + OAuth + token refresh.

### 8.4 Design Principle: Infrastructure, Not Orchestration

OpenTentacles deliberately avoids building workflow orchestration because:

1. **Agents already orchestrate.** An LLM calling MCP tools is already a workflow engine. Adding another orchestration layer creates confusion about who controls the flow.
2. **Lobster exists.** For OpenClaw users who want deterministic pipelines, Lobster is purpose-built and already integrated.
3. **Temporal exists.** For enterprise users who need distributed durable execution, Temporal is battle-tested and a better investment than building a competing engine.
4. **The integration layer is the gap.** No existing tool gives agents authenticated, encrypted, enterprise-grade API module access. That's the unique value.

The right boundary: OpenTentacles makes API calls reliable and secure. Workflow engines make sequences of those calls reliable and recoverable. Different problems, different tools.

---

## 9. MVP Scope

### Phase 1: Foundation (MCP Server + Module Manifests)

**Goal:** An agent can discover modules, authenticate, and call API methods.

| Deliverable | Package | Effort |
|---|---|---|
| MCP server with stdio transport | `@opententacles/mcp-server` | Core |
| Tool: `ot_list_modules`, `ot_module_info`, `ot_search_modules` | mcp-server | Core |
| Tool: `ot_auth_connect`, `ot_auth_status` | mcp-server | Core |
| Tool: `ot_invoke` (direct method invocation) | mcp-server | Core |
| Module manifests for top 10 modules | `@opententacles/module-manifests` | Core |
| Manifest JSON Schema | module-manifests | Core |
| Auto-generation script for manifests | module-manifests | Core |
| `llms.txt` at project root | docs | Low |
| README and getting-started guide | docs | Low |

**Success criteria:** An agent (any MCP client) can list modules, connect to HubSpot via OAuth2, and call `hubspot.contacts.list()` through the MCP server.

### Phase 2: Local Runtime + Scaffolding

**Goal:** An agent can create and run integrations locally.

> **Effort revised downward.** Codebase audit shows Frigg is already 99% standalone (see Section 4.2). The local runtime is a thin wrapper around Frigg's existing Express app, not a from-scratch build. The `serverless-http` adapter is the only Lambda coupling point. Scheduler already has a mock provider. Encryption already has AES fallback.

| Deliverable | Package | Effort | Notes |
|---|---|---|---|
| Standalone Express wrapper | `@opententacles/local-runtime` | **Low** | Replace `serverless-http` with `app.listen()` -- Frigg's `createApp()` already returns a standard Express app |
| In-process queue (SQS-compatible) | local-runtime | Medium | EventEmitter-based, same `send(message, queueUrl)` API |
| Local scheduler (node-cron, EventBridge-compat) | local-runtime | **Low** | Frigg's scheduler already supports `SCHEDULER_PROVIDER=mock` |
| Tool: `ot_scaffold` (generate integration files) | mcp-server | Core | |
| Tool: `ot_start`, `ot_stop`, `ot_status` | mcp-server | Core | |
| Tool: `ot_logs` | mcp-server | Low | |
| Webhook tunnel (cloudflared) | local-runtime | Medium | |
| Tool: `ot_webhook_test` | mcp-server | Medium | |
| `create-opententacles-app` scaffolder | create-opententacles-app | Medium | |
| CLI: `opententacles init`, `opententacles start` | `@opententacles/cli` | Medium | |

**What we DON'T need to build** (already exists in Frigg):
- Express app with body-parser, CORS, error handling (`createApp()`)
- Health check routers with DB connectivity checks
- Auth routers with OAuth2 flow management
- Integration-defined route registration
- Webhook route registration
- Database layer with multi-DB support (Prisma)
- AES encryption for credentials (Cryptor with `AES_KEY`)
- Module loading via npm package discovery

**Success criteria:** An agent can scaffold a HubSpot→Slack integration, run it locally, receive a simulated webhook, and see Slack messages posted.

### Phase 3: Recommendation Engine + Cloud Deployment

**Goal:** The system learns from agent behavior and integrations graduate to cloud.

| Deliverable | Package | Effort |
|---|---|---|
| Call tracking middleware | recommendation-engine | Core |
| Vectra vector store integration | recommendation-engine | Medium |
| Pattern detection | recommendation-engine | Medium |
| Tool: `ot_recommendations` | mcp-server | Medium |
| Tool: `ot_scaffold_from_pattern` | mcp-server | Medium |
| Tool: `ot_deploy`, `ot_deploy_status` | mcp-server | Core |
| Credential migration (local → cloud) | mcp-server + local-runtime | Medium |
| `agents.json` workflow definitions | docs | Medium |

**Success criteria:** After 3+ similar sessions, the engine recommends creating a coded integration. Agent deploys a local integration to AWS with a single tool call.

---

## 10. Technical Decisions

### 10.1 Language: Node.js (JavaScript)

Matches Frigg's stack. The MCP server, local runtime, and all packages are JavaScript/Node.js. This ensures:
- Direct `require()` of Frigg packages (no language bridge)
- Same developer tooling (npm, Jest, ESLint)
- Compatibility with Frigg's Prisma + Express patterns

### 10.2MCP SDK: `@modelcontextprotocol/sdk`

The official MCP TypeScript/JavaScript SDK. Supports all transports (stdio, SSE, Streamable HTTP) and all primitives (Tools, Resources, Prompts, Tasks).

### 10.3Vector Store: Vectra (Local) → RuVector/pgvector (Cloud)

- **Local development**: Vectra (pure Node.js, file-based, zero-config)
- **Production**: RuVector (npm package, pgvector-compatible) or pgvector directly (already using Postgres)
- Adapter pattern lets the recommendation engine work with either

### 10.4Local Database: SQLite (Default) → Postgres (Optional)

- SQLite via Prisma for zero-config local development
- Same Prisma schema as Frigg (Postgres), so migrations carry over
- Agents get a working database without installing anything

### 10.5Webhook Tunnel: cloudflared (Default)

- Free, no account required for quick tunnels
- `npx cloudflared tunnel --url http://localhost:3000` -- single command
- Falls back to ngrok if cloudflared unavailable

### 10.6Monorepo: npm Workspaces

Same pattern as Frigg. All packages in `packages/`, managed by npm workspaces, published independently to npm under `@opententacles/` scope.

---

## 11. Naming and Branding

### Package Names (npm)

```
@opententacles/mcp-server
@opententacles/local-runtime
@opententacles/recommendation-engine
@opententacles/module-manifests
@opententacles/cli
create-opententacles-app
```

### CLI Command

```bash
# Project setup
npx create-opententacles-app my-integration-project

# Daily use
opententacles start        # Start local runtime + MCP server
opententacles deploy       # Deploy to cloud
opententacles manifest     # Generate module manifests
```

### MCP Tool Prefix

All MCP tools use the `ot_` prefix (short for OpenTentacles):

```
ot_list_modules
ot_invoke
ot_scaffold
ot_start
ot_deploy
```

### Tagline Options

- "Integration infrastructure for autonomous agents"
- "Give your AI agent 40+ API integrations in one command"
- "The integration layer agents build for themselves"
- "Frigg-powered. Agent-driven."

---

## 12. Open Questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | **License** | MIT vs Apache 2.0 | MIT (matches OpenClaw, maximizes adoption) |
| 2 | **Org name** | `opententacles` vs `open-tentacles` | `opententacles` (no hyphen, cleaner imports) |
| 3 | **Initial module manifests** | Hand-author vs AI-generate from source | AI-generate from Frigg module source, then hand-verify |
| 4 | **SQLite vs Postgres default** | SQLite zero-config vs Postgres more compatible | SQLite default, Postgres opt-in (`--postgres` flag) |
| 5 | **OpenClaw-specific features** | Agent-agnostic only vs OpenClaw skill packages | Agent-agnostic core, optional OpenClaw adapter package |
| 6 | **Recommendation engine LLM** | Local (Ollama) vs API (Claude) vs configurable | Configurable, with Claude as default and local as fallback |
| 7 | **GitHub org** | New org vs under friggframework | New org (`github.com/opententacles/opententacles`) |

---

## 13. What Happens Next

1. **Validate the concept** with the OpenClaw and broader agent community
2. **Set up the repository** with monorepo structure and CI/CD
3. **Build Phase 1 MVP**: MCP server + top 10 module manifests + auth tools
4. **Demonstrate** an agent (OpenClaw or Claude Code) discovering and using a Frigg module through OpenTentacles
5. **Iterate** based on real agent usage patterns
6. **Release** `@opententacles/mcp-server` to npm

The first milestone is simple: **an agent calls `ot_list_modules()` and gets back a list of 40+ API integrations it can use**. Everything else builds from there.

---

## Appendix A: Comparison with Alternatives

| Feature | OpenTentacles | Raw MCP Servers | Composio | Zapier MCP |
|---|---|---|---|---|
| Pre-built API modules | 40+ (via Frigg) | Build each from scratch | 150+ tools | 7000+ apps |
| Local-first runtime | Yes (standalone) | No standard | Cloud-only | Cloud-only |
| Code generation | Agent writes Frigg code | N/A | No code gen | No-code only |
| Cloud deployment | AWS Lambda (Frigg infra) | Manual | Managed cloud | Managed cloud |
| Open source | Yes (MIT) | Varies | Partial | No |
| Self-hostable | Yes | Yes | Enterprise only | No |
| Pattern learning | Recommendation engine | No | No | No |
| Webhook handling | Full two-stage pipeline | Basic | Basic | Managed |
| Enterprise encryption | Field-level KMS/AES | DIY | Managed | Managed |
| Agent writes real code | Yes (IntegrationBase) | N/A | No | No |

The key differentiator: OpenTentacles is the only option where **agents write real, deployable integration code** rather than configuring a managed service. The integrations are yours -- in your repo, your infrastructure, your control.

## Appendix B: OpenTentacles vs OpenClaw Lobster

These are **complementary tools operating at different layers**, not competitors.

| Dimension | OpenTentacles | Lobster |
|---|---|---|
| **Layer** | Integration infrastructure | Workflow orchestration |
| **Core problem** | "How do I call HubSpot's API with valid OAuth tokens?" | "How do I sequence 5 steps with a human approval in the middle?" |
| **Written in** | JavaScript/Node.js (matches Frigg) | TypeScript |
| **Runtime** | Long-running Express HTTP server | Short-lived CLI subprocess |
| **State storage** | Prisma database (Postgres/SQLite/MongoDB) | Filesystem (~/.openclaw/ state dir) |
| **Auth management** | Full OAuth2 lifecycle, token refresh, credential encryption | None -- delegates to tool layer |
| **Webhook support** | Full HTTP server with tunnel for external delivery | None -- not an HTTP server |
| **Retry/error handling** | Frigg event dispatcher, queue-based retry | Timeouts and output caps only |
| **Human-in-the-loop** | Not built-in (delegates to workflow layer) | First-class `approve` primitive |
| **Determinism model** | Code-based (IntegrationBase classes) | Data-based (YAML pipelines) |
| **Scalability target** | Local → serverless cloud graduation | Local single-host only |
| **Self-description** | "Integration infrastructure for autonomous agents" | "Temporal: 80/20 version for personal workflows" |

**Together they form a complete stack:**

```
Lobster    → "fetch deals, filter big ones, get human approval, post to Slack"
OpenTentacles → "here's an authenticated HubSpot client and a Slack client with valid tokens"
Frigg      → "here's how IntegrationBase, Module, and Requester classes work"
```

An agent using only Lobster must hand-roll every API call. An agent using only OpenTentacles must rely on the LLM to sequence multi-step flows. An agent using both gets **deterministic pipelines with enterprise-grade API infrastructure** -- the best of both worlds.
