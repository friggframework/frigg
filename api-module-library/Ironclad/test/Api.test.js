const chai = require('chai');
const should = chai.should();
//const Authenticator = require('../../../../test/utils/Authenticator');
const { Api } = require('../api');

const TestUtils = require('../../../../test/utils/TestUtils');
const { expect } = require('chai');

describe('Ironclad API class', () => {
    const api = new Api({
        api_key: process.env.IRONCLAD_API_KEY,
    });

    describe('Webhooks', () => {
        it.only('should list all webhooks', async () => {
            const response = await api.listWebhooks();
            console.log(response);
        });
    });
});

describe('Ironclad Integration Tests', () => {
    it('should work', async () => {
        expect(1 + 1).toEqual(2);
    });
});
