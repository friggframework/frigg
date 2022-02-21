const LHModuleManager = require('../../../../src/base/managers/LHModuleManager');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential');
const MockSync = require('../../objects/sync/MockSync');
const ModuleConstants = require('../../../../src/modules/ModuleConstants');

class Manager extends LHModuleManager {
    constructor(params) {
        super({ ...params, entityClass: Entity, credentialClass: Credential });

        // this is setting the default data for testing the optional data. This should not be
        // something you do outside of mocks
        this.data = [
            {
                data: {
                    name: ['Sean', 'Magpie'],
                    email: 'seanmagpie@lefthook.co',
                },
                id: { userId: 1 },
            },
            {
                data: {
                    name: [null, 'Bison'],
                    email: 'calebBison@lefthook.co',
                },
                id: { userId: 2 },
            },
        ];
    }

    static getName() {
        return 'mockModuleTwo';
    }

    static async getInstance(params) {
        return new Manager(params);
    }

    async getAuthorizationRequirements(params) {
        return {
            url: 'localhost:3000/test',
            type: ModuleConstants.authType.oauth2,
        };
    }

    async processAuthorizationCallback(params) {
        const userId = this.getParam(params, 'userId');
        const data = this.getParam(params, 'data');

        const credential = await this.credentialMO.create({});

        const entity = await this.entityMO.create({
            credential,
            user: this.userId,
        });
        return {
            id: entity.id,
            type: Manager.getName(),
        };
    }

    //----------------------------------------------------------------------------------------------------
    // optional

    async getAllSyncObjects(SyncClass) {
        return this.data.map(
            (d) =>
                new MockSync({
                    moduleName: this.constructor.getName(),
                    data: d.data,
                    dataIdentifier: d.id,
                })
        );
    }

    async batchCreateSyncObjects(syncObjects, syncManager) {
        for (const syncObj of syncObjects) {
            const dataObj = {
                data: syncObj.reverseModuleMap(this.constructor.getName()),
                id: {
                    userId: Math.random(),
                },
            };
            this.data.push(dataObj);
            await syncManager.updateSyncObject(
                syncObj.syncId,
                dataObj.id,
                this
            );
        }
    }

    async batchUpdateSyncObjects(syncObjects, syncManager) {
        for (const syncObj of syncObjects) {
            const localDataObj = this.data.find(
                (e1) => e1.id.userId === syncObj.dataIdentifier.userId
            );
            localDataObj.data = syncObj.reverseModuleMap(
                this.constructor.getName()
            );
        }
    }
}

module.exports = Manager;
