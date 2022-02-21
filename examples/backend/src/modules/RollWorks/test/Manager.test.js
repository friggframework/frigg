require('../../../../test/utils/TestUtils');
const UserManager = require('../../../managers/UserManager');
const chai = require('chai');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);

const Authenticator = require('../../../../test/utils/Authenticator');
const TestUtils = require('../../../../test/utils/TestUtils');
const RollWorksManager = require('../../../managers/entities/RollWorksManager.js');

describe.skip('RollWorks Manager', async () => {
    let rollworksManager;
    let authorizeUrl;
    before(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();
        rollworksManager = await RollWorksManager.getInstance({
            userId: this.userManager.getUserId(),
        });

        const res = await rollworksManager.getAuthorizationRequirements();

        chai.assert.hasAnyKeys(res, ['url', 'type']);
        authorizeUrl = res.url;

        const response = await Authenticator.oauth2(authorizeUrl);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const ids = await rollworksManager.processAuthorizationCallback({
            userId: this.userManager.getUserId(),
            data: response.data,
        });

        // TODO Should not be empty (any key)
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
    });

    it('Should get Auth Requirements and go through OAuth Flow and processAuthorizationCallback', async () => {
        // Hope the before works!
    });

    it('Should retreive the right entity if exists', async () => {
        const credentials = await rollworksManager.credentialMO.list({
            user: this.userManager.getUserId(),
        });

        const orgUuid = 'TESTORGID';
        const newUserManager = await new UserManager();
        let orgUser = await newUserManager.userMO.getUserByCrossbeamOrgId(
            orgUuid
        );
        if (!orgUser) {
            orgUser = await newUserManager.organizationUserMO.create({
                crossbeamOrgId: orgUuid,
            });
        }
        newUserManager.user = orgUser;

        const createObj = {
            credential: credentials[0].id,
            user: newUserManager.getUserId(),
            name: 'accountName',
            externalId: 'accountId',
        };
        const wrongEntity = await rollworksManager.entityMO.create(createObj);

        const entity = await rollworksManager.findOrCreateEntity({
            credentialId: credentials[0]._id,
            accountName: 'wrong',
            accountId: 'accountId',
        });
        expect(wrongEntity.id).to.not.eql(entity.id);
    });

    it('should reinstantiate with an entity ID', async () => {
        const newManager = await RollWorksManager.getInstance({
            userId: this.userManager.getUserId(),
            entityId: rollworksManager.entity._id,
        });
        newManager.api.access_token.should.equal(
            rollworksManager.api.access_token
        );
        // newManager.api.refresh_token.should.equal(rollworksManager.api.refresh_token);
        // newManager.api.organization_id.should.equal(rollworksManager.api.organization_id);
        newManager.entity._id
            .toString()
            .should.equal(rollworksManager.entity._id.toString());
        newManager.credential._id
            .toString()
            .should.equal(rollworksManager.credential._id.toString());
    });

    it('should reinstantiate with a credential ID', async () => {
        const newManager = await RollWorksManager.getInstance({
            userId: this.userManager.getUserId(),
            credentialId: rollworksManager.credential._id,
        });
        newManager.api.access_token.should.equal(
            rollworksManager.api.access_token
        );
        // newManager.api.refresh_token.should.equal(rollworksManager.api.refresh_token);
        newManager.credential._id
            .toString()
            .should.equal(rollworksManager.credential._id.toString());
    });

    it('should refresh and update invalid token', async () => {
        rollworksManager.api.access_token = 'nolongervalid';
        await rollworksManager.testAuth();

        const credential = await rollworksManager.credentialMO.get(
            rollworksManager.entity.credential
        );
        credential.access_token.should.equal(rollworksManager.api.access_token);
    });

    it('should fail to refresh token and mark auth as invalid', async () => {
        try {
            rollworksManager.api.access_token = 'nolongervalid';
            rollworksManager.api.refresh_token = 'nolongervalideither';
            await rollworksManager.testAuth();
            throw new Error('goblinoids');
        } catch (e) {
            e.message.should.equal(
                'RollWorksAPI -- Error: Error Refreshing Credentials'
            );
            const credential = await rollworksManager.credentialMO.get(
                rollworksManager.entity.credential
            );
            credential.auth_is_valid.should.equal(false);
        }
    });
});
