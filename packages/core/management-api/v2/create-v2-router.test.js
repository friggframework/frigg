const { createApp } = require('../../handlers/app-handler-helpers');
const { request } = require('../test-support/http-client');
const { createMemorySink } = require('../../logs');
const { createManagementApiV2Router } = require('./create-v2-router');
const { fakeV2Dependencies } = require('./test-support/fake-dependencies');

const AUTH = { authorization: 'Bearer token' };

function appWith(deps) {
    return createApp((app) =>
        app.use(createManagementApiV2Router({ dependencies: deps, config: deps.config }))
    );
}

describe('Management API v2 router: integrations and entities', () => {
    let deps;
    let app;

    beforeEach(() => {
        createMemorySink();
        deps = fakeV2Dependencies();
        app = appWith(deps);
    });

    it('requires authentication on every route', async () => {
        const res = await request(app, { path: '/api/v2/integrations' });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
        expect(res.headers['frigg-api-version']).toBe('2');
    });

    it('requires authentication for integration options too', async () => {
        const res = await request(app, { path: '/api/v2/integrations/options' });
        expect(res.status).toBe(401);
        expect(deps.getPossibleIntegrations.execute).not.toHaveBeenCalled();
    });

    describe('integrations', () => {
        it('lists only { integrations }', async () => {
            const res = await request(app, { path: '/api/v2/integrations', headers: AUTH });
            expect(res.status).toBe(200);
            expect(Object.keys(res.body)).toEqual(['integrations']);
            expect(res.body.integrations[0]).toEqual({
                id: 'i1', entities: ['e1'], status: 'ENABLED', config: { type: 'sync' }, version: null, messages: {},
            });
            expect(deps.getIntegrationsForUser.execute).toHaveBeenCalledWith('user-1');
        });

        it('lists the integration types this app offers', async () => {
            const res = await request(app, { path: '/api/v2/integrations/options', headers: AUTH });
            expect(res.body).toEqual({ integrations: [{ type: 'sync', display: {} }] });
        });

        it('creates with 201', async () => {
            const res = await request(app, {
                method: 'POST', path: '/api/v2/integrations', headers: AUTH,
                body: { entities: ['e1'], config: { type: 'sync' } },
            });
            expect(res.status).toBe(201);
            expect(res.body.id).toBe('i2');
            expect(deps.createIntegrationForUser.execute).toHaveBeenCalledWith(
                { entities: ['e1'], config: { type: 'sync' } }, deps.user
            );
        });

        it('rejects a non-object body with 400', async () => {
            const res = await request(app, {
                method: 'POST', path: '/api/v2/integrations', headers: AUTH, body: [1, 2],
            });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('gets, updates and deletes', async () => {
            const got = await request(app, { path: '/api/v2/integrations/i1', headers: AUTH });
            expect(got.body.id).toBe('i1');

            const missing = await request(app, { path: '/api/v2/integrations/nope', headers: AUTH });
            expect(missing.status).toBe(404);
            expect(missing.body.error.code).toBe('INTEGRATION_NOT_FOUND');

            const patched = await request(app, {
                method: 'PATCH', path: '/api/v2/integrations/i1', headers: AUTH, body: { config: { type: 'sync', x: 1 } },
            });
            expect(patched.body.config).toEqual({ type: 'sync', x: 1 });

            const deleted = await request(app, { method: 'DELETE', path: '/api/v2/integrations/i1', headers: AUTH });
            expect(deleted.status).toBe(204);
            expect(deleted.body).toBeUndefined();
        });

        it('sends fixed framework events for options and actions', async () => {
            await request(app, { path: '/api/v2/integrations/i1/config/options', headers: AUTH });
            expect(deps.sendIntegrationEventForUser.execute).toHaveBeenLastCalledWith('i1', deps.user, 'GET_CONFIG_OPTIONS', undefined);

            await request(app, { method: 'POST', path: '/api/v2/integrations/i1/config/options/refresh', headers: AUTH, body: { a: 1 } });
            expect(deps.sendIntegrationEventForUser.execute).toHaveBeenLastCalledWith('i1', deps.user, 'REFRESH_CONFIG_OPTIONS', { a: 1 });

            await request(app, { path: '/api/v2/integrations/i1/actions?actionType=QUICK', headers: AUTH });
            expect(deps.sendIntegrationEventForUser.execute).toHaveBeenLastCalledWith('i1', deps.user, 'GET_USER_ACTIONS', { actionType: 'QUICK' });

            await request(app, { method: 'POST', path: '/api/v2/integrations/i1/actions/SYNC/options', headers: AUTH, body: { b: 2 } });
            expect(deps.sendIntegrationEventForUser.execute).toHaveBeenLastCalledWith('i1', deps.user, 'GET_USER_ACTION_OPTIONS', { actionId: 'SYNC', data: { b: 2 } });

            await request(app, { method: 'POST', path: '/api/v2/integrations/i1/actions/SYNC/options/refresh', headers: AUTH, body: {} });
            expect(deps.sendIntegrationEventForUser.execute).toHaveBeenLastCalledWith('i1', deps.user, 'REFRESH_USER_ACTION_OPTIONS', { actionId: 'SYNC', data: {} });
        });

        it('runs a user action', async () => {
            const res = await request(app, {
                method: 'POST', path: '/api/v2/integrations/i1/actions/SYNC_NOW', headers: AUTH, body: { full: true },
            });
            expect(res.body).toEqual({ ran: 'SYNC_NOW', payload: { full: true } });
        });

        it('reports the auth test as data', async () => {
            deps.testIntegrationAuthForUser.execute.mockResolvedValueOnce({ ok: false, errors: [{ title: 'x' }] });
            const res = await request(app, { path: '/api/v2/integrations/i1/test-auth', headers: AUTH });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ status: 'failed', errors: [{ title: 'x' }] });
        });
    });

    describe('entities', () => {
        it('lists entities without credential material', async () => {
            const res = await request(app, { path: '/api/v2/entities', headers: AUTH });
            expect(res.body).toEqual({
                entities: [{
                    id: 'e1', type: 'acme', name: 'Acme', externalId: 'x1', credentialId: 'c1', userId: 'user-1', authIsValid: true,
                }],
            });
            expect(JSON.stringify(res.body)).not.toContain('secret');
        });

        it('serves entity types before treating "types" as an entity id', async () => {
            const res = await request(app, { path: '/api/v2/entities/types', headers: AUTH });
            expect(res.body).toEqual({ types: [{ type: 'acme', name: 'Acme' }] });
            expect(deps.getEntityForUser.execute).not.toHaveBeenCalled();
        });

        it('gets one entity type or 404s', async () => {
            expect((await request(app, { path: '/api/v2/entities/types/acme', headers: AUTH })).body.type).toBe('acme');
            const missing = await request(app, { path: '/api/v2/entities/types/zzz', headers: AUTH });
            expect(missing.status).toBe(404);
            expect(missing.body.error.code).toBe('ENTITY_TYPE_NOT_FOUND');
        });

        it('describes a requirements step without starting a session', async () => {
            const res = await request(app, { path: '/api/v2/entities/types/acme/requirements?step=1', headers: AUTH });
            expect(res.body.type).toBe('oauth2');
            expect(res.body).not.toHaveProperty('sessionId');
            expect(deps.getAuthorizationRequirements.execute).toHaveBeenCalledWith({ entityType: 'acme', step: 1, userId: 'user-1' });

            const bad = await request(app, { path: '/api/v2/entities/types/acme/requirements?step=zero', headers: AUTH });
            expect(bad.status).toBe(400);
            expect(bad.body.error.code).toBe('INVALID_STEP');
        });

        it('gets, tests, reads options of and deletes an entity', async () => {
            expect((await request(app, { path: '/api/v2/entities/e1', headers: AUTH })).body.id).toBe('e1');
            const missing = await request(app, { path: '/api/v2/entities/e9', headers: AUTH });
            expect(missing.status).toBe(404);
            expect(missing.body.error.code).toBe('ENTITY_NOT_FOUND');

            expect((await request(app, { path: '/api/v2/entities/e1/test-auth', headers: AUTH })).body).toEqual({ status: 'ok' });
            expect((await request(app, { path: '/api/v2/entities/e1/options', headers: AUTH })).body).toEqual({ jsonSchema: {} });
            expect((await request(app, { method: 'POST', path: '/api/v2/entities/e1/options/refresh', headers: AUTH, body: { q: 1 } })).body).toEqual({ refreshed: { q: 1 } });

            const deleted = await request(app, { method: 'DELETE', path: '/api/v2/entities/e1', headers: AUTH });
            expect(deleted.status).toBe(204);
        });
    });

    it('404s an unknown v2 path and method in the v2 shape', async () => {
        const res = await request(app, { method: 'PUT', path: '/api/v2/entities/e1', headers: AUTH });
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });
});
