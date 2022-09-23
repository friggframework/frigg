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

    describe.only('Webhooks', () => {
        it('should list all webhooks', async () => {
            const response = await api.listWebhooks();
            expect(response).to.have.property('page');
            expect(response).to.have.property('pageSize')
            expect(response).to.have.property('list');
        });

        it('should create a webhook', async () => {
            const events = [
                'workflow_cancelled'
            ];
            const targetURL = 'https://webhook.site/d895e13f-ccee-47fc-9ba9-fc41a8f7fb5e';
            const response = await api.createWebhook(events, targetURL);
            console.log(response);
            expect(response).to.have.property('id');
            expect(response).to.have.property('events');
            expect(response).to.have.property('targetURL');
            expect(response).to.have.property('companyId');
        });

        it('should delete a webhook', async () => {
            const id = '632de3658a95cb469df741e9';
            const response = await api.deleteWebhook(id);
            expect(response.status).equal(204)
        })
    });
});

describe('Ironclad Integration Tests', () => {
    it('should work', async () => {
        expect(1 + 1).toEqual(2);
    });
});
