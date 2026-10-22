/**
 * Extension contract 2 (ADR-054 §2): what an API module's extension may declare beyond contract 1's routes and
 * events. Everything is optional, and a contract-1 bundle (no `contract`, or `contract: 1`) stays valid as it is.
 *
 *     module.exports = defineExtension({            // or a plain object with `contract: 2`: modules need no core import
 *         name: 'hubspot-webhooks',
 *         contract: 2,
 *         requires: { core: '>=2.0.0-next.0 <3' },
 *         useDatabase: false,
 *         env: ['HUBSPOT_CLIENT_SECRET'],
 *         options: { type: 'object', properties: { subscribe: {...}, hydrate: {...} } },   // schema of use(m, { <key>: opts })
 *         routes: [{ path: '/webhooks', method: 'POST' }],
 *         handshake: (input, ctx) => ({ status, headers, body }) | null,     // answered at receipt, nothing queued
 *         verify: (input, ctx) => ({ valid, reason }) | boolean,             // or the name of an Api method (see below)
 *         receive: (input, ctx) => [{ externalId, body }],                   // split one delivery, at receipt (no DB)
 *         resolve: { module: 'hubspot' },                                    // externalId -> installations, in the worker
 *         emits: { 'deal.changed': {}, ... },                               // integration-facing names, prefixed by the module key
 *         normalize: async (batch, ctx) => [{ name: 'deal.changed', payload }],   // in the worker, with the installation's api
 *         subscriptions: { scope: 'app', desired, list, create, remove, key },
 *         triggers: {},                                                      // ADR-055 shape, merged as `<moduleKey>.<name>`
 *         events: {},                                                        // contract-1 escape hatch
 *     });
 *
 * `input` is the delivery as signature checks need it, the same object Stack B's runtime passes to a capability
 * manifest's `webhook.verify` (IntegrationBase#webhookVerificationInput): `{ headers, body, query, rawBody, method, url }`.
 * `verify` may name an Api method instead of being a function: that is how a capability manifest names it too, so a
 * module declares how deliveries are verified once, on its Api (`verifyWebhookSignature`), for both front doors.
 *
 * Not in the stable 2.0.1 path (ADR-054 decisions 2026-10-03): `subscriptions.scope: 'instance'` (experimental),
 * extension `queues`/`workers` (ADR-047), `scripts` and `lifecycle` (follow-up in this PR's checklist).
 */
const CORE_VERSION = require('../../package.json').version;

const STABLE_KEYS = new Set([
    'name', 'contract', 'requires', 'useDatabase', 'env', 'options', 'routes', 'handshake', 'verify', 'receive',
    'resolve', 'emits', 'normalize', 'subscriptions', 'triggers', 'events', 'description',
]);
const LATER_KEYS = new Set(['scripts', 'lifecycle', 'queues', 'workers', 'fields']);
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

// ---- a tiny semver range check: space-separated comparators (>=, >, <=, <, =), prereleases ordered as semver does.
function parseVersion(v) {
    const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/.exec(String(v).trim());
    if (!m) return null;
    return { nums: [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)], pre: m[4] ? m[4].split('.') : [] };
}
function compareVersions(a, b) {
    for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] < b.nums[i] ? -1 : 1;
    if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
    for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
        const x = a.pre[i], y = b.pre[i];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
        if (nx && ny && Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
        if (nx !== ny) return nx ? -1 : 1;
        if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
}
function satisfies(version, range) {
    const v = parseVersion(version);
    if (!v) return false;
    return String(range).trim().split(/\s+/).every((part) => {
        const m = /^(>=|<=|>|<|=)?(.+)$/.exec(part);
        const target = parseVersion(m[2]);
        if (!target) return false;
        const c = compareVersions(v, target);
        switch (m[1] || '=') {
            case '>=': return c >= 0;
            case '>': return c > 0;
            case '<=': return c <= 0;
            case '<': return c < 0;
            default: return c === 0;
        }
    });
}

const contractOf = (ext) => (ext && ext.contract !== undefined ? ext.contract : 1);
const isContract2 = (ext) => contractOf(ext) === 2;

/**
 * Validate a contract-2 bundle. Throws with the extension name and what is wrong. Returns the bundle.
 * @param {object} ext
 * @param {{ coreVersion?: string, where?: string }} [opts]
 */
function validateExtension(ext, { coreVersion = CORE_VERSION, where } = {}) {
    const name = ext?.name || '(unnamed)';
    const fail = (msg) => { throw new Error(`${where ? `${where}: ` : ''}extension "${name}" ${msg}`); };
    if (!ext || typeof ext !== 'object') fail('must be an object');
    if (typeof ext.name !== 'string' || !ext.name) fail('needs a "name"');
    const contract = contractOf(ext);
    if (contract !== 1 && contract !== 2) fail(`declares contract ${contract}; this core supports contracts 1 and 2`);
    if (contract === 1) return ext;
    if (ext.requires?.core && !satisfies(coreVersion, ext.requires.core)) {
        fail(`requires @friggframework/core ${ext.requires.core}, but this is ${coreVersion}`);
    }
    for (const key of Object.keys(ext)) {
        if (key === 'fields') fail('declares "fields": config fields are a module export (module.fields), so a module bound without an extension can offer them');
        if (LATER_KEYS.has(key)) fail(`declares "${key}", which the stable defineIntegration does not run yet (ADR-054 phasing)`);
        if (!STABLE_KEYS.has(key)) fail(`has an unknown key "${key}"`);
    }
    if (ext.useDatabase !== undefined && typeof ext.useDatabase !== 'boolean') fail('"useDatabase" must be a boolean');
    if (ext.env !== undefined && (!Array.isArray(ext.env) || ext.env.some((e) => typeof e !== 'string'))) fail('"env" must be a list of variable names');
    if (ext.options !== undefined && (typeof ext.options !== 'object' || ext.options === null)) fail('"options" must be a JSON Schema object');
    for (const fn of ['handshake', 'receive', 'normalize']) {
        if (ext[fn] !== undefined && ext[fn] !== null && typeof ext[fn] !== 'function') fail(`"${fn}" must be a function`);
    }
    if (ext.verify !== undefined && ext.verify !== null && typeof ext.verify !== 'function' && typeof ext.verify !== 'string') {
        fail('"verify" must be a function or the name of an Api method');
    }
    const routes = ext.routes || [];
    if (!Array.isArray(routes)) fail('"routes" must be an array');
    for (const r of routes) {
        if (!r || typeof r.path !== 'string' || !r.path.startsWith('/')) fail('has a route without a "/path"');
        if (typeof r.method !== 'string' || !METHODS.has(r.method.toLowerCase())) fail(`route ${r.path} has an unsupported method`);
        if (r.event !== undefined) fail(`route ${r.path} names an "event": a contract-2 route is received by core (receive/verify/resolve), not by an event`);
    }
    if (routes.length && typeof ext.receive !== 'function') fail('has routes but no "receive"');
    if (routes.length && !ext.resolve) fail('has routes but no "resolve"');
    if (ext.resolve && typeof ext.resolve !== 'function' && typeof ext.resolve?.module !== 'string') fail('"resolve" must be { module } or a function');
    if (ext.emits !== undefined && (typeof ext.emits !== 'object' || Array.isArray(ext.emits))) fail('"emits" must be an object keyed by event name');
    for (const [k, v] of Object.entries(ext.emits || {})) {
        if (!/^[a-z][A-Za-z0-9_-]*(\.[a-z][A-Za-z0-9_-]*)*$/.test(k)) fail(`emits "${k}": names are dotted lower-camel words (deal.changed)`);
        if (v?.handler !== undefined && typeof v.handler !== 'function') fail(`emits "${k}": "handler" must be a function`);
    }
    const subs = ext.subscriptions;
    if (subs) {
        if (subs.scope === 'instance') fail('declares instance-scope subscriptions, which are experimental (@friggframework/core/experimental)');
        if (subs.scope !== 'app') fail('subscriptions.scope must be "app"');
        for (const fn of ['desired', 'list', 'create']) if (typeof subs[fn] !== 'function') fail(`subscriptions.${fn} must be a function`);
        for (const fn of ['remove', 'key']) if (subs[fn] !== undefined && typeof subs[fn] !== 'function') fail(`subscriptions.${fn} must be a function`);
    }
    if (ext.triggers !== undefined && (typeof ext.triggers !== 'object' || Array.isArray(ext.triggers))) fail('"triggers" must be an object');
    return ext;
}

/** Core's helper for module authors: validates and freezes a contract-2 bundle. A plain object works the same. */
function defineExtension(ext) {
    const bundle = { contract: 2, ...ext };
    validateExtension(bundle);
    return Object.freeze(bundle);
}

module.exports = { defineExtension, validateExtension, isContract2, contractOf, satisfies, CORE_VERSION };
