/**
 * The user action routes end to end through the real router and
 * GetIntegrationInstance over an in-memory integration repository: only
 * events the integration lists as user actions may run, and an integration
 * the caller does not own answers like one that does not exist.
 */
const mockIntegrations = [];
const mockHandlers = {};

jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));
jest.mock('../../handlers/app-definition-loader', () => ({
    loadAppDefinition: () => ({
        integrations: [mockIntegrationClass()],
        userConfig: {},
    }),
}));
jest.mock('../repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({
        // Like the real repositories, which throw rather than return null.
        findIntegrationById: async (id) => {
            const record = mockIntegrations.find((i) => i.id === String(id));
            if (!record) throw new Error(`Integration with id ${id} not found`);
            return record;
        },
    }),
}));
jest.mock('../../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));

function mockIntegrationClass() {
    const { IntegrationBase } = require('../integration-base');

    class ActionsIntegration extends IntegrationBase {
        static Definition = {
            name: 'actions-sync',
            version: '1.0.0',
            modules: {},
        };

        constructor(params) {
            super(params);
            this.events = {
                RUN_INITIAL_SYNC: {
                    type: 'USER_ACTION',
                    handler: (body) => mockHandlers.RUN_INITIAL_SYNC(body),
                },
                SYNC_PAGE: {
                    type: 'QUEUE',
                    handler: (body) => mockHandlers.SYNC_PAGE(body),
                },
            };
        }

        async loadDynamicUserActions() {
            await mockHandlers.LOAD_DYNAMIC_USER_ACTIONS();
            return {
                DYNAMIC_ACTION: {
                    type: 'USER_ACTION',
                    handler: (body) => mockHandlers.DYNAMIC_ACTION(body),
                },
                UNTYPED_DYNAMIC_ACTION: {
                    handler: (body) =>
                        mockHandlers.UNTYPED_DYNAMIC_ACTION(body),
                },
                DYNAMIC_QUEUE_EVENT: {
                    type: 'QUEUE',
                    handler: (body) => mockHandlers.DYNAMIC_QUEUE_EVENT(body),
                },
            };
        }

        async onDelete() {
            return mockHandlers.ON_DELETE();
        }

        async getActionOptions({ actionId }) {
            return { actionId };
        }

        async refreshActionOptions({ actionId }) {
            return { actionId, refreshed: true };
        }
    }
    return ActionsIntegration;
}

const Boom = require('@hapi/boom');
const { createIntegrationRouter } = require('../integration-router');
const { createApp } = require('../../handlers/app-handler-helpers');
const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');

const caller = (id) => ({ getId: () => id });

async function call(method, path, body) {
    const app = createApp((a) => a.use(createIntegrationRouter()));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    try {
        const res = await fetch(
            `http://127.0.0.1:${server.address().port}${path}`,
            {
                method,
                headers: { 'content-type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            }
        );
        return { status: res.status, body: await res.json() };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

describe('integration user action routes', () => {
    let consoleSpies;

    beforeEach(() => {
        mockIntegrations.length = 0;
        mockIntegrations.push({
            id: 'int-1',
            userId: '7',
            entitiesIds: [],
            config: { type: 'actions-sync' },
            status: 'ENABLED',
            version: '1.0.0',
            messages: {},
        });
        for (const name of [
            'RUN_INITIAL_SYNC',
            'SYNC_PAGE',
            'DYNAMIC_ACTION',
            'ON_DELETE',
            'LOAD_DYNAMIC_USER_ACTIONS',
            'UNTYPED_DYNAMIC_ACTION',
            'DYNAMIC_QUEUE_EVENT',
        ]) {
            mockHandlers[name] = jest.fn(async () => ({ ran: name }));
        }
        consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
            jest.spyOn(console, m).mockImplementation(() => {})
        );
        jest.spyOn(AuthenticateUser.prototype, 'execute').mockResolvedValue(
            caller('7')
        );
    });
    afterEach(() => {
        consoleSpies.forEach((spy) => spy.mockRestore());
        jest.restoreAllMocks();
    });

    describe('GET /api/integrations/:integrationId/actions', () => {
        it('lists declared and dynamic user actions, untyped dynamic ones included', async () => {
            const res = await call('GET', '/api/integrations/int-1/actions');

            expect(res.status).toBe(200);
            expect(Object.keys(res.body).sort()).toEqual([
                'DYNAMIC_ACTION',
                'RUN_INITIAL_SYNC',
                'UNTYPED_DYNAMIC_ACTION',
            ]);
        });
    });

    describe('POST /api/integrations/:integrationId/actions/:actionId', () => {
        it('runs a declared user action with the request body', async () => {
            const res = await call(
                'POST',
                '/api/integrations/int-1/actions/RUN_INITIAL_SYNC',
                { full: true }
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ran: 'RUN_INITIAL_SYNC' });
            expect(mockHandlers.RUN_INITIAL_SYNC).toHaveBeenCalledWith({
                full: true,
            });
        });

        it('runs a dynamic user action', async () => {
            const res = await call(
                'POST',
                '/api/integrations/int-1/actions/DYNAMIC_ACTION'
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ran: 'DYNAMIC_ACTION' });
        });

        it('runs a dynamic user action that declares no type', async () => {
            const res = await call(
                'POST',
                '/api/integrations/int-1/actions/UNTYPED_DYNAMIC_ACTION'
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ran: 'UNTYPED_DYNAMIC_ACTION' });
        });

        it('refuses a dynamic event typed as something other than a user action', async () => {
            const res = await call(
                'POST',
                '/api/integrations/int-1/actions/DYNAMIC_QUEUE_EVENT'
            );

            expect(res.status).toBe(404);
            expect(mockHandlers.DYNAMIC_QUEUE_EVENT).not.toHaveBeenCalled();
        });

        it('loads the dynamic user actions once per request', async () => {
            await call(
                'POST',
                '/api/integrations/int-1/actions/RUN_INITIAL_SYNC'
            );

            expect(
                mockHandlers.LOAD_DYNAMIC_USER_ACTIONS
            ).toHaveBeenCalledTimes(1);
        });

        it('still runs a declared user action when the dynamic ones fail to load', async () => {
            mockHandlers.LOAD_DYNAMIC_USER_ACTIONS.mockRejectedValue(
                new Error('provider down')
            );

            const res = await call(
                'POST',
                '/api/integrations/int-1/actions/RUN_INITIAL_SYNC'
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ran: 'RUN_INITIAL_SYNC' });
        });

        it.each(['ON_DELETE', 'SYNC_PAGE', 'GET_CONFIG_OPTIONS'])(
            'refuses %s, which is not a user action, without running it',
            async (event) => {
                const res = await call(
                    'POST',
                    `/api/integrations/int-1/actions/${event}`
                );

                expect(res.status).toBe(404);
                expect(mockHandlers.ON_DELETE).not.toHaveBeenCalled();
                expect(mockHandlers.SYNC_PAGE).not.toHaveBeenCalled();
            }
        );

        it.each(['NOPE', 'constructor', '__proto__'])(
            'refuses the unknown action %s',
            async (actionId) => {
                const res = await call(
                    'POST',
                    `/api/integrations/int-1/actions/${actionId}`
                );

                expect(res.status).toBe(404);
            }
        );

        it.each([
            [409, Boom.conflict('Initial sync already running')],
            [429, Boom.tooManyRequests('Slow down')],
        ])('passes through a %i the handler throws', async (status, error) => {
            mockHandlers.RUN_INITIAL_SYNC.mockRejectedValue(error);

            const res = await call(
                'POST',
                '/api/integrations/int-1/actions/RUN_INITIAL_SYNC'
            );

            expect(res.status).toBe(status);
            expect(res.body).toEqual({ error: error.message });
        });
    });

    describe.each([
        ['GET', 'options', { actionId: 'RUN_INITIAL_SYNC' }],
        [
            'POST',
            'options/refresh',
            { actionId: 'RUN_INITIAL_SYNC', refreshed: true },
        ],
    ])(
        '%s /api/integrations/:integrationId/actions/:actionId/%s',
        (method, suffix, expected) => {
            it('returns the options of a dynamic user action that declares no type', async () => {
                const res = await call(
                    method,
                    `/api/integrations/int-1/actions/UNTYPED_DYNAMIC_ACTION/${suffix}`
                );

                expect(res.status).toBe(200);
                expect(res.body.actionId).toBe('UNTYPED_DYNAMIC_ACTION');
            });

            it('returns the options of a user action', async () => {
                const res = await call(
                    method,
                    `/api/integrations/int-1/actions/RUN_INITIAL_SYNC/${suffix}`
                );

                expect(res.status).toBe(200);
                expect(res.body).toEqual(expected);
            });

            it.each(['ON_DELETE', 'NOPE'])(
                'refuses %s, which is not a user action',
                async (actionId) => {
                    const res = await call(
                        method,
                        `/api/integrations/int-1/actions/${actionId}/${suffix}`
                    );

                    expect(res.status).toBe(404);
                }
            );
        }
    );

    describe('an integration the caller cannot see', () => {
        it.each([
            ['POST', '/actions/RUN_INITIAL_SYNC', undefined],
            ['GET', '/actions', undefined],
            ['GET', '/actions/RUN_INITIAL_SYNC/options', undefined],
            ['POST', '/actions/RUN_INITIAL_SYNC/options/refresh', undefined],
            ['GET', '', undefined],
            ['GET', '/config/options', undefined],
            ['PATCH', '', { config: { type: 'actions-sync' } }],
            ['DELETE', '', undefined],
        ])(
            "%s %s answers 404 alike for another user's integration and an unknown one",
            async (method, suffix, body) => {
                AuthenticateUser.prototype.execute.mockResolvedValue(
                    caller('8')
                );
                const foreign = await call(
                    method,
                    `/api/integrations/int-1${suffix}`,
                    body
                );
                const unknown = await call(
                    method,
                    `/api/integrations/int-404${suffix}`,
                    body
                );

                expect(foreign.status).toBe(404);
                expect(unknown.status).toBe(404);
                expect(unknown.body.error).toBe(
                    foreign.body.error.replace('int-1', 'int-404')
                );
                expect(mockHandlers.RUN_INITIAL_SYNC).not.toHaveBeenCalled();
                expect(mockHandlers.ON_DELETE).not.toHaveBeenCalled();
            }
        );
    });
});
