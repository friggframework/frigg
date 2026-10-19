/**
 * Turning a provider's webhook delivery into the module events a definition listens for. Pure; no I/O.
 *
 * Providers disagree about everything: where the topic is (a body field, a header, two fields combined), whether one
 * POST carries one event or a batch (HubSpot sends an array, QuickBooks nests entities inside notifications), which
 * account it is about, and whether the first request is a handshake to answer synchronously (Slack url_verification,
 * Asana X-Hook-Secret). A manifest says so in its `webhook` block, with the same template expressions definitions
 * use, so none of it is code:
 *
 *   "webhook": {
 *     "scope": "app",                                   // one URL for every account ("installation": one per install)
 *     "batch": "body",                                  // path to the array of events; [outer, inner] for two levels
 *     "topic": "{{item.subscriptionType}}",             // the provider's topic; a list tries each until one is non-empty
 *     "eventId": "{{item.eventId}}",                    // dedupe id
 *     "account": "{{item.portalId}}",                   // the connected account (entity externalId) the event is about
 *     "verify": "verifyWebhookSignature",               // optional Api method: ({ headers, body, query }) -> boolean
 *     "handshake": { "when": "...", "status": 200, "headers": {...}, "body": {...} },
 *     "unwrap": "payload"                               // a form-encoded field holding the JSON body (Slack interactivity)
 *   }
 *
 * and each event says which provider topic it is (`match`, default: the event key) and optionally a condition on the
 * record (`when`): Quo reports a missed call as call.completed with status missed.
 *
 * Template context: { body, headers, query, item, parent }. `item` is the event (the body itself when there is no
 * batch); `parent` is the outer item of a two-level batch (a QuickBooks notification, which carries the realmId).
 */
const { resolve, evaluate, getPath } = require('./expressions');

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** The first template in `tpls` that renders to a non-empty string. */
function renderFirst(tpls, ctx) {
    for (const t of list(tpls)) {
        const v = str(resolve(t, ctx)).trim();
        if (v) return v;
    }
    return '';
}

/** Lower-case header names, as Express and Lambda deliver them, so manifests can always write headers.x-shopify-topic. */
function normaliseHeaders(headers = {}) {
    return Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
}

/** The delivery as the manifest sees it: lower-case headers, and the JSON body unwrapped from a form field if declared. */
function prepare(webhook = {}, delivery) {
    let body = delivery.body;
    if (webhook.unwrap && body && typeof body[webhook.unwrap] === 'string') {
        try { body = JSON.parse(body[webhook.unwrap]); } catch { /* not JSON: leave the body as delivered */ }
    }
    return { body, headers: normaliseHeaders(delivery.headers), query: delivery.query || {} };
}

/** Split one delivery into events: [{ item, parent }]. */
function splitBatch(webhook = {}, input) {
    const paths = list(webhook.batch);
    const at = (obj, p) => (p === 'body' ? obj.body : p === '$' ? obj : getPath(obj, '$.' + p));
    if (!paths.length) return [{ item: input.body, parent: null }];
    const outer = at(input, paths[0]);
    const outerItems = Array.isArray(outer) ? outer : outer == null ? [] : [outer];
    if (paths.length === 1) return outerItems.map((item) => ({ item, parent: null }));
    return outerItems.flatMap((parent) => {
        const inner = getPath(parent, '$.' + paths[1]);
        return (Array.isArray(inner) ? inner : inner == null ? [] : [inner]).map((item) => ({ item, parent }));
    });
}

/**
 * Every module event in one delivery.
 * @param {object} manifest   the module's capability manifest
 * @param {{ body, headers?, query? }} delivery
 * @returns {Array<{ topic: string, providerTopic: string, eventId: string|null, account: string|null, event: object, record: any }>}
 *          topic is the manifest's event key (what definitions name); event is the item the workflow sees as $.event.
 */
function eventsIn(manifest, delivery) {
    const webhook = manifest?.webhook;
    if (!webhook) return [];
    const input = prepare(webhook, delivery);
    const out = [];
    for (const { item, parent } of splitBatch(webhook, input)) {
        const ctx = { ...input, item, parent };
        const providerTopic = renderFirst(webhook.topic, ctx);
        if (!providerTopic) continue;
        const eventId = renderFirst(webhook.eventId, ctx) || null;
        const account = webhook.account ? renderFirst(webhook.account, ctx) || null : null;
        for (const [key, ev] of Object.entries(manifest.events || {})) {
            if (ev.delivery && ev.delivery !== 'webhook') continue;
            if ((ev.match ?? key) !== providerTopic) continue;
            const record = ev.record ? getPath(item, '$.' + ev.record) : item;
            if (ev.when && !evaluate(ev.when, { event: item, record, headers: input.headers, parent })) continue;
            out.push({ topic: key, providerTopic, eventId, account, event: item, record });
        }
    }
    return out;
}

/** A handshake to answer at receipt, before anything is queued: { status, headers, body } or null. */
function handshakeFor(manifest, delivery) {
    const h = manifest?.webhook?.handshake;
    if (!h) return null;
    const ctx = prepare(manifest.webhook, delivery);
    if (!evaluate(h.when, ctx)) return null;
    return { status: h.status || 200, headers: resolve(h.headers || {}, ctx), body: h.body === undefined ? '' : resolve(h.body, ctx) };
}

/**
 * Which module of a definition a delivery came from. The URL names it (?module=<module name>); without that, the one
 * module whose manifest recognises an event in the body. Returns module keys of the definition (usually one).
 */
function modulesFor(def, manifests, delivery) {
    const named = delivery.query?.module;
    const keys = Object.entries(def.modules || {}).filter(([, m]) => (named ? m.module === named : true)).map(([k]) => k);
    if (named) return keys;
    const recognised = keys.filter((k) => eventsIn(manifests[def.modules[k].module], delivery).length > 0);
    return recognised.length === 1 ? recognised : [];
}

module.exports = { eventsIn, handshakeFor, modulesFor, splitBatch, renderFirst, normaliseHeaders };
