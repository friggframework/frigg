const chai = require('chai');
const should = chai.should();
const { Api } = require('../api');
require('dotenv').config()
const { expect } = require('chai');

describe('Ironclad API class', () => {
    const api = new Api({
        apiKey: process.env.IRONCLAD_API_KEY,
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
            const targetURL = process.env.IRONCLAD_WEBHOOK_URL;
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

    describe('Workflows', () => {
        let workflowID
        it('should list all workflows', async () => {
            const response = await api.listAllWorkflows()
            expect(response).to.have.property('page');
            expect(response).to.have.property('pageSize');
            expect(response).to.have.property('count');
            expect(response).to.have.property('list');
        })

        it('should create a workflow', async () => {
            const body = {
                creator: {
                    type: "email",
                    email: "projectteam@lefthook.com"
                  },
                  attributes: {
                    counterpartyName: "Example Company",
                    recordType: "NDAs",
                    draft: [
                      {
                        version: "6IiS9B4hU",
                        filename: "sample.pdf",
                        url: "https://www.africau.edu/images/default/sample.pdf"
                      }
                    ],
                    signerb441f3af431a4eba8231819722265373: "jonathan.moore@lefthook.com",
                    signer7e741c328bd84d68a8f58f04449a5e50: "Jonathan Moore"
                  },
                  template: "62e407fdd2e5bbfc9bc7eeb6"
            }
            const response = await api.createWorkflow(body);
            expect(response).to.have.property('id');
            expect(response).to.have.property('title');
            expect(response).to.have.property('template');
            expect(response).to.have.property('step');
            expect(response).to.have.property('schema');

        })
    })
});
