/**
 * Validate a capability manifest (v0.1): the module author's promise of what a definition may call. Definitions are
 * validated against manifests, so a broken manifest would let a broken definition through; this checks the manifest
 * itself.
 *
 * @param {object} m  capabilities/<module>.capabilities.json
 * @returns {{ valid: boolean, errors: Array<{path:string,message:string}> }}
 */
const { templateTags, parseCondition, FILTERS } = require('./expressions');
const { eventsIn } = require('./webhooks');

const PATH_RE = /^\$\.[A-Za-z_][\w-]*(\.[\w-]+|\[\d+\])*$/;
const KINDS = new Set(['read', 'search', 'write', 'delete', 'subscribe']); // schema/capability-manifest.v0.1.schema.json
const READS = new Set(['read', 'search']);

function validateManifest(m) {
    const errors = [];
    const err = (path, message) => errors.push({ path, message });
    if (!m || typeof m !== 'object') return { valid: false, errors: [{ path: '', message: 'Manifest must be an object' }] };
    if (!/^[a-z][a-z0-9-]*$/.test(m.module || '')) err('module', 'Lowercase module name');
    if (!m.label) err('label', 'Required');

    const objects = m.objects || {};
    for (const [o, def] of Object.entries(objects)) {
        const names = new Set();
        (def.fields || []).forEach((f, i) => {
            if (!f?.name) err(`objects.${o}.fields[${i}]`, 'Field needs a name');
            else if (names.has(f.name)) err(`objects.${o}.fields[${i}]`, `Duplicate field "${f.name}"`);
            else names.add(f.name);
            // An enum lists its values, or names one of this module's option lists when they differ per account
            // (HubSpot deal stages are per portal).
            if (f?.type === 'enum' && !Array.isArray(f.values) && !(typeof f.values === 'string' && m.options?.[f.values])) err(`objects.${o}.fields[${i}]`, 'An enum lists its values, or names an option list of this module');
        });
    }

    const caps = m.capabilities || {};
    for (const [name, c] of Object.entries(caps)) {
        const p = `capabilities.${name}`;
        if (!/^[A-Za-z][\w]*\.[A-Za-z][\w]*$/.test(name)) err(p, 'Capability names are "<object>.<verb>"');
        if (!KINDS.has(c?.kind)) err(`${p}.kind`, [...KINDS].join(', '));
        if (!/^[A-Za-z_$][\w$]*$/.test(c?.method || '')) err(`${p}.method`, 'Name of a method on the module\'s Api class');
        for (const [arg, spec] of Object.entries(c?.input || {})) if (!spec?.type) err(`${p}.input.${arg}`, 'Input needs a type');
    }

    for (const [topic, e] of Object.entries(m.events || {})) {
        const p = `events.${topic}`;
        if (e.object && !objects[e.object]) err(`${p}.object`, `"${e.object}" is not an object of this module`);
        if (e.payload && (e.delivery || 'webhook') === 'webhook' && m.webhook) {
            // The example is a real delivery (body, plus headers when the topic is in one): it must route to this event
            // through the same code a live webhook goes through, and its record path must find something.
            const found = eventsIn(m, { body: e.payload, headers: e.headers }).find((x) => x.topic === topic);
            if (!found) err(`${p}.payload`, `The example delivery does not route to "${topic}" (check webhook.topic and this event's match)`);
            else if (e.record && found.record === undefined) err(`${p}.record`, `"${e.record}" finds nothing in the example event`);
        } else if (e.record && e.payload) {
            let cur = e.payload;
            for (const seg of e.record.split(/\.|(?=\[)/)) { const i = /^\[(\d+)\]$/.exec(seg); cur = cur == null ? undefined : i ? cur[Number(i[1])] : cur[seg]; }
            if (cur === undefined) err(`${p}.record`, `"${e.record}" is not a path in the example payload`);
        }
    }

    // An option list: a read capability, its inputs, and how each item becomes { label, value } (one reference, or
    // a template). A string that mixes "$.x" into text renders the path literally, so it is refused.
    const checkItemExpr = (v, p) => {
        if (typeof v !== 'string') { err(p, 'A reference ($.item.id) or a template ({{item.name}})'); return; }
        if (!PATH_RE.test(v) && v.includes('$.')) err(p, `"${v}" mixes a $. reference into text, which renders literally; use {{item.x}} for every part`);
        for (const t of templateTags(v)) {
            if (t.path.split(/\.|\[/)[0] !== 'item') err(p, `{{${t.path}}} — an option label can only read item`);
            for (const f of t.filters) if (!FILTERS[f.name]) err(p, `Unknown template filter "${f.name}"`);
        }
        if (PATH_RE.test(v) && !v.startsWith('$.item')) err(p, 'An option value can only read $.item');
    };
    for (const [name, o] of Object.entries(m.options || {})) {
        const p = `options.${name}`;
        const c = caps[o?.capability];
        if (!c) err(`${p}.capability`, `"${o?.capability}" is not a capability of this module`);
        else if (!READS.has(c.kind)) err(`${p}.capability`, `An option list reads; ${o.capability} is a ${c.kind} capability`);
        checkItemExpr(o?.label, `${p}.label`);
        checkItemExpr(o?.value, `${p}.value`);
        for (const [input, spec] of Object.entries(o?.inputs || {})) {
            if (c && !(input in (c.input || {}))) err(`${p}.inputs.${input}`, `${o.capability} takes no argument "${input}"`);
            if (!spec?.type) err(`${p}.inputs.${input}`, 'Input needs a type');
        }
        if (c) for (const [arg, spec] of Object.entries(c.input || {})) if (spec.required && !(arg in (o.inputs || {}))) err(`${p}.inputs`, `${o.capability} requires "${arg}", so the option list must declare it as an input`);
    }

    // Webhook delivery: how a POST from this provider becomes module events (webhooks.js). Templates may read body,
    // headers (lower-case), query, item (one event of a batch) and parent (the outer item of a two-level batch).
    const w = m.webhook;
    const webhookEvents = Object.entries(m.events || {}).filter(([, e]) => (e.delivery || 'webhook') === 'webhook');
    if (webhookEvents.length && !w) err('webhook', 'This module has webhook events, so it needs a webhook block saying where the topic is');
    if (w) {
        if (!['installation', 'app'].includes(w.scope)) err('webhook.scope', 'installation (a URL per installation) or app (one URL for every account)');
        const tpl = (v, p, roots = ['body', 'headers', 'query', 'item', 'parent']) => {
            for (const t of (Array.isArray(v) ? v : [v])) {
                if (typeof t !== 'string') { err(p, 'A template string, or a list of them'); continue; }
                for (const tag of templateTags(t)) {
                    if (!roots.includes(tag.path.split(/\.|\[/)[0])) err(p, `{{${tag.path}}}: a webhook template can read ${roots.join(', ')}`);
                    for (const f of tag.filters) if (!FILTERS[f.name]) err(p, `Unknown template filter "${f.name}"`);
                }
            }
        };
        if (!w.topic) err('webhook.topic', 'Required: where the provider puts the event type');
        else tpl(w.topic, 'webhook.topic');
        if (w.eventId) tpl(w.eventId, 'webhook.eventId'); else err('webhook.eventId', 'Required: the id that makes a redelivery a no-op');
        if (w.scope === 'app' && !w.account) err('webhook.account', 'An app-level webhook needs account: which connected account an event is about');
        if (w.account) tpl(w.account, 'webhook.account');
        const batch = w.batch == null ? [] : Array.isArray(w.batch) ? w.batch : [w.batch];
        if (batch.length > 2 || batch.some((b) => typeof b !== 'string')) err('webhook.batch', 'A path to the array of events, or [outer, inner] for two levels');
        if (w.verify != null && !/^[A-Za-z_$][\w$]*$/.test(w.verify)) err('webhook.verify', 'Name of an Api method that checks the signature');
        if (w.handshake) {
            try { parseCondition(w.handshake.when); } catch (e) { err('webhook.handshake.when', e.message); }
            if (w.handshake.status != null && !Number.isInteger(w.handshake.status)) err('webhook.handshake.status', 'An HTTP status code');
        }
        if (w.unwrap != null && typeof w.unwrap !== 'string') err('webhook.unwrap', 'The name of a form field holding the JSON body');
    }
    for (const [topic, e] of webhookEvents) {
        if (e.match != null && typeof e.match !== 'string') err(`events.${topic}.match`, 'The provider\'s topic string for this event');
        if (e.when) { try { parseCondition(e.when); } catch (x) { err(`events.${topic}.when`, x.message); } }
    }

    for (const pl of m.ui?.placements || []) if (typeof pl !== 'string') err('ui.placements', 'Placements are strings');
    return { valid: errors.length === 0, errors };
}

module.exports = { validateManifest };
