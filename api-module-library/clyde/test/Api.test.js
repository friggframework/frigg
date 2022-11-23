const { expect, should } = require('chai');
const nockout = require('./nockout/nockout');
const { Api } = require('../api');
const config = require('../defaultConfig.json');

require('dotenv').config();

describe(`Should fully test the ${config.label} API Class`, () => {
    const api = new Api({
        clientKey: process.env.CLYDE_TEST_CLIENT_KEY,
        secret: process.env.CLYDE_TEST_SECRET,
    });

    describe('Orders', () => {
        let params;
        let options;
        let response;

        beforeAll(async () => {
            params = {
                email:
                    process.env.CLYDE_TEST_EMAIL || 'testingclyde@lefthook.com',
            };
        });

        it('should list orders by email', async () => {
            options = {
                url: process.env.CLYDE_API_BASE_URL,
                path: '/orders',
                status: 200,
                tag: 'api-orders-by-email-response',
                query: params,
            };

            nockout.initialize(true, options);
            response = await api.listOrders(params);
            nockout.done();

            expect(response.data).to.be.an('array');
            expect(response.data[0]).to.have.property('type');
            expect(response.data[0]).to.have.property('id');
            expect(response.data[0]).to.have.property('attributes');
            expect(response.data[0].type).to.equal('order');
        });

        afterAll(async () => {
            await nockout.clean();
            params = undefined;
            options = undefined;
            response = undefined;
        });
    });

    describe('Claims', () => {
        let params;
        let options;
        let response;

        beforeAll(async () => {
            params = {
                email:
                    process.env.CLYDE_TEST_EMAIL || 'testingclyde@lefthook.com',
            };
        });

        it('should list claims by email', async () => {
            options = {
                url: process.env.CLYDE_API_BASE_URL,
                path: '/claims',
                status: 200,
                tag: 'api-claims-by-email-response',
                query: params,
            };

            nockout.initialize(true, options);
            response = await api.listClaims(params);
            nockout.done();

            expect(response.data).to.be.an('array');
            expect(response.data[0]).to.have.property('type');
            expect(response.data[0]).to.have.property('id');
            expect(response.data[0]).to.have.property('attributes');
            expect(response.data[0].type).to.equal('claim');
        });

        afterAll(async () => {
            await nockout.clean();
            params = undefined;
            options = undefined;
            response = undefined;
        });
    });

    describe('Contract Sales', () => {
        let params;
        let options;
        let response;

        beforeAll(async () => {
            params = {
                email:
                    process.env.CLYDE_TEST_EMAIL || 'testingclyde@lefthook.com',
            };
        });

        it('should list contract sales by email', async () => {
            options = {
                url: process.env.CLYDE_API_BASE_URL,
                path: '/contract-sales',
                status: 200,
                tag: 'api-contract-sales-by-email-response',
                query: params,
            };

            nockout.initialize(true, options);
            response = await api.listContractSales(params);
            nockout.done();

            expect(response.data).to.be.an('array');
            expect(response.data[0]).to.have.property('type');
            expect(response.data[0]).to.have.property('id');
            expect(response.data[0]).to.have.property('attributes');
            expect(response.data[0].type).to.equal('contractSale');
        });

        afterAll(async () => {
            await nockout.clean();
            params = undefined;
            options = undefined;
            response = undefined;
        });
    });

    describe('Registration', () => {
        let params;
        let options;
        let response;

        beforeAll(async () => {
            params = {
                email:
                    process.env.CLYDE_TEST_EMAIL || 'testingclyde@lefthook.com',
            };
        });

        it('should list claims by email', async () => {
            options = {
                url: process.env.CLYDE_API_BASE_URL,
                path: '/claims',
                status: 200,
                tag: 'api-registrations-by-email-response',
                query: params,
            };

            nockout.initialize(true, options);
            response = await api.listRegistrations(params);
            nockout.done();

            expect(response.data).to.be.an('array');
            expect(response.data[0]).to.have.property('type');
            expect(response.data[0]).to.have.property('id');
            expect(response.data[0]).to.have.property('attributes');
            expect(response.data[0].type).to.equal('registration');
        });

        afterAll(async () => {
            await nockout.clean();
            params = undefined;
            options = undefined;
            response = undefined;
        });
    });
});
