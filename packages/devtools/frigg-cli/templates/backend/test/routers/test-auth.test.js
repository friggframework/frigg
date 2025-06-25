const chai = require('chai');
const chaiHttp = require('chai-http');
const express = require('express');
const auth = require('../../src/routers/auth');
const EntityManager = require('../../src/managers/entities/EntityManagerFactory');
const IntegrationManager = require('../../src/integrations/IntegrationManagerFactory');

jest.mock('../../src/managers/entities/EntityManager');
jest.mock('../../src/integrations/IntegrationManager');

chai.use(chaiHttp);

const app = express();
app.use((request, response, next) => {
    request.userManager = new MockedUserManager();
    next();
});
app.use(auth);

const mockManagers = ({ testAuthData, errors }) => {
    EntityManager.getEntityManagerInstanceFromEntityId.mockResolvedValue(
        mockEntityManager(testAuthData)
    );
    IntegrationManager.getInstanceFromIntegrationId.mockResolvedValue(
        mockIntegrationManager(errors)
    );
};

describe('auth router -- test-auth', () => {
    it('reports status OK if the integration succeeds in its call to testAuth', async () => {
        mockManagers({ errors: [] });

        const { status, body } = await chai
            .request(app)
            .get('/api/integrations/7g9a/test-auth');

        expect(status).toBe(200);
        expect(body).toEqual({ status: 'ok' });
    });

    it('reports an error if the integration fails the call to testAuth', async () => {
        const errors = [
            { old: true, timestamp: 0 },
            // Simulate creating these in the future, after the route has called testAuth()
            { broken: true, timestamp: Date.now() + 1500 },
            { broken: true, timestamp: Date.now() + 1500 },
        ];
        mockManagers({ errors });
        const { status, body } = await chai
            .request(app)
            .get('/api/integrations/____/test-auth');

        expect(status).toBe(400);
        expect(body).toEqual({ errors: errors.slice(1) });
    });

    it('reports status OK if the entity succeeds in its call to testAuth', async () => {
        mockManagers({ testAuthData: {} });
        const { status, body } = await chai
            .request(app)
            .get('/api/entities/123/test-auth');

        expect(status).toBe(200);
        expect(body).toEqual({ status: 'ok' });
    });

    it('reports an error if the entity fails the call to testAuth', async () => {
        mockManagers({ testAuthData: null });
        const { status, body } = await chai
            .request(app)
            .get('/api/entities/abc/test-auth');

        expect(status).toBe(400);
        expect(body).toHaveProperty('errors');
        expect(body.errors).toHaveLength(1);

        const error = body.errors[0];
        delete error.timestamp;

        expect(error).toEqual({
            message:
                'There was an error with your test-manager Entity.  Please reconnect/re-authenticate, or reach out to Support for assistance.',
            title: 'Authentication Error',
        });
    });

    it('get config options request should respond with a 200 OK status', async () => {
        mockManagers({ testAuthData: {} });

        const { body, status, text } = await chai
            .request(app)
            .get('/api/integrations/7g9a/config/options');

        expect(status).toBe(200);
    });
});

class MockedUserManager {
    getUserId = () => 'fake-user-123';
    isLoggedIn = () => true;
}

const mockEntityManager = (testAuthData) => ({
    testAuth: async () => testAuthData,
    constructor: {
        getName: () => 'test-manager',
    },
});

const mockIntegrationManager = (errors) => ({
    testAuth: async () => {},
    integration: {
        messages: {
            errors,
        },
    },
});
