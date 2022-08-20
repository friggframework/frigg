// require('../../../../test/utils/TestUtils');
// const chai = require('chai');
//
// const { expect } = chai;
// const should = chai.should();
// const chaiAsPromised = require('chai-as-promised');
// chai.use(require('chai-url'));
//
// chai.use(chaiAsPromised);
// const _ = require('lodash');
//
// const Authenticator = require('../../../../test/utils/Authenticator');
// const UserManager = require('../../../managers/UserManager');
const Manager = require('./manager.js');
// const TestUtils = require('../../../../test/utils/TestUtils');
//
// const testType = 'local-dev';

describe.skip('Attentive Entity Manager', () => {
    let manager;
    beforeAll(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();
        manager = await Manager.getInstance({
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
        chai.assert.hasAnyKeys(ids, ['credential', 'entity', 'type']);

        manager = await Manager.getInstance({
            entityId: ids.entity_id,
            userId: this.userManager.getUserId(),
        });
        return 'done';
    });

    it('should go through Oauth flow', async () => {
        manager.should.have.property('userId');
        manager.should.have.property('entity');
    });

    it('should reinstantiate with an entity ID', async () => {
        let newManager = await Manager.getInstance({
            userId: this.userManager.getUserId(),
            subType: testType,
            entityId: manager.entity._id,
        });
        newManager.api.access_token.should.equal(manager.api.access_token);
        newManager.entity._id
            .toString()
            .should.equal(manager.entity._id.toString());
        newManager.credential._id
            .toString()
            .should.equal(manager.credential._id.toString());
    });

    it('should reinstantiate with a credential ID', async () => {
        let newManager = await Manager.getInstance({
            userId: this.userManager.getUserId(),
            subType: testType,
            credentialId: manager.credential._id,
        });
        newManager.api.access_token.should.equal(manager.api.access_token);
        newManager.credential._id
            .toString()
            .should.equal(manager.credential._id.toString());
    });
});
