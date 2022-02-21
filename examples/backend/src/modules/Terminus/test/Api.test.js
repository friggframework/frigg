const chai = require('chai');
const TestUtils = require('../../../../test/utils/TestUtils');
const moment = require('moment');

const should = chai.should();

const TerminusApiClass = require('../Api');

describe.skip('Terminus API', async () => {
    const terminusApi = new TerminusApiClass({
        backoff: [1, 3, 10],
        api_key: process.env.TERMINUS_TEST_API_KEY,
    });
    describe('Terminus Folders', async () => {
        let folder_id;
        before(async () => {
            // Create a folder
            let body = {
                folderName: 'Unit Testing - ' + moment().format('x'),
                folderAccess: 'PUBLIC',
            };
            let folder = await terminusApi.createFolder(body);
            folder.should.have.property('displayName');
            folder.should.have.property('folderAccess');
            folder.should.have.property('folderId');
            folder_id = folder.folderId;
        });

        it('should create a folder', async () => {
            // Hope the before works!
        });

        it('should list folders', async () => {
            let res = await terminusApi.listFolders();
            res.should.have.property('folders');
            res.should.have.property('nextPageToken');
        });

        describe('Terminus Account Lists', async () => {
            let list_id;
            before(async () => {
                // create account list
                let body = {
                    listName: 'Unit test list',
                    folderId: folder_id,
                };
                let res = await terminusApi.createAccountList(body);
                res.should.have.property('folderId');
                res.should.have.property('listId');
                res.should.have.property('listName');
                list_id = res.listId;
            });

            it('should create account list', async () => {
                // Hope the before works!
            });

            it('should list account lists', async () => {
                let res = await terminusApi.listAccountLists();
                res.should.have.property('lists');
                res.should.have.property('nextPageToken');
            });

            describe('Add and remove accounts', async () => {
                before(async () => {
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
                    res.should.have.property('listId');
                    res.should.have.property('successfulAccounts');
                    res.should.have.property('accountsNotFound');
                    res.should.have.property('addedAccounts');
                    res.should.have.property('duplicateAccounts');
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
                    res.should.have.property('listId');
                    res.should.have.property('accounts');
                });
            });
        });
    });
});
