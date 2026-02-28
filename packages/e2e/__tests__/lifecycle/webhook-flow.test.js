const request = require('supertest');
const { TestServer } = require('../helpers/test-server');
const { createFixture } = require('../helpers/fixtures');

describe('Webhook Integration Lifecycle', () => {
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

    describe('Webhook Entity Creation', () => {
        it('should create webhook entity with API key', async () => {
            const { userId } = await fixture.createUser();

            const res = await request(app)
                .post('/api/authorize')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entityType: 'webhook-mock',
                    data: { apiKey: 'webhook-api-key' },
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('entity');
            expect(res.body.entity).toHaveProperty('id');
        });
    });

    describe('Webhook Integration Creation', () => {
        it('should create webhook integration', async () => {
            const { userId } = await fixture.createUser();
            const { entityId } = await fixture.createWebhookEntity(userId);

            const res = await request(app)
                .post('/api/integrations')
                .set('Authorization', `Bearer ${userId}`)
                .send({
                    entities: [entityId],
                    config: { type: 'webhook-integration' },
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
        });
    });

    describe('Webhook Signature Validation', () => {
        it('should receive webhook and validate signature', async () => {
            const { userId, integrationId } = await fixture.createFullWebhookSetup();
            const payload = {
                event: 'item.created',
                data: { id: '123', name: 'Test Item' },
            };

            const res = await request(app)
                .post(`/api/webhook-integration/webhooks/${integrationId}`)
                .set('X-Webhook-Signature', 'valid-signature')
                .send(payload);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('received', true);
        });

        it('should reject webhook with invalid signature', async () => {
            const { integrationId } = await fixture.createFullWebhookSetup();
            const payload = {
                event: 'item.created',
                data: { id: '123' },
            };

            const res = await request(app)
                .post(`/api/webhook-integration/webhooks/${integrationId}`)
                .set('X-Webhook-Signature', 'invalid-signature')
                .send(payload);

            expect(res.status).toBe(401);
        });

        it('should reject webhook with missing signature', async () => {
            const { integrationId } = await fixture.createFullWebhookSetup();
            const payload = {
                event: 'item.created',
                data: { id: '123' },
            };

            const res = await request(app)
                .post(`/api/webhook-integration/webhooks/${integrationId}`)
                .send(payload);

            expect(res.status).toBe(401);
        });
    });

    describe('Webhook Event Processing', () => {
        it('should process item.created event', async () => {
            const { integrationId } = await fixture.createFullWebhookSetup();
            const payload = {
                event: 'item.created',
                data: { id: '456', name: 'New Item' },
            };

            const res = await request(app)
                .post(`/api/webhook-integration/webhooks/${integrationId}`)
                .set('X-Webhook-Signature', 'valid-signature')
                .send(payload);

            expect(res.status).toBe(200);
        });

        it('should process item.updated event', async () => {
            const { integrationId } = await fixture.createFullWebhookSetup();
            const payload = {
                event: 'item.updated',
                data: { id: '456', name: 'Updated Item' },
            };

            const res = await request(app)
                .post(`/api/webhook-integration/webhooks/${integrationId}`)
                .set('X-Webhook-Signature', 'valid-signature')
                .send(payload);

            expect(res.status).toBe(200);
        });

        it('should process item.deleted event', async () => {
            const { integrationId } = await fixture.createFullWebhookSetup();
            const payload = {
                event: 'item.deleted',
                data: { id: '456' },
            };

            const res = await request(app)
                .post(`/api/webhook-integration/webhooks/${integrationId}`)
                .set('X-Webhook-Signature', 'valid-signature')
                .send(payload);

            expect(res.status).toBe(200);
        });
    });

    describe('Invalid Integration Webhook', () => {
        it('should return 404 for nonexistent integration', async () => {
            const payload = {
                event: 'item.created',
                data: { id: '123' },
            };

            const res = await request(app)
                .post('/api/webhook-integration/webhooks/nonexistent-id')
                .set('X-Webhook-Signature', 'valid-signature')
                .send(payload);

            expect(res.status).toBe(404);
        });
    });
});
