# Frigg + AI Agent Integration: Architecture Analysis & Roadmap

## Executive Summary

This document analyzes how the Frigg Framework (v2.0, `next` branch) can evolve to serve as the integration backbone for AI coding agents like OpenClaw, Claude Code, and similar tools. It identifies gaps in the current architecture, proposes new components, and maps Frigg's role against the [six MCP servers every product company needs](https://lefthook.com/blog/mcp-servers-every-product-company-needs).

The vision has four pillars:

1. **Agent-Readable Frigg** -- Machine-readable docs and an MCP server so agents can discover and use Frigg API modules natively
2. **Intelligent Recommendation Layer** -- A classifying agent with vector store that observes agent API call patterns and suggests hardening them into coded integrations
3. **Local-to-Cloud Deployment** -- A robust local Frigg runtime (beyond serverless-offline) that lets agent-driven integrations graduate from local prototypes to deployed cloud services
4. **Real-Time Event Handling** -- Local webhook reception, polling, and event-driven processing so agents can react to external system changes deterministically

---

## Table of Contents

- [1. Current State of Frigg 2.0](#1-current-state-of-frigg-20)
- [2. The AI Agent Landscape](#2-the-ai-agent-landscape)
- [3. Gap Analysis](#3-gap-analysis)
- [4. Proposed Architecture: Frigg MCP Server](#4-proposed-architecture-frigg-mcp-server)
- [5. Proposed Architecture: Recommendation Engine](#5-proposed-architecture-recommendation-engine)
- [6. Proposed Architecture: Local Runtime](#6-proposed-architecture-local-runtime)
- [7. Machine-Readable Documentation](#7-machine-readable-documentation)
- [8. Mapping to LeftHook's Six MCP Servers](#8-mapping-to-lefthooks-six-mcp-servers)
- [9. Implementation Roadmap](#9-implementation-roadmap)
- [10. Open Questions & Risks](#10-open-questions--risks)

---

## 1. Current State of Frigg 2.0

### What Frigg Already Has

| Capability | Status | Location |
|---|---|---|
| IntegrationBase lifecycle | Stable | `packages/core/integrations/` |
| API module system (40+ modules) | Stable | Separate repo, npm `@friggframework/api-module-*` |
| OAuth2 / API-key / Basic auth | Stable | `packages/core/modules/requester/` |
| Two-stage webhook processing | Stable | `packages/core/handlers/WEBHOOKS.md` |
| SQS job queuing | Stable | `packages/core/queues/` |
| EventBridge Scheduler | Stable | `packages/core/infrastructure/scheduler/` |
| Transparent field-level encryption | Stable | `packages/core/database/encryption/` |
| Infrastructure-as-code generation | Stable | `packages/devtools/infrastructure/` |
| CLI (`frigg start/install/deploy`) | Stable | `packages/devtools/frigg-cli/` |
| JSON Schema for module definitions | Stable | `packages/schemas/` |
| Local dev via serverless-offline (`osls`) | Working | `packages/devtools/frigg-cli/start-command/` |
| Mock scheduler for local dev | Working | `packages/core/infrastructure/scheduler/mock-scheduler-adapter.js` |
| Multi-database (Mongo/Postgres via Prisma) | Stable | `packages/core/database/` |
| Hexagonal/DDD architecture | Enforced | Throughout core |

### What Frigg Does Not Have

| Capability | Gap Level | Impact |
|---|---|---|
| MCP server implementation | **Not started** | Agents can't discover or invoke Frigg tools |
| Machine-readable API module docs | **Partial** -- JSON Schema exists but no per-method docs | Agents can't learn what API methods are available |
| Robust local runtime (non-serverless) | **Not started** -- only serverless-offline | Can't run persistent local integrations reliably |
| Vector store / recommendation engine | **Not started** | No pattern detection or integration suggestions |
| Local webhook reception (tunneling) | **Not started** | Can't receive webhooks during local dev |
| Local SQS emulation | **Partial** -- env vars checked but no local queue | Queue-based processing doesn't work locally |
| `llms.txt` or equivalent | **Not started** | Agents can't discover Frigg's capabilities |

---

## 2. The AI Agent Landscape

### OpenClaw

[OpenClaw](https://en.wikipedia.org/wiki/OpenClaw) (formerly Clawdbot/Moltbot) is an open-source autonomous AI agent created by Peter Steinberger in November 2025. Key characteristics:

- **140,000+ GitHub stars**, 565+ community skills
- Runs locally, connects to LLMs (Claude, GPT, DeepSeek)
- Supports MCP via `@modelcontextprotocol/sdk@1.25.3`
- Operates through messaging platforms (Signal, Telegram, Discord, WhatsApp)
- Configuration via `openclaw.json` with MCP server definitions
- Now transitioning to an independent foundation (OpenAI sponsoring)

OpenClaw's MCP integration means it can discover and call tools exposed by MCP servers. A Frigg MCP server would let OpenClaw directly leverage Frigg's API modules.

### Other Agents

- **Claude Code** -- Terminal-native agent with native MCP support
- **Cursor / Windsurf** -- IDE-integrated agents with MCP support
- **Gemini CLI** -- Google's terminal agent

All major AI coding agents now support MCP as the standard protocol for tool discovery and invocation. MCP was donated to the Agentic AI Foundation (Linux Foundation) in December 2025 and is governed by Anthropic, Block, and OpenAI jointly.

### MCP Protocol Architecture

```
┌─────────────────────────────────┐
│ AI Agent (Host)                 │
│ - OpenClaw, Claude Code, etc.   │
│ - Maintains MCP Client          │
└──────────────┬──────────────────┘
               │ JSON-RPC over stdio/SSE/StreamableHTTP
┌──────────────▼──────────────────┐
│ MCP Server                       │
│ - Exposes tools (functions)      │
│ - Exposes resources (data)       │
│ - Exposes prompts (templates)    │
│ - Handles tool invocations       │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│ Backend System                   │
│ - Frigg API modules              │
│ - Database, queues, etc.         │
└─────────────────────────────────┘
```

MCP servers expose three primitives:
1. **Tools** -- Functions the agent can call (e.g., `hubspot_create_contact`)
2. **Resources** -- Data the agent can read (e.g., `frigg://integrations/active`)
3. **Prompts** -- Templates for common operations (e.g., "set up a CRM sync")

---

## 3. Gap Analysis

### Gap 1: No MCP Server

**Current:** Frigg has no MCP implementation. Agents cannot discover what API modules are available or invoke them.

**Required:** An MCP server that:
- Lists available API modules as tool groups
- Exposes per-method tools for each installed module (e.g., `hubspot_get_contacts`, `hubspot_create_deal`)
- Handles authentication flow (OAuth2 redirect, API key prompts)
- Manages credential lifecycle
- Exposes integration status as resources

### Gap 2: Machine-Readable API Module Documentation

**Current:**
- `packages/schemas/schemas/api-module-definition.schema.json` defines the module definition shape
- Per-module docs in `docs/api-modules/` are mostly empty stubs (e.g., HubSpot README is blank)
- No per-method documentation (parameters, return types, examples)

**Required:**
- Every API module method needs a machine-readable descriptor (name, description, parameters with JSON Schema, return type, examples)
- An `llms.txt` at the framework level for AI discoverability
- OpenAPI-compatible tool definitions that MCP can serve

### Gap 3: Robust Local Runtime

**Current:** `frigg start` launches `osls` (serverless-offline), which:
- Emulates API Gateway + Lambda locally
- Has known reliability issues at scale
- No local SQS emulation (queue operations fail locally)
- No local EventBridge Scheduler (mock exists but only in-memory)
- No persistent process for long-running integrations

**Required:** A local runtime that:
- Runs as a standalone Node.js/Express service OR Docker Compose stack
- Includes local queue processing (in-process or via local SQS alternative)
- Supports webhook reception (local tunnel or callback server)
- Handles scheduled jobs deterministically
- Can be started by an agent via a single command
- Maintains state across restarts (persistent local database)

### Gap 4: Recommendation Engine (Agent Workflow Hardening)

**Current:** No pattern detection or recommendation system exists.

**Required:**
- Track sequences of API calls made through the MCP server
- Store call patterns as embeddings in a vector store
- A lightweight classifying agent that:
  - Identifies repeated multi-step workflows
  - Matches against known integration patterns
  - Recommends creating a coded Frigg integration from the pattern
- Ability to generate integration scaffolding from detected patterns

---

## 4. Proposed Architecture: Frigg MCP Server

### Package: `@friggframework/mcp-server`

```
packages/mcp-server/
├── index.js                          # MCP server entry point
├── server.js                         # MCP server instance (SDK based)
├── tools/
│   ├── tool-registry.js              # Dynamic tool registration from API modules
│   ├── module-tools-generator.js     # Generates MCP tools from module definitions
│   ├── integration-tools.js          # Integration lifecycle tools
│   └── auth-tools.js                 # Authentication flow tools
├── resources/
│   ├── module-catalog-resource.js    # Available API modules
│   ├── integration-status-resource.js # Active integration status
│   └── credential-resource.js        # Credential health
├── prompts/
│   ├── setup-integration-prompt.js   # Guide: setting up a new integration
│   ├── sync-data-prompt.js           # Guide: syncing data between systems
│   └── debug-integration-prompt.js   # Guide: debugging integration issues
├── recommendation/
│   ├── call-tracker.js               # Records tool invocations with context
│   ├── pattern-detector.js           # Identifies repeated sequences
│   └── integration-suggester.js      # Generates integration recommendations
└── config.js                         # Server configuration
```

### Tool Generation from API Modules

Each installed `@friggframework/api-module-*` would expose its methods as MCP tools:

```javascript
// Auto-generated from HubSpot API module
{
    name: "hubspot_list_contacts",
    description: "List contacts from HubSpot CRM with optional filtering",
    inputSchema: {
        type: "object",
        properties: {
            limit: { type: "integer", default: 100, description: "Max results" },
            after: { type: "string", description: "Pagination cursor" },
            properties: {
                type: "array",
                items: { type: "string" },
                description: "Contact properties to return"
            }
        }
    }
}
```

### Tool Categories

| Category | Example Tools | Auth Required |
|---|---|---|
| **Discovery** | `frigg_list_modules`, `frigg_search_modules`, `frigg_module_info` | No |
| **Auth** | `frigg_auth_oauth2`, `frigg_auth_apikey`, `frigg_auth_status` | No |
| **Module Operations** | `hubspot_list_contacts`, `slack_post_message`, etc. | Yes |
| **Integration Management** | `frigg_create_integration`, `frigg_integration_status` | Yes |
| **Webhook Management** | `frigg_register_webhook`, `frigg_webhook_history` | Yes |

### MCP Server Transport Options

```javascript
// stdio transport (for Claude Code, OpenClaw local)
const server = new FriggMCPServer({ transport: 'stdio' });

// SSE transport (for web-based agents)
const server = new FriggMCPServer({ transport: 'sse', port: 3001 });

// Streamable HTTP (emerging standard)
const server = new FriggMCPServer({ transport: 'streamable-http', port: 3001 });
```

### Agent Configuration Example

```json
// openclaw.json
{
    "mcpServers": {
        "frigg": {
            "command": "npx",
            "args": ["@friggframework/mcp-server", "--config", "./frigg.config.json"],
            "env": {
                "DATABASE_URL": "postgresql://...",
                "STAGE": "local"
            }
        }
    }
}
```

---

## 5. Proposed Architecture: Recommendation Engine

### Core Concept

The MCP server records every tool invocation. A background process analyzes these patterns and recommends hardening repeated sequences into formal Frigg integrations.

### Components

#### 5.1 Call Tracker

Records tool calls with context:

```javascript
// Stored per session
{
    sessionId: "sess_abc123",
    timestamp: "2026-02-22T10:00:00Z",
    tool: "hubspot_list_contacts",
    input: { limit: 50, properties: ["email", "company"] },
    output_summary: "returned 50 contacts",
    duration_ms: 230,
    preceding_tool: "slack_list_channels",
    user_intent: "sync contacts to slack channel"  // from agent context
}
```

#### 5.2 Vector Store for Pattern Matching

**Recommended: [Vectra](https://github.com/Stevenic/vectra)** -- A local vector database for Node.js

Why Vectra over alternatives:
- Pure Node.js, no external dependencies
- File-system based (persists to disk)
- Supports cosine similarity search
- Lightweight enough for local use
- No Docker or external service required

> Note: "ruvector" does not appear to be an established product. The closest matches are **RediSearch** (vector search in Redis) or **Qdrant** (Rust-based vector DB). For Frigg's local-first requirement, Vectra is the best fit. For production cloud deployment, Qdrant or Pinecone would be alternatives.

```javascript
const { LocalIndex } = require('vectra');

const index = new LocalIndex(path.join(dataDir, 'frigg-patterns'));

// Store a workflow pattern
await index.insertItem({
    vector: await embedWorkflow(toolSequence),
    metadata: {
        tools: ['hubspot_list_contacts', 'slack_post_message'],
        frequency: 12,
        description: "Sync HubSpot contacts to Slack"
    }
});

// Find similar patterns
const results = await index.queryItems(
    await embedWorkflow(currentSequence),
    5  // top 5 matches
);
```

#### 5.3 Classifying Agent

A lightweight LLM-backed classifier that:

1. **Observes** tool call sequences from the call tracker
2. **Embeds** sequences using a small model (local or API)
3. **Matches** against known integration patterns in the vector store
4. **Recommends** when a pattern:
   - Has been repeated 3+ times
   - Involves 2+ API modules
   - Could be simplified into a single integration

```javascript
class IntegrationSuggester {
    async analyze(recentSessions) {
        // 1. Extract tool sequences
        const sequences = this.extractSequences(recentSessions);

        // 2. Find repeated patterns
        const patterns = this.findRepeatedPatterns(sequences, { minFrequency: 3 });

        // 3. Match against known templates
        const matches = await this.vectorStore.queryItems(
            await this.embed(patterns),
            3
        );

        // 4. Generate recommendation
        if (matches.length > 0 && matches[0].score > 0.85) {
            return {
                type: 'USE_EXISTING_TEMPLATE',
                template: matches[0].metadata.templateName,
                confidence: matches[0].score
            };
        }

        // 5. Suggest new integration
        return {
            type: 'CREATE_NEW_INTEGRATION',
            suggestedModules: this.extractModules(patterns),
            suggestedEvents: this.extractEvents(patterns),
            scaffold: await this.generateScaffold(patterns)
        };
    }
}
```

#### 5.4 Recommendation Delivery

Recommendations surface through:
- **MCP Resource**: `frigg://recommendations/pending` -- agents can poll for suggestions
- **MCP Tool**: `frigg_get_recommendations` -- on-demand query
- **Proactive notification**: If the MCP server detects a repeated pattern during the current session, it can include a recommendation in the tool response metadata

---

## 6. Proposed Architecture: Local Runtime

### The Problem with serverless-offline

`frigg start` currently uses `osls` (serverless-offline), which:
- Simulates API Gateway/Lambda but with known gaps
- No SQS support (queue operations throw errors locally)
- No EventBridge support (scheduler is mock/in-memory only)
- Cold starts behave differently from production
- Not designed for persistent, long-running processes

### Proposed: `@friggframework/local-runtime`

A standalone Node.js service that provides production-equivalent local behavior.

```
packages/local-runtime/
├── index.js                        # Entry point
├── server.js                       # Express HTTP server
├── local-queue.js                  # In-process queue (BullMQ-compatible API)
├── local-scheduler.js              # Cron/at-based local scheduler
├── local-webhook-receiver.js       # ngrok/cloudflared tunnel manager
├── local-event-bus.js              # In-process event bus (EventEmitter)
├── docker-compose.yml              # Optional: Postgres + Redis + Frigg
├── Dockerfile                      # Container for Frigg local runtime
└── health-check.js                 # Local health monitoring
```

### Architecture: Two Modes

#### Mode A: Standalone Node.js Service (Recommended for agents)

```
┌──────────────────────────────────────────────┐
│ Frigg Local Runtime (single process)          │
│                                               │
│  ┌─────────────┐  ┌──────────────────────┐   │
│  │ Express HTTP │  │ MCP Server (stdio)   │   │
│  │ Server       │  │                      │   │
│  │ - REST API   │  │ - Tool invocation    │   │
│  │ - Webhooks   │  │ - Resource queries   │   │
│  │ - Health     │  │ - Recommendations    │   │
│  └──────┬───────┘  └──────────┬───────────┘   │
│         │                     │               │
│  ┌──────▼─────────────────────▼───────────┐   │
│  │ Integration Engine                      │   │
│  │ - Load integrations from app definition │   │
│  │ - Hydrate modules with credentials      │   │
│  │ - Dispatch events                       │   │
│  └──────┬─────────────────────┬───────────┘   │
│         │                     │               │
│  ┌──────▼───────┐  ┌─────────▼───────────┐   │
│  │ Local Queue   │  │ Local Scheduler     │   │
│  │ (in-process)  │  │ (node-cron)         │   │
│  │               │  │                     │   │
│  │ BullMQ-compat │  │ EventBridge-compat  │   │
│  │ API surface   │  │ API surface         │   │
│  └───────────────┘  └─────────────────────┘   │
│                                               │
│  ┌────────────────────────────────────────┐   │
│  │ Database (Prisma)                       │   │
│  │ SQLite (dev) / Postgres (staging)       │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

**Key properties:**
- Single `frigg local` command starts everything
- In-process queue replaces SQS (same API surface)
- `node-cron` replaces EventBridge Scheduler
- SQLite for zero-config local dev, Postgres for staging
- ngrok/cloudflared tunnel for webhook reception
- MCP server runs in-process or as a sidecar

#### Mode B: Docker Compose Stack (For team/CI environments)

```yaml
# docker-compose.yml
services:
  frigg:
    build: .
    ports:
      - "3000:3000"   # HTTP API
      - "3001:3001"   # MCP SSE transport
    environment:
      - DATABASE_URL=postgresql://frigg:frigg@postgres:5432/frigg
      - STAGE=local
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: frigg
      POSTGRES_USER: frigg
      POSTGRES_PASSWORD: frigg
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    # Used by BullMQ for persistent local queues

  tunnel:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run
    # Exposes frigg:3000 for webhook reception

volumes:
  pgdata:
```

### Local Queue Implementation

Replace SQS with an in-process or BullMQ-based queue that matches the `QueuerUtil` API:

```javascript
class LocalQueuerUtil {
    constructor() {
        this.queues = new Map();
        this.handlers = new Map();
    }

    async send(message, queueUrl) {
        const queueName = this.queueNameFromUrl(queueUrl);
        const handler = this.handlers.get(queueName);

        if (handler) {
            // Process immediately (in-process mode)
            setImmediate(() => handler(message));
        } else {
            // Buffer for later processing
            this.getQueue(queueName).push(message);
        }
    }

    registerHandler(queueName, handler) {
        this.handlers.set(queueName, handler);
        // Process any buffered messages
        const queue = this.getQueue(queueName);
        while (queue.length > 0) {
            handler(queue.shift());
        }
    }
}
```

### Local Webhook Reception

```javascript
class LocalWebhookReceiver {
    async start({ port = 3000, tunnel = 'cloudflared' }) {
        // 1. Start Express server for webhook endpoints
        this.app = express();
        this.app.post('/webhooks/:integrationName', this.handleWebhook);
        this.app.post('/webhooks/:integrationName/:integrationId', this.handleWebhook);

        // 2. Create tunnel for external access
        if (tunnel === 'cloudflared') {
            this.tunnelUrl = await this.startCloudflaredTunnel(port);
        } else if (tunnel === 'ngrok') {
            this.tunnelUrl = await this.startNgrokTunnel(port);
        }

        console.log(`Webhook URL: ${this.tunnelUrl}/webhooks/`);
        return this.tunnelUrl;
    }
}
```

### CLI Integration

```bash
# New commands
frigg local                     # Start standalone local runtime
frigg local --docker            # Start Docker Compose stack
frigg local --tunnel ngrok      # Use ngrok for webhooks (default: cloudflared)
frigg local --mcp               # Also start MCP server (stdio)
frigg local --mcp-sse           # Start MCP server with SSE transport

# Existing command continues to work
frigg start                     # Legacy: serverless-offline mode
```

---

## 7. Machine-Readable Documentation

### Current State

The `packages/schemas/` package has `api-module-definition.schema.json` which defines the shape of a module definition, but:
- It describes the **definition structure**, not the **API methods**
- No per-method documentation (parameters, return types)
- Per-module docs in `docs/api-modules/` are mostly empty
- No `llms.txt` for AI discoverability

### Proposed: Multi-Layer Documentation

#### Layer 1: `llms.txt` (Framework Level)

Place at repository root and published docs site:

```
# Frigg Framework
> Enterprise-grade serverless integration framework for building native integrations

## What Frigg Does
Frigg lets you build, deploy, and manage integrations between your product and
external software (CRM, communication, project management, etc.) with pre-built
API modules and a standardized integration lifecycle.

## Key Concepts
- API Module: A wrapper around an external API (HubSpot, Salesforce, Slack, etc.)
- Integration: A coded workflow connecting two or more API modules
- IntegrationBase: The base class all integrations extend

## For AI Agents
- MCP Server: npx @friggframework/mcp-server
- API Module List: https://docs.friggframework.org/api-modules.json
- Integration Templates: https://docs.friggframework.org/templates.json

## Documentation
- Getting Started: https://docs.friggframework.org/getting-started
- API Module Reference: https://docs.friggframework.org/api-modules
- Full Docs: https://docs.friggframework.org
```

#### Layer 2: Module Capability Manifests (Per Module)

Each API module publishes a `frigg-module.json`:

```json
{
    "moduleName": "hubspot",
    "version": "2.1.0",
    "description": "HubSpot CRM integration module",
    "authType": "oauth2",
    "baseUrl": "https://api.hubapi.com",
    "capabilities": {
        "contacts": {
            "list": {
                "description": "List contacts with optional filtering",
                "method": "GET",
                "path": "/crm/v3/objects/contacts",
                "parameters": {
                    "limit": { "type": "integer", "default": 100 },
                    "after": { "type": "string", "description": "Pagination cursor" },
                    "properties": { "type": "array", "items": { "type": "string" } }
                },
                "returns": {
                    "type": "object",
                    "properties": {
                        "results": { "type": "array" },
                        "paging": { "type": "object" }
                    }
                }
            },
            "create": {
                "description": "Create a new contact",
                "method": "POST",
                "path": "/crm/v3/objects/contacts",
                "parameters": {
                    "properties": {
                        "type": "object",
                        "description": "Contact properties to set",
                        "required": ["email"]
                    }
                }
            }
        }
    },
    "webhookEvents": ["contact.creation", "contact.propertyChange", "deal.creation"],
    "rateLimits": { "requests": 100, "period": "10s" }
}
```

#### Layer 3: OpenAPI Spec Generation

Generate OpenAPI 3.1 specs from module capability manifests:

```javascript
// packages/mcp-server/tools/openapi-generator.js
function generateOpenApiSpec(moduleManifest) {
    return {
        openapi: "3.1.0",
        info: {
            title: `Frigg ${moduleManifest.moduleName} Module`,
            version: moduleManifest.version
        },
        paths: Object.entries(moduleManifest.capabilities)
            .flatMap(([group, methods]) =>
                Object.entries(methods).map(([name, spec]) => ({
                    [`/${group}/${name}`]: {
                        [spec.method.toLowerCase()]: {
                            summary: spec.description,
                            parameters: spec.parameters,
                            responses: { "200": { content: spec.returns } }
                        }
                    }
                }))
            )
    };
}
```

#### Layer 4: MCP Tool Definitions (Auto-Generated)

The MCP server reads module manifests and generates MCP tool definitions at startup:

```javascript
class ModuleToolsGenerator {
    generateTools(moduleManifest) {
        const tools = [];

        for (const [group, methods] of Object.entries(moduleManifest.capabilities)) {
            for (const [name, spec] of Object.entries(methods)) {
                tools.push({
                    name: `${moduleManifest.moduleName}_${group}_${name}`,
                    description: spec.description,
                    inputSchema: {
                        type: "object",
                        properties: spec.parameters
                    }
                });
            }
        }

        return tools;
    }
}
```

---

## 8. Mapping to LeftHook's Six MCP Servers

The [LeftHook blog post](https://lefthook.com/blog/mcp-servers-every-product-company-needs) identifies six MCP servers every product company needs. Here's how a Frigg-powered application maps to each:

### 1. Documentation MCP Server

> Makes API docs machine-readable for developers using AI coding assistants.

**Frigg Role:** The `@friggframework/mcp-server` exposes module capability manifests as MCP resources. An agent building with Frigg can query available modules, read method signatures, and understand authentication requirements without visiting a docs site.

**Implementation:**
- MCP Resource: `frigg://docs/modules` -- catalog of all modules
- MCP Resource: `frigg://docs/modules/{name}` -- detailed module docs
- `llms.txt` at framework level

### 2. API MCP Server

> Exposes actual API operations as callable tools for AI agents.

**Frigg Role:** This is the primary function of the Frigg MCP server. Each installed API module becomes a set of callable MCP tools. Authentication is handled by the module system.

**Implementation:**
- MCP Tools: `{module}_{group}_{method}` for every installed module
- Auth tools: `frigg_auth_connect`, `frigg_auth_status`
- Frigg handles the OAuth dance, token refresh, and credential encryption

**Unique Frigg Advantage:** Because Frigg already standardizes OAuth2/API-key flows across 40+ modules, the MCP server gets authentication "for free" -- agents don't need to implement per-service auth.

### 3. Product Agent MCP Server

> Your own AI features with structured access to internal APIs and integrations.

**Frigg Role:** When a Frigg application is deployed, the MCP server becomes the Product Agent's interface to all connected external systems. Instead of hardwiring API calls into your product's AI agent, the agent calls Frigg MCP tools.

**Implementation:**
- MCP Resource: `frigg://integrations/active` -- list of active integrations
- MCP Tools: integration lifecycle management
- MCP Prompts: common workflow templates ("sync CRM contacts", "send notification on deal close")

### 4. Internal Operations MCP Server

> AI-assisted access to customer data, tickets, dashboards for support/ops teams.

**Frigg Role:** A Frigg integration that connects to internal tools (Zendesk, Jira, PagerDuty) exposed through MCP gives operations teams AI-powered access to cross-system data.

**Implementation:**
- Deploy Frigg with internal API modules
- MCP tools for querying across systems
- Integration mappings as cross-system identifiers

### 5. Browser MCP Server (WebMCP)

> Embeds MCP in web apps using existing authenticated sessions.

**Frigg Role:** The Frigg Management UI (`packages/devtools/management-ui`) could expose MCP tools via the WebMCP standard, allowing in-browser AI assistants to manage integrations.

**Implementation (Future):**
- WebMCP endpoint in management UI
- Session-scoped tools for integration management
- No additional auth required (inherits browser session)

### 6. Dev Knowledge MCP Server

> Architecture decisions, internal conventions, and system design docs for AI coding agents.

**Frigg Role:** The `CLAUDE.md`, architecture decision records in `docs/architecture-decisions/`, and the comprehensive DDD documentation in the codebase serve as the dev knowledge base. An MCP server wrapping these enables agents to write Frigg-idiomatic code.

**Implementation:**
- MCP Resource: `frigg://knowledge/architecture` -- DDD/hexagonal patterns
- MCP Resource: `frigg://knowledge/integration-patterns` -- integration best practices
- MCP Prompts: "create a new integration", "add webhook handling"

---

## 9. Implementation Roadmap

### Phase 1: Foundation (Machine-Readable Docs + MCP Server MVP)

**Goal:** Agents can discover and invoke Frigg API modules.

| Work Item | Package | Priority |
|---|---|---|
| Define `frigg-module.json` manifest spec | `@friggframework/schemas` | P0 |
| Add manifests to top 10 API modules | `api-module-library` | P0 |
| Build MCP server with tool generation from manifests | `@friggframework/mcp-server` | P0 |
| Add auth tools (OAuth2 flow, API key) | `@friggframework/mcp-server` | P0 |
| Create `llms.txt` for framework | `docs/` | P1 |
| MCP resources for module catalog | `@friggframework/mcp-server` | P1 |

### Phase 2: Local Runtime

**Goal:** Frigg runs robustly on the local machine for agent-driven integrations.

| Work Item | Package | Priority |
|---|---|---|
| Local queue (in-process, BullMQ-compatible API) | `@friggframework/local-runtime` | P0 |
| Standalone Express server (replaces serverless-offline) | `@friggframework/local-runtime` | P0 |
| Local scheduler (node-cron based) | `@friggframework/local-runtime` | P0 |
| Webhook tunnel integration (cloudflared/ngrok) | `@friggframework/local-runtime` | P1 |
| Docker Compose template | `@friggframework/local-runtime` | P1 |
| `frigg local` CLI command | `@friggframework/devtools` | P1 |
| SQLite support for zero-config local dev | `@friggframework/core` | P2 |

### Phase 3: Recommendation Engine

**Goal:** The MCP server intelligently suggests hardening agent workflows into integrations.

| Work Item | Package | Priority |
|---|---|---|
| Call tracking middleware in MCP server | `@friggframework/mcp-server` | P0 |
| Vectra vector store integration | `@friggframework/mcp-server` | P0 |
| Pattern detection (repeated sequences) | `@friggframework/mcp-server` | P1 |
| Integration scaffold generator | `@friggframework/mcp-server` | P1 |
| Recommendation delivery (MCP resource + tool) | `@friggframework/mcp-server` | P1 |
| LLM-based pattern classifier | `@friggframework/mcp-server` | P2 |

### Phase 4: Local-to-Cloud Graduation

**Goal:** Agent-created local integrations deploy to production with a single command.

| Work Item | Package | Priority |
|---|---|---|
| `frigg deploy` from local-runtime config | `@friggframework/devtools` | P0 |
| Infrastructure generation from local runtime definition | `@friggframework/devtools` | P0 |
| Credential migration (local -> cloud) | `@friggframework/core` | P1 |
| Multi-tenant deployment (per-customer accounts) | `@friggframework/core` | P1 |
| CI/CD pipeline templates | `@friggframework/devtools` | P2 |

---

## 10. Open Questions & Risks

### Open Questions

1. **Which LLM for the classifying agent?** The recommendation engine needs an LLM to classify patterns. Options:
   - Local small model (Ollama + Llama 3) -- zero cost, private, but less capable
   - Claude API -- high quality, but adds a dependency and cost
   - Configurable (let users choose) -- recommended approach

2. **Vector store for production?** Vectra works locally but may not scale for cloud deployment. Consider:
   - Vectra for local, Qdrant/Pinecone for cloud
   - Or use PostgreSQL `pgvector` extension (already have Postgres)

3. **Module manifest authoring?** Who writes `frigg-module.json` files for the 40+ existing modules?
   - Option A: AI-assisted generation from existing source code
   - Option B: Manual authoring as modules are updated
   - Option C: Runtime introspection of API class methods

4. **Tunnel provider preference?** For local webhook reception:
   - cloudflared (free, Cloudflare) -- reliable but requires Cloudflare account
   - ngrok (freemium) -- widely known but paid for custom domains
   - localtunnel (OSS) -- free but less reliable

5. **MCP server auth model?** When the MCP server is exposed over SSE/HTTP (not stdio), how do we authenticate the calling agent?
   - Bearer token
   - OAuth2 (the MCP server itself being an OAuth resource)
   - Shared secret

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| MCP spec evolving rapidly | Tool definitions may need updates | Pin to SDK version, abstract behind Frigg interfaces |
| OpenClaw security concerns (CVE-2026-25253) | Agents may execute unsafe operations | MCP tool permissions, sandboxed execution |
| Module manifest maintenance burden | 40+ modules need manifests | AI-assisted generation, incremental rollout |
| Local runtime complexity | Two code paths (local vs cloud) | Shared integration engine, adapter pattern for queue/scheduler |
| Vector store accuracy | Poor recommendations erode trust | High threshold (0.85+), user confirmation before acting |

---

## Appendix A: Key File References

| Area | File | Purpose |
|---|---|---|
| Integration base | `packages/core/integrations/integration-base.js` | All integrations extend this |
| Module system | `packages/core/modules/module.js` | Module instantiation and credential management |
| HTTP requester | `packages/core/modules/requester/requester.js` | Base HTTP client with retry/auth |
| OAuth2 requester | `packages/core/modules/requester/oauth-2.js` | OAuth2 token management |
| Webhook handling | `packages/core/handlers/WEBHOOKS.md` | Webhook architecture documentation |
| Event dispatcher | `packages/core/handlers/integration-event-dispatcher.js` | Routes events to handlers |
| Queue utility | `packages/core/queues/queuer-util.js` | SQS message sending |
| Scheduler factory | `packages/core/infrastructure/scheduler/scheduler-service-factory.js` | EventBridge/Mock scheduler |
| Module definition schema | `packages/schemas/schemas/api-module-definition.schema.json` | JSON Schema for modules |
| Start command | `packages/devtools/frigg-cli/start-command/index.js` | Local dev via serverless-offline |
| Infrastructure composer | `packages/devtools/infrastructure/infrastructure-composer.js` | Serverless config generation |
| Architecture docs | `packages/devtools/infrastructure/ARCHITECTURE.md` | DDD infrastructure patterns |

## Appendix B: Technology Choices

| Component | Recommended Technology | Rationale |
|---|---|---|
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK, TypeScript, well-maintained |
| Vector store (local) | Vectra | Pure Node.js, file-system based, no deps |
| Vector store (cloud) | pgvector (PostgreSQL) | Already using Postgres, no new service |
| Local queue | BullMQ (Redis) or in-process EventEmitter | BullMQ for Docker mode, EventEmitter for standalone |
| Local scheduler | node-cron | Lightweight, no external deps |
| Webhook tunnel | cloudflared | Free, reliable, no account required for quick tunnels |
| Embedding model | `@xenova/transformers` (local) or Claude API | Local for privacy, Claude for quality |
| Module doc format | JSON (`frigg-module.json`) | Machine-readable, easy to validate, MCP-compatible |

## Appendix C: Related Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/) -- Protocol documentation
- [OpenClaw GitHub](https://github.com/anthropics/openclaw) -- AI agent with MCP support
- [LeftHook: 6 MCP Servers](https://lefthook.com/blog/mcp-servers-every-product-company-needs) -- Product company MCP strategy
- [Vectra](https://github.com/Stevenic/vectra) -- Local vector database for Node.js
- [Frigg Framework Docs](https://docs.friggframework.org) -- Official documentation
- [Frigg API Module Library](https://github.com/friggframework/api-module-library) -- Pre-built modules
