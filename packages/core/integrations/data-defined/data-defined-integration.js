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
const { compile, routeWebhook } = require('./compile');
const { makePorts, runWorkflow, runQuery, renderSurface, runLifecycle } = require('./runtime');

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
function defineIntegrationClass({ id, definitions, manifests, modules, runCode, IntegrationBase }) {
    const latest = definitions.latest(id);
    if (!latest) throw new Error(`No published definition "${id}"`);
    return makeClass({
        name: latest.id, defaultId: id, definitions, manifests, runCode, IntegrationBase,
        modules: Object.fromEntries(Object.keys(latest.modules).map((key) => [key, { definition: modules[key] }])),
        display: { label: latest.display.label, description: latest.display.description, category: latest.display.category },
        version: latest.version,
    });
}

function defineSharedIntegrationClass({ name = 'data-defined', definitions, manifests, modules, runCode, IntegrationBase }) {
    return makeClass({
        name, defaultId: null, definitions, manifests, runCode, IntegrationBase,
        modules: Object.fromEntries(Object.entries(modules).map(([key, definition]) => [key, { definition }])),
        display: { label: 'Data-defined integration', description: 'Runs any published integration definition.', category: 'Custom' },
        version: '0.1.0',
    });
}

function makeClass({ name, defaultId, definitions, manifests, runCode, IntegrationBase, modules, display, version }) {
    const Base = IntegrationBase || require('../integration-base').IntegrationBase;
    const id = name;

    class DataDefinedIntegration extends Base {
        static Definition = { name, version, modules, webhooks: { enabled: true }, display }; // version is display only; installations pin their own

        /** Called once the record is loaded (config holds the pinned version). */
        async loadDefinition() {
            const pin = this.config?.definition || (defaultId ? { id: defaultId, version: definitions.latest(defaultId).version } : null);
            if (!pin?.id || !pin?.version) throw new Error('This installation does not name a definition (config.definition.id and .version)');
            this.def = await definitions.get(pin.id, pin.version);
            if (!this.def) throw new Error(`Definition ${pin.id}@${pin.version} is not published`);
            this.compiled = compile(this.def, this.config || {});
            this.ports = makePorts({
                def: this.def, manifests, runCode,
                callApi: (moduleKey, method, args) => this[moduleKey].api[method](args),
                store: {
                    get: async (key) => (await this.getMapping(key))?.mapping || null,
                    put: (key, value) => this.upsertMapping(key, value),
                    claim: async (key, value) => { try { await this.createMapping(key, value); return true; } catch (e) { if (e.name === 'MappingAlreadyExistsError') return false; throw e; } },
                    release: (key) => this.deleteMapping(key),
                },
            });
            // The same shape a hand-written integration builds in its constructor.
            for (const [name, e] of Object.entries(this.compiled.events)) {
                this.events[name] = { ...e, handler: (payload) => this.dispatch(e.ref, payload) };
            }
            this.registerEventHandlers();
            return this.def;
        }

        async dispatch(ref, payload = {}) {
            const msg = payload.data || payload;
            // A message queued under an older version runs on that version (an upgrade drains, it never re-interprets).
            const def = msg.definitionVersion && msg.definitionVersion !== this.def.version
                ? await definitions.get(this.def.id, msg.definitionVersion) || this.def
                : this.def;
            const installation = this.installation();
            if (ref.kind === 'workflow') return this.recordRun(await runWorkflow({ def, installation, workflowId: ref.id, event: msg.body ?? msg, record: msg.record, ports: this.ports, manifests }));
            if (ref.kind === 'query') return runQuery({ def, installation, queryId: ref.id, record: msg.record, ports: this.ports });
            if (ref.kind === 'ui') return renderSurface({ def, installation, surfaceId: ref.id, record: payload.req?.body?.record || msg.record, ports: this.ports });
            if (ref.kind === 'sync') return this.runSync(ref, msg);
            throw new Error(`Unknown event ref ${JSON.stringify(ref)}`);
        }

        /** Inbound webhook (queue worker side): one delivery fans out to every enabled workflow listening for it. */
        async onWebhook({ data }) {
            const moduleKey = data.module, topic = data.topic;
            for (const name of routeWebhook(this.compiled, moduleKey, topic)) {
                await this.queueWebhook({ event: name, module: moduleKey, topic, body: data.body, definitionVersion: this.def.version });
            }
        }

        async onCreate(params) {
            await this.loadDefinition();
            const out = await runLifecycle({ def: this.def, installation: this.installation(), hook: 'onInstall', ports: this.ports });
            // Every onInstall step with an id keeps its result, so onUninstall can undo exactly what install did
            // ($.install.runtime.installed.<step id>). Saved even when empty, so a re-install replaces stale ids.
            const installed = Object.fromEntries((this.def.lifecycle?.onInstall || []).filter((st) => st.id).map((st) => [st.id, out.steps?.[st.id] ?? null]));
            await this.patchConfig({ runtime: { ...(this.config?.runtime || {}), installed } });
            return super.onCreate(params);
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

        installation() {
            return { ...(this.config || {}), integrationId: this.id, accounts: this.accounts(), webhookUrl: `${process.env.FRIGG_PUBLIC_URL || ''}/api/${id}-integration/webhooks/${this.id}` };
        }

        /** $.install.accounts: per module key, the account fields its manifest declares, read from the module's Api
         *  (where apiPropertiesToPersist land after auth). An undeclared property is never exposed. */
        accounts() {
            return Object.fromEntries(Object.entries(this.def?.modules || {}).map(([key, m]) => {
                const fields = manifests[m.module]?.account?.fields || [];
                const api = this[key]?.api || {};
                return [key, Object.fromEntries(fields.map((f) => [f.name, api[f.name] ?? null]))];
            }));
        }

        async recordRun(run) {
            this.telemetry?.count?.('workflow.run', 1, { workflow: run.workflowId, status: run.status });
            if (run.status === 'failed') { const e = new Error(run.error); e.run = run; throw e; } // the queue retries
            return run;
        }

        async runSync(ref) {
            // v0.1 note: the sync engine (backfill pages, ongoing deltas, two-way master rules) reuses Frigg's
            // existing SYNC_PAGE pattern; it is specified in README.md and lands in v0.2.
            throw new Error(`Sync ${ref.id} (${ref.phase}) is not implemented in v0.1`);
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
        get: async (id, version) => byKey.get(`${id}@${version}`) || null,
        latest: (id) => docs.filter((d) => d.id === id).sort((a, b) => cmp(b.version, a.version))[0] || null,
    };
}

module.exports = { defineIntegrationClass, defineSharedIntegrationClass, memoryDefinitions };
