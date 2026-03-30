const request = require('supertest');
const { TestServer } = require('../helpers/test-server');

describe('Management API - Health Checks', () => {
    let server;
    let app;

    beforeAll(async () => {
        server = new TestServer();
        await server.start();
        app = server.getApp();
    });

    afterAll(async () => {
        await server.stop();
    });

    describe('GET /health', () => {
        it('should return basic health status', async () => {
            const res = await request(app).get('/health');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
            expect(res.body).toHaveProperty('timestamp');
        });
    });

    describe('GET /health/live', () => {
        it('should require API key for liveness check', async () => {
            const res = await request(app).get('/health/live');
            expect(res.status).toBe(401);
        });

        it('should return liveness status with valid API key', async () => {
            const res = await request(app)
                .get('/health/live')
                .set('x-frigg-health-api-key', process.env.HEALTH_API_KEY || 'test-key');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'alive');
        });
    });

    describe('GET /health/ready', () => {
        it('should return readiness response with checks', async () => {
            const res = await request(app)
                .get('/health/ready')
                .set('x-frigg-health-api-key', process.env.HEALTH_API_KEY || 'test-key');

            expect([200, 503]).toContain(res.status);
            expect(res.body).toHaveProperty('ready');
            expect(res.body).toHaveProperty('checks');
        });

        it('should require API key', async () => {
            const res = await request(app).get('/health/ready');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /health/detailed', () => {
        it('should return detailed health information', async () => {
            const res = await request(app)
                .get('/health/detailed')
                .set('x-frigg-health-api-key', process.env.HEALTH_API_KEY || 'test-key');

            expect([200, 503]).toContain(res.status);
            expect(res.body).toHaveProperty('status');
            expect(res.body).toHaveProperty('checks');
            expect(res.body.checks).toHaveProperty('database');
        });

        it('should require API key', async () => {
            const res = await request(app).get('/health/detailed');
            expect(res.status).toBe(401);
        });
    });
});
