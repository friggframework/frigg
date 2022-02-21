require('../../../../setupEnv');

const chai = require('chai');
const nock = require('nock');
const path = require('path');

const should = chai.should();
const ActiveCampaignApiClass = require('../Api');

nock.back.fixtures = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'test',
    'mocks',
    'requests'
);
// nock.back.setMode('record');

describe('ActiveCampaign API', () => {
    let testedApi;
    let activeCampaignHttpMock;

    before(async () => {
        testedApi = new ActiveCampaignApiClass({
            apiKey: process.env.AC_API_KEY,
            apiUrl: process.env.AC_API_URL,
        });
        activeCampaignHttpMock = await nock.back('activecampaign.json');
    });

    after(() => {
        activeCampaignHttpMock.nockDone();
        activeCampaignHttpMock.context.assertScopesFinished();
        nock.cleanAll();
        nock.restore();
    });

    describe('#constructor', () => {
        it('requires an apiKey', () => {
            try {
                new ActiveCampaignApiClass();
                throw new Error('Did not throw expected error.');
            } catch (e) {
                e.message.should.include('apiKey is a required parameter');
            }
        });

        it('requires an apiUrl', () => {
            try {
                new ActiveCampaignApiClass({ apiKey: 'mykey' });
                throw new Error('Did not throw expected error.');
            } catch (e) {
                e.message.should.include('apiUrl is a required parameter');
            }
        });
    });

    describe('contact CRUD', () => {
        let contactId = null;

        it('creates a contact', async () => {
            const { contact } = await testedApi.createContact({
                contact: {
                    email: 'jonathandoe4@example.com',
                    firstName: 'Jonathan',
                    lastName: 'Doe',
                    phone: '7223224241',
                },
            });
            contact.should.have.property('id');
            contact.should.have.property('links');
            contact.should.have.property('email', 'jonathandoe4@example.com');
            contactId = contact.id;
        });

        it('retrieve a contact', async () => {
            const res = await testedApi.retrieveContact(contactId);
            const retrievedContact = res.contact;
            retrievedContact.should.have.property(
                'email_domain',
                'example.com'
            );
            retrievedContact.should.have.property('accountContacts');
            retrievedContact.should.have.property('fieldValues');
            retrievedContact.should.have.property('deals');
            retrievedContact.should.have.property('id', contactId);
        });

        it('update a contact', async () => {
            const res = await testedApi.updateContact(contactId, {
                contact: {
                    lastName: 'Updateddoe',
                },
            });

            const updatedContact = res.contact;
            updatedContact.should.have.property('lastName', 'Updateddoe');
            updatedContact.should.have.property('udate');
        });

        it('delete a contact', async () => {
            const res = await testedApi.deleteContact(contactId);
            res.should.have.property('status', 200);
        });

        it('list contacts', async () => {
            const res = await testedApi.listContacts();
            res.should.have.property('contacts');
            res.meta.should.have.property('total', '6');
        });

        it('bulk contact import', async () => {
            const body = {
                contacts: [
                    {
                        email: 'someone@somewhere.com',
                        first_name: 'Jane',
                        last_name: 'Doe',
                        phone: '123-456-7890',
                        customer_acct_name: 'ActiveCampaign',
                        tags: [
                            'dictumst',
                            'aliquam',
                            'augue quam',
                            'sollicitudin rutrum',
                        ],
                        fields: [
                            { id: 1, value: 'foo' },
                            { id: 2, value: '||foo||bar||baz||' },
                        ],
                        subscribe: [{ listid: 1 }, { listid: 2 }],
                        unsubscribe: [{ listid: 3 }],
                    },
                ],
                callback: {
                    url: 'www.your_web_server.com',
                    requestType: 'POST',
                    detailed_results: 'true',
                    params: [{ key: '', value: '' }],
                    headers: [{ key: '', value: '' }],
                },
            };

            const res = await testedApi.bulkContactImport(body);
            //res.should.have.property('success', 1)
            //res.should.have.property('message', 'Contact import queued')
        });
    });

    describe('account CRUD', () => {
        let accountId;

        it('lists all accounts', async () => {
            const res = await testedApi.listAccounts();
            res.should.have.property('accounts');
        });

        it('list all accounts with account contacts', async () => {
            const params = {
                include: 'accountContacts',
            };
            const res = await testedApi.listAccounts(params);
            res.should.have.property('accountContacts');
        });

        it('creates an account', async () => {
            const account = {
                account: {
                    name: 'Test Account3',
                    accountUri: 'https://www.testaccount.com',
                },
            };
            const response = await testedApi.createAccount(account);

            accountId = response.account.id;
        });

        it('retrieves an account', async () => {
            const res = await testedApi.retrieveAccount(accountId);
            const retrievedAccount = res.account;
            retrievedAccount.should.have.property('name');
            retrievedAccount.should.have.property('accountUrl');
            retrievedAccount.should.have.property('owner');
            retrievedAccount.should.have.property('links');
            retrievedAccount.should.have.property('id', accountId);
        });

        it('updates an account', async () => {
            const res = await testedApi.updateAccount(accountId, {
                account: {
                    name: 'name_updated',
                },
            });
        });

        it('deletes an account', async () => {
            const res = await testedApi.deleteAccount(accountId);
            res.should.have.property('status', 200);
        });
    });

    describe('task CRUD', () => {
        it('creates a task', async () => {
            const res = await testedApi.createTask();
            res.should.have.property('dealTasks');
        });
    });

    describe('tags CRUD', () => {
        let tagId;
        it('lists all tags', async () => {
            const res = await testedApi.listTags();
            res.should.have.property('tags');
            res.tags[0].should.have.property('id');
        });

        it('creates a tag', async () => {
            const body = {
                tag: {
                    tag: 'My Tag',
                    tagType: 'contact',
                    description: 'Description',
                },
            };

            const res = await testedApi.createTag(body);
            tagId = res.tag.id;
        });

        it('add tag to contact', async () => {
            const body = {
                contactTag: {
                    contact: '2',
                    tag: tagId,
                },
            };

            const res = await testedApi.addTagToContact(body);
            res.should.have.property('contactTag');
            res.contactTag.should.have.property('id');
        });

        it('deletes tag', async () => {
            const res = await testedApi.deleteTag(tagId);
            res.should.have.property('status', 200);
        });
    });
});
