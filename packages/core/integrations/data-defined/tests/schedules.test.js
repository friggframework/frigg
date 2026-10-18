/**
 * Recurring schedules for data-defined installations: what a definition may declare, what an installation may
 * change, and that the class keeps one host schedule per installation in step through create, update, upgrade and
 * delete (IntegrationBase.syncSchedules over the real scheduler commands and the mock adapter).
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: () => 'mongodb', PRISMA_LOG_LEVEL: 'error,warn' }));

const d = require('..');
const { compile } = require('../compile');
const { validate } = require('../validate');
const { diff, planUpgrade } = require('../versioning');
const { buildConfigForm } = require('../config-form');
const { IntegrationBase } = require('../../integration-base');
const { MockSchedulerAdapter } = require('../../../infrastructure/scheduler/mock-scheduler-adapter');
const { createSchedulerCommands } = require('../../../application/commands/scheduler-commands');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));
const DIGEST = 'WF_DUE_TOMORROW_DIGEST';

/** asana-slack with its digest made configurable (never more often than hourly). */
function digestDef({ configurable = { min: '1h' }, version } = {}) {
    const def = example('asana-slack');
    const w = def.workflows.find((x) => x.id === 'due-tomorrow-digest');
    if (configurable !== null) w.trigger.configurable = configurable;   // null: leave it fixed
    if (version) def.version = version;
    return def;
}

describe('definition and installation', () => {
    it('compiles each switched-on schedule into an entry with its default, its allowance and the installation\'s choice', () => {
        const def = digestDef();
        const out = compile(def, { workflows: { 'due-tomorrow-digest': { schedule: { cron: '0 9 * * 1-5', timezone: 'Europe/Paris' } } } });
        expect(out.schedules).toEqual([{ key: DIGEST, event: DIGEST, default: { cron: '0 16 * * 1-5', timezone: 'America/New_York' }, configurable: { min: '1h' }, choice: { cron: '0 9 * * 1-5', timezone: 'Europe/Paris' } }]);
        expect(compile(def, { workflows: { 'due-tomorrow-digest': { enabled: false } } }).schedules).toEqual([]);
    });

    it('a polling sync compiles to an interval entry, configurable when the definition says so', () => {
        const def = example('pipedrive-hubspot');
        def.syncs[0].ongoing = { mode: 'poll', every: '30m', configurable: true };
        const out = compile(def, { syncs: { [def.syncs[0].id]: { schedule: { every: '2h' } } } });
        expect(out.schedules).toEqual([expect.objectContaining({ default: { every: '30m' }, configurable: {}, choice: { every: '2h' } })]);
    });

    it('validates a schedule as a host would run it, and a default that breaks its own floor', () => {
        const errors = (def) => validate(def, manifests).errors.filter((e) => /trigger|ongoing/.test(e.path)).map((e) => `${e.path}: ${e.message}`);
        const w = (def) => def.workflows.find((x) => x.id === 'due-tomorrow-digest');
        let def = digestDef(); w(def).trigger.cron = '0 9 1 * 1';
        expect(errors(def)).toEqual(['workflows[0].trigger.cron: Restrict day of month or day of week, not both']);
        def = digestDef(); w(def).trigger.every = '1h';
        expect(errors(def)).toEqual(['workflows[0].trigger: Give exactly one of cron or every']);
        def = digestDef({ configurable: { min: '2d' } });
        expect(errors(def)).toEqual(['workflows[0].trigger.configurable.min: The default schedule breaks its own minimum: Runs every 1440 minutes at its most frequent; the minimum is 2d']);
        def = example('pipedrive-hubspot'); def.syncs[0].ongoing = { mode: 'webhook', configurable: true };
        expect(validate(def, manifests).errors.map((e) => e.message)).toContain('Only a polling sync has an interval to configure');
        expect(d.checkDefinition(digestDef(), manifests).valid).toBe(true);   // and the JSON Schema accepts the new fields
    });

    it('offers a timing field in the configure form only where the definition allows it', async () => {
        const configurable = await buildConfigForm(digestDef(), { workflows: { 'due-tomorrow-digest': { schedule: { cron: '0 9 * * *' } } } });
        expect(configurable.jsonSchema.properties.workflows.properties['due-tomorrow-digest'].properties.schedule.properties).toEqual({
            cron: { type: 'string', title: 'Cron', default: '0 16 * * 1-5' }, timezone: { type: 'string', title: 'Time zone', default: 'America/New_York' },
        });
        expect(configurable.data.workflows['due-tomorrow-digest'].schedule).toEqual({ cron: '0 9 * * *' });
        expect(configurable.uiSchema.workflows['due-tomorrow-digest'].schedule.cron['ui:help']).toMatch(/No more often than every 1h/);
        const fixed = await buildConfigForm(digestDef({ configurable: null }), {});
        expect(fixed.jsonSchema.properties.workflows.properties['due-tomorrow-digest'].properties.schedule).toBeUndefined();
    });

    it('versioning: taking configurability away is major; an upgrade keeps a choice only where the new version allows it', () => {
        expect(diff(digestDef(), digestDef({ configurable: false, version: '2.0.0' })).changes).toContainEqual(expect.objectContaining({ level: 'major', path: 'workflows.due-tomorrow-digest.trigger.configurable' }));
        expect(diff(digestDef({ configurable: false }), digestDef({ version: '1.1.0' })).level).toBe('minor');

        const install = { definition: { id: 'asana-slack', version: '1.0.0' }, workflows: { 'due-tomorrow-digest': { enabled: true, schedule: { every: '2h' } } } };
        const tighter = planUpgrade(install, digestDef(), digestDef({ configurable: { min: '4h' }, version: '1.1.0' }));
        expect(tighter.config.workflows['due-tomorrow-digest'].schedule).toBeUndefined();
        expect(tighter.actions).toContainEqual(expect.objectContaining({ kind: 'reschedule', id: 'workflows.due-tomorrow-digest' }));
        const same = planUpgrade(install, digestDef(), digestDef({ version: '1.1.0' }));
        expect(same.config.workflows['due-tomorrow-digest'].schedule).toEqual({ every: '2h' });
        expect(same.actions.map((a) => a.kind)).not.toContain('reschedule');
    });
});

describe('installation lifecycle', () => {
    let service;

    /** IntegrationBase's real lifecycle and syncSchedules, with persistence and module wiring stubbed. */
    class Base extends IntegrationBase {
        constructor(p = {}) {
            super(p);
            this.id = p.id; this.config = p.config; this.status = 'IN_CREATION';
            this.updateIntegrationStatus = { execute: async () => true };
            this.updateIntegrationMessages = { execute: jest.fn(async () => true) };
            this.patchIntegrationConfig = { execute: async (id, patch) => ({ config: (this.config = { ...this.config, ...patch }) }) };
            this.schedulerCommands = createSchedulerCommands({ integrationName: 'data-defined', schedulerService: service });
            this.ran = [];
        }
        async initialize() { this.registerEventHandlers(); }
        registerEventHandlers() {}
        async getMapping() { return null; }
        async upsertMapping() {}
        async createMapping(k) { if (this.ran.includes(k)) { const e = new Error('exists'); e.name = 'MappingAlreadyExistsError'; throw e; } this.ran.push(k); }
        async deleteMapping() {}
    }

    const setup = (defs) => {
        const definitions = d.memoryDefinitions(defs);
        const Cls = d.defineSharedIntegrationClass({ definitions, manifests, modules: { asana: {}, slack: {} }, IntegrationBase: Base, runs: false });
        return (config) => { const inst = new Cls({ id: 'int9', config: { type: 'data-defined', ...config } }); const api = new Proxy({}, { get: () => async () => ({ id: 'X1' }) });   // install steps succeed
        inst.asana = { api }; inst.slack = { api }; return inst; };
    };

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        process.env.DATA_DEFINED_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/data-defined-queue';
        service = new MockSchedulerAdapter();
    });
    afterEach(() => { jest.restoreAllMocks(); delete process.env.DATA_DEFINED_QUEUE_URL; });

    it('create schedules the installation\'s workflows; an update to its own timing retimes it; delete removes it', async () => {
        const newInstall = setup([digestDef()]);
        const inst = newInstall({ definition: { id: 'asana-slack', version: digestDef().version } });
        await inst.initialize();
        await inst.onCreate();
        const name = 'data-defined-int9-wf_due_tomorrow_digest';
        expect(service._getSchedules()[name]).toMatchObject({ recurrence: { cron: '0 16 * * 1-5', timezone: 'America/New_York' }, state: 'ENABLED' });
        expect(inst.config.runtime.schedules[DIGEST]).toMatchObject({ jobId: name, event: DIGEST });

        await inst.onUpdate({ config: { workflows: { 'due-tomorrow-digest': { enabled: true, schedule: { every: '3h' } } } } });
        expect(service._getSchedules()[name].recurrence).toEqual({ every: '3h' });

        await inst.onUpdate({ config: { workflows: { 'due-tomorrow-digest': { enabled: true, schedule: { every: '10m' } } } } });
        expect(service._getSchedules()[name].recurrence).toEqual({ cron: '0 16 * * 1-5', timezone: 'America/New_York' });
        expect(inst.updateIntegrationMessages.execute).toHaveBeenCalledWith('int9', 'warnings', 'Schedule not changed', `${DIGEST}: Runs every 10 minutes at its most frequent; the minimum is 1h`, expect.any(Number));

        await inst.onUpdate({ config: { workflows: { 'due-tomorrow-digest': { enabled: false } } } });
        expect(service._getSchedules()).toEqual({});                  // switching the workflow off removes its schedule

        await inst.onUpdate({ config: { workflows: { 'due-tomorrow-digest': { enabled: true } } } });
        await inst.onDelete();
        expect(service._getSchedules()).toEqual({});
        expect(inst.config.runtime.schedules).toEqual({});
    });

    it('an upgrade retimes schedules and keeps the install steps\' results beside them', async () => {
        const v2 = digestDef({ configurable: false, version: '2.0.0' });
        v2.workflows.find((x) => x.id === 'due-tomorrow-digest').trigger.cron = '0 15 * * 1-5';
        const newInstall = setup([digestDef(), v2]);
        const inst = newInstall({ definition: { id: 'asana-slack', version: digestDef().version }, settings: { workspace: 'W1', project: 'P1' }, workflows: { 'due-tomorrow-digest': { enabled: true, schedule: { every: '2h' } }, 'completed-in-project': { enabled: true, settings: { channel: 'C1' } } } });
        await inst.initialize();
        await inst.onCreate();
        expect(service._getSchedules()['data-defined-int9-wf_due_tomorrow_digest'].recurrence).toEqual({ every: '2h' });

        const out = await inst.upgradeTo('2.0.0', { apply: true });
        expect(out.applied).toBe(true);
        expect(out.actions).toContainEqual(expect.objectContaining({ kind: 'reschedule' }));
        expect(service._getSchedules()['data-defined-int9-wf_due_tomorrow_digest'].recurrence).toEqual({ cron: '0 15 * * 1-5', timezone: 'America/New_York' });
        expect(inst.config.runtime.schedules[DIGEST].recurrence).toEqual({ cron: '0 15 * * 1-5', timezone: 'America/New_York' });
    });

    it('a redelivered tick runs once: the tick\'s scheduled time is the dedupe id', async () => {
        const newInstall = setup([digestDef()]);
        const inst = newInstall({ definition: { id: 'asana-slack', version: digestDef().version } });
        await inst.initialize();
        const runs = [];
        inst.recordRun = async (r) => { runs.push(r); return r; };
        const tick = { event: DIGEST, data: { integrationId: 'int9', scheduleKey: DIGEST, tick: { id: 'exec-1', scheduledFor: '2026-10-19T20:00:00Z' } } };
        await inst.events[DIGEST].handler(tick);
        await inst.events[DIGEST].handler(tick);
        expect(runs.map((r) => r.status)).toEqual([expect.not.stringMatching(/duplicate/), 'duplicate']);
        expect(runs[0].trigger.eventId).toBe(`tick:${DIGEST}:2026-10-19T20:00:00Z`);
        // An unfilled placeholder (a host that cannot supply the time) is not an id, so it cannot block every tick.
        const unfilled = { data: { scheduleKey: DIGEST, tick: { scheduledFor: '{{frigg.tick.scheduledFor}}' } } };
        await inst.events[DIGEST].handler(unfilled);
        await inst.events[DIGEST].handler(unfilled);
        expect(runs.slice(2).map((r) => r.status)).not.toContain('duplicate');
    });
});
