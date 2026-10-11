const mockAppDefinition = { integrations: [], userConfig: {}, managementApi: {} };

jest.mock('../app-definition-loader', () => ({
    loadAppDefinition: () => mockAppDefinition,
}));
jest.mock('../../integrations/repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({}),
}));
jest.mock('../../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: () => ({}),
}));
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({}),
}));
jest.mock('../../modules/repositories/authorization-session-repository-factory', () => ({
    createAuthorizationSessionRepository: () => ({}),
}));
jest.mock('../../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));

const { createApp } = require('../app-handler-helpers');
const { request } = require('../../management-api/test-support/http-client');
const { createMemorySink } = require('../../logs');
const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');
const {
    GetIntegrationsForUser,
} = require('../../integrations/use-cases/get-integrations-for-user');
const {
    GetEntitiesForUser,
} = require('../../modules/use-cases/get-entities-for-user');

describe('auth Lambda router (Management API)', () => {
    let app;

    beforeAll(() => {
        const { router } = require('./auth');
        app = createApp((a) => a.use(router));
    });

    beforeEach(() => {
        createMemorySink();
        jest.spyOn(AuthenticateUser.prototype, 'execute').mockResolvedValue({
            getId: () => 'user-1',
        });
    });
    afterEach(() => jest.restoreAllMocks());

    it('serves the v1 integrations list unchanged, with deprecation headers', async () => {
        jest.spyOn(GetIntegrationsForUser.prototype, 'execute').mockResolvedValue([]);
        jest.spyOn(GetEntitiesForUser.prototype, 'execute').mockResolvedValue([]);
        const res = await request(app, { path: '/api/integrations' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            entities: { options: [], authorized: [] },
            integrations: [],
        });
        expect(res.headers.deprecation).toMatch(/^@\d+$/);
        expect(res.headers.link).toContain('rel="deprecation"');
    });

    it('keeps the OAuth redirect working without deprecation headers', async () => {
        process.env.FRONTEND_URI = 'https://app.example.com';
        const server = await new Promise((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
        try {
            const res = await fetch(
                `http://127.0.0.1:${server.address().port}/api/integrations/redirect/hubspot?code=abc`,
                { redirect: 'manual' }
            );
            expect(res.status).toBe(302);
            expect(res.headers.get('location')).toBe(
                'https://app.example.com/redirect/hubspot?code=abc'
            );
            expect(res.headers.get('deprecation')).toBeNull();
        } finally {
            await new Promise((resolve) => server.close(resolve));
            delete process.env.FRONTEND_URI;
        }
    });

    it('answers an unknown /api/v2 path with a v2 404', async () => {
        const res = await request(app, { path: '/api/v2/nothing-here' });
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(res.headers['frigg-api-version']).toBe('2');
    });
});
