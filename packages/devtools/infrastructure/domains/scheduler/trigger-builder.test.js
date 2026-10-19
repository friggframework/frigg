/**
 * TriggerBuilder (ADR-055 §2): one tick function per integration with triggers, one schedule per distinct tick and
 * one per `at` trigger, never anything per installation.
 */
const { TriggerBuilder, rateExpression } = require('./trigger-builder');
const { applyFunctionEnvironments } = require('../shared/function-environments');

const poll = { every: '15m', handler: 'poll' };

describe('TriggerBuilder', () => {
    beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { jest.restoreAllMocks(); });

    it('runs when, and only when, an integration declares triggers (code or per installation)', () => {
        const b = new TriggerBuilder();
        expect(b.shouldExecute({ integrations: [{ Definition: { name: 'a', triggers: { poll } } }] })).toBe(true);
        expect(b.shouldExecute({ integrations: [{ Definition: { name: 'dd', instanceTriggers: { tick: '5m' } } }] })).toBe(true);
        expect(b.shouldExecute({ integrations: [{ Definition: { name: 'a', webhooks: true } }] })).toBe(false);
        expect(b.shouldExecute({ integrations: [{ Definition: { name: 'a', triggers: {} } }] })).toBe(false);
        expect(b.shouldExecute({})).toBe(false);
        expect(b.getDependencies()).toEqual(['IntegrationBuilder']);
    });

    it('writes rate() in the largest whole unit EventBridge accepts', () => {
        expect([1, 5, 60, 90, 120, 1440].map(rateExpression)).toEqual(['rate(1 minute)', 'rate(5 minutes)', 'rate(1 hour)', 'rate(90 minutes)', 'rate(2 hours)', 'rate(1 day)']);
    });

    it('emits one function per integration: a schedule per distinct tick and one per at trigger, with its zone', async () => {
        const appDefinition = {
            integrations: [
                { Definition: { name: 'crm', triggers: {
                    poll,
                    sync: { every: '1h', configurable: { min: '15m' }, handler: 'sync' },   // 15m tick: same schedule as poll
                    digest: { cron: '0 8 * * 1-5', timezone: 'America/New_York', handler: 'digest' },   // 5m
                    nightly: { at: 'cron(0 3 * * ? *)', timezone: 'Europe/London', handler: 'nightly' },
                } } },
                { Definition: { name: 'plain' } },
            ],
        };
        const result = await new TriggerBuilder().build(appDefinition, {});
        expect(Object.keys(result.functions)).toEqual(['crmTriggers']);
        const fn = result.functions.crmTriggers;
        expect(fn).toMatchObject({
            handler: 'node_modules/@friggframework/core/handlers/workers/integration-triggers.handlers.crm.tick',
            skipEsbuild: true,
            layers: [{ Ref: 'PrismaLambdaLayer' }],
            timeout: 300,
        });
        expect(fn.events).toEqual([
            { schedule: { rate: ['rate(5 minutes)'], inputTransformer: { inputPathsMap: { time: '$.time' }, inputTemplate: '{"tick":"5m","time":<time>}' } } },
            { schedule: { rate: ['rate(15 minutes)'], inputTransformer: { inputPathsMap: { time: '$.time' }, inputTemplate: '{"tick":"15m","time":<time>}' } } },
            { schedule: { method: 'scheduler', rate: ['cron(0 3 * * ? *)'], timezone: 'Europe/London', input: { at: 'nightly', time: '<aws.scheduler.scheduled-time>' } } },
        ]);
        // The tick never calls EventBridge Scheduler at runtime: no scheduler IAM, no resources.
        expect(result.iamStatements).toEqual([]);
        expect(result.resources).toEqual({});
        // The inputTemplate is valid JSON once EventBridge fills <time>.
        expect(JSON.parse(fn.events[0].schedule.inputTransformer.inputTemplate.replace('<time>', '"2026-10-19T12:00:00Z"'))).toEqual({ tick: '5m', time: '2026-10-19T12:00:00Z' });
    });

    it('leaves the Prisma layer off when the app bundles Prisma', async () => {
        const result = await new TriggerBuilder().build({ usePrismaLambdaLayer: false, integrations: [{ Definition: { name: 'crm', triggers: { poll } } }] }, {});
        expect(result.functions.crmTriggers.layers).toBeUndefined();
    });

    it('fails validation, naming the integration, when a trigger cannot be provisioned', () => {
        const v = new TriggerBuilder().validate({ integrations: [{ Definition: { name: 'crm', triggers: { bad: { every: 'often', handler: 'x' } } } }] });
        expect(v.valid).toBe(false);
        expect(v.errors[0]).toMatch(/Integration "crm" declares invalid triggers: bad: every "often"/);
    });

    it('scoped env: the queue URL reaches the tick function, through the shared function-name contract', async () => {
        const { IntegrationBuilder } = require('../integration/integration-builder');
        const integration = { Definition: { name: 'crm', triggers: { poll } } };
        const ib = new IntegrationBuilder();
        const result = { functionEnvironments: {}, environment: {} };
        ib.setQueueUrlEnvironment('crm', { Ref: 'CrmQueue' }, result, { lambda: { scopedEnvironment: true }, integrations: [integration] });
        const functions = { auth: {}, crm: {}, crmQueueWorker: {}, ...(await new TriggerBuilder().build({ integrations: [integration] }, {})).functions };
        applyFunctionEnvironments(functions, result.functionEnvironments);
        expect(functions.crmTriggers.environment).toEqual({ CRM_QUEUE_URL: { Ref: 'CrmQueue' } });
    });
});
