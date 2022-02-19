const chai = require('chai');
const SalesForceApi = require('../../src/modules/Salesforce/Api.js');

describe('SalesForceApi', () => {
    const api = new SalesForceApi({
        CLIENT_ID: process.env.SALESFORCE_CLIENT_ID,
        CLIENT_SECRET_ID: process.env.SALESFORCE_CLIENT_SECRET,
        REDIRECT_URI: process.env.SALESFORCE_REDIRECT_URI,
    });

    xdescribe('getAccessToken', function () {
        it('should get the access token', async () => {
            let response = await api.getAccessToken(
                'aPrx9e9Z3rfks67wJbaRZX6PwXR6R9ZCSUmNiFVXncd99m3fO3_gxjiszRkjyEOwK.gH09xh3Q=='
            );
            expect(response).toHaveProperty('refreshToken');
            expect(response).toHaveProperty('accessToken');
        });
    });

    xdescribe('getAuthUri', () => {
        it('should return the authorization auth url', async () => {
            const response = await api.getAuthUri();
            expect(response).to.contain.path('/services/oauth2/authorize');
        });
    });

    xdescribe('refreshAccessToken', function () {
        it('should get the access token from the refresh token', async () => {
            let response = await api.refreshAccessToken();
            expect(response).toHaveProperty('refreshToken');
            expect(response).toHaveProperty('accessToken');
        });
    });

    describe.skip('list', function () {
        it('should ', async () => {
            let response = await api.list();
            //expect(response).to.have.property('refreshToken');
            //expect(response).to.have.property('accessToken');
        });
    });

    describe('create', () => {
        it.skip('should create', async () => {
            let response = await api.create();
            //expect(response).to.have.property('refreshToken');
            //expect(response).to.have.property('accessToken');
        });
    });

    describe('update', () => {
        it.skip('should update', async () => {
            let response = await api.update('Company');
            //expect(response).to.have.property('refreshToken');
            //expect(response).to.have.property('accessToken');
        });
    });
});
