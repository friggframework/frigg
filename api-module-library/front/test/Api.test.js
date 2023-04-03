/**
 * @group interactive
 */

const Authenticator = require('@friggframework/test-environment/Authenticator');
const { Api } = require('../api.js');

describe.skip('Front API', () => {
    const frontApi = new Api({ backOff: [1, 3, 10] });
    beforeAll(async () => {
        const url = frontApi.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await frontApi.getTokenFromCode(response.data.code);
    });

    describe('User Info', () => {
        it('should get user info', async () => {
            const response = await frontApi.getTokenIdentity();
        });
    });

    describe('Conversations', () => {
        it('should list conversations', async () => {
            const response = await frontApi.listConversations();
            expect(response).toHaveProperty('_links');
            expect(response).toHaveProperty('_results');
            expect(response).toHaveProperty('_pagination');
        });
    });

    describe('Contacts', () => {
        let contact;
        beforeAll(async () => {
            const body = {
                name: 'Test Name',
                handles: [
                    {
                        handle: 'testEmail@lefthook.co',
                        source: 'email',
                    },
                ],
                description: 'This is a sample contact made by unit testing',
            };
            contact = await frontApi.createContact(body);
            expect(contact).toHaveProperty('id');
            expect(contact).toHaveProperty('name');
            expect(contact).toHaveProperty('description');
            expect(contact).toHaveProperty('handles');
            expect(contact.name).toBe(body.name);
            expect(contact.description).toBe(body.description);
        });

        afterAll(async () => {
            let deleted = await frontApi.deleteContact(contact.id);
            expect(deleted.status).toBe(204);
        });

        it('should create a contact', async () => {
            //Hope the before happens
        });

        it('should get contact by ID', async () => {
            let res = await frontApi.getContactById(contact.id);
            expect(res).toHaveProperty('id');
            expect(res).toHaveProperty('name');
            expect(res).toHaveProperty('description');
            expect(res).toHaveProperty('handles');
            expect(res.name).toBe(contact.name);
            expect(res.description).toBe(contact.description);
        });

        it('should list contacts', async () => {
            const response = await frontApi.listContacts();
            expect(response).toHaveProperty('_links');
            expect(response).toHaveProperty('_results');
            expect(response).toHaveProperty('_pagination');
        });

        it('should update contact', async () => {
            let body = {
                name: 'Updated Name Test',
            };
            let res = await frontApi.updateContact(contact.id, body);
            // Since the update response doesn't return the updated contact...
            let response = await frontApi.getContactById(contact.id);
            expect(response).toHaveProperty('id');
            expect(response).toHaveProperty('name');
            expect(response).toHaveProperty('description');
            expect(response).toHaveProperty('handles');
            expect(response.name).toBe(body.name);
            expect(response.description).toBe(contact.description);
        });

        it('should delete contact', async () => {
            // Hope the after works!
        });
    });
});
