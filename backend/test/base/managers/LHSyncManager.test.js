const chai = require('chai');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const mongoose = require('mongoose');
const ModelTestUtils = require('../../utils/ModelTestUtils');

const UserManager = require('../../../src/managers/UserManager');
const LHSyncManager = require('../../../src/base/managers/LHSyncManager');
const MockSync = require('../../mocks/objects/sync/MockSync');
const MockModuleOneManager = require('../../mocks/modules/MockModuleOne/Manager');
const MockModuleTwoManager = require('../../mocks/modules/MockModuleTwo/Manager');
const Sync = require('../../../src/base/models/Sync');

const loginCredentials = { username: 'admin', password: 'password1' };

describe.skip('LHSyncManager', async () => {
    before(async () => {
        await ModelTestUtils.wipeDB();
    });

    beforeEach(async function () {
        this.userManager = await UserManager.createUser(loginCredentials);
        this.oneManager = await MockModuleOneManager.getInstance({
            userId: this.userManager.getUserId(),
        });
        this.twoManager = await MockModuleTwoManager.getInstance({
            userId: this.userManager.getUserId(),
        });
        await this.oneManager.processAuthorizationCallback({
            userId: this.userManager.getUserId(),
            data: {},
        });
        await this.twoManager.processAuthorizationCallback({
            userId: this.userManager.getUserId(),
            data: {},
        });
        this.syncMO = new Sync();
        this.syncManager = new LHSyncManager({
            primary: this.oneManager,
            secondary: this.twoManager,
            syncObjectClass: MockSync,
        });

        this.verifyData = (async (oneCount, twoCount, dbCount) => {
            expect(this.twoManager.data.length).to.equal(twoCount);
            expect(this.oneManager.data.length).to.equal(oneCount);
            let syncObjs = await this.syncMO.list({});
            expect(syncObjs.length).to.equal(dbCount);
            for (let syncObj of syncObjs) {
                expect(syncObj.dataIdentifiers.length).to.equal(2);
            }
        }).bind(this);
    });
    afterEach(async () => {
        await ModelTestUtils.wipeDB();
    });

    it('basic test of initial sync', async function () {
        await this.syncManager.initialSync();
        await this.verifyData(3, 3, 3);
    });

    it('basic test of initial unidirectional sync', async function () {
        this.syncManager = new LHSyncManager({
            primary: this.oneManager,
            secondary: this.twoManager,
            syncObjectClass: MockSync,
            isUnidirectionalSync: true,
        });

        await this.syncManager.initialSync();
        await this.verifyData(2, 3, 2);
    });

    describe('after initial sync', async () => {
        beforeEach(async function () {
            await this.syncManager.initialSync();
        });
        it('basic test of sync', async function () {
            const data = {
                firstName: 'Bill',
                lastName: 'Ted',
                email: 'billyted@test.com',
            };
            const id = this.oneManager.addDataHelper(data);
            const syncObjArr = [
                new MockSync({
                    data,
                    dataIdentifier: id,
                    moduleName: this.oneManager.constructor.getName(),
                }),
            ];
            await this.syncManager.sync(syncObjArr);
            await this.verifyData(4, 4, 4);

            await this.syncManager.sync(syncObjArr);
            await this.verifyData(4, 4, 4);
        });
    });
});
