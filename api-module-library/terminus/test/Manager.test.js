const chai = require('chai');

const { expect } = chai;
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);
const _ = require('lodash');

const Manager = require('../manager.js');
const mongoose = require("mongoose");

const testType = 'local-dev';

describe.skip('Terminus Entity Manager', () => {
    let testContext, userId;

    beforeAll(() => {
        testContext = {};
    });

    let manager;
    beforeAll(async () => {
        userId = new mongoose.Types.ObjectId();
        manager = await Manager.getInstance({
            userId,
        });
        const res = await manager.getAuthorizationRequirements();

        chai.assert.hasAnyKeys(res, ['type']);

        const ids = await manager.processAuthorizationCallback({
            userId: 0,
            data: {
                apiKey: process.env.TERMINUS_TEST_API_KEY,
            },
        });
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);

        // Don't need these. Entity should already be created
        // const options = await manager.getEntityOptions();

        // const entity = await manager.findOrCreateEntity({
        //     credential_id: ids.credential_id,
        //     [options[0].key]: options[0].options[0],
        //     // organization_id: ""
        // });

        manager = await Manager.getInstance({
            entityId: ids.entity_id,
            userId,
        });
        return 'done';
    });

    afterAll(async () => {
        await manager.deauthorize();
        await manager.entityMO.delete(manager.entity._id);
    });

    it('should create credential and entity from API Key', async () => {
        manager.should.have.property('userId');
        manager.should.have.property('entity');
    });

    it('should reinstantiate with an entity ID', async () => {
        let newManager = await Manager.getInstance({
            userId,
            entityId: manager.entity._id,
        });
        newManager.api.API_KEY_VALUE.should.equal(manager.api.API_KEY_VALUE);
        newManager.entity._id
            .toString()
            .should.equal(manager.entity._id.toString());
    });

    it('should return original credential and entity when processAuthorizationCallback is invoked with the same key', async () => {
        const ids = await manager.processAuthorizationCallback({
            userId: 0,
            data: {
                apiKey: process.env.TERMINUS_TEST_API_KEY,
            },
        });
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
        ids.credential_id
            .toString()
            .should.equal(manager.entity.credential.toString());
        ids.entity_id.toString().should.equal(manager.entity._id.toString());
    });

    it('should recognize invalid api key', async () => {
        try {
            const res = await manager.processAuthorizationCallback({
                userId: 0,
                data: {
                    apiKey: 'garbage',
                },
            });
            true.should.equal(false);
        } catch (e) {
            e.message.should.include('500 Internal Server Error');
        }
    });

    it('processAuthorizationCallback should fail because credential is in use with another user', async () => {
        try {
            let newUserId = new mongoose.Types.ObjectId();
            let newManager = await Manager.getInstance({
                userId: newUserId,
            });

            await newManager.processAuthorizationCallback({
                userId: 1,
                data: {
                    apiKey: process.env.TERMINUS_TEST_API_KEY,
                },
            });
            throw new Error("It's a trap!");
        } catch (e) {
            e.message.should.include('E11000 duplicate key error');
        }
        // chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
    });
});
