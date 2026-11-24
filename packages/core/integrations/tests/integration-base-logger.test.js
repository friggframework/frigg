jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { IntegrationBase } = require('../integration-base');
const { createMemorySink } = require('../../logs');
const { NoOpTelemetry } = require('../../telemetry/no-op-telemetry');
const {
    setTelemetryForTests,
    resetTelemetryRuntimeForTests,
} = require('../../telemetry/telemetry-runtime');

class HubspotIntegration extends IntegrationBase {
    static Definition = { name: 'hubspot', version: '1.2.3', modules: {} };
}

const hydrate = (integration) =>
    integration.setIntegrationRecord({
        record: { id: 'int_1', userId: 'user_1', version: '2.0.0' },
    });

let sink;

beforeEach(() => {
    setTelemetryForTests(new NoOpTelemetry());
    sink = createMemorySink();
});

afterEach(() => resetTelemetryRuntimeForTests());

describe('IntegrationBase logger', () => {
    it('gives every instance a logger with the six level methods', () => {
        const integration = new HubspotIntegration();
        for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
            expect(typeof integration.logger[level]).toBe('function');
        }
    });

    it('names the logger integration.<Definition.name>', () => {
        const integration = new HubspotIntegration();
        integration.logger.info('hello');
        expect(sink.records[0].logger).toBe('integration.hubspot');
    });

    it('reads the bindings per record, so ids set after construction appear', () => {
        const integration = new HubspotIntegration();
        const logger = integration.logger;
        logger.info('before');
        hydrate(integration);
        logger.info('after');

        expect(sink.records[0]).not.toHaveProperty('integrationId');
        expect(sink.records[0].integrationType).toBe('hubspot');
        expect(sink.records[0].version).toBe('1.2.3');
        expect(sink.records[1]).toMatchObject({
            integrationId: 'int_1',
            integrationType: 'hubspot',
            userId: 'user_1',
            version: '2.0.0',
        });
    });

    it('does not bind stage or appName, so nothing is dropped', () => {
        const previous = process.env.FRIGG_STACK;
        process.env.FRIGG_STACK = 'my-app';
        try {
            const integration = new HubspotIntegration();
            hydrate(integration);
            expect(integration.getLoggerBindings()).toEqual({
                integrationId: 'int_1',
                integrationType: 'hubspot',
                userId: 'user_1',
                version: '2.0.0',
            });
            integration.logger.info('x');
            expect(sink.records[0]).not.toHaveProperty('droppedKeys');
        } finally {
            if (previous === undefined) delete process.env.FRIGG_STACK;
            else process.env.FRIGG_STACK = previous;
        }
    });

    it('binds no entityId or credentialId', () => {
        const integration = new HubspotIntegration();
        hydrate(integration);
        integration.logger.info('x');
        expect(sink.records[0]).not.toHaveProperty('entityId');
        expect(sink.records[0]).not.toHaveProperty('credentialId');
    });

    it('a record inside send() carries integrationEvent', async () => {
        class SendingIntegration extends HubspotIntegration {
            constructor(params) {
                super(params);
                this.events = {
                    SYNC_NOW: {
                        type: 'USER_ACTION',
                        handler: async () => this.logger.info('syncing'),
                    },
                };
            }
        }
        const integration = new SendingIntegration();
        hydrate(integration);
        integration.registerEventHandlers();

        await integration.send('SYNC_NOW');
        integration.logger.info('outside');

        const inside = sink.records.find((r) => r.message === 'syncing');
        const outside = sink.records.find((r) => r.message === 'outside');
        expect(inside).toMatchObject({
            integrationEvent: 'SYNC_NOW',
            integrationId: 'int_1',
        });
        expect(outside).not.toHaveProperty('integrationEvent');
    });

    it('falls back to integration.unknown without a Definition name', () => {
        class Nameless extends IntegrationBase {
            static Definition = { modules: {} };
        }
        new Nameless().logger.info('x');
        expect(sink.records[0].logger).toBe('integration.unknown');
    });
});
