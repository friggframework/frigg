const request = require('supertest');

class TestFixture {
    constructor(app) {
        this.app = app;
        this.createdUsers = [];
        this.createdEntities = [];
        this.createdIntegrations = [];
    }

    async createUser(overrides = {}) {
        const timestamp = Date.now();
        const defaults = {
            username: `testuser-${timestamp}@example.com`,
            password: 'testpass123',
        };

        const userData = { ...defaults, ...overrides };

        const res = await request(this.app)
            .post('/user/create')
            .send(userData);

        if (res.body.user?.id) {
            this.createdUsers.push(res.body.user.id);
        }

        return {
            userId: res.body.user?.id,
            token: res.body.token,
            response: res,
        };
    }

    async authenticateEntity(userId, entityType, authData) {
        const res = await request(this.app)
            .post('/api/authorize')
            .set('Authorization', `Bearer ${userId}`)
            .send({ entityType, data: authData });

        if (res.body.entity?.id) {
            this.createdEntities.push(res.body.entity.id);
        }

        return {
            entityId: res.body.entity?.id,
            entity: res.body.entity,
            response: res,
        };
    }

    async createOAuthEntity(userId) {
        return this.authenticateEntity(userId, 'oauth2-mock', {
            code: `mock-code-${Date.now()}`,
        });
    }

    async createFormBasedEntity(userId) {
        const step1Res = await request(this.app)
            .post('/api/authorize')
            .set('Authorization', `Bearer ${userId}`)
            .send({
                entityType: 'form-based-mock',
                data: { apiKey: `api-key-${Date.now()}` },
                step: 1,
            });

        const sessionId = step1Res.body.sessionId;

        const step2Res = await request(this.app)
            .post('/api/authorize')
            .set('Authorization', `Bearer ${userId}`)
            .send({
                entityType: 'form-based-mock',
                data: { workspaceId: `workspace-${Date.now()}` },
                step: 2,
                sessionId,
            });

        if (step2Res.body.entity?.id) {
            this.createdEntities.push(step2Res.body.entity.id);
        }

        return {
            entityId: step2Res.body.entity?.id,
            entity: step2Res.body.entity,
            response: step2Res,
        };
    }

    async createWebhookEntity(userId) {
        return this.authenticateEntity(userId, 'webhook-mock', {
            apiKey: `webhook-key-${Date.now()}`,
        });
    }

    async createIntegration(userId, entityId, integrationType) {
        const res = await request(this.app)
            .post('/api/integrations')
            .set('Authorization', `Bearer ${userId}`)
            .send({
                entities: [entityId],
                config: { type: integrationType },
            });

        if (res.body.id) {
            this.createdIntegrations.push(res.body.id);
        }

        return {
            integrationId: res.body.id,
            integration: res.body,
            response: res,
        };
    }

    async createOAuthIntegration(userId) {
        const { entityId } = await this.createOAuthEntity(userId);
        return this.createIntegration(userId, entityId, 'oauth-integration');
    }

    async createFormBasedIntegration(userId) {
        const { entityId } = await this.createFormBasedEntity(userId);
        return this.createIntegration(userId, entityId, 'form-based-integration');
    }

    async createWebhookIntegration(userId) {
        const { entityId } = await this.createWebhookEntity(userId);
        return this.createIntegration(userId, entityId, 'webhook-integration');
    }

    async createFullOAuthSetup() {
        const { userId, token } = await this.createUser();
        const { entityId } = await this.createOAuthEntity(userId);
        const { integrationId } = await this.createIntegration(
            userId,
            entityId,
            'oauth-integration'
        );

        return { userId, token, entityId, integrationId };
    }

    async createFullWebhookSetup() {
        const { userId, token } = await this.createUser();
        const { entityId } = await this.createWebhookEntity(userId);
        const { integrationId } = await this.createIntegration(
            userId,
            entityId,
            'webhook-integration'
        );

        return { userId, token, entityId, integrationId };
    }
}

function createFixture(app) {
    return new TestFixture(app);
}

module.exports = { TestFixture, createFixture };
