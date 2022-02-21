// let test = require('../../../src/modules/Crossbeam/test/Manager.test.js');

require('../../utils/TestUtils');
const chai = require('chai');

const { expect } = chai;
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);
const _ = require('lodash');

const UserManager = require('../../../src/managers/UserManager');
const CrossbeamManager = require('../../../src/managers/entities/CrossbeamManager.js');
const TestUtils = require('../../utils/TestUtils');

const testSecretAndId = {
    client_id: process.env.CROSSBEAM_TEST_CLIENT_ID,
    client_secret: process.env.CROSSBEAM_TEST_CLIENT_SECRET,
};

const testType = 'local-dev';

describe.skip('Crossbeam Entity Manager', async () => {
    let xbeamManager;
    before(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();

        xbeamManager = await CrossbeamManager.getInstance({
            userId: this.userManager.getUserId(),
            subType: testType,
        });
        expect(xbeamManager).to.exist;

        const data = {
            credentialType: 'local-dev',
            ...testSecretAndId,
        };
        const ids = await xbeamManager.processAuthorizationCallback({
            userId: this.userManager.id,
            data,
        });
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
    });

    it('should go through Oauth flow', async () => {
        xbeamManager.should.have.property('userId');
        xbeamManager.should.have.property('entity');
    });

    it('should reinstantiate with an entity ID', async () => {
        let newManager = await CrossbeamManager.getInstance({
            userId: this.userManager.getUserId(),
            subType: testType,
            entityId: xbeamManager.entity._id,
        });
        newManager.api.access_token.should.equal(xbeamManager.api.access_token);
        // newManager.api.refresh_token.should.equal(xbeamManager.api.refresh_token);
        // newManager.api.organization_id.should.equal(xbeamManager.api.organization_id);
        newManager.entity._id
            .toString()
            .should.equal(xbeamManager.entity._id.toString());
        newManager.credential._id
            .toString()
            .should.equal(xbeamManager.credential._id.toString());
    });

    it('should reinstantiate with a credential ID', async () => {
        let newManager = await CrossbeamManager.getInstance({
            userId: this.userManager.getUserId(),
            subType: testType,
            credentialId: xbeamManager.credential._id,
        });
        newManager.api.access_token.should.equal(xbeamManager.api.access_token);
        // newManager.api.refresh_token.should.equal(xbeamManager.api.refresh_token);
        newManager.credential._id
            .toString()
            .should.equal(xbeamManager.credential._id.toString());
    });

    it('should refresh and update invalid token', async () => {
        xbeamManager.api.access_token = 'nolongervalid';
        const response = await xbeamManager.api.getUserDetails();
        response.should.have.key('items');
        response.items.should.be.an('array');
        const credential = await xbeamManager.credentialMO.get(
            xbeamManager.entity.credential
        );
        credential.access_token.should.equal(xbeamManager.api.access_token);
    });

    // Uses client credentials, so there is no refresh token needed
    // it('should fail to refresh token and mark auth as invalid', async () => {
    //     try {
    //         xbeamManager.api.access_token = 'nolongervalid';
    //         xbeamManager.api.refresh_token = 'nolongervalideither';
    //         const response = await xbeamManager.api.getUserDetails();
    //         throw new Error("Why is this not hitting an auth error?");
    //     } catch (e) {
    //         e.message.should.equal('CrossbeamAPI -- Error: Authentication is no longer valid');
    //         const credential = await xbeamManager.credentialMO.get(xbeamManager.entity.credential);
    //         credential.auth_is_valid.should.equal(false);
    //     }
    // });
});
