/**
 * App-scope webhook subscriptions (ADR-054 §2): one set per provider app, shared by every account (HubSpot v3
 * subscriptions belong to the developer app, not to a portal). The desired set is the union over every integration
 * class in the app that enables the extension: a static `use()` option counts once per class, an option that is a
 * function of instance config counts once per ENABLED installation.
 *
 * Reconcile compares that set with what the provider has (`list`), creates what is missing and removes what no binding
 * needs (when the extension has `remove`). It is the hook the three invokers call: the `frigg deploy` post-step, the
 * module's admin script, and the daily trigger (the last two are follow-ups; this is the engine).
 *
 *     subscriptions: {
 *         scope: 'app',
 *         desired: (options) => options.subscribe,             // what one binding needs, as keys
 *         list: (api, env) => api.listWebhookSubscriptions(…), // what the provider has
 *         key: (sub) => 'deal.propertyChange:dealstage',       // a listed subscription as a desired key
 *         create: (api, env, key) => …,
 *         remove: (api, env, sub) => …,                        // optional: without it nothing is torn down
 *     }
 */
const { planOf } = require('./define-integration');
const { resolveOptions, appApiOf, envFor } = require('./extension-binding');

const hasFunctionOption = (binding) => Object.values(binding.options === true ? {} : binding.options || {}).some((v) => typeof v === 'function');

/** Every ENABLED installation of a class, paged by id (what the trigger tick reads). */
function defaultListInstallations() {
    let repository;
    return async function* list(IntegrationClass) {
        if (!repository) repository = require('../repositories/integration-repository-factory').createIntegrationRepository();
        let after;
        for (;;) {
            const page = await repository.findIntegrations({ type: IntegrationClass.Definition.name, status: 'ENABLED', limit: 500, after });
            if (!page?.length) return;
            yield* page;
            if (page.length < 500) return;
            after = page[page.length - 1].id;
        }
    };
}

/**
 * @param {object} params
 * @param {Function[]} params.integrations the app's integration classes (appDefinition.integrations)
 * @param {(Cls: Function) => AsyncIterable<{ id, config }>} [params.listInstallations]
 * @param {boolean} [params.dryRun] plan only
 * @param {object} [params.log]
 * @returns {Promise<Array<{ extension, module, desired: string[], create: string[], remove: string[], kept: string[] }>>}
 */
async function reconcileAppSubscriptions({ integrations = [], listInstallations = defaultListInstallations(), dryRun = false, log } = {}) {
    const groups = new Map();   // ext -> [{ Cls, binding }]
    for (const Cls of integrations) {
        const plan = planOf(Cls);
        for (const binding of plan?.extensionBindings || []) {
            if (binding.ext.subscriptions?.scope !== 'app') continue;
            if (!groups.has(binding.ext)) groups.set(binding.ext, []);
            groups.get(binding.ext).push({ Cls, binding });
        }
    }
    const results = [];
    for (const [ext, entries] of groups) {
        const subs = ext.subscriptions;
        const desired = new Set();
        const want = (options) => { for (const k of subs.desired(options) || []) desired.add(typeof k === 'string' ? k : subs.key(k)); };
        for (const { Cls, binding } of entries) {
            if (!hasFunctionOption(binding)) { want(resolveOptions(binding, {})); continue; }
            for await (const installation of listInstallations(Cls)) {
                try {
                    want(resolveOptions(binding, installation.config || {}));
                } catch (error) {
                    log?.warn?.('Installation options skipped in subscription reconcile', { eventName: 'frigg.subscriptions.options_invalid', integrationId: installation.id, error });
                }
            }
        }
        const { binding } = entries[0];
        const api = appApiOf(binding);
        const env = envFor(ext);
        const existing = (await subs.list(api, env)) || [];
        const keyOf = (s) => (typeof s === 'string' ? s : subs.key ? subs.key(s) : s.key);
        const existingKeys = new Map(existing.map((s) => [keyOf(s), s]));
        const create = [...desired].filter((k) => !existingKeys.has(k));
        const remove = subs.remove ? [...existingKeys.keys()].filter((k) => !desired.has(k)) : [];
        const kept = [...existingKeys.keys()].filter((k) => desired.has(k));
        if (!dryRun) {
            for (const k of create) await subs.create(api, env, k);
            for (const k of remove) await subs.remove(api, env, existingKeys.get(k));
        }
        log?.info?.('Webhook subscriptions reconciled', { eventName: 'frigg.subscriptions.reconciled', extension: ext.name, created: create.length, removed: remove.length, kept: kept.length, dryRun });
        results.push({ extension: ext.name, module: binding.moduleName, desired: [...desired], create, remove, kept });
    }
    return results;
}

module.exports = { reconcileAppSubscriptions };
