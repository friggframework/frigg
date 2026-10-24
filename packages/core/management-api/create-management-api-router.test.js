const express = require('express');
const { createApp } = require('../handlers/app-handler-helpers');
const { request } = require('./test-support/http-client');
const { createMemorySink } = require('../logs');
const { createManagementApiRouter } = require('./create-management-api-router');

function fakeV1Router() {
    const router = express.Router();
    router.get('/api/integrations', (_req, res) =>
        res.json({ entities: { options: [], authorized: [] }, integrations: [] })
    );
    return router;
}

const build = (managementApi) =>
    createApp((app) =>
        app.use(
            createManagementApiRouter({
                appDefinition: { managementApi },
                createV1Router: fakeV1Router,
                createV2Router: () => express.Router(),
            })
        )
    );

describe('createManagementApiRouter', () => {
    beforeEach(() => createMemorySink());

    it('serves v1 with deprecation headers by default', async () => {
        const res = await request(build(), { path: '/api/integrations' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            entities: { options: [], authorized: [] },
            integrations: [],
        });
        expect(res.headers.deprecation).toMatch(/^@\d+$/);
    });

    it('replaces v1 with 410 responses when managementApi.v1 is false', async () => {
        const res = await request(build({ v1: false }), { path: '/api/integrations' });
        expect(res.status).toBe(410);
        expect(res.body.error.code).toBe('API_VERSION_DISABLED');
    });

    it('does not build the v1 router at all when v1 is disabled', () => {
        const createV1Router = jest.fn(fakeV1Router);
        createManagementApiRouter({
            appDefinition: { managementApi: { v1: false } },
            createV1Router,
            createV2Router: () => express.Router(),
        });
        expect(createV1Router).not.toHaveBeenCalled();
    });
});
