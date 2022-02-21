require('../../../../test/utils/TestUtils');
const chai = require('chai');

const { expect } = chai;
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);
const _ = require('lodash');

const Authenticator = require('../../../../test/utils/Authenticator');
const UserManager = require('../../../managers/UserManager');
const Manager = require('../Manager.js');
const TestUtils = require('../../../../test/utils/TestUtils');

const testType = 'local-dev';

describe.skip('Front Entity Manager', async () => {
    let manager;
    before(async () => {
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

        // Don't need these. Entity should already be created
        // const options = await manager.getEntityOptions();

        // const entity = await manager.findOrCreateEntity({
        //     credential_id: ids.credential_id,
        //     [options[0].key]: options[0].options[0],
        //     // organization_id: ""
        // });

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
        newManager.api.refresh_token.should.equal(manager.api.refresh_token);
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
        newManager.api.refresh_token.should.equal(manager.api.refresh_token);
        newManager.credential._id
            .toString()
            .should.equal(manager.credential._id.toString());
    });

    it('should list all contacts', async () => {
        const contacts = await manager.listAllContacts();
        contacts.length.should.be.above(50);
    });

    it('should refresh and update invalid token', async () => {
        manager.api.access_token = 'nolongervalid';
        await manager.testAuth();

        const credential = await manager.credentialMO.get(
            manager.entity.credential
        );
        credential.access_token.should.equal(manager.api.access_token);
        credential.access_token.should.not.equal('nolongervalid');
    });

    it('should fail to refresh token and mark auth as invalid', async () => {
        try {
            manager.api.access_token = 'nolongervalid';
            manager.api.refresh_token = 'nolongervalideither';
            await manager.testAuth();
            throw new Error('Why is this not hitting an auth error?');
        } catch (e) {
            e.message.should.equal(
                'FrontAPI -- Error: Error Refreshing Credentials'
            );
            // e.message.should.equal('FrontAPI -- Error: Authentication is no longer valid');
            const credential = await manager.credentialMO.get(
                manager.entity.credential
            );
            credential.auth_is_valid.should.equal(false);
        }
    });
});
