/**
 * App-scope webhook subscriptions (ADR-054 §2): one set per provider app, shared by every account (HubSpot v3
 * subscriptions belong to the developer app, not to a portal). The desired set is the union over every integration
 * class in the app that enables the extension: a static `use()` option counts once per class, an option that is a
 * function of instance config counts once per ENABLED installation.
 *
 *     subscriptions: {
 *         scope: 'app',
 *         desired: (options) => options.subscribe,             // what one binding needs, as keys
 *         list: (api, env) => api.listWebhookSubscriptions(…), // what the provider has
 *         key: (sub) => 'deal.propertyChange:dealstage',       // a listed subscription as a desired key
 *         create: (api, env, key) => …,
 *         remove: (api, env, sub) => …,                        // used only with prune
 *     }
 *
 * Add-only by default. Reconcile creates what is missing and never removes anything unless it is called with
 * `prune: true`. A dry run reports `create` and `remove` (what pruning would do) and writes nothing. Pruning also
 * needs the full union: when an option depends on installation config and the installations cannot be listed (a
 * deploy step without database access), the group is not pruned and the result says why.
 *
 * Supported setup: one provider developer app per stage. The subscriptions are app-wide, so two stages (or two
 * Frigg apps) that share a developer app would see, and with `prune` remove, each other's subscriptions.
 *
 * Invokers (no recurring trigger):
 *   (a) after deploy: `frigg deploy` (devtools) runs it add-only; `--prune-subscriptions` prunes;
 *   (b) installation lifecycle: create and config update of an installation whose binding options are functions of
 *       its config (`ensureInstallationSubscriptions`, add-only, that installation's needs only);
 *   (c) the admin script (`createReconcileSubscriptionsScript`, with `prune` and `dryRun` inputs).
 */
const { planOf } = require('./define-integration');
const { resolveOptions, appApiOf, envFor } = require('./extension-binding');

const hasFunctionOption = (binding) => Object.values(binding.options === true ? {} : binding.options || {}).some((v) => typeof v === 'function');

/** Every ENABLED installation of a class, paged by id (what the trigger tick reads). Needs the database. */
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

/** The app-scope bindings of some classes, grouped by extension. */
function groupsOf(integrations, only) {
    const groups = new Map();   // ext -> [{ Cls, binding }]
    for (const Cls of integrations) {
        for (const binding of planOf(Cls)?.extensionBindings || []) {
            if (binding.ext.subscriptions?.scope !== 'app') continue;
            if (only && binding.ext.name !== only) continue;
            if (!groups.has(binding.ext)) groups.set(binding.ext, []);
            groups.get(binding.ext).push({ Cls, binding });
        }
    }
    return groups;
}

function keyOf(subs) {
    return (s) => (typeof s === 'string' ? s : subs.key ? subs.key(s) : s.key);
}

/**
 * @param {object} params
 * @param {Function[]} params.integrations the app's integration classes (appDefinition.integrations)
 * @param {((Cls: Function) => AsyncIterable<{ id, config }>)|null} [params.listInstallations] null: no database
 * @param {boolean} [params.prune] remove what no binding needs (default false: add-only)
 * @param {boolean} [params.dryRun] plan only: report create and remove, write nothing
 * @param {string} [params.extension] only this extension (by name)
 * @param {object} [params.log]
 * @returns {Promise<Array<{ extension, module, desired, create, remove, kept, created, removed, complete, pruneSkipped? }>>}
 */
async function reconcileAppSubscriptions({ integrations = [], listInstallations = defaultListInstallations(), prune = false, dryRun = false, extension, log } = {}) {
    const results = [];
    for (const [ext, entries] of groupsOf(integrations, extension)) {
        const subs = ext.subscriptions;
        const desired = new Set();
        let complete = true;
        const want = (options) => { for (const k of subs.desired(options) || []) desired.add(typeof k === 'string' ? k : subs.key(k)); };
        for (const { Cls, binding } of entries) {
            if (!hasFunctionOption(binding)) { want(resolveOptions(binding, {})); continue; }
            if (!listInstallations) { complete = false; continue; }
            for await (const installation of listInstallations(Cls)) {
                try {
                    want(resolveOptions(binding, installation.config || {}));
                } catch (error) {
                    complete = false;
                    log?.warn?.('Installation options skipped in subscription reconcile', { eventName: 'frigg.subscriptions.options_invalid', integrationId: installation.id, error });
                }
            }
        }
        const { binding } = entries[0];
        const api = appApiOf(binding);
        const env = envFor(ext);
        const existing = (await subs.list(api, env)) || [];
        const k = keyOf(subs);
        const existingKeys = new Map(existing.map((s) => [k(s), s]));
        const create = [...desired].filter((key) => !existingKeys.has(key));
        const remove = subs.remove ? [...existingKeys.keys()].filter((key) => !desired.has(key)) : [];
        const kept = [...existingKeys.keys()].filter((key) => desired.has(key));
        let pruneSkipped;
        if (prune && !subs.remove) pruneSkipped = 'the extension has no subscriptions.remove';
        else if (prune && !complete) pruneSkipped = 'installation config could not be read for every binding, so the desired set is incomplete';
        const created = [], removed = [];
        if (!dryRun) {
            for (const key of create) { await subs.create(api, env, key); created.push(key); }
            if (prune && !pruneSkipped) for (const key of remove) { await subs.remove(api, env, existingKeys.get(key)); removed.push(key); }
        }
        log?.info?.('Webhook subscriptions reconciled', { eventName: 'frigg.subscriptions.reconciled', extension: ext.name, created: created.length, removed: removed.length, wouldRemove: remove.length, prune, dryRun });
        results.push({ extension: ext.name, module: binding.moduleName, desired: [...desired], create, remove, kept, created, removed, complete, ...(pruneSkipped ? { pruneSkipped } : {}) });
    }
    return results;
}

/**
 * Lifecycle invoker (b): the subscriptions one installation needs, created when missing. Only bindings whose options
 * are functions of installation config take part (a static option was handled at deploy). Add-only: a deleted or
 * reconfigured installation's old subscriptions stay until a reconcile runs with `prune`.
 * @param {object} integration a hydrated defineIntegration instance
 * @returns {Promise<Array<{ extension, created: string[] }>>}
 */
async function ensureInstallationSubscriptions(integration) {
    const plan = planOf(integration.constructor);
    const out = [];
    for (const binding of plan?.extensionBindings || []) {
        const subs = binding.ext.subscriptions;
        if (subs?.scope !== 'app' || !hasFunctionOption(binding)) continue;
        const desired = (subs.desired(resolveOptions(binding, integration.resolvedConfig())) || []).map((d) => (typeof d === 'string' ? d : subs.key(d)));
        const api = appApiOf(binding);
        const env = envFor(binding.ext);
        const have = new Set(((await subs.list(api, env)) || []).map(keyOf(subs)));
        const created = [];
        for (const key of desired) if (!have.has(key)) { await subs.create(api, env, key); created.push(key); }
        out.push({ extension: binding.ext.name, created });
    }
    return out;
}

/**
 * Admin-script invoker (c): an admin script class (the AdminScriptBase shape, no import needed) that runs the
 * reconcile in the deployed stack, where the installations can be read. Inputs: `prune`, `dryRun` (or
 * `args: ['--prune', '--dry-run']`).
 *
 *     const { createReconcileSubscriptionsScript } = require('@friggframework/core');
 *     module.exports = createReconcileSubscriptionsScript({ name: 'hubspot.reconcile-subscriptions', extension: 'hubspot-webhooks' });
 */
function createReconcileSubscriptionsScript({ name = 'frigg.subscriptions.reconcile', extension, description, loadIntegrations } = {}) {
    return class ReconcileSubscriptionsScript {
        static Definition = {
            name,
            version: '1.0.0',
            description: description || `Create the app-scope webhook subscriptions${extension ? ` of ${extension}` : ''} that installed integrations need; with prune, remove the ones none needs.`,
            source: 'BUILTIN',
            inputSchema: {
                type: 'object',
                properties: {
                    prune: { type: 'boolean', default: false, description: 'Remove subscriptions no binding needs (one developer app per stage only)' },
                    dryRun: { type: 'boolean', default: false, description: 'Report what would be created and removed; change nothing' },
                    args: { type: 'array', items: { type: 'string', enum: ['--prune', '--dry-run'] }, description: 'CLI form of the flags' },
                },
            },
            config: { timeout: 300000, requireIntegrationInstance: false },
            display: { category: 'maintenance', icon: null },
        };

        constructor(params = {}) { this.context = params.context || null; }

        /** `{ prune, dryRun }`, or the CLI form `{ args: ['--prune', '--dry-run'] }`. */
        async execute({ prune = false, dryRun = false, args = [] } = {}) {
            const flags = Array.isArray(args) ? args : String(args).split(/\s+/);
            prune = Boolean(prune) || flags.includes('--prune');
            dryRun = Boolean(dryRun) || flags.includes('--dry-run');
            const integrations = loadIntegrations ? await loadIntegrations() : require('../../handlers/app-definition-loader').loadAppDefinition().integrations;
            const results = await reconcileAppSubscriptions({ integrations, prune: Boolean(prune), dryRun: Boolean(dryRun), extension });
            return { prune: Boolean(prune), dryRun: Boolean(dryRun), results };
        }
    };
}

module.exports = { reconcileAppSubscriptions, ensureInstallationSubscriptions, createReconcileSubscriptionsScript, hasFunctionOption };
