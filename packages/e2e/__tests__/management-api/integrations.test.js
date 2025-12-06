const request = require('supertest');
const { TestServer } = require('../helpers/test-server');
const { createFixture } = require('../helpers/fixtures');

describe('Management API - Integrations', () => {
    let server;
    let app;
    let fixture;

    beforeAll(async () => {
        server = new TestServer();
        await server.start();
        app = server.getApp();
    });

    afterAll(async () => {
        await server.stop();
    });

    beforeEach(() => {
        fixture = createFixture(app);
    });

    describe('GET /api/integrations/options', () => {
        it('should return available integration types', async () => {
            const res = await request(app).get('/api/integrations/options');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('integrations');
            expect(Array.isArray(res.body.integrations)).toBe(true);
        });

        it('should include oauth, form-based, and webhook integrations', async () => {
            const res = await request(app).get('/api/integrations/options');

            const names = res.body.integrations.map((i) => i.name);
            expect(names).toContain('oauth-integration');
            expect(names).toContain('form-based-integration');
            expect(names).toContain('webhook-integration');
        });
    });

    describe('GET /api/integrations', () => {
        it('should require authentication', async () => {
            const res = await request(app).get('/api/integrations');
            expect(res.status).toBe(401);
        });

        it('should return empty list for new user', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .get('/api/integrations')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('integrations');
            expect(res.body.integrations).toHaveLength(0);
        });

        it('should return integrations for user with existing integrations', async () => {
            const { userId, token } = await fixture.createUser();
            await fixture.createOAuthIntegration(userId);

            const res = await request(app)
                .get('/api/integrations')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.integrations.length).toBeGreaterThan(0);
        });
    });

    describe('POST /api/integrations', () => {
        it('should require authentication', async () => {
            const res = await request(app)
                .post('/api/integrations')
                .send({ entities: ['some-id'], config: { type: 'oauth-integration' } });

            expect(res.status).toBe(401);
        });

        it('should create integration with valid entity', async () => {
            const { userId, token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            const res = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entities: [entityId],
                    config: { type: 'oauth-integration' },
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('status');
        });

        it('should reject invalid integration type', async () => {
            const { userId, token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            const res = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entities: [entityId],
                    config: { type: 'nonexistent-integration' },
                });

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/integrations/:id', () => {
        it('should return integration details', async () => {
            const { userId, token } = await fixture.createUser();
            const { integrationId } = await fixture.createOAuthIntegration(userId);

            const res = await request(app)
                .get(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id', integrationId);
            expect(res.body).toHaveProperty('config');
            expect(res.body).toHaveProperty('entities');
        });

        it('should return 404 for nonexistent integration', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .get('/api/integrations/nonexistent-id')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });

        it('should not allow access to other user integrations', async () => {
            const { userId: user1Id } = await fixture.createUser();
            const { token: user2Token } = await fixture.createUser();
            const { integrationId } = await fixture.createOAuthIntegration(user1Id);

            const res = await request(app)
                .get(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${user2Token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('PATCH /api/integrations/:id', () => {
        it('should update integration config', async () => {
            const { userId, token } = await fixture.createUser();
            const { integrationId } = await fixture.createOAuthIntegration(userId);

            const res = await request(app)
                .patch(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    config: { customSetting: 'value' },
                });

            expect(res.status).toBe(200);
            expect(res.body.config).toHaveProperty('customSetting', 'value');
        });

        it('should preserve existing config when updating', async () => {
            const { userId, token } = await fixture.createUser();
            const { integrationId } = await fixture.createOAuthIntegration(userId);

            await request(app)
                .patch(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ config: { setting1: 'value1' } });

            const res = await request(app)
                .patch(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ config: { setting2: 'value2' } });

            expect(res.status).toBe(200);
            expect(res.body.config).toHaveProperty('setting1', 'value1');
            expect(res.body.config).toHaveProperty('setting2', 'value2');
        });
    });

    describe('DELETE /api/integrations/:id', () => {
        it('should delete integration', async () => {
            const { userId, token } = await fixture.createUser();
            const { integrationId } = await fixture.createOAuthIntegration(userId);

            const res = await request(app)
                .delete(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(204);
        });

        it('should return 404 after deletion', async () => {
            const { userId, token } = await fixture.createUser();
            const { integrationId } = await fixture.createOAuthIntegration(userId);

            await request(app)
                .delete(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${token}`);

            const res = await request(app)
                .get(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });

        it('should return 404 for nonexistent integration', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .delete('/api/integrations/nonexistent-id')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });
});
