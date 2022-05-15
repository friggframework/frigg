/* eslint-disable no-only-tests/no-only-tests */
const chai = require('chai');

const ManagerClass = require('../manager');
const Authenticator = require('../../../../test/utils/Authenticator');
const TestUtils = require('../../../../test/utils/TestUtils');

describe('should make Clyde requests through the Clyde Manager', async () => {
    let manager;
    before(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();
        manager = await ManagerClass.getInstance({
            userId: this.userManager.getUserId(),
        });
        const res = await manager.getAuthorizationRequirements();

        chai.assert.hasAllKeys(res, ['url', 'data', 'type']);
        const testCreds = {
            clientKey: process.env.CLYDE_TEST_CLIENT_KEY,
            secret: process.env.CLYDE_TEST_SECRET,
        };
        const ids = await manager.processAuthorizationCallback({
            userId: this.userManager.getUserId(),
            data: testCreds,
        });
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);

        manager = await ManagerClass.getInstance({
            entityId: ids.entity_id,
            userId: this.userManager.getUserId(),
        });
        return 'done';
    });

    after(async () => {
        const removeCred = await manager.credentialMO.delete(
            manager.credential._id
        );
        const removeEntity = await manager.entityMO.delete(manager.entity._id);
        // await disconnectFromDatabase();
    });

    it('should process Auth callback', async () => {
        manager.should.have.property('userId');
        manager.should.have.property('entity');
    });

    it('should test auth', async () => {
        const res = await manager.testAuth();
        res.should.equal(true);
    });

    it('should reinstantiate with an entity ID', async () => {
        const newManager = await ManagerClass.getInstance({
            userId: this.userManager.getUserId(),
            entityId: manager.entity._id,
        });
        newManager.api.clientKey.should.equal(manager.api.clientKey);
        newManager.api.secret.should.equal(manager.api.secret);
        newManager.entity._id
            .toString()
            .should.equal(manager.entity._id.toString());
        newManager.credential._id
            .toString()
            .should.equal(manager.credential._id.toString());
    });

    it('should list products', async () => {
        const products = await manager.api.listProducts();
        products.data.should.be.an('array');
    });

    it('should fail to refresh token and mark auth as invalid', async () => {
        manager.api.setClientKey('nolongervalid');
        manager.api.setSecret('nolongervalideither');
        const response = await manager.testAuth();

        response.should.equal(false);
        const credential = await manager.credentialMO.get(
            manager.credential._id
        );
        credential.auth_is_valid.should.equal(false);
    });
});
