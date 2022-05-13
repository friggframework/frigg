const TestUtils = require('../../../../test/utils/TestUtils');
const moment = require('moment');

const TerminusApiClass = require('../api');

describe.skip('Terminus API', () => {
    const terminusApi = new TerminusApiClass({
        backoff: [1, 3, 10],
        api_key: process.env.TERMINUS_TEST_API_KEY,
    });
    describe('Terminus Folders', () => {
        let folder_id;
        beforeAll(async () => {
            // Create a folder
            let body = {
                folderName: 'Unit Testing - ' + moment().format('x'),
                folderAccess: 'PUBLIC',
            };
            let folder = await terminusApi.createFolder(body);
            expect(folder).toHaveProperty('displayName');
            expect(folder).toHaveProperty('folderAccess');
            expect(folder).toHaveProperty('folderId');
            folder_id = folder.folderId;
        });

        it('should create a folder', async () => {
            // Hope the before works!
        });

        it('should list folders', async () => {
            let res = await terminusApi.listFolders();
            expect(res).toHaveProperty('folders');
            expect(res).toHaveProperty('nextPageToken');
        });

        describe('Terminus Account Lists', () => {
            let list_id;
            beforeAll(async () => {
                // create account list
                let body = {
                    listName: 'Unit test list',
                    folderId: folder_id,
                };
                let res = await terminusApi.createAccountList(body);
                expect(res).toHaveProperty('folderId');
                expect(res).toHaveProperty('listId');
                expect(res).toHaveProperty('listName');
                list_id = res.listId;
            });

            it('should create account list', async () => {
                // Hope the before works!
            });

            it('should list account lists', async () => {
                let res = await terminusApi.listAccountLists();
                expect(res).toHaveProperty('lists');
                expect(res).toHaveProperty('nextPageToken');
            });

            describe('Add and remove accounts', () => {
                beforeAll(async () => {
                    // Add account to list
                    let body = {
                        accounts: [
                            {
                                id: process.env.TERMINUS_TEST_ACCOUNT_ID,
                                // crmOrgId: process.env.TERMINUS_CRM_ORG_ID,
                                // crmType: process.env.TERMINUS_CRM_TYPE,
                            },
                        ],
                    };

                    let res = await terminusApi.addAccountsToList(
                        list_id,
                        body
                    );
                    expect(res).toHaveProperty('listId');
                    expect(res).toHaveProperty('successfulAccounts');
                    expect(res).toHaveProperty('accountsNotFound');
                    expect(res).toHaveProperty('addedAccounts');
                    expect(res).toHaveProperty('duplicateAccounts');
                });

                it('should add an account to a list', async () => {
                    // Hope the before works!
                });

                it('should remove an account from a list', async () => {
                    let body = {
                        accounts: [
                            {
                                id: process.env.TERMINUS_TEST_ACCOUNT_ID,
                                // crmOrgId: process.env.TERMINUS_CRM_ORG_ID,
                                // crmType: process.env.TERMINUS_CRM_TYPE,
                            },
                        ],
                    };

                    let res = await terminusApi.removeAccountsFromList(
                        list_id,
                        body
                    );
                    expect(res).toHaveProperty('listId');
                    expect(res).toHaveProperty('accounts');
                });
            });
        });
    });
});
