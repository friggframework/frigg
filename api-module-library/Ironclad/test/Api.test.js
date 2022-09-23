const chai = require('chai');
const should = chai.should();
const { Api } = require('../api');
require('dotenv').config()
const { expect } = require('chai');

describe('Ironclad API class', () => {
    const api = new Api({
        api_key: process.env.IRONCLAD_API_KEY,
    });

    describe('Webhooks', () => {
        let webhookID
        it('should list all webhooks', async () => {
            const response = await api.listWebhooks();
            expect(response).to.have.property('page');
            expect(response).to.have.property('pageSize')
            expect(response).to.have.property('list');
        });

        it('should create a webhook', async () => {
            const events = [
                'workflow_launched'
            ];
            const targetURL = 'https://webhook.site/a9a70c01-ba8a-4e28-8b6b-bafeda21284e';
            const response = await api.createWebhook(events, targetURL);
            expect(response).to.have.property('id');
            expect(response).to.have.property('events');
            expect(response).to.have.property('targetURL');
            expect(response).to.have.property('companyId');
            webhookID = response.id;
        });

        it('should update a webhook', async () => {
            const events = [
                'workflow_cancelled'
            ];
            const response = await api.updateWebhook(webhookID, events)
            expect(response).to.have.property('id');
            expect(response).to.have.property('events');
            expect(response).to.have.property('targetURL');
            expect(response).to.have.property('companyId');
        })

        it('should delete a webhook', async () => {
            const response = await api.deleteWebhook(webhookID);
            expect(response.status).equal(204)
        })
    });
});
