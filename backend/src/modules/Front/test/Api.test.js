const chai = require('chai');
const TestUtils = require('../../../../test/utils/TestUtils');

const should = chai.should();

const Authenticator = require('../../../../test/utils/Authenticator');
const FrontApiClass = require('../Api.js');

describe('Front API', async () => {
    const frontApi = new FrontApiClass({ backOff: [1, 3, 10] });
    before(async () => {
        const url = frontApi.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await frontApi.getTokenFromCode(response.data.code);
    });

    describe('User Info', async () => {
        it('should get user info', async () => {
            const response = await frontApi.getTokenIdentity();
        });
    });

    describe('Conversations', async () => {
        it('should list conversations', async () => {
            const response = await frontApi.listConversations();
            response.should.have.property('_links');
            response.should.have.property('_results');
            response.should.have.property('_pagination');
        });
    });

    describe('Contacts', async () => {
        let contact;
        before(async () => {
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
            contact.should.have.property('id');
            contact.should.have.property('name');
            contact.should.have.property('description');
            contact.should.have.property('handles');
            contact.name.should.equal(body.name);
            contact.description.should.equal(body.description);
        });

        after(async () => {
            let deleted = await frontApi.deleteContact(contact.id);
            deleted.status.should.equal(204);
        });

        it('should create a contact', async () => {
            //Hope the before happens
        });

        it('should get contact by ID', async () => {
            let res = await frontApi.getContactById(contact.id);
            res.should.have.property('id');
            res.should.have.property('name');
            res.should.have.property('description');
            res.should.have.property('handles');
            res.name.should.equal(contact.name);
            res.description.should.equal(contact.description);
        });

        it('should list contacts', async () => {
            const response = await frontApi.listContacts();
            response.should.have.property('_links');
            response.should.have.property('_results');
            response.should.have.property('_pagination');
        });

        it('should update contact', async () => {
            let body = {
                name: 'Updated Name Test',
            };
            let res = await frontApi.updateContact(contact.id, body);
            // Since the update response doesn't return the updated contact...
            let response = await frontApi.getContactById(contact.id);
            response.should.have.property('id');
            response.should.have.property('name');
            response.should.have.property('description');
            response.should.have.property('handles');
            response.name.should.equal(body.name);
            response.description.should.equal(contact.description);
        });

        it('should delete contact', async () => {
            // Hope the after works!
        });
    });
});
