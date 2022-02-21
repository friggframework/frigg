const chai = require('chai');
const SalesForceApi = require('../../src/modules/Salesforce/Api.js');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);

describe('SalesForceApi', async () => {
    const api = new SalesForceApi({
        CLIENT_ID: process.env.SALESFORCE_CLIENT_ID,
        CLIENT_SECRET_ID: process.env.SALESFORCE_CLIENT_SECRET,
        REDIRECT_URI: process.env.SALESFORCE_REDIRECT_URI,
    });

    xdescribe('getAccessToken', async function () {
        it('should get the access token', async () => {
            let response = await api.getAccessToken(
                'aPrx9e9Z3rfks67wJbaRZX6PwXR6R9ZCSUmNiFVXncd99m3fO3_gxjiszRkjyEOwK.gH09xh3Q=='
            );
            expect(response).to.have.property('refreshToken');
            expect(response).to.have.property('accessToken');
        });
    });

    xdescribe('getAuthUri', async () => {
        it('should return the authorization auth url', async () => {
            const response = await api.getAuthUri();
            expect(response).to.contain.path('/services/oauth2/authorize');
        });
    });

    xdescribe('refreshAccessToken', async function () {
        it('should get the access token from the refresh token', async () => {
            let response = await api.refreshAccessToken();
            expect(response).to.have.property('refreshToken');
            expect(response).to.have.property('accessToken');
        });
    });

    describe.skip('list', async function () {
        it('should ', async () => {
            let response = await api.list();
            //expect(response).to.have.property('refreshToken');
            //expect(response).to.have.property('accessToken');
        });
    });

    describe('create', async function () {
        it.skip('should create', async () => {
            let response = await api.create();
            //expect(response).to.have.property('refreshToken');
            //expect(response).to.have.property('accessToken');
        });
    });

    describe('update', async function () {
        it.skip('should update', async () => {
            let response = await api.update('Company');
            //expect(response).to.have.property('refreshToken');
            //expect(response).to.have.property('accessToken');
        });
    });
});
