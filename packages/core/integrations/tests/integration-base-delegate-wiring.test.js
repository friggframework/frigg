jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');

/**
 * The Delegate wiring between Module instances and their parent Integration
 * lives in IntegrationBase._appendModules so that every code path that
 * constructs an Integration (HTTP read, webhook queue worker, create/update
 * flows, etc.) gets the bridge installed automatically.
 */
describe('IntegrationBase — module.delegate wiring', () => {
    it('sets module.delegate = this for every module attached at construction', () => {
        const moduleA = { getName: () => 'a', delegate: null };
        const moduleB = { getName: () => 'b', delegate: null };

        const integration = new IntegrationBase({
            id: 'int-1',
            userId: 'user-1',
            entities: [],
            config: { type: 'test' },
            status: 'ENABLED',
            version: '0.0.0',
            messages: {},
            modules: [moduleA, moduleB],
        });

        expect(moduleA.delegate).toBe(integration);
        expect(moduleB.delegate).toBe(integration);
    });

    it('keeps delegate wiring intact after initialize() merges Tier 3 extensions', async () => {
        const moduleA = { getName: () => 'a', delegate: null };

        class ExtAwareIntegration extends IntegrationBase {
            static Definition = {
                name: 'ext-aware',
                version: '1.0.0',
                modules: {},
                extensions: {
                    noop: {
                        extension: {
                            name: 'noop',
                            routes: [],
                            events: {
                                NOOP: { handler: async () => null },
                            },
                        },
                    },
                },
            };
        }

        const integration = new ExtAwareIntegration({
            id: 'int-2',
            userId: 'user-2',
            entities: [],
            config: { type: 'test' },
            status: 'ENABLED',
            version: '0.0.0',
            messages: {},
            modules: [moduleA],
        });

        await integration.initialize();

        expect(moduleA.delegate).toBe(integration);
        expect(integration.events.NOOP).toBeDefined();
    });
});
