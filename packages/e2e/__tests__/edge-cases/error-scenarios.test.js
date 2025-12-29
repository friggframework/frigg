const request = require('supertest');
const { TestServer } = require('../helpers/test-server');
const { createFixture } = require('../helpers/fixtures');

describe('Error Scenarios', () => {
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

    describe('Authentication Errors', () => {
        it('should return 401 for missing authorization header', async () => {
            const res = await request(app).get('/api/integrations');
            expect(res.status).toBe(401);
        });

        it('should return 401 for invalid token format', async () => {
            const res = await request(app)
                .get('/api/integrations')
                .set('Authorization', 'InvalidFormat');
            expect(res.status).toBe(401);
        });

        it('should return 401 for nonexistent user token', async () => {
            const res = await request(app)
                .get('/api/integrations')
                .set('Authorization', 'Bearer nonexistent-user-id');
            expect(res.status).toBe(401);
        });
    });

    describe('Authorization Errors', () => {
        it('should reject unknown entity type', async () => {
            const { userId, token } = await fixture.createUser();

            const res = await request(app)
                .get('/api/authorize')
                .query({ entityType: 'unknown-entity-type' })
                .set('Authorization', `Bearer ${userId}`);

            expect(res.status).toBe(400);
        });

        it('should reject authorization without entity type', async () => {
            const { userId, token } = await fixture.createUser();

            const res = await request(app)
                .get('/api/authorize')
                .set('Authorization', `Bearer ${userId}`);

            expect(res.status).toBe(400);
        });
    });

    describe('Integration Errors', () => {
        it('should reject creating integration without entities', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entities: [],
                    config: { type: 'oauth-integration' },
                });

            expect(res.status).toBe(400);
        });

        it('should reject creating integration with nonexistent entity', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entities: ['nonexistent-entity-id'],
                    config: { type: 'oauth-integration' },
                });

            expect(res.status).toBe(400);
        });

        it('should reject creating integration without config type', async () => {
            const { userId, token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            const res = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entities: [entityId],
                    config: {},
                });

            expect(res.status).toBe(400);
        });
    });

    describe('Resource Not Found', () => {
        it('should return 404 for nonexistent integration', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .get('/api/integrations/507f1f77bcf86cd799439011')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });

        it('should return 404 for nonexistent entity', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .get('/api/entities/507f1f77bcf86cd799439011')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('Malformed Requests', () => {
        it('should handle malformed JSON body gracefully', async () => {
            const { token } = await fixture.createUser();

            const res = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${token}`)
                .set('Content-Type', 'application/json')
                .send('{invalid json}');

            expect(res.status).toBe(400);
        });

        it('should handle empty body gracefully', async () => {
            const { userId, token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            const res = await request(app)
                .patch(`/api/integrations/${entityId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect([200, 400]).toContain(res.status);
        });
    });

    describe('Concurrent Operations', () => {
        it('should handle concurrent entity creation', async () => {
            const { userId, token } = await fixture.createUser();

            const promises = Array(5).fill(null).map(() =>
                request(app)
                    .post('/api/authorize')
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        entityType: 'oauth2-mock',
                        data: { code: `code-${Date.now()}-${Math.random()}` },
                    })
            );

            const results = await Promise.all(promises);
            results.forEach((res) => {
                expect(res.status).toBe(200);
            });
        });

        it('should handle concurrent integration creation', async () => {
            const { userId, token } = await fixture.createUser();

            const entities = await Promise.all(
                Array(3).fill(null).map(() => fixture.createOAuthEntity(userId))
            );

            const promises = entities.map(({ entityId }) =>
                request(app)
                    .post('/api/integrations')
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        entities: [entityId],
                        config: { type: 'oauth-integration' },
                    })
            );

            const results = await Promise.all(promises);
            results.forEach((res) => {
                expect(res.status).toBe(201);
            });
        });
    });
});
