const chai = require('chai');

const should = chai.should();
const Authenticator = require('@friggframework/test-environment/Authenticator');
const { Api } = require('../api');

describe('Airwallex API class', () => {
    let api;
    beforeAll(async () => {
        api = new Api({
            api_key: process.env.AIRWALLEX_API_KEY,
            client_id: process.env.AIRWALLEX_CLIENT_ID,
        });
        await api.getTokenFromApiKey();
    });

    describe('Get Account Info', () => {
        it.skip('should get Account info', async () => {
            const response = await api.getAccount();
            response.should.have.property('id');
            return response;
        });
    });

    describe('Transactions', () => {
        it.skip('should get all transactions', async () => {
            const response = await api.getTransactions();
            response.should.have.property('items');
            return response;
        });
    });

    describe('Payments', () => {});

    describe('Charges', () => {});

    describe('Balance', () => {});

    describe('Card', () => {});

    describe('Customer', () => {});
});
