const chai = require('chai');
const should = chai.should();
//const Authenticator = require('../../../../test/utils/Authenticator');
const { Api } = require('../api');

//const TestUtils = require('../../../../test/utils/TestUtils');
const { expect } = require('chai');

describe('Ironclad API class', () => {
    const api = new Api({
        api_key: 'FsnPyagbghJPoZYf618X9F8EJXZUyZKRYsfbGr6kciq4',
    });

    describe('Webhooks', () => {
        it('should list all webhooks', async () => {
            const response = await api.listWebhooks();
            expect(response).to.have.property('page');
            expect(response).to.have.property('pageSize')
            expect(response).to.have.property('list');
        });

    });
});

describe('Ironclad Integration Tests', () => {
    it('should work', async () => {
        expect(1 + 1).toEqual(2);
    });
});
