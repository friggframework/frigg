const { IntegrationEventDispatcher } = require('./integration-event-dispatcher');
const { IntegrationBase } = require('../integrations/integration-base');

class SimulatedAsanaIntegration extends IntegrationBase {
    static Definition = {
        name: 'asana',
        version: '1.0.0',
        modules: {},
        routes: [
            { path: '/auth', method: 'GET', event: 'AUTH_REQUEST' },
            { path: '/auth/redirect/:provider', method: 'GET', event: 'AUTH_REDIRECT' },
            { path: '/form', method: 'GET', event: 'LOAD_FORM' },
        ],
    };

    constructor(params = {}) {
        super(params);
        this.events = {
            AUTH_REQUEST: { handler: this.authRequest.bind(this) },
            AUTH_REDIRECT: { handler: this.authRedirect.bind(this) },
            LOAD_FORM: { handler: this.loadForm.bind(this) },
        };
    }

    async authRequest() {
        return {
            success: true,
            action: 'redirect',
            hydrated: this.isHydrated,
        };
    }

    async authRedirect({ req }) {
        const { code } = req.query || {};
        return {
            success: true,
            action: 'tokens_received',
            receivedCode: code,
            hydrated: this.isHydrated,
        };
    }

    async loadForm() {
        if (!this.isHydrated && SimulatedAsanaIntegration.testRecord) {
            this.setIntegrationRecord({
                record: SimulatedAsanaIntegration.testRecord.record,
                modules: SimulatedAsanaIntegration.testRecord.modules,
            });
        }

        this.assertHydrated('Integration not found - must authenticate first');

        return {
            success: true,
            form: {
                fields: ['field1', 'field2'],
            },
            integrationId: this.id,
        };
    }
}

describe('IntegrationEventDispatcher auth flow', () => {
    const createDispatcher = () =>
        new IntegrationEventDispatcher(new SimulatedAsanaIntegration());

    beforeEach(() => {
        SimulatedAsanaIntegration.testRecord = null;
    });

    it('handles auth request without hydration', async () => {
        const dispatcher = createDispatcher();
        const result = await dispatcher.dispatchHttp({
            event: 'AUTH_REQUEST',
            req: { params: { provider: 'asana' }, query: {} },
            res: {},
            next: jest.fn(),
        });

        expect(result).toEqual({ success: true, action: 'redirect', hydrated: false });
    });

    it('handles auth redirect without hydration', async () => {
        const dispatcher = createDispatcher();
        const result = await dispatcher.dispatchHttp({
            event: 'AUTH_REDIRECT',
            req: { params: { provider: 'asana' }, query: { code: 'abc123' } },
            res: {},
            next: jest.fn(),
        });

        expect(result).toEqual({
            success: true,
            action: 'tokens_received',
            receivedCode: 'abc123',
            hydrated: false,
        });
    });

    it('throws for protected routes when no record is loaded', async () => {
        const dispatcher = createDispatcher();
        await expect(
            dispatcher.dispatchHttp({
                event: 'LOAD_FORM',
                req: { query: {} },
                res: {},
                next: jest.fn(),
            })
        ).rejects.toThrow('Integration not found - must authenticate first');
    });

    it('allows handlers to hydrate explicitly before continuing', async () => {
        SimulatedAsanaIntegration.testRecord = {
            record: {
                id: 'integration-123',
                userId: 'user-456',
                config: { type: 'asana' },
                status: 'ENABLED',
                version: '1.0.0',
                messages: { errors: [], warnings: [] },
                entities: [],
            },
            modules: [],
        };

        const dispatcher = createDispatcher();
        const result = await dispatcher.dispatchHttp({
            event: 'LOAD_FORM',
            req: { query: {} },
            res: {},
            next: jest.fn(),
        });

        expect(result).toEqual({
            success: true,
            form: { fields: ['field1', 'field2'] },
            integrationId: 'integration-123',
        });
    });
});
