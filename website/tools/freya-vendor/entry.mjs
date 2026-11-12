// Vendored Freya entry — the bundling seed for the on-site "Ask Freya" assistant.
//
// esbuild bundles this module (and everything it imports from @freyaframework/*)
// into  website/friggframework-api/lib/freya-runtime.mjs , a single self-contained
// ESM file the Netlify function loads. See ./build.mjs and ./README.md.
//
// Why deep imports instead of the package barrels: the @freyaframework/llm barrel
// re-exports the transformers-js embedding adapter, and the memory barrel carries
// the Postgres adapters. We need none of that here. Importing the specific adapter
// files keeps those (and their heavy optional deps) out of the bundle graph. The
// only optional dep that remains referenced is @huggingface/transformers, and only
// via a lazy `await import()` inside an embedding path we never call — it is marked
// external in build.mjs and never loads at runtime.
import { createAgentRuntime } from '@freyaframework/runtime/dist/create-agent-runtime.js';
import { AnthropicLLM } from '@freyaframework/llm/dist/adapters/anthropic.js';
import { FakeEmbedding } from '@freyaframework/llm/dist/adapters/fake-embedding.js';
import { InMemoryMemoryRepository } from '@freyaframework/memory/dist/adapters/in-memory-repo.js';
import { InMemorySessionRepository } from '@freyaframework/memory/dist/adapters/in-memory-session-repo.js';
import { InMemoryOntologyRepository } from '@freyaframework/ontology/dist/adapters/in-memory-ontology-repo.js';
import { parseOntologyYaml } from '@freyaframework/ontology/dist/seed/loader.js';
import {
    createUserMessage,
    createAssistantMessage,
    createSession,
    addMessage,
} from '@freyaframework/core';
import { McpClientToolExecutor } from '@freyaframework/mcp-client';

const AGENT_ID = 'frigg-web';
const TRANSPORT = 'netlify-web';

// Frigg-domain ontology. Rendered into the system prompt each turn as a typed
// domain model, so the agent reasons in Frigg's real vocabulary (and its enum
// values line up with the search tools' category/status/complexity args). This is
// prompt-only grounding today; when the site gets a durable memory store, the same
// typed entities make Freya's memory capture meaningful (a returning visitor's
// stack/interests become typed, queryable memories).
const FRIGG_ONTOLOGY = {
    name: 'frigg',
    scope: 'domain',
    entities: {
        Platform: {
            description: 'A third-party software product Frigg integrates with (e.g. HubSpot, Salesforce, Attio).',
            properties: ['name', 'vendor'],
        },
        ApiModule: {
            description:
                'A prebuilt Frigg connector for a platform API, installed with `frigg install <name>` and drawn from the api-module-library.',
            properties: ['name', 'provider', 'authType'],
            category: [
                'ai', 'analytics', 'commerce', 'communication', 'crm', 'devtools',
                'finance', 'hr', 'marketing', 'other', 'productivity', 'storage', 'support',
            ],
            complexity: ['Low', 'Medium', 'High'],
            status: ['Active', 'Beta', 'Planned'],
            belongs_to: 'Platform',
        },
        Integration: {
            description:
                'A running integration a developer builds by extending IntegrationBase, wiring API modules to events (USER_ACTION, CRON, QUEUE, WEBHOOK).',
            properties: ['name', 'useCase'],
            connects: ['ApiModule', 'Primitive'],
        },
        Primitive: {
            description:
                'A Frigg building block exposed to developers and their agents: an Endpoint, a Queue, a Provider-native backend, or a Fenestra in-app UI experience.',
            properties: ['name'],
            kind: ['Endpoint', 'Queue', 'ProviderNative', 'Fenestra'],
        },
        Capability: {
            description:
                'A typed declaration of what a module or integration can do, pointing at a spec and its implementation (the mcp-tool / agent-tooling surface).',
            properties: ['name', 'spec'],
            belongs_to: 'ApiModule',
        },
        Adr: {
            description:
                'A Frigg architecture decision record shaping the roadmap, tracked on the "next" branch and surfaced at /roadmap/.',
            properties: ['num', 'title', 'theme'],
            status: ['Accepted', 'Proposed', 'Superseded', 'Draft'],
        },
        Visitor: {
            description: 'A person chatting with the assistant on the site.',
            properties: ['name', 'stack', 'interest'],
        },
    },
};

// Retrieval data for the current request, set at the top of each runTurn call.
// A warm Netlify instance handles one request at a time, so a module-level holder
// is safe; the tool executor reads whatever the latest turn supplied.
let activeData = { adrs: [], apis: [], categories: [], builtCount: 0 };

const s = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
const matches = (hay, q) => !q || s(hay).includes(s(q));

// A small, honest data-retrieval tool surface over the roadmap catalog. The
// agent calls these instead of reciting from a static blob, so answers track
// the committed ADR / API data rather than the prompt.
class RoadmapTools {
    async discoverTools(scope) {
        if (scope !== 'roadmap') return [];
        return [
            {
                name: 'catalog_stats',
                description:
                    'Frigg roadmap catalog summary: number of ADRs, number of API modules, ' +
                    'how many are already built, and the list of API categories. Call this ' +
                    'first for any "how many / what categories" question.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                source: 'roadmap',
                requiresApproval: false,
                permissionScope: 'roadmap:read',
            },
            {
                name: 'search_adrs',
                description:
                    'Search Frigg architecture decision records (ADRs). Filter by free-text ' +
                    'query (matches title/summary/theme) and/or status (e.g. Accepted, Proposed). ' +
                    'Returns matching ADRs with number, title, status, theme, one-line summary, and URL.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Free-text filter over title/summary/theme' },
                        status: { type: 'string', description: 'Exact status filter, e.g. "Accepted"' },
                    },
                    additionalProperties: false,
                },
                source: 'roadmap',
                requiresApproval: false,
                permissionScope: 'roadmap:read',
            },
            {
                name: 'search_apis',
                description:
                    'Search the Frigg API module catalog (224 integrations). Filter by free-text ' +
                    'query (matches name/provider/description/tags), category, or built=true to only ' +
                    'return modules that already exist in api-module-library. Returns a capped list ' +
                    'plus the total match count so you can point people to /roadmap/ for the full set.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                        category: { type: 'string', description: 'One of the catalog categories' },
                        built: { type: 'boolean', description: 'If true, only modules already built' },
                    },
                    additionalProperties: false,
                },
                source: 'roadmap',
                requiresApproval: false,
                permissionScope: 'roadmap:read',
            },
        ];
    }

    async execute(call) {
        const start = Date.now();
        const done = (output, status = 'success', error) => ({
            callId: call.id,
            toolName: call.toolName,
            output,
            status,
            error,
            durationMs: Date.now() - start,
            timestamp: new Date(),
        });
        try {
            const input = call.input || {};
            if (call.toolName === 'catalog_stats') {
                return done({
                    adrCount: activeData.adrs.length,
                    apiCount: activeData.apis.length,
                    builtCount: activeData.builtCount,
                    categories: activeData.categories,
                });
            }
            if (call.toolName === 'search_adrs') {
                const hits = activeData.adrs.filter(
                    (a) =>
                        (matches(a.title, input.query) ||
                            matches(a.summary, input.query) ||
                            matches(a.theme, input.query)) &&
                        (!input.status || s(a.status) === s(input.status)),
                );
                return done({
                    total: hits.length,
                    adrs: hits.slice(0, 12).map((a) => ({
                        num: a.num,
                        title: a.title,
                        status: a.status,
                        theme: a.theme,
                        summary: a.summary,
                        url: a.url,
                    })),
                });
            }
            if (call.toolName === 'search_apis') {
                const hits = activeData.apis.filter(
                    (a) =>
                        (matches(a.name, input.query) ||
                            matches(a.provider, input.query) ||
                            matches(a.description, input.query) ||
                            (Array.isArray(a.tags) && a.tags.some((t) => matches(t, input.query)))) &&
                        (!input.category || s(a.category) === s(input.category)) &&
                        (input.built === undefined || Boolean(a.built) === Boolean(input.built)),
                );
                return done({
                    total: hits.length,
                    showing: Math.min(hits.length, 15),
                    apis: hits.slice(0, 15).map((a) => ({
                        slug: a.slug,
                        name: a.name,
                        provider: a.provider,
                        category: a.category,
                        status: a.status,
                        complexity: a.complexity,
                        built: !!a.built,
                        library: a.library,
                    })),
                });
            }
            return done(null, 'error', `unknown tool: ${call.toolName}`);
        } catch (e) {
            return done(null, 'error', e && e.message ? e.message : String(e));
        }
    }
}

/**
 * Configure the MCP servers the assistant can reach, from env. Each is offered
 * only when its credential is present, so the widget degrades gracefully:
 *   - frigg-docs  → Context7 (semantic docs), pinned to the next branch via the
 *     repo's context7.json. Needs CONTEXT7_API_KEY.
 *   - frigg-repo  → GitHub's MCP server (branch-accurate file/code on next).
 *     Needs GITHUB_MCP_TOKEN (a read-only token); URL overridable via GITHUB_MCP_URL.
 */
function mcpServersFromEnv() {
    const servers = [];
    if (process.env.CONTEXT7_API_KEY) {
        servers.push({
            id: 'frigg-docs',
            url: process.env.CONTEXT7_MCP_URL || 'https://mcp.context7.com/mcp',
            headers: { CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY },
        });
    }
    // Dedicated var only — do NOT fall back to an ambient GITHUB_TOKEN, which is
    // commonly present in host/CI envs and would half-activate this server with a
    // wrong-scoped token.
    const ghToken = process.env.GITHUB_MCP_TOKEN;
    if (ghToken) {
        servers.push({
            id: 'frigg-repo',
            url: process.env.GITHUB_MCP_URL || 'https://api.githubcopilot.com/mcp/',
            headers: { Authorization: `Bearer ${ghToken}` },
        });
    }
    return servers;
}

/**
 * Fans discovery/execution across sub-executors (roadmap tools + MCP client).
 * Each sub-executor returns [] for scopes it doesn't own, so exactly one claims
 * a given scope; the owning executor for each discovered tool is remembered so
 * execute() routes straight back to it.
 */
class CompositeToolExecutor {
    constructor(executors) {
        this.executors = executors;
        this.owner = new Map();
    }
    async discoverTools(scope) {
        for (const ex of this.executors) {
            const defs = await ex.discoverTools(scope);
            if (defs && defs.length) {
                for (const d of defs) this.owner.set(d.name, ex);
                return defs;
            }
        }
        return [];
    }
    async execute(call) {
        const ex = this.owner.get(call.toolName);
        if (ex) return ex.execute(call);
        return {
            callId: call.id,
            toolName: call.toolName,
            output: null,
            status: 'error',
            error: `no executor for tool: ${call.toolName}`,
            durationMs: 0,
            timestamp: new Date(),
        };
    }
}

let runtime = null;
let sessionsRepo = null;
let registered = false;
let mcpScopes = [];

function getRuntime() {
    if (runtime) return runtime;
    sessionsRepo = new InMemorySessionRepository();
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    const baseUrl = process.env.ANTHROPIC_BASE_URL || undefined;

    // Roadmap tools always; MCP servers (Context7 docs, GitHub repo) when keyed.
    const executors = [new RoadmapTools()];
    const mcpServers = mcpServersFromEnv();
    if (mcpServers.length) {
        executors.push(new McpClientToolExecutor({ servers: mcpServers, mode: 'proxy' }));
        mcpScopes = mcpServers.map((sv) => `mcp:${sv.id}`);
    }
    const toolExecutor = new CompositeToolExecutor(executors);

    runtime = createAgentRuntime({
        llm: new AnthropicLLM({
            apiKey,
            baseUrl,
            defaultModel: process.env.ASSISTANT_MODEL || 'claude-opus-4-8',
            maxTokens: 900,
        }),
        toolExecutor,
        memory: new InMemoryMemoryRepository(),
        ontologyRepo: (() => {
            const repo = new InMemoryOntologyRepository();
            repo.addLayer(parseOntologyYaml('frigg', FRIGG_ONTOLOGY));
            return repo;
        })(),
        sessions: sessionsRepo,
        embedding: new FakeEmbedding(),
    });
    return runtime;
}

async function ensureAgent(rt, systemPrompt, model) {
    if (registered) return;
    await rt.registry.registerAgent(
        {
            id: AGENT_ID,
            name: 'Freya',
            type: 'shared',
            systemPrompt,
            ontologyScopes: ['frigg'],
            memoryNamespaces: ['default'],
            toolScopes: ['roadmap', ...mcpScopes],
            routines: [],
            delegationTargets: [],
            modelId: model || process.env.ASSISTANT_MODEL || 'claude-opus-4-8',
            maxTurns: 6,
        },
        'friggframework-org',
    );
    registered = true;
}

/**
 * Drive one grounded, tool-using Freya turn.
 *
 * @param {object}   opts
 * @param {string}   opts.systemPrompt   Static voice/rules core for the agent.
 * @param {string=}  opts.model          Model id (defaults to ASSISTANT_MODEL / opus).
 * @param {Array<{role:'user'|'assistant',content:string}>} opts.messages
 *                                        Full conversation; the last entry must be the user turn.
 * @param {object=}  opts.data           { adrs:[], apis:{apis:[],categories:[],builtCount} }.
 * @returns {Promise<string>}            The assistant reply text.
 */
export async function runTurn({ systemPrompt, model, messages, data }) {
    if (data) {
        const apis = data.apis || {};
        activeData = {
            adrs: (data.adrs && data.adrs.adrs) || data.adrs || [],
            apis: apis.apis || (Array.isArray(apis) ? apis : []),
            categories: apis.categories || [],
            builtCount: apis.builtCount || 0,
        };
    }

    const rt = getRuntime();
    await ensureAgent(rt, systemPrompt, model);

    const history = messages.slice(0, -1);
    const last = messages[messages.length - 1];

    // Seed a fresh session with prior turns so each request is self-contained
    // (in-memory repos reset on cold start; the widget always sends full history).
    const sessionId = crypto.randomUUID();
    let session = createSession(sessionId, AGENT_ID, 'web-visitor', TRANSPORT);
    for (const m of history) {
        const msg =
            m.role === 'assistant'
                ? createAssistantMessage(crypto.randomUUID(), m.content)
                : createUserMessage(crypto.randomUUID(), m.content, TRANSPORT);
        session = addMessage(session, msg);
    }
    await sessionsRepo.save(session);

    const result = await rt.handleMessage({
        agentId: AGENT_ID,
        sessionId,
        message: createUserMessage(crypto.randomUUID(), last.content, TRANSPORT),
    });
    return (result && result.message && result.message.content) || '';
}
