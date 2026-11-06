/**
 * The v1 entity routes end to end through the real router, use cases and
 * Module, over in-memory repositories: POST /api/entity creates an entity from
 * a stored credential, GET /api/entities/:entityId (and its test-auth) load
 * it, and GET /api/integrations lists it.
 */
const mockStore = { entities: [], credentials: [], nextId: 100 };

jest.mock('../../handlers/app-definition-loader', () => ({
    loadAppDefinition: () => ({
        integrations: [mockIntegrationClass()],
        userConfig: {},
    }),
}));
jest.mock('../repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({
        findIntegrationsByUserId: async () => [],
        findIntegrationsByEntityId: async () => [],
    }),
}));
jest.mock('../../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: () => ({
        // Tokens come back flat, as the real repositories return them.
        findCredentialById: async (id) => {
            const row = mockStore.credentials.find((c) => c.id === String(id));
            return row ? { ...row } : null;
        },
        upsertCredential: async () => {
            throw new Error('not expected in these tests');
        },
    }),
}));
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => {
        const withCredential = (row) => {
            const stored = mockStore.credentials.find(
                (c) => c.id === row.credentialId
            );
            if (!stored) return { ...row, credential: null };
            const { id, userId, externalId, authIsValid, ...data } = stored;
            return { ...row, credential: { id, userId, externalId, authIsValid, data } };
        };
        return {
            findEntityById: async (id) => {
                const row = mockStore.entities.find((e) => e.id === String(id));
                if (!row) throw new Error(`Entity ${id} not found`);
                return withCredential(row);
            },
            findEntitiesByUserId: async (userId) =>
                mockStore.entities
                    .filter((e) => e.userId === String(userId))
                    .map(withCredential),
            findEntity: async ({ externalId, user, moduleName }) => {
                const row = mockStore.entities.find(
                    (e) =>
                        e.externalId === externalId &&
                        e.userId === String(user) &&
                        e.moduleName === moduleName
                );
                return row ? withCredential(row) : null;
            },
            createEntity: async ({ user, userId, credential, ...rest }) => {
                const row = {
                    ...rest,
                    id: String(mockStore.nextId++),
                    userId: String(userId ?? user),
                    credentialId: String(credential),
                };
                mockStore.entities.push(row);
                return withCredential(row);
            },
            updateEntity: async () => null,
        };
    },
}));
jest.mock('../../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));

function mockIntegrationClass() {
    class AcmeApi {
        constructor(params = {}) {
            this.access_token = params.access_token;
        }
        getAuthorizationRequirements() {
            return { type: 'oauth2', url: 'https://acme.example/auth' };
        }
    }
    const definition = {
        moduleName: 'acme',
        API: AcmeApi,
        requiredAuthMethods: {
            getToken: async () => ({}),
            getCredentialDetails: async () => ({ identifiers: {}, details: {} }),
            getEntityDetails: async (api, _params, _tokens, userId) => {
                if (api.access_token !== 'stored-access-token') {
                    throw new Error('the API was built without the stored credential');
                }
                return {
                    identifiers: { externalId: 'acct-1', user: userId },
                    details: { name: 'Acme account' },
                };
            },
            testAuthRequest: async (api) =>
                api.access_token === 'stored-access-token',
            apiPropertiesToPersist: { credential: ['access_token'], entity: [] },
        },
    };
    class AcmeIntegration {}
    AcmeIntegration.Definition = {
        name: 'acme-sync',
        version: '1.0.0',
        modules: { acme: { definition } },
    };
    AcmeIntegration.getOptionDetails = () => ({ type: 'acme-sync' });
    return AcmeIntegration;
}

const { createIntegrationRouter } = require('../integration-router');
const { createApp } = require('../../handlers/app-handler-helpers');
const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');

const caller = (id) => ({
    getId: () => id,
    ownsUserId: (userId) => String(userId) === id,
});

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

describe('v1 entity routes', () => {
    let consoleSpies;

    beforeEach(() => {
        mockStore.entities = [];
        mockStore.credentials = [
            {
                id: 'cred-7',
                userId: '7',
                externalId: 'acct-1',
                authIsValid: true,
                access_token: 'stored-access-token',
            },
            {
                id: 'cred-8',
                userId: '8',
                externalId: 'acct-2',
                authIsValid: true,
                access_token: 'someone-elses-token',
            },
        ];
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

    describe('POST /api/entity', () => {
        it('creates the entity from a credential the caller owns, calling the provider with that credential', async () => {
            const res = await call('POST', '/api/entity', {
                entityType: 'acme',
                data: { credential_id: 'cred-7' },
            });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                userId: '7',
                externalId: 'acct-1',
                moduleName: 'acme',
                name: 'Acme account',
            });
            expect(mockStore.entities).toEqual([
                expect.objectContaining({
                    userId: '7',
                    externalId: 'acct-1',
                    moduleName: 'acme',
                    credentialId: 'cred-7',
                }),
            ]);
        });

        it('returns the existing entity the second time instead of creating another', async () => {
            const body = { entityType: 'acme', data: { credential_id: 'cred-7' } };
            const first = await call('POST', '/api/entity', body);
            const second = await call('POST', '/api/entity', body);
            expect(second.status).toBe(200);
            expect(second.body.id).toBe(first.body.id);
            expect(mockStore.entities).toHaveLength(1);
        });

        it("refuses another user's credential and an unknown one the same way", async () => {
            const other = await call('POST', '/api/entity', {
                entityType: 'acme',
                data: { credential_id: 'cred-8' },
            });
            const missing = await call('POST', '/api/entity', {
                entityType: 'acme',
                data: { credential_id: 'cred-404' },
            });
            expect(other.status).toBe(400);
            expect(missing.status).toBe(400);
            expect(other.body).toEqual(missing.body);
            expect(mockStore.entities).toEqual([]);
        });

        it('refuses an unknown entity type', async () => {
            const res = await call('POST', '/api/entity', {
                entityType: 'nope',
                data: { credential_id: 'cred-7' },
            });
            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/entities/:entityId', () => {
        beforeEach(() => {
            mockStore.entities = [
                {
                    id: '55',
                    userId: '7',
                    name: 'Acme account',
                    externalId: 'acct-1',
                    moduleName: 'acme',
                    credentialId: 'cred-7',
                },
            ];
        });

        it("returns the caller's entity without its credential secrets", async () => {
            const res = await call('GET', '/api/entities/55');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                id: '55',
                name: 'Acme account',
                moduleName: 'acme',
                credentialId: 'cred-7',
                authIsValid: true,
                externalId: 'acct-1',
                userId: '7',
            });
            expect(JSON.stringify(res.body)).not.toContain('stored-access-token');
        });

        it("refuses another user's entity", async () => {
            AuthenticateUser.prototype.execute.mockResolvedValue(caller('8'));
            const res = await call('GET', '/api/entities/55');
            expect(res.status).not.toBe(200);
            expect(JSON.stringify(res.body)).not.toContain('stored-access-token');
        });

        it('GET /api/entities/:entityId/test-auth tests the stored credential', async () => {
            const res = await call('GET', '/api/entities/55/test-auth');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ status: 'ok' });
        });
    });

    describe('GET /api/integrations (the v1 entity list)', () => {
        it("lists the caller's authorized entities", async () => {
            mockStore.entities = [
                { id: '55', userId: '7', externalId: 'acct-1', moduleName: 'acme', credentialId: 'cred-7' },
                { id: '56', userId: '8', externalId: 'acct-2', moduleName: 'acme', credentialId: 'cred-8' },
            ];
            const res = await call('GET', '/api/integrations');
            expect(res.status).toBe(200);
            expect(res.body.entities.authorized.map((e) => e.id)).toEqual(['55']);
        });
    });
});
