/**
 * `defineIntegration` (ADR-054 §1): the code front door to the integration runtime.
 *
 * It returns an ordinary IntegrationBase subclass with a static `Definition` and an instance `events` map: the same
 * compile target an ADR-063 integration document reaches through `fromDefinitionDocument` (definitions/). Builders,
 * routers, the queue worker, the ADR-055 trigger tick and the management API read that target and nothing else, so
 * the two front doors share one runtime; neither is a serialisation of the other.
 *
 *     const DealAlerts = defineIntegration({
 *         name: 'deal-alerts', version: '1.0.0', display: { label, description, category },
 *         modules: { crm: use(hubspot, { webhooks: { subscribe: [...] } }), chat: use(slack) },
 *         config: { channel: slack.fields.channel({ required: true }), minAmount: { type: 'number', default: 0 } },
 *         on: { 'crm.deal.changed': async ({ deal, changes }, { modules: { crm, chat }, config, log }) => { … } },
 *         triggers: { digest: { cron: '0 8 * * 1-5', timezone: 'UTC', handler: async (payload, ctx) => { … } } },
 *         actions: { SEND_TEST: { title: 'Send a test', run: async (input, ctx) => { … } } },
 *         visible: (context) => true,
 *     });
 *
 * Handlers are `(payload, ctx)` and are called without `this`. `ctx` has a fixed set of core-owned keys:
 *     { modules: { <key>: api }, config, log, telemetry, commands, integration }
 * The keys inside `ctx.modules` are the author's (`crm`, `chat`); nothing else in `ctx` is.
 *
 * Compiles to:
 *     Definition.modules        { crm: { definition: hubspot.Definition }, chat: { definition: slack.Definition } }
 *     Definition.extensions     { 'crm-webhooks': <contract-1 binding> }  (extension-binding.js)
 *     Definition.triggers       { digest, 'crm.<ext trigger>' }          (ADR-055, run by Stack B's tick)
 *     this.events               SEND_TEST (USER_ACTION) + the extension's queue events (merged at initialize)
 *     getConfigOptions()        { jsonSchema, uiSchema } with module field choices loaded from the account
 */
const { IntegrationBase } = require('../integration-base');
const { validateTrigger } = require('../triggers');
const { normalizeBinding } = require('./use');
const { validateExtension, isContract2 } = require('./define-extension');
const { compileBinding, resolveOptions } = require('./extension-binding');
const { compileConfig, resolveConfig, configOptions } = require('./config');
const { check, withDefaults } = require('./json-schema-lite');

const SPEC_KEYS = new Set(['name', 'version', 'display', 'usage', 'modules', 'config', 'on', 'triggers', 'actions', 'visible', 'webhooks', 'routes']);
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const ACTION_KEY = /^[A-Z][A-Z0-9_]*$/;
const PLAN = Symbol.for('frigg.define.plan');

/**
 * Module keys that cannot be used: IntegrationBase attaches each module to the instance under its key
 * (`_appendModules`: `this[key] = module`), so a key that names an instance field or method would overwrite it.
 * Inside `ctx.modules` any name is fine; the instance is the constraint.
 */
const INSTANCE_FIELDS = ['id', 'userId', 'entities', 'config', 'status', 'version', 'messages', 'modules', 'record', 'events', 'on',
    'defaultEvents', 'logger', 'telemetry', 'def', 'compiled', 'ports', 'integrationRepository', 'integrationMappingRepository',
    'updateIntegrationStatus', 'updateIntegrationMessages', 'updateIntegrationConfig', 'patchIntegrationConfig', 'triggerProcessRepository',
    'commands', 'constructor'];
let reservedKeys;
function isReservedModuleKey(key) {
    if (!reservedKeys) {
        reservedKeys = new Set(INSTANCE_FIELDS);
        for (let p = IntegrationBase.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
            for (const n of Object.getOwnPropertyNames(p)) reservedKeys.add(n);
        }
        for (const n of ['handlerContext', 'resolvedConfig', 'runEmitted', 'syncInstallationSubscriptions']) reservedKeys.add(n);
    }
    return reservedKeys.has(key) || key.startsWith('_');
}

const pascal = (s) => s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Integration';

function fail(name, msg) {
    throw new Error(`defineIntegration(${name ? `"${name}"` : ''}): ${msg}`);
}

/** Every module binding, each enabled extension validated and compiled. */
function compileModules(name, modules) {
    if (!modules || typeof modules !== 'object' || !Object.keys(modules).length) fail(name, '"modules" must bind at least one API module');
    const bindings = [];
    const extensionBindings = [];
    const definitionModules = {};
    const contract1 = {};
    for (const [key, value] of Object.entries(modules)) {
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) fail(name, `module key "${key}" must be an identifier (it is ctx.modules.${key})`);
        if (isReservedModuleKey(key)) fail(name, `module key "${key}" names a member of IntegrationBase, where modules are also attached (this.${key}); choose another key`);
        const b = normalizeBinding(key, value);
        bindings.push(b);
        definitionModules[key] = { definition: b.module.Definition };
        for (const [extKey, options] of Object.entries(b.extensions)) {
            if (options === false || options === undefined) continue;
            const ext = b.module.extensions?.[extKey];
            if (!ext) fail(name, `modules.${key}: ${b.moduleName} has no extension "${extKey}" (it has ${Object.keys(b.module.extensions || {}).join(', ') || 'none'})`);
            validateExtension(ext, { where: `defineIntegration("${name}") modules.${key}` });
            if (!isContract2(ext)) {
                // A contract-1 bundle binds as it does today, under the derived key; its event names stay global.
                if (options !== true && Object.keys(options || {}).length) fail(name, `modules.${key}: extension "${extKey}" is contract 1 and takes no options`);
                contract1[`${key}-${extKey}`] = { extension: ext };
                continue;
            }
            const raw = options === true ? {} : options;
            // Function values depend on instance config (ADR-054 §4): present now, checked once resolved.
            const problems = check(ext.options, withDefaults(ext.options, raw));
            if (problems.length) fail(name, `use(${b.moduleName}, { ${extKey} }): ${problems.join('; ')}`);
            extensionBindings.push({ moduleKey: key, extKey, ext, module: b.module, moduleName: b.moduleName, options: raw });
        }
    }
    return { bindings, extensionBindings, definitionModules, contract1 };
}

function compileTriggers(name, triggers = {}, extensionBindings) {
    if (typeof triggers !== 'object' || Array.isArray(triggers)) fail(name, '"triggers" must be an object keyed by trigger name');
    const out = {};
    const add = (triggerName, t, handlerOf) => {
        if (out[triggerName]) fail(name, `trigger "${triggerName}" is declared twice`);
        if (typeof t?.handler !== 'function') fail(name, `trigger "${triggerName}": "handler" must be a function (payload, ctx)`);
        const problems = validateTrigger(triggerName, t);
        if (problems.length) fail(name, problems.join('; '));
        out[triggerName] = { ...t, handler: handlerOf(t.handler) };
    };
    // Called by IntegrationBase#onTriggerRun with `this` = the hydrated installation; the author's handler gets ctx.
    const wrap = (fn) => function runTrigger(payload) { return fn(payload, this.handlerContext()); };
    for (const [n, t] of Object.entries(triggers)) {
        if (n.includes('.')) fail(name, `trigger "${n}": dotted names are reserved for module extensions (<moduleKey>.<name>)`);
        add(n, t, wrap);
    }
    for (const b of extensionBindings) {
        for (const [n, t] of Object.entries(b.ext.triggers || {})) {
            // An extension trigger gets the extension ctx (its own api and options), not the integration's.
            add(`${b.moduleKey}.${n}`, t, (fn) => function runExtensionTrigger(payload) {
                const config = this.resolvedConfig();
                return fn(payload, this.handlerContext({ api: this[b.moduleKey]?.api, options: resolveOptions(b, config) }));
            });
        }
    }
    return out;
}

function compileActions(name, actions = {}) {
    if (typeof actions !== 'object' || Array.isArray(actions)) fail(name, '"actions" must be an object keyed by action id');
    const out = {};
    for (const [id, a] of Object.entries(actions)) {
        if (!ACTION_KEY.test(id)) fail(name, `action "${id}": ids are UPPER_SNAKE_CASE (they are USER_ACTION event names)`);
        if (typeof a?.run !== 'function') fail(name, `action "${id}": "run" must be a function (input, ctx)`);
        if (typeof a.title !== 'string' || !a.title) fail(name, `action "${id}": needs a "title"`);
        out[id] = a;
    }
    return out;
}

function defineIntegration(spec = {}) {
    const { name } = spec;
    if (typeof name !== 'string' || !NAME.test(name)) fail(name, '"name" must be lower-kebab-case (it names routes, functions and queues)');
    for (const key of Object.keys(spec)) if (!SPEC_KEYS.has(key)) fail(name, `unknown key "${key}"`);
    if (spec.version !== undefined && typeof spec.version !== 'string') fail(name, '"version" must be a string');
    if (spec.visible !== undefined && typeof spec.visible !== 'function') fail(name, '"visible" must be a function (context) => boolean');

    const { bindings, extensionBindings, definitionModules, contract1 } = compileModules(name, spec.modules);
    const extensions = { ...contract1 };
    const emitted = new Map();   // 'crm.deal.changed' -> { binding, name }
    const internalEvents = new Set();
    for (const b of extensionBindings) {
        const c = compileBinding(b);
        if (extensions[c.key]) fail(name, `two bindings derive the key "${c.key}"`);
        extensions[c.key] = c.compiled;
        for (const ev of Object.keys(c.compiled.extension.events)) internalEvents.add(ev);
        for (const n of Object.keys(b.ext.emits || {})) emitted.set(`${b.moduleKey}.${n}`, { binding: b, name: n });
    }

    const on = spec.on || {};
    if (typeof on !== 'object' || Array.isArray(on)) fail(name, '"on" must be an object keyed by event name');
    for (const [event, handler] of Object.entries(on)) {
        if (typeof handler !== 'function') fail(name, `on["${event}"]: handlers are functions (payload, ctx); method names are not accepted`);
        if (!emitted.has(event)) {
            const known = [...emitted.keys()];
            fail(name, `on["${event}"]: no bound extension emits it${known.length ? ` (bound extensions emit ${known.join(', ')})` : ' (no bound extension emits events)'}`);
        }
    }
    const actions = compileActions(name, spec.actions);
    for (const id of Object.keys(actions)) if (internalEvents.has(id)) fail(name, `action "${id}" collides with an extension event`);
    const triggers = compileTriggers(name, spec.triggers, extensionBindings);
    const configPlan = compileConfig(spec.config, bindings, `defineIntegration("${name}")`);

    const plan = Object.freeze({ name, bindings, extensionBindings, on: { ...on }, actions, configPlan, emitted });

    const Definition = {
        name,
        version: spec.version || '1.0.0',
        modules: definitionModules,
        display: { label: name, description: '', category: '', ...(spec.display || {}) },
        ...(spec.usage ? { usage: spec.usage } : {}),
        ...(Object.keys(extensions).length ? { extensions } : {}),
        ...(Object.keys(triggers).length ? { triggers } : {}),
        ...(spec.webhooks !== undefined ? { webhooks: spec.webhooks } : {}),
        ...(spec.routes ? { routes: spec.routes } : {}),
    };

    class DefinedIntegration extends IntegrationBase {
        static Definition = Definition;

        static [PLAN] = plan;

        constructor(params) {
            super(params);
            for (const [id, a] of Object.entries(actions)) {
                this.events[id] = {
                    type: 'USER_ACTION',
                    userActionType: a.userActionType || 'DATA_ACTION',
                    title: a.title,
                    ...(a.description ? { description: a.description } : {}),
                    handler: (input) => a.run(input ?? {}, this.handlerContext()),
                };
            }
        }

        /** The stored config with the form's defaults filled in: what handlers see as ctx.config. */
        resolvedConfig() {
            return resolveConfig(plan.configPlan, this.config || {});
        }

        /**
         * The context every handler gets (ADR-054 §1). Built per dispatch, frozen. `integration` is a read-only
         * record (ADR-054 open question 6, lean: read-only); `commands` is created on first use. `extra` adds the
         * extension keys (`api`, `options`) for an extension's own handlers.
         */
        handlerContext(extra = {}) {
            const self = this;
            const modules = {};
            for (const b of plan.bindings) {
                Object.defineProperty(modules, b.key, { enumerable: true, get: () => self[b.key]?.api });
            }
            let commands;
            const integration = Object.freeze({
                id: this.id ?? null,
                name: plan.name,
                status: this.status ?? null,
                userId: this.userId ?? null,
                entities: this.entities ?? null,
                version: this.version ?? Definition.version,
            });
            const ctx = {
                modules: Object.freeze(modules),
                config: Object.freeze(this.resolvedConfig()),
                log: this.logger,
                telemetry: this.telemetry,
                integration,
                ...extra,
            };
            Object.defineProperty(ctx, 'commands', {
                enumerable: true,
                get() {
                    if (!commands) {
                        const { createFriggCommands } = require('../../application');
                        commands = createFriggCommands({ integrationClass: self.constructor });
                    }
                    return commands;
                },
            });
            return Object.freeze(ctx);
        }

        /**
         * Run one emitted event: the `on` handler, else the extension's default handler, else ack and count it.
         * @returns {Promise<'handled'|'unhandled'|'undeclared'>}
         */
        async runEmitted(binding, eventName, payload) {
            const full = `${binding.moduleKey}.${eventName}`;
            if (!binding.ext.emits || !Object.prototype.hasOwnProperty.call(binding.ext.emits, eventName)) {
                this.logger.warn('Extension produced an event it does not declare', { eventName: 'frigg.extension.event_undeclared', event: full });
                return 'undeclared';
            }
            const handler = plan.on[full] || binding.ext.emits[eventName].handler;
            if (!handler) {
                try { this.telemetry?.event?.('frigg.extension.event_unhandled', { event: full }); } catch { /* telemetry never breaks dispatch */ }
                this.logger.info('Event has no handler', { eventName: 'frigg.extension.event_unhandled', event: full });
                return 'unhandled';
            }
            await handler(payload, this.handlerContext());
            return 'handled';
        }

        /*
         * Lifecycle invoker for app-scope subscriptions (ADR-054 §2, amended): after the base hook, an installation
         * whose binding options are functions of its config gets the subscriptions it needs, add-only. A failure is
         * a warning on the installation, never a failed create or update.
         * TODO(ADR-054 §5): move these call sites into the lifecycle dispatcher when it lands.
         */
        async onCreate(params) {
            await super.onCreate(params);
            await this.syncInstallationSubscriptions('create');
        }

        async onUpdate(params) {
            await super.onUpdate(params);
            await this.syncInstallationSubscriptions('update');
        }

        async onDelete(params) {
            await super.onDelete(params);
            await this.syncInstallationSubscriptions('delete');
        }

        async syncInstallationSubscriptions(event) {
            const { ensureInstallationSubscriptions, hasFunctionOption } = require('./subscriptions');
            const bindings = plan.extensionBindings.filter((b) => b.ext.subscriptions?.scope === 'app' && hasFunctionOption(b));
            if (!bindings.length) return [];
            if (event === 'delete') {
                // Add-only: nothing to create for an installation that is going away, and removing needs the whole
                // app's union, so its subscriptions stay until a reconcile runs with prune.
                this.logger.info('Subscriptions kept on delete; a pruning reconcile removes the ones no installation needs', { eventName: 'frigg.subscriptions.kept_on_delete', extensions: bindings.map((b) => b.ext.name) });
                return [];
            }
            if (this.status && this.status !== 'ENABLED') return [];
            try {
                return await ensureInstallationSubscriptions(this);
            } catch (error) {
                this.logger.warn('Webhook subscriptions not created', { eventName: 'frigg.subscriptions.ensure_failed', event, error });
                try {
                    await this.updateIntegrationMessages?.execute(this.id, 'warnings', 'Webhook subscriptions not created', 'The provider subscriptions this installation needs could not be created. They are retried on the next config save or reconcile.', Date.now());
                } catch { /* a report, never a failure */ }
                return [];
            }
        }

        async getConfigOptions() {
            return configOptions(plan.configPlan, (key) => this[key]?.api, this.config || {}, this.logger);
        }

        async refreshConfigOptions(params = {}) {
            const values = params?.data ?? params?.formData ?? params ?? {};
            return configOptions(plan.configPlan, (key) => this[key]?.api, { ...(this.config || {}), ...values }, this.logger);
        }
    }
    Object.defineProperty(DefinedIntegration, 'name', { value: pascal(name) });
    if (spec.visible) DefinedIntegration.visible = spec.visible;
    return DefinedIntegration;
}

/** The compiled plan of a class made by defineIntegration, or null for any other class. */
const planOf = (Cls) => (Cls && Object.prototype.hasOwnProperty.call(Cls, PLAN) ? Cls[PLAN] : null);

module.exports = { defineIntegration, planOf };
