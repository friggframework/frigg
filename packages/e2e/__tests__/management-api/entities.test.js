const request = require('supertest');
const { TestServer } = require('../helpers/test-server');
const { createFixture } = require('../helpers/fixtures');

describe('Management API - Entities', () => {
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

    describe('GET /api/entities', () => {
        it('should require authentication', async () => {
            const res = await request(app).get('/api/entities');
            expect(res.status).toBe(401);
        });

        it('should return empty list for new user', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .get('/api/entities')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('entities');
            expect(res.body.entities).toHaveLength(0);
        });

        it('should return entities for user with existing entities', async () => {
            const { userId, token } = await fixture.createUser();
            await fixture.createOAuthEntity(userId);

            const res = await request(app)
                .get('/api/entities')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.entities.length).toBeGreaterThan(0);
        });
    });

    describe('GET /api/entities/:id', () => {
        it('should return entity details', async () => {
            const { userId, token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            const res = await request(app)
                .get(`/api/entities/${entityId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id', entityId);
        });

        it('should return 404 for nonexistent entity', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .get('/api/entities/nonexistent-id')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });

        it('should not allow access to other user entities', async () => {
            const { userId: user1Id } = await fixture.createUser();
            const { token: user2Token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(user1Id);

            const res = await request(app)
                .get(`/api/entities/${entityId}`)
                .set('Authorization', `Bearer ${user2Token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/entities/:id/test-auth', () => {
        it('should test entity authentication', async () => {
            const { userId, token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            const res = await request(app)
                .get(`/api/entities/${entityId}/test-auth`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
        });

        it('should return 404 for nonexistent entity', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .get('/api/entities/nonexistent-id/test-auth')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('DELETE /api/entities/:id', () => {
        it('should delete entity', async () => {
            const { userId, token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            const res = await request(app)
                .delete(`/api/entities/${entityId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(204);
        });

        it('should return 404 after deletion', async () => {
            const { userId, token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            await request(app)
                .delete(`/api/entities/${entityId}`)
                .set('Authorization', `Bearer ${token}`);

            const res = await request(app)
                .get(`/api/entities/${entityId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('Entity Types', () => {
        it('should support oauth2-mock entity type', async () => {
            const { userId, token } = await fixture.createUser();

            const res = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entityType: 'oauth2-mock',
                    data: { code: 'test-code' },
                });

            expect(res.status).toBe(200);
            expect(res.body.entity).toHaveProperty('type', 'oauth2-mock');
        });

        it('should support form-based-mock entity type', async () => {
            const { userId } = await fixture.createUser();
            const { entity, response } = await fixture.createFormBasedEntity(userId);

            expect(response.status).toBe(200);
            expect(entity).toHaveProperty('type', 'form-based-mock');
        });

        it('should support webhook-mock entity type', async () => {
            const { userId, token } = await fixture.createUser();

            const res = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entityType: 'webhook-mock',
                    data: { apiKey: 'test-key' },
                });

            expect(res.status).toBe(200);
            expect(res.body.entity).toHaveProperty('type', 'webhook-mock');
        });
    });
});
