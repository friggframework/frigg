const { IntegrationEventDispatcher } = require('./integration-event-dispatcher');
const { IntegrationBase } = require('../integrations/integration-base');

class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test-integration',
        version: '1.0.0',
        modules: {},
        routes: [
            { path: '/auth', method: 'GET', event: 'AUTH_REQUEST' },
            { path: '/data', method: 'GET', event: 'LOAD_DATA' },
            { path: '/job', method: 'POST', event: 'TEST_EVENT' },
            { path: '/dynamic', method: 'GET', event: 'DYNAMIC_EVENT' },
        ],
    };

    constructor(params) {
        super(params);
        this.events = {
            AUTH_REQUEST: { handler: this.authRequest.bind(this) },
            LOAD_DATA: { handler: this.loadData.bind(this) },
            TEST_EVENT: { handler: this.testHandler.bind(this) },
        };
    }

    async authRequest() {
        TestIntegration.latestInstance = this;
        return {
            success: true,
            hydrated: this.isHydrated,
        };
    }

    async loadData() {
        this.assertHydrated('loadData requires hydration');
        return { success: true };
    }

    async testHandler({ data }) {
        TestIntegration.latestInstance = this;
        return { received: data };
    }

    async initialize() {
        this.events = {
            ...this.events,
            DYNAMIC_EVENT: { handler: this.dynamicHandler.bind(this) },
        };
    }

    async dynamicHandler() {
        TestIntegration.latestInstance = this;
        return { dynamic: true };
    }
}

describe('IntegrationEventDispatcher', () => {
    const createDispatcher = () =>
        new IntegrationEventDispatcher(new TestIntegration());

    beforeEach(() => {
        TestIntegration.latestInstance = null;
    });

    describe('dispatchHttp', () => {
        it('creates a stateless integration instance for HTTP events', async () => {
            const dispatcher = createDispatcher();
            const result = await dispatcher.dispatchHttp({
                event: 'AUTH_REQUEST',
                req: {},
                res: {},
                next: jest.fn(),
            });

            expect(result).toEqual({ success: true, hydrated: false });
            expect(TestIntegration.latestInstance).toBeInstanceOf(TestIntegration);
            expect(TestIntegration.latestInstance.isHydrated).toBe(false);
        });

        it('calls initialize to register dynamic events', async () => {
            const dispatcher = createDispatcher();
            await dispatcher.integrationInstance.initialize();
            const result = await dispatcher.dispatchHttp({
                event: 'DYNAMIC_EVENT',
                req: {},
                res: {},
                next: jest.fn(),
            });

            expect(result).toEqual({ dynamic: true });
            expect(TestIntegration.latestInstance).toBeInstanceOf(TestIntegration);
        });

        it('throws when requesting an unknown event', async () => {
            const dispatcher = createDispatcher();
            await expect(
                dispatcher.dispatchHttp({
                    event: 'UNKNOWN',
                    req: {},
                    res: {},
                    next: jest.fn(),
                })
            ).rejects.toThrow('Event UNKNOWN not registered for test-integration');
        });

        it('does not hydrate automatically for handlers that require data', async () => {
            const dispatcher = createDispatcher();
            await expect(
                dispatcher.dispatchHttp({
                    event: 'LOAD_DATA',
                    req: {},
                    res: {},
                    next: jest.fn(),
                })
            ).rejects.toThrow('loadData requires hydration');
        });
    });

    describe('dispatchJob', () => {
        it('creates a stateless integration instance for job events', async () => {
            const payload = { foo: 'bar' };
            const dispatcher = createDispatcher();
            const result = await dispatcher.dispatchJob({
                event: 'TEST_EVENT',
                data: payload,
                context: {},
            });

            expect(result).toEqual({ received: payload });
            expect(TestIntegration.latestInstance).toBeInstanceOf(TestIntegration);
            expect(TestIntegration.latestInstance.isHydrated).toBe(false);
        });
    });
});
