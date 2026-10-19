/**
 * Schedules for installations of published definitions, as ADR-055 recurring triggers: what a definition may declare, what an
 * installation may change, and that one shared tick (RunTriggerTick over the class's triggersFor) finds each
 * installation's runs due from its pinned definition and config, with no scheduler call anywhere in the lifecycle.
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: () => 'mongodb', PRISMA_LOG_LEVEL: 'error,warn' }));

const d = require('..');
const { compile } = require('../compile');
const { validate } = require('../validate');
const { diff, planUpgrade } = require('../versioning');
const { buildConfigForm } = require('../config-form');
const { IntegrationBase } = require('../../integration-base');
const { RunTriggerTick } = require('../../use-cases/run-trigger-tick');
const { IntegrationEventDispatcher } = require('../../../handlers/integration-event-dispatcher');
const { provisioningOf } = require('../../triggers');

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
    it('compiles each switched-on schedule into a trigger with its timing, its allowance and the installation\'s choice', () => {
        const def = digestDef();
        const out = compile(def, { workflows: { 'due-tomorrow-digest': { schedule: { cron: '0 9 * * 1-5', timezone: 'Europe/Paris' } } } });
        expect(out.triggers).toEqual([{ name: DIGEST, cron: '0 16 * * 1-5', timezone: 'America/New_York', configurable: { min: '1h' }, choice: { cron: '0 9 * * 1-5', timezone: 'Europe/Paris' } }]);
        expect(compile(def, { workflows: { 'due-tomorrow-digest': { enabled: false } } }).triggers).toEqual([]);
    });

    it('a polling sync compiles to an interval entry, configurable when the definition says so', () => {
        const def = example('pipedrive-hubspot');
        def.syncs[0].ongoing = { mode: 'poll', every: '30m', configurable: true };
        const out = compile(def, { syncs: { [def.syncs[0].id]: { schedule: { every: '2h' } } } });
        expect(out.triggers).toEqual([expect.objectContaining({ every: '30m', configurable: true, choice: { every: '2h' } })]);
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

describe('one shared tick for every installation', () => {
    /** IntegrationBase's real lifecycle and trigger run, with persistence and module wiring stubbed. */
    class Base extends IntegrationBase {
        constructor(p = {}) {
            super(p);
            this.id = p.id; this.config = p.config; this.status = p.status || 'IN_CREATION';
            this.updateIntegrationStatus = { execute: async () => true };
            this.updateIntegrationMessages = { execute: jest.fn(async () => true) };
            this.patchIntegrationConfig = { execute: async (id, patch) => ({ config: (this.config = { ...this.config, ...patch }) }) };
            this.triggerProcessRepository = { findByIntegrationAndType: async () => [], create: async (r) => ({ id: 'p1', ...r }), update: async () => ({}) };
            this.ran = [];
        }
        async initialize() { this.registerEventHandlers(); }
        registerEventHandlers() {}
        async getMapping() { return null; }
        async upsertMapping() {}
        async createMapping(k) { if (this.ran.includes(k)) { const e = new Error('exists'); e.name = 'MappingAlreadyExistsError'; throw e; } this.ran.push(k); }
        async deleteMapping() {}
    }

    const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/integration-runtime-queue';
    const setup = (defs) => {
        const definitions = d.memoryDefinitions(defs);
        const Cls = d.defineSharedIntegrationClass({ definitions, manifests, modules: { asana: {}, slack: {} }, IntegrationBase: Base, runs: false });
        const install = (id, config, status) => {
            const inst = new Cls({ id, status, config: { type: 'integration-runtime', ...config } });
            const api = new Proxy({}, { get: () => async () => ({ id: 'X1' }) });   // install steps succeed
            inst.asana = { api }; inst.slack = { api };
            return inst;
        };
        /** The tick over the installations' records, as the Lambda runs it (fake repository and queue). */
        const tickAt = async (installations, time) => {
            const sent = [];
            const integrationRepository = { findIntegrations: async ({ type, status }) => installations.filter((i) => i.status === status && i.config.type === type).map((i) => ({ id: i.id, status: i.status, config: i.config })) };
            const queue = { batchSend: async (entries) => { sent.push(...entries); }, send: async () => {} };
            await new RunTriggerTick({ integrationClass: Cls, integrationRepository, queue, queueUrl: QUEUE_URL }).execute({ tick: '5m', time });
            return sent;
        };
        return { Cls, install, tickAt, QUEUE_URL };
    };
    // The digest runs at 16:00 New York on weekdays: 20:00Z on Monday 2026-10-19 (EDT).
    const DUE = '2026-10-19T20:00:00Z';

    beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { jest.restoreAllMocks(); });

    it('the class declares one 5m tick for all its installations, and nothing per installation', () => {
        const { Cls } = setup([digestDef()]);
        expect(provisioningOf(Cls)).toEqual({ ticks: [5], at: [] });
    });

    it('create, update and delete schedule nothing; the tick reads the current config each time', async () => {
        const scheduler = require('../../../application/commands/scheduler-commands');
        const spy = jest.spyOn(scheduler, 'createSchedulerCommands');
        const { install, tickAt } = setup([digestDef()]);
        const inst = install('int9', { definition: { id: 'asana-slack', version: digestDef().version }, settings: { workspace: 'W1', project: 'P1' }, workflows: { 'completed-in-project': { enabled: true, settings: { channel: 'C1' } } } });
        await inst.initialize();
        await inst.onCreate();
        expect(inst.status).toBe('ENABLED');
        expect(await tickAt([inst], DUE)).toEqual([{ event: 'FRIGG_TRIGGER_RUN', data: { integrationId: 'int9', trigger: DIGEST, scheduledFor: '2026-10-19T20:00:00.000Z' } }]);
        expect(await tickAt([inst], '2026-10-19T20:05:00Z')).toEqual([]);

        // Retimed to every 3 hours: due on the slots the installation's hash picks, 36 ticks apart.
        const workflows = (digest) => ({ workflows: { 'completed-in-project': { enabled: true, settings: { channel: 'C1' } }, 'due-tomorrow-digest': digest } });
        await inst.onUpdate({ config: workflows({ enabled: true, schedule: { every: '3h' } }) });
        expect(inst.status).toBe('ENABLED');
        const slots = [];
        for (let k = 0; k < 72; k += 1) if ((await tickAt([inst], new Date(Date.parse(DUE) + k * 300000).toISOString())).length) slots.push(k);
        expect(slots).toHaveLength(2);
        expect(slots[1] - slots[0]).toBe(36);

        // Under the floor: the definition's timing stays, and the installation is told why.
        await inst.onUpdate({ config: workflows({ enabled: true, schedule: { every: '10m' } }) });
        expect((await tickAt([inst], DUE)).map((m) => m.data.trigger)).toEqual([DIGEST]);
        expect(inst.updateIntegrationMessages.execute).toHaveBeenCalledWith('int9', 'warnings', 'Trigger timing not changed', `${DIGEST}: Runs every 10 minutes at its most frequent; the minimum is 1h`, expect.any(Number));

        // Switched off: no trigger. Disabled or deleted: not read at all.
        await inst.onUpdate({ config: workflows({ enabled: false }) });
        expect(await tickAt([inst], DUE)).toEqual([]);
        await inst.onUpdate({ config: workflows({ enabled: true }) });
        expect(await tickAt([inst], DUE)).toHaveLength(1);
        inst.status = 'DISABLED';
        expect(await tickAt([inst], DUE)).toEqual([]);
        await inst.onDelete();
        expect(spy).not.toHaveBeenCalled();
    });

    it('an upgrade changes what the next tick finds due, and drops a choice the new version disallows', async () => {
        const v2 = digestDef({ configurable: false, version: '2.0.0' });
        v2.workflows.find((x) => x.id === 'due-tomorrow-digest').trigger.cron = '0 15 * * 1-5';
        const { install, tickAt } = setup([digestDef(), v2]);
        const inst = install('int9', { definition: { id: 'asana-slack', version: digestDef().version }, settings: { workspace: 'W1', project: 'P1' }, workflows: { 'due-tomorrow-digest': { enabled: true, schedule: { every: '2h' } }, 'completed-in-project': { enabled: true, settings: { channel: 'C1' } } } });
        await inst.initialize();
        await inst.onCreate();
        expect(inst.status).toBe('ENABLED');
        // every 2h (24 ticks): due only where this installation's hash puts it, never because of the 16:00 cron
        const twoHourly = [];
        for (let k = 0; k < 24; k += 1) if ((await tickAt([inst], new Date(Date.parse(DUE) + k * 300000).toISOString())).length) twoHourly.push(k);
        expect(twoHourly).toHaveLength(1);

        const out = await inst.upgradeTo('2.0.0', { apply: true });
        expect(out.applied).toBe(true);
        expect(out.actions).toContainEqual(expect.objectContaining({ kind: 'reschedule' }));
        expect(inst.config.workflows['due-tomorrow-digest'].schedule).toBeUndefined();
        expect(await tickAt([inst], '2026-10-19T19:00:00Z')).toEqual([expect.objectContaining({ data: expect.objectContaining({ trigger: DIGEST, scheduledFor: '2026-10-19T19:00:00.000Z' }) })]);
        expect(await tickAt([inst], DUE)).toEqual([]);
    });

    it('the shared tick also covers each published definition, an integration type of its own', async () => {
        const { Cls, install, tickAt } = setup([digestDef()]);
        expect(await Cls.triggerTypes()).toEqual(['integration-runtime', 'asana-slack']);
        const pin = { definition: { id: 'asana-slack', version: digestDef().version } };
        const hosted = install('int7', { type: 'asana-slack', ...pin }, 'ENABLED');
        const legacy = install('int8', pin, 'ENABLED');   // { type: 'integration-runtime', definition } still works
        const due = await tickAt([hosted, legacy], DUE);
        expect(due.map((m) => [m.data.integrationId, m.data.trigger]).sort()).toEqual([['int7', DIGEST], ['int8', DIGEST]]);

        // A tick that runs out of time hands on a cursor naming the type it stopped in, and the next one carries on there.
        const rows = [legacy, hosted].map((i) => ({ id: i.id, status: i.status, config: i.config }));
        const integrationRepository = { findIntegrations: async ({ type, after }) => rows.filter((r) => r.config.type === type && (after == null || r.id > after)) };
        const handedOn = [];
        const sent = [];
        const queue = { batchSend: async (entries) => { sent.push(...entries); }, send: async (m) => { handedOn.push(m); } };
        const tick = (cursor) => new RunTriggerTick({ integrationClass: Cls, integrationRepository, queue, queueUrl: 'https://sqs/q', pageSize: 1 }).execute({ tick: '5m', time: DUE, cursor, remainingMs: () => 0 });
        await tick();
        expect(handedOn.map((m) => m.data.cursor)).toEqual([{ type: 'integration-runtime', after: 'int8' }]);
        await tick(handedOn[0].data.cursor);
        expect(handedOn.map((m) => m.data.cursor)).toEqual([{ type: 'integration-runtime', after: 'int8' }, { type: 'asana-slack', after: null }]);
        await tick(handedOn[1].data.cursor);
        expect(sent.map((m) => m.data.integrationId)).toEqual(['int8', 'int7']);
    });

    it('a run delivered twice runs once: the trigger and its scheduled time are the dedupe id', async () => {
        const { install } = setup([digestDef()]);
        const inst = install('int9', { definition: { id: 'asana-slack', version: digestDef().version } }, 'ENABLED');
        await inst.initialize();
        const runs = [];
        inst.recordRun = async (r) => { runs.push(r); return r; };
        const run = { integrationId: 'int9', trigger: DIGEST, scheduledFor: '2026-10-19T20:00:00.000Z' };
        const dispatch = () => new IntegrationEventDispatcher(inst).dispatchJob({ event: 'FRIGG_TRIGGER_RUN', data: run });
        await dispatch();
        await dispatch();
        expect(runs.map((r) => r.status)).toEqual([expect.not.stringMatching(/duplicate/), 'duplicate']);
        expect(runs[0].trigger.eventId).toBe(`tick:${DIGEST}:2026-10-19T20:00:00.000Z`);
        // A different scheduled time is a different run.
        await new IntegrationEventDispatcher(inst).dispatchJob({ event: 'FRIGG_TRIGGER_RUN', data: { ...run, scheduledFor: '2026-10-20T20:00:00.000Z' } });
        expect(runs[2].status).not.toBe('duplicate');
    });
});
