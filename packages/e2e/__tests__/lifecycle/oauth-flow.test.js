const request = require('supertest');
const { TestServer } = require('../helpers/test-server');
const { createFixture } = require('../helpers/fixtures');

describe('OAuth Integration Lifecycle', () => {
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

    describe('Authorization Requirements', () => {
        it('should get authorization requirements for oauth module', async () => {
            const { userId } = await fixture.createUser();

            const res = await request(app)
                .get('/api/authorize')
                .query({ entityType: 'oauth2-mock' })
                .set('Authorization', `Bearer ${userId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('type', 'oauth2');
            expect(res.body).toHaveProperty('url');
        });
    });

    describe('Entity Creation', () => {
        it('should create entity after successful oauth callback', async () => {
            const { userId } = await fixture.createUser();

            const res = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entityType: 'oauth2-mock',
                    data: { code: 'mock-auth-code' },
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('entity');
            expect(res.body.entity).toHaveProperty('id');
        });
    });

    describe('Integration Creation', () => {
        it('should create integration with valid entity', async () => {
            const { userId } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            const res = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entities: [entityId],
                    config: { type: 'oauth-integration' },
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
        });
    });

    describe('Integration Auth Test', () => {
        it('should test integration auth successfully', async () => {
            const { userId, integrationId } = await fixture.createFullOAuthSetup();

            const res = await request(app)
                .get(`/api/integrations/${integrationId}/test-auth`)
                .set('Authorization', `Bearer ${userId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
        });
    });

    describe('Integration Deletion', () => {
        it('should delete integration', async () => {
            const { userId, integrationId } = await fixture.createFullOAuthSetup();

            const res = await request(app)
                .delete(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${userId}`);

            expect(res.status).toBe(204);
        });

        it('should return 404 after deletion', async () => {
            const { userId, integrationId } = await fixture.createFullOAuthSetup();

            await request(app)
                .delete(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${userId}`);

            const res = await request(app)
                .get(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${userId}`);

            expect(res.status).toBe(404);
        });
    });

    describe('Complete OAuth Flow', () => {
        it('should complete full lifecycle: authorize -> create -> test -> delete', async () => {
            const { userId } = await fixture.createUser();

            const authRes = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entityType: 'oauth2-mock',
                    data: { code: 'full-flow-code' },
                });
            expect(authRes.status).toBe(200);
            const entityId = authRes.body.entity.id;

            const createRes = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entities: [entityId],
                    config: { type: 'oauth-integration' },
                });
            expect(createRes.status).toBe(201);
            const integrationId = createRes.body.id;

            const testRes = await request(app)
                .get(`/api/integrations/${integrationId}/test-auth`)
                .set('Authorization', `Bearer ${userId}`);
            expect(testRes.status).toBe(200);

            const deleteRes = await request(app)
                .delete(`/api/integrations/${integrationId}`)
                .set('Authorization', `Bearer ${userId}`);
            expect(deleteRes.status).toBe(204);
        });
    });
});
