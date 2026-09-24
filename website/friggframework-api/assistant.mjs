// Freya — the Frigg site assistant. A small concierge that answers questions about the
// Frigg framework, helps sketch an integration, and points people around the
// roadmap and Left Hook.
//
// Runs on the Netlify AI Gateway: Netlify injects ANTHROPIC_API_KEY and
// ANTHROPIC_BASE_URL at build/deploy time, and the Anthropic SDK's `new
// Anthropic()` picks both up with no extra config. If those are absent (local
// dev without the gateway, or the gateway not enabled), the function returns a
// friendly "assistant is offline" response so the widget degrades gracefully.
//
// Freya seam: Left Hook's companion agent framework (Freya) will eventually
// drive this endpoint with tool use and richer grounding. Everything the model
// needs today flows through `buildSystemPrompt()` and the single messages.create
// call in `answer()`. When Freya lands, swap `answer()` for a Freya session and
// keep this handler's request/response contract unchanged. Look for FREYA-SEAM.

import { getStore } from '@netlify/blobs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// Model is env-overridable so the operator can pick a cost/quality point
// without a code change. Default is Opus for the best answers. For a public,
// high-traffic widget you'll likely want to set ASSISTANT_MODEL to
// claude-haiku-4-5-20251001 (fast + cheap, ideal for short grounded Q&A) or
// claude-sonnet-4-5-20250929 to keep AI Gateway credit burn down.
const MODEL = process.env.ASSISTANT_MODEL || 'claude-opus-4-8';
const MAX_TOKENS = 900;

// Rate limiting: a rolling per-IP window backed by Netlify Blobs. Keeps a
// single visitor (or a hot loop) from running up gateway credits. Generous
// enough for real conversation, tight enough to matter.
const RATE_LIMIT_MAX = 12; // requests
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // per minute
const MAX_MESSAGES = 12; // trim conversation history sent to the model
const MAX_CHARS = 4000; // per-message input clamp

function clientIp(request, context) {
    const xff = context.ip || request.headers.get('x-nf-client-connection-ip') ||
        request.headers.get('x-forwarded-for') || '';
    return (xff.split(',')[0] || 'unknown').trim();
}

async function checkRateLimit(ip) {
    // Best-effort: if Blobs is unavailable, fail open rather than block chat.
    try {
        const store = getStore('assistant-rate');
        const key = `rl:${ip}`;
        const raw = await store.get(key, { type: 'json' });
        const now = Date.now();
        const hits = (raw && Array.isArray(raw.hits) ? raw.hits : [])
            .filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
        if (hits.length >= RATE_LIMIT_MAX) {
            return { ok: false, retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
        }
        hits.push(now);
        await store.setJSON(key, { hits });
        return { ok: true };
    } catch (e) {
        console.log('rate-limit store unavailable, failing open:', e.message);
        return { ok: true };
    }
}

// Condensed, curated grounding. Deliberately not the full 224-API catalog or
// all 27 ADRs — the assistant points people at /roadmap/ for the searchable
// directory rather than reciting it. Keeps the prompt tight and the answers
// honest about where the authoritative lists live.
const KNOWLEDGE = `
# Frigg framework — quick facts

Frigg is an open-source, serverless-native framework for building direct/native
integrations. The pitch: stand up an integration in minutes, get to production
in about a day. It is maintained by Left Hook and is at v2.0.0-next (the "next"
pre-release line). GitHub: https://github.com/friggframework/frigg. Docs:
https://docs.friggframework.org.

## The point of view
An integration is more than moving data between systems. Sometimes an
integration moves no data at all. Frigg exposes integration *primitives* to
developers and their agents:
- Endpoint — spin up an ad hoc HTTP path with a simple route definition.
- Queue — add async/background processing with a quick annotation (AWS SQS).
- Provider-native — Frigg is the active backend for platforms like Attio,
  HubSpot, Zapier, Zendesk, and Salesforce, and the API modules ship helpers to
  get your platform-specific code right.
- Fenestra — in-app UI experiences. Fenestra is a new spec Left Hook is
  introducing to sit alongside the industry specs Frigg already speaks: OpenAPI
  (OAS), AsyncAPI, Arazzo, Overlays, JSON Schema, and MCP.

## What it's built on
- Runtime: Node.js 22+, JavaScript, AWS Lambda.
- Packaging/deploy: Serverless Framework fork (osls) + esbuild, generating
  serverless.yml and CloudFormation.
- Database: PostgreSQL OR MongoDB, via Prisma (two schemas ship).
- Encryption: field-level, AWS KMS OR AES-256 (auto-bypassed in dev/test/local).
- Async: AWS SQS queues; EventBridge Scheduler + cron for scheduled jobs.
- Config/secrets: SSM Parameter Store + Secrets Manager.
- HTTP: Express via serverless-http.
- Auth: OAuth2, API-key, and Basic across API modules.
- UI/forms: JSON Schema (JSONForms) with a React/Vite management UI.
- Observability: OpenTelemetry is natively supported (traces + metrics, OTLP
  exporters) — vendor-neutral, no lock-in.
- Testing: Jest, nock, in-memory database.
- Architecture: hexagonal / DDD (handlers -> use cases -> repositories).
Where it says OR, that is a real choice the adopter makes, not a default.

## Cloud + infrastructure-as-code
Cloud-agnostic by design. Today it largely runs on AWS, and adopters have also
deployed to GCP, Azure, and local clouds via container. "Infrastructure as code"
here means the Frigg app definition self-scaffolds its own resources as it needs
them — you define the integrations you want, and the infrastructure generates
from that definition. You own the stack and own your own pipes.

## Scaffolding an integration (the short version)
1. frigg init my-app — create a new Frigg app.
2. frigg install <module> — pull a pre-built API module (e.g. frigg install
   hubspot). frigg search <term> to find one.
3. Write an integration class extending IntegrationBase. Key hooks: authRequest
   (OAuth/API-key flow), loadForm/onFormSubmit (dynamic forms), onchange
   (watched-field webhooks), processJob (background work).
4. Wire events: USER_ACTION, CRON, QUEUE, WEBHOOK handlers on this.events.
5. frigg start for local dev (hot reload, Docker + DB pre-flight checks).
6. frigg deploy --stage dev|prod.
The frigg CLI also has an authenticator (frigg auth test .) to try OAuth/API-key
flows without deploying anything.

## The catalog + roadmap
Left Hook tracks a large catalog of APIs across many platforms; a subset already
have built API modules in the api-module-library and the rest are candidates.
For exact counts, categories, which modules are built, and specific ADRs, use the
catalog_stats / search_apis / search_adrs tools — those are authoritative and
current. The full searchable directory plus the roadmap (built from the ADRs)
lives at /roadmap/ on this site, with community voting; point people there rather
than listing everything. To request a new API module, there is a "Request" link
on each candidate that opens a GitHub issue.

## Roadmap themes (high level; use search_adrs for specifics)
- Agent tooling: Capabilities (typed declarations of what a module/integration
  can do, pointing at spec + implementation), Ontology (layered versioned
  context compiled into an XML block agents see at session start), Integration
  Templates (category base classes you copy into your codebase, ShadCN-style),
  Agent Harness (wires ontology + capabilities + plugins + templates into a
  coding-agent session), and Evals.
- Extensions & plugins: Plugins are swappable infrastructure (provider,
  database, encryption, queue, scheduler); Extensions are optional add-on code
  (core, integration, and API-module extensions); Artifacts are provider-side
  code Frigg helps generate.
- Also: telemetry/usage tracking (OpenTelemetry), schema + integration-version
  migrations, management UI, and infra/deploy work (e.g. SSM offload).

## Commercial
Frigg is open source. Left Hook also offers a commercial license for teams who
want commercial support and maintenance, plus premium / heavy-duty connectors,
plugins, and extensions.

## What people use it for
Frigg is agnostic about the use case. Most early adopters build native
integrations for their own end customers. Some run their internal business
process automations on it. The maintainer also runs personal home-lab and home
automation projects on it. If it involves talking to another system, it fits.

# Left Hook — who's behind Frigg
Left Hook are integration experts for the modern software stack: integration
consulting, development, and automation for businesses of all sizes. They
maintain Frigg. Partnerships include HubSpot (Solutions Partner) and Zapier
(Certified Expert). They serve verticals like legal, insurance, financial
services, healthcare, distribution, community banks, nonprofits, executive
search, and commercial landscaping. Featured work includes Docusign and a 9+
year partnership with FreshBooks. For commercial help, point people at the
"Talk to Left Hook" contact on this site.
`.trim();

function buildSystemPrompt() {
    return `You are Freya, the assistant on the Frigg framework website — a
concise, friendly guide to Frigg (an open-source serverless integration
framework maintained by Left Hook). If someone asks your name, you're Freya.

Your jobs, in one voice:
1. Answer questions about the Frigg framework — what it is, how it works, the
   stack, and the concepts.
2. Help someone sketch how they'd build a specific integration in Frigg (which
   primitive, which API module, roughly which hooks). Give a short, concrete
   starting point, not a full tutorial.
3. Act as a roadmap concierge — help people find APIs, ADRs, and what's planned,
   and send them to /roadmap/ for the searchable directory and voting.
4. Share helpful context about Left Hook when it's relevant.

Rules:
- You have live retrieval tools over the roadmap catalog: catalog_stats (ADR /
  API counts and categories), search_adrs (architecture decision records), and
  search_apis (the 224-module API catalog, incl. which are already built). For
  ANY question about specific ADRs, API modules, catalog counts, or what's built
  vs. planned, call the tool and answer from what it returns — do not guess or
  recite from memory. Everything else is grounded in the reference below.
- You may also have live documentation/source tools whose names end in
  "_list_tools" and "_call_tool" (e.g. frigg-docs for the Frigg docs, frigg-repo
  for the repository on the next branch). When present, use them for deep,
  technical, or how-does-the-code-work questions the reference doesn't cover:
  call the "_list_tools" one to see what a source offers, then "_call_tool" to
  fetch, and answer from the result rather than guessing. If they're absent, just
  rely on the reference and point to the docs.
- If something isn't covered by a tool or the reference, say so plainly and point
  to the docs (https://docs.friggframework.org), the GitHub repo, or /roadmap/
  rather than inventing specifics.
- Never invent API module names, ADR numbers, config keys, or version numbers.
  When someone wants the full API list, send them to /roadmap/.
- Keep answers short and scannable. A few sentences or a tight list. This is a
  chat widget, not a doc page. Use short code snippets only when they genuinely
  help (e.g. frigg install ...).
- Match the site's voice: direct and plain. No hype, no "this changes
  everything," go easy on em-dashes.
- You don't have access to a user's account, private data, or the ability to run
  commands or deploy. You give guidance and pointers.

Reference material:
${KNOWLEDGE}`;
}

function sanitizeMessages(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' && m.content.trim())
        .slice(-MAX_MESSAGES)
        .map((m) => ({
            role: m.role,
            content: m.content.slice(0, MAX_CHARS),
        }));
}

// Roadmap retrieval data the Freya tools query at request time. Loaded from the
// committed catalog JSON via static require so Netlify's bundler ships the files;
// if it's ever unavailable the agent still runs and leans on the static prompt.
let ROADMAP_DATA = null;
function loadRoadmapData() {
    if (ROADMAP_DATA) return ROADMAP_DATA;
    try {
        ROADMAP_DATA = {
            adrs: require('../roadmap/data/adrs.json'),
            apis: require('../roadmap/data/apis.json'),
        };
    } catch (e) {
        console.log('roadmap data unavailable:', e && e.message ? e.message : e);
        ROADMAP_DATA = { adrs: [], apis: {} };
    }
    return ROADMAP_DATA;
}

// FREYA-SEAM: a turn now runs through the vendored Freya runtime — a tool-using
// agent that retrieves ADR / API-catalog facts at request time instead of a
// single grounded Messages call. The (messages) -> string contract, the handler,
// the rate limiter, and the offline path are all unchanged. The self-contained
// bundle lives at ./lib/freya-runtime.mjs (regenerate via website/tools/freya-vendor).
let freyaModule = null;
async function answer(messages) {
    // Lazy dynamic import (ESM bundle from CJS) so a load failure never breaks
    // the offline path, matching how the SDK was lazily required before.
    if (!freyaModule) freyaModule = await import('./lib/freya-runtime.mjs');
    const reply = await freyaModule.runTurn({
        systemPrompt: buildSystemPrompt(),
        model: MODEL,
        messages,
        data: loadRoadmapData(),
    });
    return (reply && reply.trim()) || "I didn't catch that. Could you rephrase?";
}

const OFFLINE_REPLY =
    "The assistant is offline right now. In the meantime: the docs are at " +
    "https://docs.friggframework.org, the code is at " +
    "https://github.com/friggframework/frigg, and the roadmap and API directory " +
    "are at /roadmap/ on this site.";

export default async function (request, context) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
        return Response.json(
            { error: 'method not allowed' },
            { status: 405, headers: CORS_HEADERS },
        );
    }

    const json = (status, obj) => Response.json(obj, {
        status,
        headers: CORS_HEADERS,
    });

    // No gateway configured -> degrade gracefully, don't 500.
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_BASE_URL) {
        return json(200, { reply: OFFLINE_REPLY, offline: true });
    }

    let payload;
    try {
        payload = await request.json();
    } catch (e) {
        return json(400, { error: 'invalid JSON' });
    }

    const messages = sanitizeMessages(payload.messages);
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
        return json(400, { error: 'expected a non-empty messages array ending with a user turn' });
    }

    const rate = await checkRateLimit(clientIp(request, context));
    if (!rate.ok) {
        return json(429, {
            reply: "You're going a little fast for me. Give it a few seconds and try again.",
            rateLimited: true,
            retryAfter: rate.retryAfter,
        });
    }

    try {
        const reply = await answer(messages);
        return json(200, { reply });
    } catch (e) {
        console.log('assistant error:', e && e.message ? e.message : e);
        return json(200, { reply: OFFLINE_REPLY, offline: true });
    }
}
