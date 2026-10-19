/**
 * DataDefinedIntegration: one IntegrationBase subclass that runs any published definition.
 *
 * Frigg registers integration classes at startup (appDefinition.integrations). For data-defined integrations the app
 * registers one generated class per definition id:
 *
 *     const { defineIntegrationClass } = require('@friggframework/core/integrations/data-defined');
 *     integrations: [ defineIntegrationClass({ id: 'quo-hubspot', definitions, manifests, modules: { quo: QuoModule, hubspot: HubSpotModule } }) ]
 *
 * The class's static Definition (name, modules) is what the infrastructure needs, and it is the same for every
 * version, so publishing a new version deploys nothing. Each installation loads the exact version it pins
 * (record.config.definition.version) when it is hydrated, compiles it with that installation's choices, and gets an
 * ordinary `this.events` map. Everything after that is the existing Frigg machinery: the event dispatcher, the
 * queue worker, the scheduler and the mapping repository.
 *
 * Ports used: definitions.get(id, version) -> definition doc (immutable; cache freely)
 *             runCode(ref, args) -> registered code steps (optional)
 */
const { compile, routeWebhook, eventName } = require('./compile');
const { makePorts, runWorkflow, resumeWorkflow, runQuery, renderSurface, runLifecycle, resolveOptions, installContext } = require('./runtime');
const { createSyncEngine } = require('./sync-engine');
const { eventsIn, handshakeFor, modulesFor } = require('./webhooks');
const { buildConfigForm, missingRequired } = require('./config-form');

/**
 * Shape A — one class per definition id (defineIntegrationClass): the class name and modules come from the
 * definition. Publishing a new VERSION deploys nothing; a new definition ID is a new class (a deploy, and its own
 * functions and queue). Right for a product team with a handful of integrations.
 *
 * Shape B — one class for every definition (defineSharedIntegrationClass): registered once as "data-defined", its
 * static modules are every API module the app has installed, and each installation names its definition id and
 * version in config. A new integration is a row, not a deploy, and every installation shares one set of functions
 * and one queue. Right for The Integrator, where definitions accumulate without bound.
 */
function defineIntegrationClass({ id, definitions, manifests, modules, runCode, IntegrationBase, lookup, runs }) {
    const latest = definitions.latest(id);
    if (!latest || typeof latest.then === 'function') throw new Error(`defineIntegrationClass needs the definitions of "${id}" synchronously at registration (bundled files); a database store goes with defineSharedIntegrationClass`);
    return makeClass({
        name: latest.id, defaultId: id, definitions, manifests, runCode, IntegrationBase, lookup, runs,
        modules: Object.fromEntries(Object.keys(latest.modules).map((key) => [key, { definition: modules[key] }])),
        display: { label: latest.display.label, description: latest.display.description, category: latest.display.category },
        version: latest.version,
    });
}

function defineSharedIntegrationClass({ name = 'data-defined', definitions, manifests, modules, runCode, IntegrationBase, lookup, runs }) {
    return makeClass({
        name, defaultId: null, definitions, manifests, runCode, IntegrationBase, lookup, runs,
        modules: Object.fromEntries(Object.entries(modules).map(([key, definition]) => [key, { definition }])),
        display: { label: 'Data-defined integration', description: 'Runs any published integration definition.', category: 'Custom' },
        version: '0.1.0',
    });
}

/**
 * App-level webhooks (one URL for every account: HubSpot, Stripe Connect, GitHub Apps) arrive with no integration id.
 * The default lookup finds the installations of THIS class connected to that account, using Frigg's commands: the
 * entity reverse lookup, then each candidate's record, because one account can be used by integrations of other
 * types too, and the worker would hydrate those as their own class.
 */
/**
 * A code integration that also embeds a definition: the class keeps its own name, modules, handlers and lifecycle,
 * and gains what a published integration has — workflows (with delay and approval pauses), syncs, the generated
 * configure form, UI surfaces, versions and run history — through the same records and routes. Code is the escape
 * hatch inside it: a `code` step whose ref is `#<method>` calls that method on the integration.
 *
 *     class HubspotSlack extends IntegrationBase { static Definition = { name: 'hubspot-slack', modules, … }; … }
 *     module.exports = extendIntegrationClass(HubspotSlack, { definition: require('./hubspot-slack.definition.json'), manifests });
 *
 * What the definition does not declare stays the code's: with no webhook-triggered workflow or sync the class's own
 * webhook handling runs; with no settings, its own configure form; its own schedules run beside the compiled ones.
 */
function extendIntegrationClass(CodeClass, { definition, manifests, runCode, runs, lookup }) {
    const name = CodeClass?.Definition?.name;
    if (!name) throw new Error('extendIntegrationClass needs an IntegrationBase subclass with a static Definition.name');
    if (!definition || definition.id !== name) throw new Error(`The definition embedded in "${name}" must have the id "${name}" (it has "${definition?.id}")`);
    const { validate } = require('./validate');
    const codeMethods = [];
    for (let proto = CodeClass.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
        for (const k of Object.getOwnPropertyNames(proto)) if (k !== 'constructor' && typeof Object.getOwnPropertyDescriptor(proto, k).value === 'function') codeMethods.push(k);
    }
    const problems = (validate(definition, manifests, { codeMethods }).errors || []);
    if (problems.length) throw new Error(`The definition embedded in "${name}" is not valid: ${problems.map((e) => `${e.path || ''} ${e.message}`.trim()).join('; ')}`);
    return makeClass({
        name, defaultId: name, definitions: memoryDefinitions([definition]), manifests, runCode, IntegrationBase: CodeClass, lookup, runs,
        modules: CodeClass.Definition.modules, display: CodeClass.Definition.display, version: CodeClass.Definition.version, embedded: true,
    });
}

/** Whether a definition receives webhooks itself (a webhook-triggered workflow or a webhook-driven sync). */
const ownsWebhooks = (def) => Boolean((def?.workflows || []).some((w) => w.trigger?.type === 'webhook') || (def?.syncs || []).some((sy) => sy.ongoing?.mode === 'webhook'));
/** Whether a definition generates the configure form (it declares settings, at its level or a workflow's). */
const ownsConfigForm = (def) => Boolean(Object.keys(def?.settings || {}).length || (def?.workflows || []).some((w) => Object.keys(w.settings || {}).length));

function friggLookup(accepts) {
    return async (externalId, moduleName) => {
        const { createIntegrationCommands } = require('../../application/commands/integration-commands');
        const commands = createIntegrationCommands();
        const ids = await commands.listIntegrationsByEntityExternalId(externalId, moduleName);
        const out = [];
        for (const integrationId of ids) {
            const found = await commands.loadIntegrationContextById(integrationId);
            if (await accepts(found?.context?.record?.config?.type)) out.push(integrationId);
        }
        return out;
    };
}

function makeClass({ name, defaultId, definitions, manifests, runCode, IntegrationBase, modules, display, version, lookup, runs, embedded = false }) {
    const Base = IntegrationBase || require('../integration-base').IntegrationBase;
    const id = name;
    // Where workflow runs are kept: the WorkflowRun table by default (loaded lazily, so tests and tools without a
    // database can pass their own store or `false` to keep none).
    let runStore = runs;
    // App-level webhooks fan out to the installations of every type this deployment runs.
    const findInstallations = (externalId, moduleName, Cls) => (lookup || friggLookup(async (type) => type === id || type === Cls.Definition.name || Boolean(await DataDefinedIntegration.IntegrationProvider?.resolve(type))))(externalId, moduleName);
    const runRepository = () => (runStore === undefined ? (runStore = require('./repositories/workflow-run-repository').createWorkflowRunRepository()) : runStore);
    const baseFor = (typeName) => `${process.env.FRIGG_PUBLIC_URL || ''}/api/${typeName}-integration/webhooks`;

    class DataDefinedIntegration extends Base {
        // version is display only; installations pin their own. A code class keeps every part of its Definition.
        static Definition = embedded ? { ...Base.Definition, webhooks: Base.Definition.webhooks ?? { enabled: true } } : { name, version, modules, webhooks: { enabled: true }, display };

        /** How the routers find data-defined classes and the store and manifests they run on. */
        static DataDefined = { definitions, manifests, shared: !defaultId, runs: () => runRepository() };

        /** Shape A: the one definition this class runs. A class generated for a published definition sets its own. */
        static definitionId = defaultId;

        /**
         * Frigg's use cases construct an integration from its record and call initialize() before anything else
         * (create, update, delete, webhooks, user actions, config options). So this is where the pinned definition is
         * loaded: every real entry point hydrates through here. A dry instance (no record, e.g. an app-level webhook
         * before its installation is known) has no pin and loads nothing.
         */
        async initialize() {
            if (this.config?.definition || this.constructor.definitionId) await this.loadDefinition();
            return super.initialize();
        }

        async loadDefinition() {
            const fixedId = this.constructor.definitionId;
            let pin = this.config?.definition || (fixedId ? { id: fixedId } : null);
            if (fixedId && pin.id !== fixedId) throw new Error(`This installation pins "${pin.id}", but its type is "${fixedId}"`);
            if (!pin?.id) throw new Error('This installation does not name a definition (config.definition.id)');
            // A definition embedded in code ships with the code: an installation runs the version deployed now.
            if (embedded) pin = { id: pin.id };
            if (!pin.version) {
                // Installed by id alone: pin the latest published version now (onCreate persists the pin).
                const latest = await definitions.latest(pin.id);
                if (!latest) throw new Error(`No published version of "${pin.id}"`);
                pin = { id: pin.id, version: latest.version, checksum: await definitions.checksumOf?.(pin.id, latest.version) || undefined };
                // Persisted by onCreate, so this installation stays on this version until it is upgraded.
                this.config = { ...(this.config || {}), definition: pin };
            }
            this.def = await definitions.get(pin.id, pin.version, { checksum: pin.checksum });
            if (!this.def) throw new Error(`Definition ${pin.id}@${pin.version} is not published`);
            this.compiled = compile(this.def, this.config || {});
            this.ports = this.portsFor(this.def);
            // Replace, not merge: a workflow switched off since the last compile must lose its event.
            for (const n of this.compiledEventNames || []) delete this.events[n];
            this.compiledEventNames = Object.keys(this.compiled.events);
            for (const [n, e] of Object.entries(this.compiled.events)) {
                this.events[n] = { ...e, handler: (payload) => this.dispatch(e.ref, payload) };
            }
            this.registerEventHandlers();
            return this.def;
        }

        /** Ports for a definition: Api calls through the manifest, and links/dedupe over IntegrationMapping. */
        portsFor(def) {
            return makePorts({
                def, manifests,
                // `#method` is a method of this integration (a code class embedding a definition); anything else is a
                // registered code step.
                runCode: (ref, args) => {
                    if (typeof ref === 'string' && ref.startsWith('#')) {
                        const fn = this[ref.slice(1)];
                        if (typeof fn !== 'function') throw new Error(`code: this integration has no method "${ref.slice(1)}"`);
                        return fn.call(this, args);
                    }
                    if (!runCode) throw new Error('code: this runtime has no code steps registered');
                    return runCode(ref, args);
                },
                // The shared class registers modules by module name; a definition may name them by its own keys.
                callApi: (moduleKey, method, args) => this.moduleFor(moduleKey).api[method](args),
                store: this.mappingStore(),
            });
        }

        /** Key-value rows in IntegrationMapping: links, dedupe claims and sync progress all live here. */
        mappingStore() {
            return {
                get: async (key) => (await this.getMapping(key))?.mapping || null,
                put: (key, value) => this.upsertMapping(key, value),
                claim: async (key, value) => { try { await this.createMapping(key, value); return true; } catch (e) { if (e.name === 'MappingAlreadyExistsError') return false; throw e; } },
                release: (key) => this.deleteMapping(key),
            };
        }

        moduleFor(key) {
            const m = this[key] || this[this.def?.modules?.[key]?.module];
            if (!m?.api) throw new Error(`Module "${key}" is not connected to this installation`);
            return m;
        }

        async dispatch(ref, payload = {}) {
            const msg = payload.data || payload;
            if (msg.resume) return this.resumeRun(msg.resume, msg);   // a paused run carries on (its own version)
            // A message queued under an older version runs on that version (an upgrade drains, it never re-interprets).
            const def = msg.definitionVersion && msg.definitionVersion !== this.def.version
                ? await definitions.get(this.def.id, msg.definitionVersion) || this.def
                : this.def;
            const installation = this.installation();
            // A scheduled tick may be delivered twice; its scheduled time makes the dedupe id (an unfilled
            // placeholder, from a host that cannot supply it, is not an id).
            const scheduledFor = msg.tick?.scheduledFor && !String(msg.tick.scheduledFor).startsWith('{{') ? msg.tick.scheduledFor : null;
            const eventId = msg.eventId || (scheduledFor ? `tick:${msg.scheduleKey}:${scheduledFor}` : undefined);
            if (ref.kind === 'workflow') return this.recordRun(await runWorkflow({ def, installation, workflowId: ref.id, event: msg.body ?? msg, eventId, record: msg.record, ports: this.ports, manifests }));
            if (ref.kind === 'query') return runQuery({ def, installation, queryId: ref.id, record: msg.record, ports: this.ports });
            if (ref.kind === 'ui') return renderSurface({ def, installation, surfaceId: ref.id, record: payload.req?.body?.record || msg.record, ports: this.ports });
            if (ref.kind === 'sync') return this.runSync(ref, msg);
            throw new Error(`Unknown event ref ${JSON.stringify(ref)}`);
        }

        /**
         * Receipt (no database): answer a provider handshake synchronously (Slack url_verification, Asana
         * X-Hook-Secret), otherwise queue the delivery as Frigg always does. The URL names the module (?module=).
         */
        async onWebhookReceived({ req, res }) {
            if (embedded && !ownsWebhooks(this.def)) return super.onWebhookReceived({ req, res });
            const manifest = manifests[req.query?.module];
            const h = manifest && handshakeFor(manifest, { body: req.body, headers: req.headers, query: req.query });
            if (h) {
                for (const [k, v] of Object.entries(h.headers || {})) res.set(k, String(v));
                return typeof h.body === 'object' ? res.status(h.status).json(h.body) : res.status(h.status).send(h.body);
            }
            return super.onWebhookReceived({ req, res });
        }

        /**
         * Worker side of a raw delivery. Without an installation (an app-level webhook), find the installations
         * connected to each account the delivery is about and queue it for each. With one: verify it, split it into
         * module events, and queue one message per enabled workflow listening for each event.
         */
        async onWebhook(params) {
            if (embedded && !ownsWebhooks(this.def)) return super.onWebhook(params);
            const { data = {} } = params || {};
            if (data.module && data.topic) return this.routeEvents(data.module, [{ topic: data.topic, event: data.body, eventId: data.eventId || data.body?.id || null }]);
            const delivery = { body: data.body, headers: data.headers || {}, query: data.query || {} };
            // No installation yet (an app-level webhook): find the ones it is for.
            if (!this.id || !this.def) return this.fanOutAppWebhook(delivery);

            const keys = modulesFor(this.def, manifests, delivery);
            if (keys.length !== 1) { this.logWebhook('webhook.unrouted', { module: delivery.query.module || null, candidates: keys }); return { routed: 0 }; }
            const key = keys[0];
            const manifest = manifests[this.def.modules[key].module];
            if (manifest.webhook?.verify) {
                let ok = false;
                try { ok = await this.moduleFor(key).api[manifest.webhook.verify]({ headers: delivery.headers, body: delivery.body, query: delivery.query }); } catch { ok = false; }
                if (ok !== true) { this.logWebhook('webhook.rejected', { module: key }); return { routed: 0, rejected: true }; }
            }
            const own = this.accountOf(key);
            const events = eventsIn(manifest, delivery).filter((e) => manifest.webhook?.scope !== 'app' || !own || !e.account || String(e.account) === String(own));
            return this.routeEvents(key, events);
        }

        async routeEvents(moduleKey, events) {
            let routed = 0;
            for (const e of events) {
                for (const n of routeWebhook(this.compiled, moduleKey, e.topic)) {
                    await this.queueWebhook({ event: n, integrationId: this.id, module: moduleKey, topic: e.topic, body: e.event, eventId: e.eventId, definitionVersion: this.def.version });
                    routed += 1;
                }
            }
            return { routed };
        }

        async fanOutAppWebhook(delivery) {
            const moduleName = delivery.query.module;
            const manifest = manifests[moduleName];
            if (!manifest?.webhook?.account) { this.logWebhook('webhook.unrouted', { module: moduleName || null, reason: 'no installation and no account to look it up by' }); return { queued: 0 }; }
            const accounts = new Set(eventsIn(manifest, delivery).map((e) => e.account).filter(Boolean));
            let queued = 0;
            for (const account of accounts) {
                for (const integrationId of await findInstallations(account, moduleName, this.constructor)) {
                    await this.queueWebhook({ integrationId, body: delivery.body, headers: delivery.headers, query: delivery.query });
                    queued += 1;
                }
            }
            return { queued };
        }

        /** The connected account's id for a module (its entity externalId): what app-level events are matched on. */
        accountOf(key) {
            const m = this[key] || this[this.def?.modules?.[key]?.module] || this.modules?.[this.def?.modules?.[key]?.module];
            return m?.entity?.externalId ?? null;
        }

        logWebhook(eventName, fields) {
            try { require('../../logs').getLogger('frigg.data-defined').info('Webhook not routed', { eventName: `frigg.data-defined.${eventName}`, integrationId: this.id || null, ...fields }); } catch { /* logging must never break delivery */ }
        }

        async onCreate(params) {
            if (!this.def) await this.loadDefinition();
            const out = await runLifecycle({ def: this.def, installation: this.installation(), hook: 'onInstall', ports: this.ports });
            // Every onInstall step with an id keeps its result, so onUninstall can undo exactly what install did
            // ($.install.runtime.installed.<step id>). Saved even when empty, so a re-install replaces stale ids.
            const installed = Object.fromEntries((this.def.lifecycle?.onInstall || []).filter((st) => st.id).map((st) => [st.id, out.steps?.[st.id] ?? null]));
            await this.patchConfig({ definition: this.config.definition, runtime: { ...(this.config?.runtime || {}), installed } });
            const result = await super.onCreate(params);
            // Syncs that copy what already exists at install time start their backfill now (through the queue).
            for (const sy of this.def.syncs || []) {
                if (sy.backfill?.trigger === 'onInstall' && this.compiled.events[eventName('SYNC', sy.id, 'PAGE')]) await this.startBackfill(sy.id, 'install');
            }
            return result;
        }

        async onUpdate(params) {
            await super.onUpdate(params);           // merges config (enabled workflows, settings, mapping overrides)
            return this.loadDefinition();           // recompile: enabling a workflow adds its event, disabling removes it
        }

        async onDelete(params) {
            if (!this.def) await this.loadDefinition();
            await runLifecycle({ def: this.def, installation: this.installation(), hook: 'onUninstall', ports: this.ports });
            return super.onDelete(params);
        }

        /**
         * The recurring schedules this installation should have: the definition's schedule-triggered workflows and
         * polling syncs that are switched on, with the installation's timing where the definition allows it.
         * Compiled from the current config every time, so the base class's onUpdate (which patches config, then
         * reconciles) schedules what was just chosen. The base class's onCreate, onUpdate and onDelete keep the host
         * in step (IntegrationBase.syncSchedules).
         */
        scheduleEntries() {
            const compiled = this.def ? compile(this.def, this.config || {}).schedules : [];
            return embedded && typeof super.scheduleEntries === 'function' ? [...super.scheduleEntries(), ...compiled] : compiled;
        }

        /**
         * The queue worker's seam (IntegrationEventDispatcher.dispatchJob): a code integration's own queued events are
         * runs too, recorded in the same history as its workflows. Compiled events record their own runs (with steps).
         * As with workflows, the history never decides the outcome: a failed write is logged and the handler's result
         * or error stands.
         */
        async runEvent(event, invoke) {
            if (!embedded || (this.compiledEventNames || []).includes(event)) return invoke();
            const startedAt = new Date().toISOString();
            const write = async (status, error) => {
                try {
                    const store = runRepository();
                    if (store) await store.createRun({ integrationId: this.id, definitionId: name, definitionVersion: this.def?.version, workflowId: event, triggerType: 'code', status, error: error ? String(error.message || error) : null, retryable: Boolean(error), trace: [], startedAt, endedAt: new Date().toISOString() });
                } catch (e) {
                    try { require('../../logs').getLogger('frigg.data-defined').warn('Workflow run not recorded', { eventName: 'frigg.data-defined.run.not_recorded', integrationId: this.id, workflowId: event, cause: e?.message }); } catch { /* ignore */ }
                }
            };
            let out;
            try { out = await invoke(); } catch (e) { await write('failed', e); throw e; }
            await write('completed');
            return out;
        }

        /** The configure form (GET /api/integrations/:id/config/options), generated from the definition. */
        async getConfigOptions() {
            if (embedded && !ownsConfigForm(this.def)) return super.getConfigOptions();
            return buildConfigForm(this.def, this.config || {}, (path, values, integrationSettings) => this.optionsFor(path, values, integrationSettings));
        }

        /** The same form re-filled from the values chosen so far (POST …/config/options/refresh): dependent dropdowns. */
        async refreshConfigOptions(params = {}) {
            if (embedded && !ownsConfigForm(this.def)) return super.refreshConfigOptions(params);
            const values = params.config || params.formData || params.data || params;
            return buildConfigForm(this.def, { ...(this.config || {}), ...values }, (path, v, integrationSettings) => this.optionsFor(path, v, integrationSettings));
        }

        async optionsFor(path, values, integrationSettings) {
            try { return await resolveOptions({ def: this.def, manifests, ports: this.ports, path, values, integrationSettings }); } catch { return []; }
        }

        /** Required settings come from the definition; checked without calling any API (the base class renders the form). */
        async validateConfig() {
            if (embedded && !ownsConfigForm(this.def)) return super.validateConfig();
            return missingRequired(this.def, this.config || {}).length > 0;
        }

        /** The input form for a button workflow (POST …/actions/:id/options): the inputs of the UI buttons that run it. */
        async getActionOptions(actionId) {
            const ref = this.compiled?.events?.[actionId]?.ref;
            const inputs = {};
            const visit = (node) => { if (!node) return; const a = node.props?.action; if (a?.type === 'userAction' && a.workflow === ref?.id) Object.assign(inputs, a.input || {}); (node.children || []).forEach(visit); };
            if (ref?.kind === 'workflow') (this.def.ui || []).forEach((u) => visit(u.view));
            const properties = Object.fromEntries(Object.entries(inputs).map(([k, f]) => [k, { type: f.type === 'number' ? 'number' : 'string', title: f.label || k }]));
            return { jsonSchema: Object.keys(properties).length ? { type: 'object', properties: { input: { type: 'object', properties } } } : {}, uiSchema: {} };
        }

        installation() {
            // An installation's webhooks arrive at its own type's URL. App-level webhooks (one URL registered with the
            // vendor for every account) arrive at the deployment's URL, which finds the installations they are for.
            const base = baseFor(this.constructor.Definition.name);
            const appBase = baseFor(this.constructor.getDeploymentName?.() || id);
            const webhookUrls = Object.fromEntries(Object.entries(this.def?.modules || {}).map(([key, m]) => [key, manifests[m.module]?.webhook?.scope === 'app'
                ? `${appBase}?module=${encodeURIComponent(m.module)}`
                : `${base}/${this.id}?module=${encodeURIComponent(m.module)}`]));
            return { ...(this.config || {}), integrationId: this.id, accounts: this.accounts(), webhookUrl: `${base}/${this.id}`, webhookUrls };
        }

        /** $.install.accounts: per module key, the account fields its manifest declares, read from the module's Api
         *  (where apiPropertiesToPersist land after auth). An undeclared property is never exposed. */
        accounts() {
            return Object.fromEntries(Object.entries(this.def?.modules || {}).map(([key, m]) => {
                const fields = manifests[m.module]?.account?.fields || [];
                let api = {};
                try { api = this.moduleFor(key).api || {}; } catch { api = {}; }
                return [key, Object.fromEntries(fields.map((f) => [f.name, api[f.name] ?? null]))];
            }));
        }

        /**
         * Move this installation to another published version (default: the latest). With apply false, only the plan:
         * what a person must supply first and what will happen. Applying refuses while anything is needed, and when
         * install steps changed, undoes the old ones before running the new ones (it never leaves the old webhooks).
         */
        async upgradeTo(toVersion, { apply = false } = {}) {
            // An embedded definition's version is the code's: a deploy moves every installation, nothing else does.
            if (embedded) return { allowed: false, applied: false, needs: [], actions: [], from: this.def?.version ?? null, to: this.def?.version ?? null, reason: 'This integration moves to a new version when its code is deployed' };
            const { PlanInstallationUpgrade } = require('./use-cases/definition-use-cases');
            const plan = await new PlanInstallationUpgrade({ catalog: definitions }).execute({ config: this.config, toVersion });
            if (!apply || !plan.allowed) return { ...plan, applied: false };
            const reinstall = plan.actions.some((a) => a.kind === 'reinstall');
            let config = plan.config;
            if (reinstall) {
                await runLifecycle({ def: this.def, installation: this.installation(), hook: 'onUninstall', ports: this.ports });
                const next = await definitions.get(plan.config.definition.id, plan.config.definition.version);
                const out = await runLifecycle({ def: next, installation: { ...this.installation(), ...config }, hook: 'onInstall', ports: this.portsFor(next) });
                config = { ...config, runtime: { ...(this.config?.runtime || {}), installed: Object.fromEntries((next.lifecycle?.onInstall || []).filter((st) => st.id).map((st) => [st.id, out.steps?.[st.id] ?? null])) } };
            }
            await this.patchConfig(config);
            this.config = { ...this.config, ...config };
            await this.loadDefinition();
            // The new version may add, drop or retime schedules.
            const schedules = typeof this.syncSchedules === 'function' ? await this.syncSchedules() : null;
            // New identity keys: a backfill rewrites every link with them. A new sync starts its own backfill
            // only if its definition says so (onInstall); otherwise it waits for its button.
            for (const a of plan.actions.filter((x) => x.kind === 'relink')) await this.startBackfill(a.id, 'relink');
            return { ...plan, config, applied: true, ...(schedules ? { schedules } : {}) };
        }

        /**
         * Keep the run's history, and act on its outcome: a failed run throws (the queue retries), a paused run saves
         * its checkpoint and books its resume. A paused run is one row from first step to last: `rowId` updates it.
         */
        async recordRun(run, { rowId } = {}) {
            this.telemetry?.count?.('workflow.run', 1, { workflow: run.workflowId, status: run.status });
            if (run.status === 'waiting') await this.pauseRun(run, rowId);   // before the history write: a pause must not be lost
            // Run history must never decide the run's outcome: a failed write is logged and the run stands.
            let row = null;
            try {
                const store = runRepository();
                const { checkpoint, ...stored } = run;
                if (store && rowId && store.updateRun) row = await store.updateRun(rowId, { status: run.status, reason: run.reason, error: run.error, retryable: Boolean(run.retryable), trace: run.trace, waitingFor: run.waitingFor ?? null, resumeAt: run.resumeAt ?? null, endedAt: run.endedAt ?? null });
                else if (store) row = await store.createRun({ ...stored, runKey: run.id, integrationId: this.id, definitionId: run.definition?.id, definitionVersion: run.definition?.version, triggerType: run.trigger?.type, eventId: run.trigger?.eventId });
            } catch (e) {
                try { require('../../logs').getLogger('frigg.data-defined').warn('Workflow run not recorded', { eventName: 'frigg.data-defined.run.not_recorded', integrationId: this.id, workflowId: run.workflowId, cause: e?.message }); } catch { /* ignore */ }
            }
            if (run.status === 'waiting' && row?.id && !rowId) await this.mappingStore().put(`wait:${run.id}`, { ...(await this.mappingStore().get(`wait:${run.id}`)), rowId: row.id });
            if (run.status === 'failed') { const e = new Error(run.error); e.run = run; throw e; } // the queue retries
            const { checkpoint, ...out } = run;
            return out;
        }

        /**
         * Save a paused run's checkpoint (IntegrationMapping, encrypted at rest: it holds step results) and book its
         * resume: the delay's end, or an approval's timeout. If the checkpoint cannot be saved, the event's dedupe
         * claim is given back and the error thrown, so the queue runs the event again rather than losing it.
         */
        async pauseRun(run, rowId) {
            const cp = run.checkpoint;
            const store = this.mappingStore();
            try {
                await store.put(`wait:${run.id}`, { ...cp, runId: run.id, definitionVersion: run.definition.version, rowId: rowId ?? null });
            } catch (e) {
                if (cp.eventId != null) await this.ports.dedupe.release?.(`evt:${run.definition.id}:${cp.workflowId}:${cp.eventId}`);
                throw e;
            }
            if (!cp.wait.until) return;
            const name = this.constructor.Definition.name;
            const commands = typeof this.schedulerCommands?.scheduleJob === 'function' ? this.schedulerCommands : require('../../application/commands/scheduler-commands').createSchedulerCommands({ integrationName: name });
            const booked = await commands.scheduleJob({
                jobId: `${name}-${this.id}-${run.id}-${cp.index}`.replace(/[^0-9A-Za-z_.-]/g, '-').slice(0, 64),
                scheduledAt: new Date(cp.wait.until),
                event: eventName('WF', cp.workflowId),
                payload: { integrationId: this.id, resume: run.id, reason: cp.wait.kind === 'delay' ? 'delay' : 'timeout', index: cp.index },
                queueUrl: typeof this.scheduleQueueUrl === 'function' ? this.scheduleQueueUrl() : process.env[`${name.toUpperCase().replace(/-/g, '_')}_QUEUE_URL`],
            });
            if (booked?.error || booked?.warning) {
                try { require('../../logs').getLogger('frigg.data-defined').error('Run resume not booked', { eventName: 'frigg.data-defined.run.resume_not_booked', integrationId: this.id, runId: run.id, kind: cp.wait.kind, reason: booked.reason || booked.warning }); } catch { /* ignore */ }
            }
        }

        /**
         * Carry on a paused run: its delay ended, its approval timed out, or someone decided. The first of those to
         * claim the pause wins; the others are no-ops. The run continues on the definition version it started on.
         */
        async resumeRun(runId, { reason, decision, by, note, index } = {}) {
            const store = this.mappingStore();
            const cp = await store.get(`wait:${runId}`);
            if (!cp) return { status: 'gone', runId };
            if (index !== undefined && Number(index) !== cp.index) return { status: 'ignored', runId, reason: 'a resume for an earlier pause' };
            if (cp.wait.kind === 'delay' && reason !== 'delay') return { status: 'ignored', runId, reason: 'a delay resumes only when it ends' };
            if (cp.wait.kind === 'approval' && !['decision', 'timeout'].includes(reason)) return { status: 'ignored', runId };
            const claimKey = `resume:${runId}:${cp.index}`;
            if (!(await store.claim(claimKey, { at: new Date().toISOString(), reason }))) return { status: 'duplicate', runId };

            const at = new Date().toISOString();
            let result, stop;
            if (cp.wait.kind === 'delay') result = { resumedAt: at, until: cp.wait.until, waited: true };
            else if (reason === 'decision') result = { decision, by: by ?? null, note: note ?? null, at };
            else if (cp.wait.onTimeout === 'stop') stop = 'approval timed out';
            else result = { decision: cp.wait.onTimeout === 'approve' ? 'approved' : 'rejected', by: 'timeout', note: null, at };

            const def = cp.definitionVersion !== this.def.version ? (await definitions.get(this.def.id, cp.definitionVersion)) || this.def : this.def;
            const run = await resumeWorkflow({ def, installation: this.installation(), checkpoint: cp, result, stop, ports: def === this.def ? this.ports : this.portsFor(def), runId });
            if (run.status === 'failed') await store.release(claimKey);          // the queue's retry may resume again
            else if (run.status !== 'waiting') await store.release(`wait:${runId}`);
            return this.recordRun(run, { rowId: cp.rowId });
        }

        /**
         * An approval decision (POST /api/integrations/:id/runs/:runId/decision). Checked here, carried out through
         * the queue (the steps after an approval may take longer than an HTTP request should).
         */
        async decide(runId, { decision, userId, note, isOwner = true } = {}) {
            const { DefinitionError } = require('./use-cases/definition-use-cases');
            const store = this.mappingStore();
            const cp = await store.get(`wait:${runId}`);
            // Someone who neither owns the installation nor is named on this run learns nothing about it.
            if (!isOwner && !(cp?.wait?.approvers || []).includes(String(userId))) throw new DefinitionError(`Integration ${this.id} not found`, { status: 404, code: 'NOT_FOUND' });
            if (!['approve', 'reject'].includes(decision)) throw new DefinitionError('decision is approve or reject', { status: 400, code: 'BAD_DECISION' });
            if (!cp) throw new DefinitionError(`Run ${runId} is not waiting`, { status: 404, code: 'NOT_WAITING' });
            if (cp.wait.kind !== 'approval') throw new DefinitionError(`Run ${runId} is waiting on a ${cp.wait.kind}, not an approval`, { status: 409, code: 'NOT_AN_APPROVAL' });
            if (cp.wait.approvers?.length && !cp.wait.approvers.includes(String(userId))) throw new DefinitionError('You are not an approver of this run', { status: 403, code: 'NOT_AN_APPROVER' });
            if (await store.get(`resume:${runId}:${cp.index}`)) throw new DefinitionError(`Run ${runId} has already been decided`, { status: 409, code: 'ALREADY_DECIDED' });
            await this.queueWebhook({ event: eventName('WF', cp.workflowId), integrationId: this.id, resume: runId, reason: 'decision', index: cp.index, decision: decision === 'approve' ? 'approved' : 'rejected', by: String(userId), note: note ?? null });
            return { accepted: true, runId, decision };
        }

        /** The sync engine over this installation's ports and mapping store (sync-engine.js). */
        syncEngine(def = this.def) {
            const installation = this.installation();
            return createSyncEngine({ def, installation, install: installContext(def, installation), manifests, ports: def === this.def ? this.ports : this.portsFor(def), state: this.mappingStore() });
        }

        /**
         * SYNC_<ID>_BACKFILL (a button), SYNC_<ID>_PAGE (the queue, one page per message) and SYNC_<ID>_ONGOING
         * (a webhook event about a synced object, or a poll tick). Each page queues the next, so a long backfill is
         * many short messages; the progress row says where it is (GET /api/integrations/:id/syncs).
         */
        async runSync(ref, msg = {}) {
            const engine = this.syncEngine();
            if (ref.phase === 'backfill') return this.startBackfill(ref.id, msg.reason || 'user');
            if (ref.phase === 'page') {
                const out = await engine.continueBackfill({ syncId: ref.id, runId: msg.runId, role: msg.role, cursor: msg.cursor ?? null });
                if (out.next) await this.queueWebhook({ event: eventName('SYNC', ref.id, 'PAGE'), integrationId: this.id, ...out.next, definitionVersion: this.def.version });
                await this.fireSyncWorkflows(ref.id, out.results || []);
                return { progress: out.progress, stale: out.stale || false };
            }
            if (ref.phase === 'ongoing') {
                if (msg.module && msg.topic) {
                    const result = await engine.handleEvent({ syncId: ref.id, moduleKey: msg.module, topic: msg.topic, event: msg.body });
                    await this.fireSyncWorkflows(ref.id, [result]);
                    return result;
                }
                return engine.poll({ syncId: ref.id });
            }
            throw new Error(`Unknown sync phase "${ref.phase}"`);
        }

        /** Start a backfill (or a relink after an identity change) and queue its first page. */
        async startBackfill(syncId, reason = 'user') {
            const runId = `bf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            const out = await this.syncEngine().startBackfill({ syncId, runId, reason });
            if (out.started) await this.queueWebhook({ event: eventName('SYNC', syncId, 'PAGE'), integrationId: this.id, ...out.next, definitionVersion: this.def.version });
            return { started: out.started, progress: out.progress };
        }

        /**
         * syncRecord workflows: queue one run per synced record whose action (created, updated, linked) a switched-on
         * workflow listens for. A create or link happens once per record, so it carries a dedupe id; updates do not.
         */
        async fireSyncWorkflows(syncId, results) {
            for (const w of this.def.workflows || []) {
                const t = w.trigger || {};
                const n = eventName('WF', w.id);
                if (t.type !== 'syncRecord' || t.sync !== syncId || !this.compiled.events[n]) continue;
                for (const r of results) {
                    if (!r?.action || !(t.on || []).includes(r.action)) continue;
                    const ids = Object.entries(r.ids || {}).map(([k, v]) => `${k}:${v}`).sort().join('|');
                    await this.queueWebhook({ event: n, integrationId: this.id, body: { sync: syncId, action: r.action, ids: r.ids }, ...(r.action !== 'updated' ? { eventId: `${syncId}:${r.action}:${ids}` } : {}), definitionVersion: this.def.version });
                }
            }
        }

        /** Every switched-on sync's progress: the current or last backfill, and the poll marks. */
        async syncStatus() {
            const engine = this.syncEngine();
            const out = [];
            for (const sy of this.def.syncs || []) {
                if (!this.compiled.events[eventName('SYNC', sy.id, 'PAGE')]) continue;
                out.push({ id: sy.id, label: sy.label, source: sy.source, target: sy.target, direction: sy.direction, ongoing: sy.ongoing?.mode || 'none', ...(await engine.status(sy.id)) });
            }
            return out;
        }
    }
    Object.defineProperty(DataDefinedIntegration, 'name', { value: `DataDefined_${id.replace(/-/g, '_')}` });
    if (!defaultId) DataDefinedIntegration.IntegrationProvider = definitionProvider(DataDefinedIntegration, definitions);
    return DataDefinedIntegration;
}

/**
 * The shared class as a provider of integration types (integration-types.js): every published definition is an
 * integration type named by its id, run by a class of its own. The class differs from code only in where it gets its
 * behaviour; it runs on the shared deployment (queue, functions) of the class that provides it.
 */
function definitionProvider(Host, definitions) {
    const cache = new Map();   // id -> { version, cls }
    const classFor = (entry) => {
        const hit = cache.get(entry.id);
        if (hit && hit.version === entry.version && hit.workspaceId === (entry.workspaceId ?? null)) return hit.cls;
        const hostModules = Host.Definition.modules;
        const modules = {};
        for (const [key, m] of Object.entries(entry.modules || {})) {
            const moduleName = typeof m === 'string' ? m : m?.module;
            if (!hostModules[moduleName]) return null;   // an app module this deployment does not have: not installable here
            modules[key] = hostModules[moduleName];
        }
        const display = entry.display || {};
        class PublishedIntegration extends Host {
            static Definition = { name: entry.id, version: entry.version, modules, webhooks: { enabled: true }, display: { label: display.label, description: display.description, category: display.category } };
            static definitionId = entry.id;
            static Host = Host;
            /** The workspace that built it (null: the app's own catalogue). */
            static workspaceId = entry.workspaceId ?? null;

            /** The install option (GET /api/integrations): the base class reports its first module's name as the type,
             *  which is not this integration's name. */
            static getOptionDetails() {
                return {
                    type: entry.id, hasUserConfig: true, isMany: false, requiresNewEntity: false,
                    // Built by this workspace: its page shows the editor views (rule: otherwise identical).
                    ...(entry.workspaceId ? { editable: true } : {}),
                    display: { name: display.label, description: display.description, detailsUrl: display.detailsUrl, icon: display.icon },
                };
            }
        }
        Object.defineProperty(PublishedIntegration, 'IntegrationProvider', { value: undefined });
        Object.defineProperty(PublishedIntegration, 'name', { value: `Integration_${entry.id.replace(/[^0-9A-Za-z]/g, '_')}` });
        cache.set(entry.id, { version: entry.version, workspaceId: entry.workspaceId ?? null, cls: PublishedIntegration });
        return PublishedIntegration;
    };
    const visible = (cls, context) => Boolean(cls) && (!context?.workspaceId || cls.workspaceId == null || cls.workspaceId === String(context.workspaceId));
    return {
        async resolve(type, context) {
            if (!type || type === Host.Definition.name) return null;
            let cls = cache.get(type)?.cls;
            if (!cls) {
                const latest = await definitions.latest(type);
                if (!latest) return null;
                cls = classFor({ ...latest, workspaceId: (await definitions.ownerOf?.(type)) ?? null });
            }
            return visible(cls, context) ? cls : null;
        },
        async list(context) {
            const entries = (await definitions.list?.(context)) || [];
            return entries.map(classFor).filter((cls) => visible(cls, context));
        },
    };
}

/** In-memory definition store for tests and local dev. Production: the IntegrationDefinitionVersion table. */
function memoryDefinitions(docs) {
    const byKey = new Map(docs.map((d) => [`${d.id}@${d.version}`, d]));
    const cmp = (a, b) => a.split('.').map(Number).reduce((r, n, i) => r || n - Number(b.split('.')[i]), 0);
    return {
        get: async (defId, version) => byKey.get(`${defId}@${version}`) || null,
        checksumOf: async (defId, version) => { const doc = byKey.get(`${defId}@${version}`); return doc ? require('./canonical').checksum(doc) : null; },
        list: async () => {
            const latestById = new Map();
            for (const doc of docs) if (!latestById.has(doc.id) || cmp(doc.version, latestById.get(doc.id).version) > 0) latestById.set(doc.id, doc);
            return [...latestById.values()].map((doc) => ({ id: doc.id, version: doc.version, checksum: require('./canonical').checksum(doc), display: doc.display, modules: Object.fromEntries(Object.entries(doc.modules || {}).map(([k, m]) => [k, m.module])), counts: { syncs: (doc.syncs || []).length, links: (doc.links || []).length, workflows: (doc.workflows || []).length, ui: (doc.ui || []).length } }));
        },
        latest: (id) => docs.filter((d) => d.id === id).sort((a, b) => cmp(b.version, a.version))[0] || null,
    };
}

module.exports = { defineIntegrationClass, defineSharedIntegrationClass, extendIntegrationClass, memoryDefinitions };
