const chai = require('chai');

const should = chai.should();
const Authenticator = require('@friggframework/test-environment/Authenticator');
const { Api } = require('../api');

describe('Airwallex API class', () => {
    const api = new Api();
    beforeAll(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);
    });

    describe('Get Account Info', () => {
        it('should get Account info', async () => {
            const response = await api.getAccount();
            response.should.have.property('id');
            return response;
        });
    });

    describe('Transactions', () => {
        it('should get all transactions', async () => {
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
