/**
 * Previews: what an integration will show inside the apps it connects, rendered from the current settings and sample
 * or real records. Same code path as production for everything that decides the content (queries, view resolution,
 * the interpreter and its steps); the only thing swapped is where a capability call goes.
 *
 *   previewSurface   a UI surface (a HubSpot card, a Slack message menu...) -> view + html (+ slack blocks / hubspot tree)
 *   previewWorkflow  dry-run a workflow: every outbound call is RECORDED with the args it would send, none is made
 */
const { makePorts, renderSurface, runWorkflow, recordOf } = require('../runtime');
const { isBuiltin } = require('../steps');
const { viewToSlack } = require('./slack');
const { viewToHubSpot } = require('./hubspot');
const { viewToHtml, slackMessageToHtml, callToHtml, slackBlocksToHtml, esc, HOSTS } = require('./html');

class DryRunError extends Error { constructor(what) { super(`dry run: ${what} was not performed`); this.name = 'DryRunError'; } }

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** A plausible empty record for a manifest object: ids are filled (a step that checks `$.steps.x.id exists` proceeds), the rest is empty of its type. */
function sampleObject(manifest, name) {
    const o = manifest?.objects?.[name];
    const out = {};
    for (const f of o?.fields || []) {
        const keys = String(f.name).split('.');
        let cur = out;
        keys.slice(0, -1).forEach((k) => { cur = (cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {}); });
        const empty = f.type === 'id' ? `preview-${name}-${f.name}` : f.type === 'number' ? 0 : f.type === 'boolean' ? false : f.type === 'json' ? {} : f.type === 'array' ? [] : '';
        cur[keys[keys.length - 1]] = empty;
    }
    return out;
}
function sampleOutput(manifest, cap) {
    const o = String(cap?.output || '');
    if (o.endsWith('[]')) return [];
    if (/^page</.test(o)) return { results: [] };
    return o && manifest?.objects?.[o] ? sampleObject(manifest, o) : {};
}

/**
 * Ports for previews. `ports.call` answers from `fixtures` (key "<module key>.<capability>", a value or a function of
 * the args), else from the manifest's own output shape, and records the call. The real `callApi` the base ports would
 * use throws, so a call that somehow bypassed the recorder fails loudly instead of reaching an API.
 *
 * @param {{ def, manifests, fixtures?: object, store?: Map }} p  fixtures.store pre-seeds the link store (keys as the real store's)
 * @returns {{ ports, calls: object[], refusing: object }}  `refusing`: the unwrapped ports, whose call() always throws (kept so a test can prove it)
 */
function recordingPorts({ def, manifests, fixtures = {}, store }) {
    const calls = [];
    const rows = store || new Map(Object.entries(clone(fixtures.store) || {}));
    const mem = {
        get: async (k) => rows.get(k) ?? null,
        put: async (k, v) => { rows.set(k, v); },
        claim: async (k, v) => { if (rows.has(k)) return false; rows.set(k, v); return true; },
        release: async (k) => { rows.delete(k); },
    };
    const base = makePorts({
        def, manifests, store: mem,
        callApi: async (moduleKey, method) => { throw new DryRunError(`${moduleKey}.${method}`); },
        runCode: async (ref, args) => answer('code', ref, 'code', args, fixtures[`code:${ref}`], {}),
    });
    const ports = { ...base }; // the seam below replaces call() on this copy; `base` keeps the one that reaches callApi
    const manifestFor = (key) => manifests[def.modules[key]?.module];
    async function answer(module, capability, kind, args, fixture, fallback) {
        const call = { module, capability, kind, args: clone(args) };
        calls.push(call);
        try {
            call.output = typeof fixture === 'function' ? clone(await fixture(clone(args), { module, capability })) : fixture !== undefined ? clone(fixture) : fallback;
            return clone(call.output);
        } catch (e) { call.error = String(e.message || e); throw e; }
    }
    // `refusing` is the base ports as they were before the seam below: their call() reaches callApi, which throws.
    // The seam: the interpreter only ever reaches a module through ports.call.
    ports.call = async (moduleKey, capability, args) => {
        const m = manifestFor(moduleKey);
        const c = m?.capabilities?.[capability];
        if (!c) {
            calls.push({ module: moduleKey, capability, kind: 'unknown', args: clone(args), error: 'not declared by the module manifest' });
            throw new Error(`${moduleKey}.${capability} is not declared by the module manifest`);
        }
        return answer(moduleKey, capability, c.kind, args, fixtures[`${moduleKey}.${capability}`], sampleOutput(m, c));
    };
    return { ports, calls, refusing: base };
}

/** read/search/subscribe calls fetch; the rest (and code) is what leaves the integration. */
const isSend = (call) => call.kind === 'write' || call.kind === 'delete';

/** How one outbound call would look where it lands. Slack messages get the real Block Kit/mrkdwn rendering. */
function renderCall(call, manifest, appName) {
    if (manifest?.module === 'slack' && /^message\./.test(call.capability)) {
        const a = call.args || {};
        const slack = { channel: a.channel, text: a.text, ...(Array.isArray(a.blocks) ? { blocks: a.blocks } : {}) };
        return { html: slackMessageToHtml({ ...slack, appName }), slack };
    }
    return { html: callToHtml(call) };
}

/**
 * Dry-run one workflow. Nothing is performed: every capability call is recorded with the args it would carry and
 * answered from `fixtures` (or an empty record shaped by the manifest). A webhook workflow with no `event` runs on
 * the manifest's own sample payload for its trigger.
 *
 * @param {{ def, installation?, workflowId: string, event?, record?, manifests, fixtures?: object, now?: Function }} p
 * @returns {Promise<{ workflow: string, status: string, reason?: string, error?: string, waiting?: object, sends: object[], calls: object[], trace: object[] }>}
 *   `calls`: every call in order, `{ stepId, at, module, capability, kind, args, output, rendered }`; `sends`: the writes
 *   among them (`rendered` is `{ html, slack? }` for those, null for reads)
 */
async function previewWorkflow({ def, installation = {}, workflowId, event, record, manifests, fixtures = {}, now }) {
    const w = (def.workflows || []).find((x) => x.id === workflowId);
    if (!w) throw new Error(`Unknown workflow "${workflowId}"`);
    if (event === undefined) {
        const t = w.trigger;
        event = (t.type === 'webhook' && clone(manifests[def.modules[t.module]?.module]?.events?.[t.topic]?.payload)) || {};
    }
    const { ports, calls } = recordingPorts({ def, manifests, fixtures });
    const run = await runWorkflow({ def, installation, workflowId, event, record, ports, manifests, ...(now ? { now } : {}) });

    // The trace has one entry per step that ran; the calls, in the same order, belong to the entries that are capability steps (or code).
    const callSteps = (run.trace || []).filter((t) => (!isBuiltin(t.use) || t.use === 'code') && (t.status === 'ok' || t.status === 'error'));
    const aligned = callSteps.length === calls.length;
    const out = calls.map((c, i) => {
        const manifest = manifests[def.modules[c.module]?.module];
        return { stepId: aligned ? callSteps[i].id : null, at: aligned ? callSteps[i].at : null, ...c, rendered: isSend(c) && manifest ? renderCall(c, manifest, def.label || def.id) : null };
    });
    const waiting = run.status === 'waiting' ? run.waitingFor : undefined;
    return {
        workflow: workflowId, status: run.status, ...(run.reason ? { reason: run.reason } : {}), ...(run.error ? { error: run.error } : {}),
        ...(waiting ? { waiting: { ...waiting, ...(waiting.kind === 'approval' ? { html: `<div style="${HOSTS.generic.frame}"><div style="${HOSTS.generic.head}">Waits for approval</div><div style="${HOSTS.generic.body}">${esc(waiting.prompt)}</div></div>` } : {}) } } : {}),
        sends: out.filter(isSend), calls: out, trace: run.trace || [],
    };
}

/**
 * Render one UI surface. `ports` answer the surface's query (real ports for real records; `recordingPorts(...).ports`
 * with fixtures for samples). `host` defaults to the surface's own.
 *
 * @returns {Promise<{ surface, view, html: string, slack?: { blocks, text, truncated }, hubspot?: object }>}
 */
async function previewSurface({ def, installation = {}, surfaceId, record, ports, host }) {
    const { surface, view } = await renderSurface({ def, installation, surfaceId, record, ports });
    const h = host || surface.host;
    const opts = { integrationId: installation.integrationId, surface: surface.id };
    const out = { surface, view };
    if (h === 'slack') {
        out.slack = viewToSlack(view, opts);
        out.html = `<div data-preview-host="slack" style="${HOSTS.slack.frame}"><div style="${HOSTS.slack.head}">${esc(surface.label || def.label || def.id)} · ${esc(surface.placement)}</div><div style="${HOSTS.slack.body}">${view ? slackBlocksToHtml(out.slack.blocks) : '<em>Nothing to show for this record.</em>'}</div></div>`;
    } else {
        if (h === 'hubspot') out.hubspot = viewToHubSpot(view, opts);
        out.html = viewToHtml(view, { host: h, title: `${def.ui.find((u) => u.id === surface.id)?.label || surface.id} · ${surface.placement}` });
    }
    return out;
}

module.exports = { previewSurface, previewWorkflow, recordingPorts, DryRunError, recordOf };
