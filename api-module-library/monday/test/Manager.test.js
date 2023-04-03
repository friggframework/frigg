/**
 * @group interactive
 */

const chai = require('chai');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);

const Authenticator = require('@friggframework/test-environment/Authenticator');
const MondayManager = require('../manager')
const mongoose = require("mongoose");

describe.skip('Monday Manager', () => {
    let mondayManager;
    let authorizeUrl;
    let userId;
    beforeAll(async () => {
        userId = new mongoose.Types.ObjectId(); 
        // TODO verify instance with API class associated
        mondayManager = await MondayManager.getInstance({
            userId,
        });

        const res = await mondayManager.getAuthorizationRequirements();

        chai.assert.hasAnyKeys(res, ['url', 'type']);
        authorizeUrl = res.url;

        const response = await Authenticator.oauth2(authorizeUrl);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const ids = await mondayManager.processAuthorizationCallback({
            userId,
            data: response.data,
        });

        // TODO Should not be empty (any key)
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
    });

    it('Should get Auth Requirements, go through OAuth Flow, and processAuthorizationCallback', async () => {
        // Hope the before works!
    });

    it('should reinstantiate with an entity ID', async () => {
        const newManager = await MondayManager.getInstance({
            userId,
            entityId: mondayManager.entity._id,
        });
        newManager.api.access_token.should.equal(
            mondayManager.api.access_token
        );
        // newManager.api.refresh_token.should.equal(mondayManager.api.refresh_token);
        // newManager.api.organization_id.should.equal(mondayManager.api.organization_id);
        newManager.entity._id
            .toString()
            .should.equal(mondayManager.entity._id.toString());
        newManager.credential._id
            .toString()
            .should.equal(mondayManager.credential._id.toString());
    });

    it('should reinstantiate with a credential ID', async () => {
        const newManager = await MondayManager.getInstance({
            userId,
            credentialId: mondayManager.credential._id,
        });
        newManager.api.access_token.should.equal(
            mondayManager.api.access_token
        );
        // newManager.api.refresh_token.should.equal(mondayManager.api.refresh_token);
        newManager.credential._id
            .toString()
            .should.equal(mondayManager.credential._id.toString());
    });
});
