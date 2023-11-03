require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('Deel API Tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        client_id: process.env.DEEL_CLIENT_ID,
        client_secret: process.env.DEEL_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/deel`,
        scope: process.env.DEEL_SCOPE,
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);

    //Disabling auth flow for speed (access tokens expire after ten years)
    beforeAll(async () => {
        const url = api.getAuthorizationUri();
        const response = await Authenticator.oauth2(url);
        await api.getTokenFromCodeBasicAuthHeader(response.data.code);
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate tokens', async () => {
            expect(api.access_token).toBeTruthy();
        });
        it('Should refresh tokens', async () => {
           const oldToken = api.access_token;
           await api.refreshAuth();
           expect(api.access_token).toBeTruthy();
           expect(oldToken).not.toBe(api.access_token);
        });
    });
    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the Organization', async () => {
            const org = await api.getOrganization();
            expect(org.data).toBeDefined();
        });
        it('Should retrieve information about the token', async () => {
            const tokenDetails = await api.getTokenIdentity();
            expect(tokenDetails.identifiers).toBeDefined();
            expect(tokenDetails.identifiers.externalId).toBeTruthy();
        });
    });

    describe('API requests', () => {
        describe('People requests', () => {
            it('Should retrieve a page of people', async () => {
                const people = await api.listPeople();
                expect(people).toBeDefined();
            });
            it('Should retrieve another page of people', async () => {
                const offset = 100;
                const people = await api.listPeople({offset});
                expect(people).toBeDefined();
                expect(people.page.offset).toBe(offset);
            });
            it('Should retrieve a small page of people', async () => {
                const limit = 10;
                const people = await api.listPeople({limit});
                expect(people).toBeDefined();
                expect(people.page.items_per_page).toBe(limit);
            });
            let aPersonId;
            it('Should search for a person', async () => {
                const search = 'bobine'
                const people = await api.listPeople({search});
                expect(people).toBeDefined();
                expect(people.page.total_rows).toBe(2);
                aPersonId = people.data[0].id;
            })
            it('Should retrieve a person', async () => {
                const person = await api.getPerson(aPersonId);
                expect(person).toBeDefined();
                expect(person.data.id).toBe(aPersonId);
            })
        });

        describe('Webhook requests', () => {
            let webhookId = '';
            const webhookDef = {
                "name": "My webhook",
                "description": "My first webhook.",
                "events": [
                    "contract.created",
                ],
                "status": "enabled",
                "url": "https://webhook.site/fd5b33ad-8db9-4bd9-baae-4da351f667dd",
                "api_version": "v1"
            }
            it('Should create a webhook', async () => {

                const response = await api.createWebhook(webhookDef);
                expect(response.data).toBeDefined();
                expect(response.data.events).toMatchObject(webhookDef.events);
                webhookId = response.data.id;
            });
            it('Should retrieve a webhook by id', async ()=> {
                const response = await api.getWebhook(webhookId);
                expect(response.data).toBeDefined();
                expect(response.data.events).toMatchObject(webhookDef.events);
            });
            it('Should update a webhook', async () => {
                const newEvent = 'contract.status.updated';
                const response = await api.updateWebhook(webhookId, {events: [newEvent]});
                expect(response.data).toBeDefined();
                expect(response.data.events).toMatchObject([newEvent]);
            });
            it('Should delete a webhook', async () => {
                const response = await api.deleteWebhook(webhookId);
                expect(response).toBeDefined();
                expect(response.status).toBe(200);
            });
            it('Should list webhook event types', async () => {
                const response = await api.listWebhookEventTypes();
                expect(response.data).toBeDefined();
                expect(response.data.length).toBeGreaterThan(0);
            })
        });
    });
});
