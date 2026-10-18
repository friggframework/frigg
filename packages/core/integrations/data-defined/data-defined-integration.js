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
const { makePorts, runWorkflow, runQuery, renderSurface, runLifecycle, resolveOptions, installContext } = require('./runtime');
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
function friggLookup(typeName) {
    return async (externalId, moduleName) => {
        const { createIntegrationCommands } = require('../../application/commands/integration-commands');
        const commands = createIntegrationCommands();
        const ids = await commands.listIntegrationsByEntityExternalId(externalId, moduleName);
        const out = [];
        for (const integrationId of ids) {
            const found = await commands.loadIntegrationContextById(integrationId);
            if (found?.context?.record?.config?.type === typeName) out.push(integrationId);
        }
        return out;
    };
}

function makeClass({ name, defaultId, definitions, manifests, runCode, IntegrationBase, modules, display, version, lookup, runs }) {
    const Base = IntegrationBase || require('../integration-base').IntegrationBase;
    const id = name;
    const findInstallations = lookup || friggLookup(name);
    // Where workflow runs are kept: the WorkflowRun table by default (loaded lazily, so tests and tools without a
    // database can pass their own store or `false` to keep none).
    let runStore = runs;
    const runRepository = () => (runStore === undefined ? (runStore = require('./repositories/workflow-run-repository').createWorkflowRunRepository()) : runStore);
    const publicBase = () => `${process.env.FRIGG_PUBLIC_URL || ''}/api/${id}-integration/webhooks`;

    class DataDefinedIntegration extends Base {
        static Definition = { name, version, modules, webhooks: { enabled: true }, display }; // version is display only; installations pin their own

        /** How the routers find data-defined classes and the store and manifests they run on. */
        static DataDefined = { definitions, manifests, shared: !defaultId, runs: () => runRepository() };

        /**
         * Frigg's use cases construct an integration from its record and call initialize() before anything else
         * (create, update, delete, webhooks, user actions, config options). So this is where the pinned definition is
         * loaded: every real entry point hydrates through here. A dry instance (no record, e.g. an app-level webhook
         * before its installation is known) has no pin and loads nothing.
         */
        async initialize() {
            if (this.config?.definition || defaultId) await this.loadDefinition();
            return super.initialize();
        }

        async loadDefinition() {
            let pin = this.config?.definition || (defaultId ? { id: defaultId } : null);
            if (!pin?.id) throw new Error('This installation does not name a definition (config.definition.id)');
            if (!pin.version) {
                // Installed by id alone: pin the latest published version now (onCreate persists the pin).
                const latest = await definitions.latest(pin.id);
                if (!latest) throw new Error(`No published version of "${pin.id}"`);
                pin = { id: pin.id, version: latest.version, checksum: await definitions.checksumOf?.(pin.id, latest.version) || undefined };
                if (this.config?.definition) this.config = { ...this.config, definition: pin };
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
                def, manifests, runCode,
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
        async onWebhook({ data = {} }) {
            if (data.module && data.topic) return this.routeEvents(data.module, [{ topic: data.topic, event: data.body, eventId: data.eventId || data.body?.id || null }]);
            const delivery = { body: data.body, headers: data.headers || {}, query: data.query || {} };
            if (!this.def) return this.fanOutAppWebhook(delivery);

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
                for (const integrationId of await findInstallations(account, moduleName)) {
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
            await this.patchConfig({ ...(this.config?.definition ? { definition: this.config.definition } : {}), runtime: { ...(this.config?.runtime || {}), installed } });
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
            return this.def ? compile(this.def, this.config || {}).schedules : [];
        }

        /** The configure form (GET /api/integrations/:id/config/options), generated from the definition. */
        async getConfigOptions() {
            return buildConfigForm(this.def, this.config || {}, (path, values, integrationSettings) => this.optionsFor(path, values, integrationSettings));
        }

        /** The same form re-filled from the values chosen so far (POST …/config/options/refresh): dependent dropdowns. */
        async refreshConfigOptions(params = {}) {
            const values = params.config || params.formData || params.data || params;
            return buildConfigForm(this.def, { ...(this.config || {}), ...values }, (path, v, integrationSettings) => this.optionsFor(path, v, integrationSettings));
        }

        async optionsFor(path, values, integrationSettings) {
            try { return await resolveOptions({ def: this.def, manifests, ports: this.ports, path, values, integrationSettings }); } catch { return []; }
        }

        /** Required settings come from the definition; checked without calling any API (the base class renders the form). */
        async validateConfig() {
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
            const base = publicBase();
            const webhookUrls = Object.fromEntries(Object.entries(this.def?.modules || {}).map(([key, m]) => [key, manifests[m.module]?.webhook?.scope === 'app'
                ? `${base}?module=${encodeURIComponent(m.module)}`
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

        async recordRun(run) {
            this.telemetry?.count?.('workflow.run', 1, { workflow: run.workflowId, status: run.status });
            // Run history must never decide the run's outcome: a failed write is logged and the run stands.
            try {
                const store = runRepository();
                if (store) await store.createRun({ ...run, integrationId: this.id, definitionId: run.definition?.id, definitionVersion: run.definition?.version, triggerType: run.trigger?.type, eventId: run.trigger?.eventId });
            } catch (e) {
                try { require('../../logs').getLogger('frigg.data-defined').warn('Workflow run not recorded', { eventName: 'frigg.data-defined.run.not_recorded', integrationId: this.id, workflowId: run.workflowId, cause: e?.message }); } catch { /* ignore */ }
            }
            if (run.status === 'failed') { const e = new Error(run.error); e.run = run; throw e; } // the queue retries
            return run;
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
    return DataDefinedIntegration;
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

module.exports = { defineIntegrationClass, defineSharedIntegrationClass, memoryDefinitions };
