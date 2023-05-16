const chai = require('chai');
const should = chai.should();
const { Api } = require('../api');
require('dotenv').config();
const { expect } = require('chai');

describe('Ironclad API class', () => {
    const api = new Api({
        apiKey: process.env.IRONCLAD_API_KEY,
        subdomain: process.env.IRONCLAD_SUBDOMAIN,
    });

    describe('Base URL', () => {
        it('should allow localhost subdomain', async () => {
            const api = new Api({
                apiKey: process.env.IRONCLAD_API_KEY,
                subdomain: 'localhost'
            })
            expect(api.baseUrl()).to.equal('https://localhost');
        });

        it('should have ironcladapp.com to baseUrl for non local envs', async () => {
            const api = new Api({
                apiKey: process.env.IRONCLAD_API_KEY,
                subdomain: 'preview'
            })
            expect(api.baseUrl()).to.equal('https://preview.ironcladapp.com');
        });
    })

    describe('Webhooks', () => {
        let webhookID;
        it('should list all webhooks', async () => {
            const response = await api.listWebhooks();
            expect(response).to.have.property('page');
            expect(response).to.have.property('pageSize');
            expect(response).to.have.property('list');
        });

        it('should create a webhook', async () => {
            const events = ['workflow_launched'];
            const targetURL = process.env.IRONCLAD_WEBHOOK_URL;
            const response = await api.createWebhook(events, targetURL);
            expect(response).to.have.property('id');
            expect(response).to.have.property('events');
            expect(response).to.have.property('targetURL');
            expect(response).to.have.property('companyId');
            webhookID = response.id;
        });

        it('should update a webhook', async () => {
            const events = ['workflow_cancelled'];
            const response = await api.updateWebhook(webhookID, events);
            expect(response).to.have.property('id');
            expect(response).to.have.property('events');
            expect(response).to.have.property('targetURL');
            expect(response).to.have.property('companyId');
        });

        it('should delete a webhook', async () => {
            const response = await api.deleteWebhook(webhookID);
            expect(response.status).to.equal(204);
        });
    });

    describe('Workflows', () => {
        let workflowSchemaID;
        let workflowID;
        let documentKey;
        it('should list all workflows', async () => {
            const response = await api.listAllWorkflows();
            expect(response).to.have.property('page');
            expect(response).to.have.property('pageSize');
            expect(response).to.have.property('count');
            expect(response).to.have.property('list');
            workflowID = response.list[0].id;
        });

        it('should return the second page of workflows', async () => {
            let params = {
                page: 1,
            };

            const response = await api.listAllWorkflows(params);
            expect(response).to.have.property('page');
            expect(response).to.have.property('pageSize');
            expect(response).to.have.property('count');
            expect(response).to.have.property('list');
        });

        it('should create a workflow', async () => {
            const body = {
                creator: {
                    type: 'email',
                    email: 'projectteam@lefthook.com',
                },
                attributes: {
                    counterpartyName: 'Example Company',
                    recordType: 'NDAs',
                    draft: [
                        {
                            version: '6IiS9B4hU',
                            filename: 'sample.pdf',
                            url: 'https://www.africau.edu/images/default/sample.pdf',
                        },
                    ],
                    signerb441f3af431a4eba8231819722265373:
                        'jonathan.moore@lefthook.com',
                    signer7e741c328bd84d68a8f58f04449a5e50: 'Jonathan Moore',
                },
                template: '62e407fdd2e5bbfc9bc7eeb6',
            };
            const response = await api.createWorkflow(body);
            expect(response).to.have.property('id');
            expect(response).to.have.property('title');
            expect(response).to.have.property('template');
            expect(response).to.have.property('step');
            expect(response).to.have.property('schema');
        });

        it('should list all workflow schemas', async () => {
            const params = {
                form: 'launch',
            };
            const response = await api.listAllWorkflowSchemas(params);
            expect(response).to.have.property('list');
            workflowSchemaID = response.list[0].id;
        });

        it('should retrieve a workflow schema', async () => {
            const params = {
                form: 'launch',
            };
            const response = await api.retrieveWorkflowSchema(
                params,
                workflowSchemaID
            );
            expect(response).to.have.property('id');
            expect(response).to.have.property('name');
            expect(response).to.have.property('schema');
        });

        it('should retrieve a workflow', async () => {
            const response = await api.retrieveWorkflow(workflowID);
            expect(response).to.have.property('id');
            expect(response).to.have.property('title');
            expect(response).to.have.property('template');
            expect(response).to.have.property('step');
            expect(response).to.have.property('schema');
            expect(response).to.have.property('attributes');
            expect(response).to.have.property('isCancelled');
            expect(response).to.have.property('isComplete');
            expect(response).to.have.property('status');
            expect(response).to.have.property('creator');
            expect(response).to.have.property('created');
            expect(response).to.have.property('lastUpdated');
            expect(response).to.have.property('roles');
            expect(response).to.have.property('approvals');
            expect(response).to.have.property('signatures');
            expect(response).to.have.property('isRevertibleToReview');
            documentKey = response.attributes.draft[0].download.split('/')[7];
        });

        it.skip('should list all workflow approvals', async () => {
            const response = await api.listAllWorkflowApprovals(workflowID);
            expect(response).to.have.property('workflowId');
            expect(response).to.have.property('title');
            expect(response).to.have.property('approvalGroups');
            expect(response).to.have.property('roles');
        });

        it('should update a workflow approval', async () => {
            workflowID = process.env.WORKFLOW_ID;
            const workflowApprovals = await api.listAllWorkflowApprovals(
                workflowID
            );
            workflowApprovals.approvalGroups.forEach(async (approvalGroup) => {
                let roleID = approvalGroup.reviewers[0].role;
                let role = workflowApprovals.roles.find(
                    (role) => role.id === roleID
                );
                let email = role.assignees[0].email;

                let body = {
                    user: {
                        type: 'email',
                        email,
                    },
                    status: 'approved',
                };

                const response = await api.updateWorkflowApprovals(
                    workflowID,
                    roleID,
                    body
                );
                expect(response).to.equal(true);
            });
        });

        it('should create a workflow comment', async () => {
            const body = {
                creator: {
                    type: 'email',
                    email: 'projectteam@lefthook.com',
                },
                comment: 'Testing a comment',
            };

            const response = await api.createWorkflowComment(workflowID, body);
            expect(response).to.equal('');
        });

        it('should retrieve a workflow document', async () => {
            const response = await api.retrieveWorkflowDocument(
                workflowID,
                documentKey
            );
            expect(response).to.exist;
        });

        // Must be workflow in review step
        it('should update a workflow metadata', async () => {
            const params = {
                status: 'active',
            };
            const datetime = Date.now();
            const getReviewWorkflows = await api.listAllWorkflows(params);
            let reviewWorkflowId;

            for (const workflow of getReviewWorkflows.list) {
                if (workflow.step === 'Review') {
                    reviewWorkflowId = workflow.id;
                    console.log(workflow);
                    break;
                }
            }

            const body = {
                // Testing string, also should test:
                //    Email, Number, Boolean, Date, Dynamic table, Monetary value, Address, General object
                updates: [
                    {
                        action: 'set',
                        path: 'counterpartyName',
                        value: `Updated Example Company ${datetime}`,
                    },
                ],
                comment: 'Updated workflow counterpartyName',
            };
            const response = await api.updateWorkflow(reviewWorkflowId, body);
            expect(response).to.have.property('id');
            expect(response).to.have.property('title');
            expect(response).to.have.property('schema');
        });
    });

    describe('Records', () => {
        let recordID;

        it('should create a record', async () => {
            const body = {
                type: 'nDAs',
                name: 'Example Record',
                properties: {
                    agreementDate: {
                        type: 'date',
                        value: '2022-08-12T00:00:00-07:00',
                    },
                    counterpartyName: {
                        type: 'string',
                        value: 'John Doe',
                    },
                },
            };
            const response = await api.createRecord(body);
            expect(response).to.have.property('id');
            expect(response).to.have.property('type');
            expect(response).to.have.property('name');
            expect(response).to.have.property('lastUpdated');
            recordID = response.id;
        });

        it('should list all records', async () => {
            const response = await api.listAllRecords();
            expect(response).to.have.property('page');
            expect(response).to.have.property('pageSize');
            expect(response).to.have.property('count');
            expect(response).to.have.property('list');
        });

        it('should list all record schemas', async () => {
            const response = await api.listAllRecordSchemas();
            expect(response).to.have.property('properties');
            expect(response).to.have.property('recordTypes');
        });

        it('should retrieve a record', async () => {
            const response = await api.retrieveRecord(recordID);
            expect(response).to.have.property('id');
            expect(response).to.have.property('type');
            expect(response).to.have.property('name');
            expect(response).to.have.property('lastUpdated');
            expect(response).to.have.property('properties');
            expect(response).to.have.property('attachments');
            expect(response).to.have.property('links');
        });

        it('should update a record metadata', async () => {
            const body = {
                type: 'nDAs',
                name: 'Updated Example Record',
                addProperties: {
                    counterpartyName: {
                        type: 'string',
                        value: 'Jane Doe',
                    },
                },
            };
            const response = await api.updateRecord(recordID, body);
            expect(response).to.have.property('id');
            expect(response).to.have.property('type');
            expect(response).to.have.property('name');
            expect(response).to.have.property('properties');
            expect(response).to.have.property('lastUpdated');
            expect(response.properties.counterpartyName.value).to.equal(
                'Jane Doe'
            );
        });

        it('should delete a record', async () => {
            const response = await api.deleteRecord(recordID);
            expect(response.status).to.equal(204);
            expect(response.statusText).to.equal('No Content');
        });
    });
});
