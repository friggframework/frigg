/**
 * The pieces DataDefinedIntegration wires to Frigg. Each takes its I/O as arguments, so the whole runtime can be
 * driven in a test with fakes and the same code runs in Lambda.
 *
 *   makePorts      capability calls go through the module manifest to an Api method; links live in IntegrationMapping
 *   runWorkflow    one delivered event -> one WorkflowRun (dedupe, filter, steps, trace)
 *   runQuery       a UI surface's data
 *   renderSurface  query + view -> a resolved component tree the host's generic renderer draws
 *   runLifecycle   onInstall / onUninstall steps
 */
const { execute } = require('./interpreter');
const { evaluate, resolve, getPath } = require('./expressions');
const { TRANSFORMS } = require('./transforms');

/**
 * @param {object} p
 * @param {object} p.def
 * @param {Record<string, object>} p.manifests        manifest name -> manifest
 * @param {(moduleKey:string, method:string, args:object) => Promise<any>} p.callApi   e.g. (k, m, a) => this[k].api[m](a)
 * @param {{ get(key:string): Promise<object|null>, put(key:string, value:object): Promise<void>, claim(key:string, value:object): Promise<boolean> }} p.store
 *        Backed by IntegrationMapping: get = getMapping, put = upsertMapping, claim = createMapping (insert-only; false if it existed)
 * @param {(ref:string, args:object) => Promise<any>} [p.runCode]
 */
function makePorts({ def, manifests, callApi, store, runCode }) {
    const manifestFor = (key) => manifests[def.modules[key]?.module];
    const normalise = (set, key, value) => {
        const m = (set.identity?.match || []).find((x) => x.key === key);
        const fn = m?.transform && TRANSFORMS[m.transform];
        return fn ? fn(value) : value;
    };
    /** A sync or a link set (definition.links): both store links the same way, under their own id. */
    const linkSetOf = ({ link, sync }) => {
        const id = link ?? sync;
        const s = link != null ? (def.links || []).find((x) => x.id === id) : (def.syncs || []).find((x) => x.id === id);
        if (!s) throw new Error(`Unknown ${link != null ? 'link set' : 'sync'} "${id}"`);
        return s;
    };
    return {
        async call(moduleKey, capability, args) {
            const c = manifestFor(moduleKey)?.capabilities?.[capability];
            if (!c) throw new Error(`${moduleKey}.${capability} is not declared by the module manifest`);
            return callApi(moduleKey, c.method, args);
        },
        links: {
            /** By one side's id: link:<set>:<module>:<id>. By identity key: idx:<set>:<key>:<normalised value>. */
            async find({ link, sync, from, id, key }) {
                const s = linkSetOf({ link, sync });
                if (from && id != null) return (await store.get(`link:${s.id}:${from}:${id}`)) || null;
                for (const [k, v] of Object.entries(key || {})) {
                    if (v == null || v === '') continue;
                    const hit = await store.get(`idx:${s.id}:${k}:${normalise(s, k, v)}`);
                    if (hit) return hit;
                }
                return null;
            },
            async upsert({ link, sync, ids, keys }) {
                const s = linkSetOf({ link, sync });
                const value = { ...ids, linkedAt: new Date().toISOString() };
                for (const [mod, id] of Object.entries(ids || {})) if (id != null) await store.put(`link:${s.id}:${mod}:${id}`, value);
                for (const [k, v] of Object.entries(keys || {})) if (v != null && v !== '') await store.put(`idx:${s.id}:${k}:${normalise(s, k, v)}`, value);
                return value;
            },
        },
        dedupe: {
            claim: (key) => store.claim(key, { at: new Date().toISOString() }),
            /** A failed run gives its claim back, so the queue's retry runs the steps instead of reading as a duplicate. */
            release: (key) => (store.release ? store.release(key) : undefined),
        },
        runCode,
    };
}

/** The record an event is about, per the manifest's `record` path (Quo: data.object; HubSpot: the payload itself). */
function recordOf(manifests, def, moduleKey, topic, payload) {
    const ev = manifests[def.modules[moduleKey]?.module]?.events?.[topic];
    return ev?.record ? getPath(payload, '$.' + ev.record) : payload;
}

/**
 * Run one workflow for one event.
 * @returns {Promise<object>} a WorkflowRun record (see schema/records.md)
 */
async function runWorkflow({ def, installation, workflowId, event = {}, record, ports, manifests, now = () => new Date(), runId }) {
    const w = (def.workflows || []).find((x) => x.id === workflowId);
    if (!w) throw new Error(`Unknown workflow "${workflowId}"`);
    const t = w.trigger;
    if (record === undefined && t.type === 'webhook') record = recordOf(manifests, def, t.module, t.topic, event);
    const startedAt = now();
    const base = {
        id: runId || `run_${startedAt.getTime().toString(36)}`, integrationId: installation.integrationId || null,
        definition: { id: def.id, version: def.version }, workflowId, trigger: { type: t.type, eventId: event.id || null },
        startedAt: startedAt.toISOString(),
    };
    const settings = { ...defaultsOf(w.settings), ...(installation.workflows?.[w.id]?.settings || {}) };
    const install = installContext(def, installation);
    const ctx = { event, record, settings, install, now: startedAt.toISOString() };

    if (t.filter && !evaluate(t.filter, ctx)) return { ...base, status: 'filtered', endedAt: now().toISOString(), trace: [] };
    const claimKey = event.id && ports.dedupe ? `evt:${def.id}:${w.id}:${event.id}` : null;
    if (claimKey) {
        const fresh = await ports.dedupe.claim(claimKey);
        if (!fresh) return { ...base, status: 'duplicate', endedAt: now().toISOString(), trace: [] };
    }
    try {
        const out = await execute(w.steps, { def, installation, ctx, ports });
        return { ...base, status: out.status, reason: out.reason, endedAt: now().toISOString(), trace: out.trace };
    } catch (e) {
        if (claimKey) await ports.dedupe.release?.(claimKey);
        return { ...base, status: 'failed', error: String(e.message || e), endedAt: now().toISOString(), trace: e.trace || [], retryable: true };
    }
}

async function runQuery({ def, installation, queryId, record, ports }) {
    const q = (def.queries || []).find((x) => x.id === queryId);
    if (!q) throw new Error(`Unknown query "${queryId}"`);
    const install = installContext(def, installation);
    const out = await execute(q.steps, { def, installation, ctx: { record, install, event: {} }, ports });
    if (out.status === 'stopped') return { stopped: out.reason };
    return resolve(q.returns, { steps: out.steps, record, install });
}

/** Resolve a view tree against data: drop nodes whose `when` is false, expand List/Table rows. */
function resolveView(node, ctx) {
    if (!node) return null;
    if (node.when && !evaluate(node.when, ctx)) return null;
    const props = { ...(node.props || {}) };
    if (node.component === 'List') {
        const items = resolve(props.items, ctx) || [];
        props.items = (Array.isArray(items) ? items : []).map((item) => ({ title: resolve(props.title, { ...ctx, item }), meta: resolve(props.meta, { ...ctx, item }) }));
        delete props.title; delete props.meta;
    } else if (node.component === 'Table') {
        const rows = resolve(props.rows, ctx) || [];
        props.rows = (Array.isArray(rows) ? rows : []).map((row) => (props.columns || []).map((c) => resolve(c.value, { ...ctx, row })));
        props.columns = (props.columns || []).map((c) => c.label);
    } else {
        for (const [k, v] of Object.entries(props)) if (k !== 'action') props[k] = resolve(v, ctx);
        if (props.action?.url) props.action = { ...props.action, url: resolve(props.action.url, ctx) };
    }
    const children = (node.children || []).map((c) => resolveView(c, ctx)).filter(Boolean);
    return { component: node.component, props, ...(children.length ? { children } : {}) };
}

/** GET /ui/<surface> -> { surface, view } — what the host app's generic renderer receives. */
async function renderSurface({ def, installation, surfaceId, record, ports }) {
    const u = (def.ui || []).find((x) => x.id === surfaceId);
    if (!u) throw new Error(`Unknown UI surface "${surfaceId}"`);
    const data = await runQuery({ def, installation, queryId: u.data.query, record, ports });
    const install = installContext(def, installation);
    return { surface: { id: u.id, host: u.host, placement: u.placement, definition: `${def.id}@${def.version}` }, view: resolveView(u.view, { data, record, install }) };
}

async function runLifecycle({ def, installation, hook, ports }) {
    const steps = def.lifecycle?.[hook] || [];
    if (!steps.length) return { status: 'completed', steps: {}, trace: [] };
    const install = installContext(def, installation);
    return execute(steps, { def, installation, ctx: { install, event: {}, record: null }, ports });
}

/**
 * The choices for an option setting, for the configure form. `options` is "module.list" or
 * { source: "module.list", with: { <input>: "$.settings.<other setting>" } } — the list's capability is called with
 * those inputs, resolved from the values the user has chosen so far, so a later dropdown depends on an earlier one
 * (Asana projects for the chosen workspace). Returns [] until every required input has a value.
 *
 * @param {{ def, manifests, ports, path: string, values?: object, integrationSettings?: object }} p
 *        path: "settings.project" or "workflows.<id>.settings.<key>"; values: the form's current values at that level;
 *        integrationSettings: the integration-level values, which a workflow setting's inputs read as $.install
 * @returns {Promise<Array<{ label: string, value: any }>>}
 */
async function resolveOptions({ def, manifests, ports, path, values = {}, integrationSettings = {} }) {
    const segs = path.split('.');
    const setting = segs[0] === 'workflows'
        ? (def.workflows || []).find((w) => w.id === segs[1])?.settings?.[segs[3]]
        : def.settings?.[segs[1]];
    if (!setting || setting.type !== 'option') throw new Error(`"${path}" is not an option setting`);
    const ref = typeof setting.options === 'string' ? { source: setting.options } : setting.options;
    const [moduleKey, listName] = ref.source.split('.');
    const list = manifests[def.modules[moduleKey]?.module]?.options?.[listName];
    if (!list) throw new Error(`Module "${moduleKey}" has no option list "${listName}"`);
    const ctx = { settings: values, install: installContext(def, { settings: segs[0] === 'settings' ? values : integrationSettings }) };
    const inputs = resolve(ref.with || {}, ctx);
    for (const [name, spec] of Object.entries(list.inputs || {})) if (spec.required && (inputs[name] == null || inputs[name] === '')) return [];
    const items = await ports.call(moduleKey, list.capability, inputs);
    return (Array.isArray(items) ? items : []).map((item) => ({ label: String(resolve(list.label, { item }) ?? ''), value: resolve(list.value, { item }) }));
}

/**
 * $.install, the same everywhere a definition runs (workflows, queries, UI, lifecycle, option lists): the integration
 * settings with their defaults, the installation's webhook URL and id, `accounts` (per module key, the account fields
 * its manifest declares, e.g. $.install.accounts.quickbooks.realmId) and `runtime.installed` (each onInstall step's
 * result, by step id, so onUninstall can undo it).
 */
function installContext(def, installation = {}) {
    return {
        ...defaultsOf(def.settings), ...(installation.settings || {}),
        webhookUrl: installation.webhookUrl, integrationId: installation.integrationId, portalId: installation.portalId,
        accounts: installation.accounts || {},
        runtime: { installed: installation.runtime?.installed || {} },
    };
}

function defaultsOf(settings) {
    return Object.fromEntries(Object.entries(settings || {}).filter(([, s]) => s.default !== undefined).map(([k, s]) => [k, s.default]));
}

module.exports = { makePorts, runWorkflow, runQuery, renderSurface, resolveView, runLifecycle, resolveOptions, installContext, recordOf, defaultsOf };
