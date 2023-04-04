/**
 * @group live-api
 */

const nock = require('nock');
const path = require('path');

const { Api } = require('../api');

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

describe.skip('ActiveCampaign API', () => {
    let testedApi;
    let activeCampaignHttpMock;

    beforeAll(async () => {
        testedApi = new Api({
            apiKey: process.env.AC_API_KEY,
            apiUrl: process.env.AC_API_URL,
        });
        activeCampaignHttpMock = await nock.back('activecampaign.json');
    });

    afterAll(() => {
        activeCampaignHttpMock.nockDone();
        activeCampaignHttpMock.context.assertScopesFinished();
        nock.cleanAll();
        nock.restore();
    });

    describe('#constructor', () => {
        it('requires an apiKey', () => {
            try {
                new Api();
                throw new Error('Did not throw expected error.');
            } catch (e) {
                expect(e.message).toContain('apiKey is a required parameter');
            }
        });

        it('requires an apiUrl', () => {
            try {
                new Api({ apiKey: 'mykey' });
                throw new Error('Did not throw expected error.');
            } catch (e) {
                expect(e.message).toContain('apiUrl is a required parameter');
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
            expect(contact).toHaveProperty('id');
            expect(contact).toHaveProperty('links');
            expect(contact).toHaveProperty('email', 'jonathandoe4@example.com');
            contactId = contact.id;
        });

        it('retrieve a contact', async () => {
            const res = await testedApi.retrieveContact(contactId);
            const retrievedContact = res.contact;
            expect(retrievedContact).toHaveProperty(
                'email_domain',
                'example.com'
            );
            expect(retrievedContact).toHaveProperty('accountContacts');
            expect(retrievedContact).toHaveProperty('fieldValues');
            expect(retrievedContact).toHaveProperty('deals');
            expect(retrievedContact).toHaveProperty('id', contactId);
        });

        it('update a contact', async () => {
            const res = await testedApi.updateContact(contactId, {
                contact: {
                    lastName: 'Updateddoe',
                },
            });

            const updatedContact = res.contact;
            expect(updatedContact).toHaveProperty('lastName', 'Updateddoe');
            expect(updatedContact).toHaveProperty('udate');
        });

        it('delete a contact', async () => {
            const res = await testedApi.deleteContact(contactId);
            expect(res).toHaveProperty('status', 200);
        });

        it('list contacts', async () => {
            const res = await testedApi.listContacts();
            expect(res).toHaveProperty('contacts');
            expect(res.meta).toHaveProperty('total', '6');
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
            expect(res).toHaveProperty('accounts');
        });

        it('list all accounts with account contacts', async () => {
            const params = {
                include: 'accountContacts',
            };
            const res = await testedApi.listAccounts(params);
            expect(res).toHaveProperty('accountContacts');
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
            expect(retrievedAccount).toHaveProperty('name');
            expect(retrievedAccount).toHaveProperty('accountUrl');
            expect(retrievedAccount).toHaveProperty('owner');
            expect(retrievedAccount).toHaveProperty('links');
            expect(retrievedAccount).toHaveProperty('id', accountId);
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
            expect(res).toHaveProperty('status', 200);
        });
    });

    describe('task CRUD', () => {
        it('creates a task', async () => {
            const res = await testedApi.createTask();
            expect(res).toHaveProperty('dealTasks');
        });
    });

    describe('tags CRUD', () => {
        let tagId;
        it('lists all tags', async () => {
            const res = await testedApi.listTags();
            expect(res).toHaveProperty('tags');
            expect(res.tags[0]).toHaveProperty('id');
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
            expect(res).toHaveProperty('contactTag');
            expect(res.contactTag).toHaveProperty('id');
        });

        it('deletes tag', async () => {
            const res = await testedApi.deleteTag(tagId);
            expect(res).toHaveProperty('status', 200);
        });
    });
});
