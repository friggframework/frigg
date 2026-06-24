/**
 * Tests for the per-event `dispatch` axis on IntegrationBase.
 *
 * `dispatch: 'sync'` (default) runs the handler in-process; `dispatch: 'queue'`
 * is read by the dispatch helper to route the event through the FIFO queue.
 * Here we only assert that the flag is resolved correctly onto `this.on`.
 */

jest.mock('../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('./integration-base');

describe('IntegrationBase - dispatch axis', () => {
    it('defaults to no dispatch flag (sync) when nothing is declared', async () => {
        class TestIntegration extends IntegrationBase {
            static Definition = { name: 'test', version: '1.0.0', modules: {} };
        }

        const integration = new TestIntegration();
        await integration.initialize();

        expect(integration.on.ON_UPDATE.dispatch).toBeUndefined();
    });

    it('applies Definition.eventDispatch onto default lifecycle events', async () => {
        class TestIntegration extends IntegrationBase {
            static Definition = {
                name: 'test',
                version: '1.0.0',
                modules: {},
                eventDispatch: { ON_UPDATE: 'queue' },
            };
        }

        const integration = new TestIntegration();
        await integration.initialize();

        expect(integration.on.ON_UPDATE.dispatch).toBe('queue');
        // Untargeted events stay sync (no flag).
        expect(integration.on.ON_CREATE.dispatch).toBeUndefined();
    });

    it('preserves an inline dispatch flag on a custom event', async () => {
        class TestIntegration extends IntegrationBase {
            constructor(params) {
                super(params);
                this.events = {
                    ...this.events,
                    MY_ACTION: {
                        type: 'USER_ACTION',
                        dispatch: 'queue',
                        handler: () => 'ok',
                    },
                };
            }
            static Definition = { name: 'test', version: '1.0.0', modules: {} };
        }

        const integration = new TestIntegration();
        await integration.initialize();

        expect(integration.on.MY_ACTION.dispatch).toBe('queue');
    });

    it('lets an inline dispatch flag win over the eventDispatch map', async () => {
        class TestIntegration extends IntegrationBase {
            constructor(params) {
                super(params);
                // Re-declare ON_UPDATE inline as sync; the map says queue.
                this.events = {
                    ...this.events,
                    ON_UPDATE: {
                        type: 'LIFE_CYCLE_EVENT',
                        dispatch: 'sync',
                        handler: () => 'ok',
                    },
                };
            }
            static Definition = {
                name: 'test',
                version: '1.0.0',
                modules: {},
                eventDispatch: { ON_UPDATE: 'queue' },
            };
        }

        const integration = new TestIntegration();
        await integration.initialize();

        expect(integration.on.ON_UPDATE.dispatch).toBe('sync');
    });

    it('ignores unknown event names in eventDispatch without crashing', async () => {
        class TestIntegration extends IntegrationBase {
            static Definition = {
                name: 'test',
                version: '1.0.0',
                modules: {},
                eventDispatch: { NOPE_NOT_A_REAL_EVENT: 'queue' },
            };
        }

        const integration = new TestIntegration();
        await expect(integration.initialize()).resolves.not.toThrow();
        expect(integration.on.NOPE_NOT_A_REAL_EVENT).toBeUndefined();
    });

    it('preserves dispatch on events merged from a Tier 3 extension', async () => {
        const extension = {
            name: 'my-extension',
            events: {
                EXT_ACTION: {
                    type: 'USER_ACTION',
                    dispatch: 'queue',
                    handler: () => 'ext',
                },
            },
        };

        class TestIntegration extends IntegrationBase {
            static Definition = {
                name: 'test',
                version: '1.0.0',
                modules: {},
                extensions: { myBinding: { extension } },
            };
        }

        const integration = new TestIntegration();
        await integration.initialize();

        expect(integration.on.EXT_ACTION.dispatch).toBe('queue');
    });
});
