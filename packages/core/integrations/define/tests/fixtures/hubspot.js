/**
 * A test stand-in for @friggframework/api-module-hubspot with its webhooks extension on contract 2: the same shape
 * as the module change (api-module-library `claude/hubspot-contract-2`), reduced to what example (a) touches. Real
 * HTTP through core's OAuth2Requester, so tests nock api.hubapi.com.
 */
const crypto = require('crypto');
const { OAuth2Requester } = require('../../../../modules/requester/oauth-2');

const BASE = 'https://api.hubapi.com';
const OBJECT_TYPE_IDS = { contact: '0-1', company: '0-2', deal: '0-3' };

class Api extends OAuth2Requester {
    constructor(params = {}) {
        super(params);
        this.portalId = params.portalId ?? null;
        this.urls = { record: (type, id) => `https://app.hubspot.com/contacts/${this.portalId}/record/${OBJECT_TYPE_IDS[type] || type}/${id}` };
    }
    getOwnerById(id) { return this._get({ url: `${BASE}/crm/v3/owners/${id}` }); }
    batchReadObjects(type, body) { return this._post({ url: `${BASE}/crm/v3/objects/${type}/batch/read`, body }); }
    getPipelineDetails(type) { return this._get({ url: `${BASE}/crm/v3/pipelines/${type}` }); }
    async listWebhookSubscriptions({ appId }) { return (await this._get({ url: `${BASE}/webhooks/v3/${appId}/subscriptions` })).results || []; }
    createWebhookSubscription({ appId, eventType, propertyName }) { return this._post({ url: `${BASE}/webhooks/v3/${appId}/subscriptions`, body: { eventType, ...(propertyName ? { propertyName } : {}), active: true } }); }
    deleteWebhookSubscription({ appId, subscriptionId }) { return this._delete({ url: `${BASE}/webhooks/v3/${appId}/subscriptions/${subscriptionId}` }); }
}

const Definition = { moduleName: 'hubspot', getName: () => 'hubspot', API: Api };

/** HubSpot v3: base64(HMAC-SHA256(secret, method + url + rawBody + timestamp)), 5 minutes. */
function verify(input, { env }) {
    const h = Object.fromEntries(Object.entries(input.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const ts = Number(h['x-hubspot-request-timestamp']);
    if (!env.HUBSPOT_CLIENT_SECRET) return { valid: false, reason: 'missing client secret' };
    if (!h['x-hubspot-signature-v3'] || !Number.isFinite(ts)) return { valid: false, reason: 'missing signature headers' };
    if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) return { valid: false, reason: 'timestamp outside 5 minutes' };
    const body = input.rawBody ?? JSON.stringify(input.body ?? '');
    const expected = crypto.createHmac('sha256', env.HUBSPOT_CLIENT_SECRET).update(`${input.method}${input.url}${body}${h['x-hubspot-request-timestamp']}`).digest('base64');
    const a = Buffer.from(expected), b = Buffer.from(String(h['x-hubspot-signature-v3']));
    return { valid: a.length === b.length && crypto.timingSafeEqual(a, b), reason: 'signature mismatch' };
}

const VERBS = { creation: 'created', propertyChange: 'changed', deletion: 'deleted' };
const PLURAL = { deal: 'deals', contact: 'contacts', company: 'companies' };

async function normalize(batch, { api, options }) {
    const out = [];
    for (const e of batch) {
        const [object, kind] = String(e.subscriptionType || '').split('.');
        if (!PLURAL[object] || !VERBS[kind]) continue;
        if (api && api.portalId == null) api.portalId = String(e.portalId);
        const changes = kind === 'propertyChange' ? { [e.propertyName]: { to: e.propertyValue } } : {};
        let record = { id: String(e.objectId), properties: kind === 'propertyChange' ? { [e.propertyName]: e.propertyValue } : {} };
        if (options.hydrate && kind !== 'deletion') {
            const properties = Array.isArray(options.hydrate) ? options.hydrate : undefined;
            const res = await api.batchReadObjects(PLURAL[object], { inputs: [{ id: String(e.objectId) }], ...(properties ? { properties } : {}) });
            record = res.results?.[0] || record;
        }
        out.push({ name: `${object}.${VERBS[kind]}`, payload: { [object]: record, changes, event: e } });
    }
    return out;
}

const webhooks = {
    name: 'hubspot-webhooks',
    contract: 2,
    requires: { core: '>=2.0.0-next.0 <3' },
    useDatabase: false,
    env: ['HUBSPOT_CLIENT_SECRET', 'HUBSPOT_APP_ID', 'HUBSPOT_DEVELOPER_API_KEY'],
    options: {
        type: 'object',
        properties: {
            subscribe: { type: 'array', items: { type: 'string' } },
            hydrate: { oneOf: [{ type: 'boolean' }, { type: 'array', items: { type: 'string' } }], default: false },
        },
        required: ['subscribe'],
        additionalProperties: false,
    },
    routes: [{ path: '/webhooks', method: 'POST' }],
    verify,
    receive: (input) => (Array.isArray(input.body) ? input.body : []).map((e) => ({ externalId: e?.portalId, body: e })),
    resolve: { module: 'hubspot' },
    emits: {
        'deal.created': {}, 'deal.changed': {}, 'deal.deleted': {},
        'contact.created': {}, 'contact.changed': {}, 'contact.deleted': {},
        'company.created': {}, 'company.changed': {}, 'company.deleted': {},
    },
    normalize,
    subscriptions: {
        scope: 'app',
        desired: (options) => options.subscribe,
        key: (s) => (s.propertyName ? `${s.eventType}:${s.propertyName}` : s.eventType),
        list: (api, env) => api.listWebhookSubscriptions({ appId: env.HUBSPOT_APP_ID }),
        create: (api, env, key) => { const [eventType, propertyName] = key.split(':'); return api.createWebhookSubscription({ appId: env.HUBSPOT_APP_ID, eventType, propertyName }); },
        remove: (api, env, sub) => api.deleteWebhookSubscription({ appId: env.HUBSPOT_APP_ID, subscriptionId: sub.id }),
    },
};

const fields = {
    dealStages: ({ title = 'Deal stage', multiple = false, required = false, default: dflt } = {}) => ({
        module: 'hubspot',
        required,
        schema: multiple ? { type: 'array', title, items: { type: 'string' }, ...(dflt !== undefined ? { default: dflt } : {}) } : { type: 'string', title, ...(dflt !== undefined ? { default: dflt } : {}) },
        options: async (api) => {
            const res = await api.getPipelineDetails('deals');
            return (res.results || []).flatMap((p) => (p.stages || []).map((s) => ({ const: s.id, title: `${p.label}: ${s.label}` })));
        },
    }),
};

module.exports = { Api, Definition, extensions: { webhooks }, fields };
