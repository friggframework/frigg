const request = require('supertest');
const { TestServer } = require('../helpers/test-server');
const { createFixture } = require('../helpers/fixtures');

describe('Form-Based Authentication Lifecycle', () => {
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

    describe('Step 1: API Key Form', () => {
        it('should get form fields for step 1', async () => {
            const { userId } = await fixture.createUser();

            const res = await request(app)
                .get('/api/authorize')
                .query({ entityType: 'form-based-mock', step: 1 })
                .set('Authorization', `Bearer ${userId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('type', 'form');
            expect(res.body).toHaveProperty('fields');
            expect(res.body.fields).toContainEqual(
                expect.objectContaining({ name: 'apiKey', type: 'password' })
            );
        });

        it('should process step 1 and return next step info', async () => {
            const { userId } = await fixture.createUser();

            const res = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entityType: 'form-based-mock',
                    data: { apiKey: 'valid-api-key-123456' },
                    step: 1,
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('nextStep', 2);
        });

        it('should reject invalid API key', async () => {
            const { userId } = await fixture.createUser();

            const res = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entityType: 'form-based-mock',
                    data: { apiKey: 'bad' },
                    step: 1,
                });

            expect(res.status).toBe(400);
        });
    });

    describe('Step 2: Workspace Selection', () => {
        it('should get form fields for step 2 after step 1 completes', async () => {
            const { userId } = await fixture.createUser();

            const step1Res = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entityType: 'form-based-mock',
                    data: { apiKey: 'valid-api-key-123456' },
                    step: 1,
                });

            const sessionId = step1Res.body.sessionId;

            const step2FieldsRes = await request(app)
                .get('/api/authorize')
                .query({ entityType: 'form-based-mock', step: 2, sessionId })
                .set('Authorization', `Bearer ${userId}`);

            expect(step2FieldsRes.status).toBe(200);
            expect(step2FieldsRes.body).toHaveProperty('fields');
            expect(step2FieldsRes.body.fields).toContainEqual(
                expect.objectContaining({ name: 'workspaceId' })
            );
        });
    });

    describe('Complete Multi-Step Flow', () => {
        it('should complete full multi-step auth flow', async () => {
            const { userId } = await fixture.createUser();

            const step1Res = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entityType: 'form-based-mock',
                    data: { apiKey: 'complete-flow-key' },
                    step: 1,
                });
            expect(step1Res.status).toBe(200);
            const sessionId = step1Res.body.sessionId;

            const step2Res = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entityType: 'form-based-mock',
                    data: { workspaceId: 'workspace-123' },
                    step: 2,
                    sessionId,
                });
            expect(step2Res.status).toBe(200);
            expect(step2Res.body).toHaveProperty('entity');
            expect(step2Res.body.entity).toHaveProperty('id');
        });

        it('should create integration after completing form auth', async () => {
            const { userId } = await fixture.createUser();
            const { entityId } = await fixture.createFormBasedEntity(userId);

            const res = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entities: [entityId],
                    config: { type: 'form-based-integration' },
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
        });
    });
});
