const chai = require('chai');

const ManagerClass = require('../Manager');
const Authenticator = require('../../../../test/utils/Authenticator');
const TestUtils = require('../../../../test/utils/TestUtils');

describe.skip('should make HubSpot requests through the HubSpot Manager', async () => {
    let manager;
    before(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();
        manager = await ManagerClass.getInstance({
            userId: this.userManager.getUserId(),
        });
        const res = await manager.getAuthorizationRequirements();

        chai.assert.hasAnyKeys(res, ['url', 'type']);
        const { url } = res;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const ids = await manager.processAuthorizationCallback({
            userId: 0,
            data: response.data,
        });
        chai.assert.hasAnyKeys(ids, ['credential_id', 'entity_id', 'type']);

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

    it('should go through Oauth flow', async () => {
        manager.should.have.property('userId');
        manager.should.have.property('entity');
    });

    it('should check/refresh token', async () => {
        const res = await manager.testAuth();
        res.should.equal(true);
    });

    it('should reinstantiate with an entity ID', async () => {
        const newManager = await ManagerClass.getInstance({
            userId: this.userManager.getUserId(),
            entityId: manager.entity._id,
        });
        newManager.api.access_token.should.equal(manager.api.access_token);
        newManager.api.refresh_token.should.equal(manager.api.refresh_token);
        newManager.entity._id
            .toString()
            .should.equal(manager.entity._id.toString());
        newManager.credential._id
            .toString()
            .should.equal(manager.credential._id.toString());
    });

    it('should list contact properties', async () => {
        const properties = await manager.api.getProperties('contact');
        return properties;
    });

    it('should list company properties', async () => {
        const properties = await manager.api.getProperties('company');
        return properties;
    });

    it('should list deal properties', async () => {
        const properties = await manager.api.getProperties('deal');
        return properties;
    });

    it('should refresh and update invalid token', async () => {
        manager.api.access_token = 'nolongervalid';
        const response = await manager.testAuth();

        manager.credential.accessToken.should.equal(manager.api.access_token);
        manager.credential.accessToken.should.not.equal('nolongervalid');

        return response;
    });

    it('should fail to refresh token and mark auth as invalid', async () => {
        manager.api.access_token = 'nolongervalid';
        manager.api.refresh_token = 'nolongervalideither';
        const response = await manager.testAuth();

        response.should.equal(false);
        const credential = await manager.credentialMO.get(
            manager.credential._id
        );
        credential.auth_is_valid.should.equal(false);
    });
});
