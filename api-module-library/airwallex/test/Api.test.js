const chai = require('chai');

const should = chai.should();
const Authenticator = require('../../../../test/utils/Authenticator');
const { Api } = require('../api');

const TestUtils = require('../../../../test/utils/TestUtils');

describe('Airwallex API class', async () => {
    const api = new Api();
    before(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);
    });

    describe('Get Account Info', async () => {
        it('should get Account info', async () => {
            const response = await api.getAccount();
            response.should.have.property('id');
            return response;
        });
    });

    describe('Transactions', async () => {
        it('should get all transactions', async () => {
            const response = await api.getTransactions();
            response.should.have.property('items');
            return response;
        });
    });

    describe('Payments', async () => {});

    describe('Charges', async () => {});

    describe('Balance', async () => {});

    describe('Card', async () => {});

    describe('Customer', async () => {});
});
