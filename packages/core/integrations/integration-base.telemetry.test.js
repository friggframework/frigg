// Mock database config before importing IntegrationBase — its repository
// class-fields read DB_TYPE during construction.
jest.mock('../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('./integration-base');
const { NoOpTelemetry } = require('../telemetry/no-op-telemetry');
const { createTelemetryEventBus } = require('../telemetry/telemetry-event-bus');
const {
    setTelemetryForTests,
    resetTelemetryRuntimeForTests,
} = require('../telemetry/telemetry-runtime');

class TestIntegration extends IntegrationBase {
    static Definition = { name: 'hubspot', version: '1.2.3', modules: {} };
}

// IntegrationBase reads the telemetry singleton at construction, so tests
// install their instance there and reset it afterward.
afterEach(() => resetTelemetryRuntimeForTests());

function metricHarness() {
    const bus = createTelemetryEventBus();
    const telemetry = new NoOpTelemetry({ bus });
    const metrics = [];
    bus.on('metric', (m) => metrics.push(m));
    setTelemetryForTests(telemetry);
    return { metrics };
}

describe('IntegrationBase — telemetry context (ADR-011 P5)', () => {
    it('exposes a telemetry service on every instance', () => {
        const integration = new TestIntegration();
        expect(typeof integration.telemetry.count).toBe('function');
        expect(typeof integration.telemetry.span).toBe('function');
    });

    it('binds the telemetry so instance emissions carry integration_type', () => {
        const fake = { count: jest.fn(), span() {}, on() {}, event() {} };
        setTelemetryForTests(fake);
        const integration = new TestIntegration();
        integration.setIntegrationRecord({
            record: { id: 'i1', userId: 'u1', version: '1.2.3' },
            modules: [],
        });

        integration.telemetry.count('records.synced', 2, { entity: 'deal' });

        // integration_type rides attributes; the full id set rides the bus
        // context — both injected by the bound service, no per-call boilerplate.
        expect(fake.count).toHaveBeenCalledWith(
            'records.synced',
            2,
            { integration_type: 'hubspot', entity: 'deal' },
            expect.objectContaining({
                integrationId: 'i1',
                integrationType: 'hubspot',
                userId: 'u1',
            })
        );
    });

    it('does not hydrate a record when constructed without one', () => {
        const integration = new TestIntegration();
        expect(integration.isHydrated).toBe(false);
        expect(integration.id).toBeUndefined();
    });

    it('builds the standard identifier context from the record + Definition', () => {
        const integration = new TestIntegration();
        integration.setIntegrationRecord({
            record: { id: 'int_1', userId: 'user_9', version: '1.2.3' },
            modules: [],
        });

        const ctx = integration.getTelemetryContext();

        expect(ctx).toMatchObject({
            integrationId: 'int_1',
            integrationType: 'hubspot',
            userId: 'user_9',
            version: '1.2.3',
        });
    });

    it('falls back to Definition version and null ids when unhydrated', () => {
        const integration = new TestIntegration();

        const ctx = integration.getTelemetryContext();

        expect(ctx.integrationType).toBe('hubspot');
        expect(ctx.version).toBe('1.2.3');
        expect(ctx.integrationId).toBeNull();
        expect(ctx.userId).toBeNull();
    });

    describe('instantiation event (ADR-011 Decision 2 — logged once)', () => {
        function eventHarness() {
            const bus = createTelemetryEventBus();
            const telemetry = new NoOpTelemetry({ bus });
            const events = [];
            bus.on('event', (e) => events.push(e));
            setTelemetryForTests(telemetry);
            return { events };
        }

        it('emits frigg.integration.instantiated once, carrying the standard id set, when hydrated', () => {
            const { events } = eventHarness();
            const integration = new TestIntegration();
            integration.setIntegrationRecord({
                record: { id: 'i1', userId: 'u1', version: '1.2.3' },
                modules: [],
            });

            const opened = events.filter(
                (e) => e.name === 'frigg.integration.instantiated'
            );
            expect(opened).toHaveLength(1);
            expect(opened[0].attributes).toMatchObject({
                integration_type: 'hubspot',
            });
            expect(opened[0].context).toMatchObject({
                integrationId: 'i1',
                integrationType: 'hubspot',
                userId: 'u1',
            });
        });

        it('does not emit for an unhydrated instance', () => {
            const { events } = eventHarness();
            new TestIntegration();
            expect(
                events.find(
                    (e) => e.name === 'frigg.integration.instantiated'
                )
            ).toBeUndefined();
        });

        it('emits at most once even if setIntegrationRecord runs again', () => {
            const { events } = eventHarness();
            const integration = new TestIntegration();
            const rec = {
                record: { id: 'i1', userId: 'u1', version: '1.2.3' },
                modules: [],
            };
            integration.setIntegrationRecord(rec);
            integration.setIntegrationRecord(rec);
            const opened = events.filter(
                (e) => e.name === 'frigg.integration.instantiated'
            );
            expect(opened).toHaveLength(1);
        });
    });

    describe('send() auto-instrumentation', () => {
        it('emits a handler-invocation metric keyed by event type and returns the result', async () => {
            const { metrics } = metricHarness();
            const integration = new TestIntegration();
            integration.setIntegrationRecord({
                record: { id: 'i1', userId: 'u1', version: '1.2.3' },
                modules: [],
            });
            integration.on = {
                DO_THING: {
                    type: 'USER_ACTION',
                    handler: async () => 'result',
                },
            };

            const result = await integration.send('DO_THING', {});

            expect(result).toBe('result');
            expect(metrics).toContainEqual(
                expect.objectContaining({
                    name: 'frigg.handler.invocations',
                    value: 1,
                    attributes: {
                        integration_type: 'hubspot',
                        event: 'USER_ACTION',
                        status: 'ok',
                    },
                })
            );
        });

        it('emits error status and re-throws when the handler throws', async () => {
            const { metrics } = metricHarness();
            const integration = new TestIntegration();
            integration.on = {
                DO_THING: {
                    type: 'USER_ACTION',
                    handler: async () => {
                        throw new Error('nope');
                    },
                },
            };

            await expect(integration.send('DO_THING')).rejects.toThrow('nope');
            expect(
                metrics.find((m) => m.attributes.status === 'error')
            ).toBeDefined();
        });
    });
});
