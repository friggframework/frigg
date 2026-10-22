/**
 * A contract-2 extension enabled on a module binding, compiled into the contract-1 binding that `next` already runs
 * (ADR-054 §3). Nothing downstream changes: devtools gives the binding its own function, the defined-routes router
 * mounts it under the binding key, `_mergeExtensions` merges its events, and the queue worker dispatches them.
 *
 * For `modules: { crm: use(hubspot, { webhooks }) }`:
 *
 *   binding key        crm-webhooks           route  /api/{integration}-integration/crm-webhooks/webhooks
 *   function           {integration}__crmwebhooks (devtools, from Definition.extensions as today)
 *   queue events       CRM__WEBHOOKS__RECEIVED (receipt, no DB) -> CRM__WEBHOOKS__RESOLVE (worker, dry)
 *                      -> CRM__WEBHOOKS__DISPATCH (worker, the installation hydrated)
 *                      CRM__WEBHOOKS__DEAL_CHANGED, … one per emitted event (replays, tests)
 *   integration events crm.deal.changed, … (the `on` map)
 *   triggers           crm.<name> (merged into Definition.triggers)
 *
 * Every name derives from the module key, so two modules that both emit `contact.changed`, or the same module bound
 * twice, never collide; no bare name reaches the global event map.
 */
const { check, withDefaults } = require('./json-schema-lite');

const upper = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
const bindingKeyOf = (moduleKey, extKey) => `${moduleKey}-${extKey}`;
const eventPrefixOf = (moduleKey, extKey) => `${upper(moduleKey)}__${upper(extKey)}__`;

function envFor(ext) {
    return Object.fromEntries((ext.env || []).map((k) => [k, process.env[k]]));
}

/**
 * The binding's options for one installation: function values resolved with its config, defaults applied, then
 * checked against the extension's schema.
 */
function resolveOptions(binding, config = {}) {
    const raw = binding.options === true ? {} : binding.options || {};
    const resolved = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'function' ? v(config) : v]));
    const out = withDefaults(binding.ext.options, resolved);
    const problems = check(binding.ext.options, out);
    if (problems.length) throw new Error(`use(${binding.moduleName}, { ${binding.extKey} }) for this installation: ${problems.join('; ')}`);
    return out;
}

/** The Api a verify method or an app-scope subscription runs on: the module's Api class, without a credential. */
function appApiOf(binding) {
    const Api = binding.module.Definition?.API || binding.module.Api;
    return Api ? new Api({}) : null;
}

async function runVerify(binding, input, ctx) {
    const { ext } = binding;
    let out;
    if (typeof ext.verify === 'string') {
        const api = appApiOf(binding);
        if (!api || typeof api[ext.verify] !== 'function') return { valid: false, reason: `the module Api has no ${ext.verify}()` };
        out = await api[ext.verify](input);
    } else {
        out = await ext.verify(input, ctx);
    }
    if (typeof out === 'boolean') return { valid: out, reason: out ? undefined : 'signature check failed' };
    return { valid: Boolean(out?.valid), reason: out?.reason };
}

/** The installations an external account belongs to, among this integration type: the entity reverse lookup. */
async function defaultLookup(IntegrationClass, externalId, moduleName) {
    const { createIntegrationCommands } = require('../../application/commands/integration-commands');
    const commands = createIntegrationCommands({ integrationClass: IntegrationClass });
    const ids = await commands.listIntegrationsByEntityExternalId(String(externalId), moduleName);
    const out = [];
    for (const integrationId of ids || []) {
        const found = await commands.loadIntegrationContextById(integrationId);
        const type = found?.context?.record?.config?.type;
        if (type === undefined || type === IntegrationClass.Definition.name) out.push(integrationId);
    }
    return out;
}

/**
 * @param {object} binding { moduleKey, extKey, ext, module, moduleName, options }
 * @param {object} plan the integration's compiled plan (on handlers), read at call time
 * @returns {{ key: string, compiled: object, emitted: string[], prefix: string }}
 */
function compileBinding(binding) {
    const { moduleKey, extKey, ext } = binding;
    const key = bindingKeyOf(moduleKey, extKey);
    const prefix = eventPrefixOf(moduleKey, extKey);
    const RECEIVED = `${prefix}RECEIVED`;
    const RESOLVE = `${prefix}RESOLVE`;
    const DISPATCH = `${prefix}DISPATCH`;
    const emits = ext.emits || {};
    const emitted = Object.keys(emits).map((n) => `${moduleKey}.${n}`);
    const env = () => envFor(ext);
    const where = `${moduleKey}-${extKey}`;

    /** Receipt: handshake, verification, split. No database: the binding's function has no Prisma layer. */
    async function received({ req, res }) {
        const { webhookRequestFacts } = require('../integration-base');
        const input = { headers: req.headers || {}, body: req.body, query: req.query || {}, params: req.params || {}, ...webhookRequestFacts(req) };
        const ctx = { env: env(), options: binding.options, log: this.logger };
        if (ext.handshake) {
            const h = await ext.handshake(input, ctx);
            if (h) {
                for (const [k, v] of Object.entries(h.headers || {})) res.set(k, String(v));
                res.status(h.status || 200);
                return h.body === undefined ? {} : h.body;
            }
        }
        if (ext.verify) {
            const v = await runVerify(binding, input, ctx);
            if (!v.valid) {
                this.logger.warn('Webhook rejected', { eventName: 'frigg.extension.webhook_rejected', binding: where, reason: v.reason });
                res.status(401);
                return { error: 'invalid signature' };
            }
        }
        const items = (await ext.receive(input, ctx)) || [];
        let queued = 0;
        for (const item of items) {
            if (item?.externalId === undefined || item?.externalId === null) {
                this.logger.warn('Webhook item without an account id skipped', { eventName: 'frigg.extension.webhook_item_skipped', binding: where });
                continue;
            }
            await this.queueWebhook({ event: RESOLVE, externalId: String(item.externalId), body: item.body });
            queued += 1;
        }
        return { received: items.length, queued };
    }

    /** Worker, dry instance: which installations of this integration the account belongs to; one message each. */
    async function resolve({ data = {} } = {}) {
        const Cls = this.constructor;
        const lookup = (externalId, moduleName) => (Cls.lookupInstallations || defaultLookup)(Cls, externalId, moduleName);
        const ids = typeof ext.resolve === 'function'
            ? await ext.resolve({ externalId: data.externalId, body: data.body }, { lookup, env: env(), log: this.logger })
            : await lookup(data.externalId, ext.resolve.module);
        if (!ids?.length) {
            this.logger.info('Webhook for an account with no installation', { eventName: 'frigg.extension.webhook_unresolved', binding: where });
            return { resolved: 0 };
        }
        for (const integrationId of ids) await this.queueWebhook({ event: DISPATCH, integrationId, body: data.body });
        return { resolved: ids.length };
    }

    /** Worker, the installation hydrated: normalize into named events and run the integration's handlers. */
    async function dispatch({ data = {} } = {}) {
        const config = this.resolvedConfig();
        const ctx = { api: this[moduleKey]?.api, options: resolveOptions(binding, config), config, env: env(), log: this.logger };
        const events = ext.normalize ? await ext.normalize([data.body], ctx) : [data.body];
        const results = [];
        for (const e of events || []) results.push(await this.runEmitted(binding, e?.name, e?.payload));
        return { dispatched: results.filter((r) => r === 'handled').length, events: results.length };
    }

    const events = {
        [RECEIVED]: { type: 'LIFE_CYCLE_EVENT', handler: received },
        [RESOLVE]: { type: 'LIFE_CYCLE_EVENT', handler: resolve },
        [DISPATCH]: { type: 'LIFE_CYCLE_EVENT', handler: dispatch },
    };
    for (const name of Object.keys(emits)) {
        events[`${prefix}${upper(name)}`] = {
            type: 'LIFE_CYCLE_EVENT',
            handler: async function emittedEvent({ data = {} } = {}) { return this.runEmitted(binding, name, data.payload); },
        };
    }
    const compiled = {
        extension: {
            name: ext.name,
            useDatabase: ext.useDatabase ?? false,
            routes: (ext.routes || []).map((r) => ({ path: r.path, method: r.method, event: RECEIVED })),
            events,
        },
    };
    return { key, compiled, emitted, prefix };
}

module.exports = { compileBinding, resolveOptions, appApiOf, runVerify, defaultLookup, bindingKeyOf, eventPrefixOf, envFor, upper };
