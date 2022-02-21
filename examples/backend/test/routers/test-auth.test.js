const chai = require('chai');
const chaiHttp = require('chai-http');
const proxyquire = require('proxyquire').noPreserveCache().noCallThru();
const express = require('express');

const { expect } = chai;
chai.use(chaiHttp);

describe('auth router -- test-auth', async () => {
    it('reports status OK if the integration succeeds in its call to testAuth', async () => {
        const app = mockApp({ errors: [] });
        const { status, body } = await chai
            .request(app)
            .get('/api/integrations/7g9a/test-auth');

        expect(status).to.equal(200);
        expect(body).to.deep.equal({ status: 'ok' });
    });

    it('reports an error if the integration fails the call to testAuth', async () => {
        const errors = [
            { old: true, timestamp: 0 },
            // Simulate creating these in the future, after the route has called testAuth()
            { broken: true, timestamp: Date.now() + 1500 },
            { broken: true, timestamp: Date.now() + 1500 },
        ];
        const app = mockApp({ errors });
        const { status, body } = await chai
            .request(app)
            .get('/api/integrations/____/test-auth');

        expect(status).to.equal(400);
        expect(body).to.deep.equal({ errors: errors.slice(1) });
    });

    it('reports status OK if the entity succeeds in its call to testAuth', async () => {
        const app = mockApp({ testAuthData: {} });
        const { status, body } = await chai
            .request(app)
            .get('/api/entities/123/test-auth');

        expect(status).to.equal(200);
        expect(body).to.deep.equal({ status: 'ok' });
    });

    it('reports an error if the entity fails the call to testAuth', async () => {
        const app = mockApp({ testAuthData: null });
        const { status, body } = await chai
            .request(app)
            .get('/api/entities/abc/test-auth');

        expect(status).to.equal(400);
        expect(body).to.have.property('errors');
        expect(body.errors).to.have.length(1);

        const error = body.errors[0];
        delete error.timestamp;

        expect(error).to.deep.equal({
            message:
                'There was an error with your test-manager Entity.  Please reconnect/re-authenticate, or reach out to Support for assistance.',
            title: 'Authentication Error',
        });
    });
});

class MockedUserManager {
    getUserId = () => 'fake-user-123';
    isLoggedIn = () => true;
}

const mockEntityManager = (testAuthData) =>
    class {
        static getName = () => 'test-manager';

        static getEntityManagerInstanceFromEntityId = async () => {
            return new this();
        };

        testAuth = async () => testAuthData;
    };

const mockIntegrationManager = (errors) =>
    class {
        integration = {
            messages: {
                errors,
            },
        };

        static getInstanceFromIntegrationId = async () => {
            return new this();
        };

        testAuth = async () => {};
    };

const mockApp = ({ errors, testAuthData }) => {
    // Because we used noPreserveCache() when we required proxyquire, this will give us new instances of the app and auth middleware each time mockApp is called.
    const mockedAuth = proxyquire('../../src/routers/auth', {
        '../managers/entities/EntityManager': mockEntityManager(testAuthData),
        '../managers/integrations/IntegrationManager':
            mockIntegrationManager(errors),
    });

    const mockedApp = express();
    mockedApp.use((request, response, next) => {
        request.userManager = new MockedUserManager();
        next();
    });
    mockedApp.use(mockedAuth);

    return mockedApp;
};
