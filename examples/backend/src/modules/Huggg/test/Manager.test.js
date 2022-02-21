const TestUtils = require('../utils/TestUtils');
const chai = require('chai');

const { expect } = chai;
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);
const _ = require('lodash');

// const app = require('../../app');
// const auth = require('../../src/routers/auth');
// const user = require('../../src/routers/user');

// app.use(auth);
// app.use(user);

const Authenticator = require('../utils/Authenticator');
const UserManager = require('../../src/managers/UserManager');
const HugggManager = require('../Manager');

const loginCredentials = { username: 'test', password: 'test' };

describe.skip('Huggg Manager', async () => {
    let manager;
    before(async () => {
        try {
            this.userManager = await UserManager.loginUser(loginCredentials);
        } catch {
            this.userManager = await UserManager.createUser(loginCredentials);
        }

        manager = await HugggManager.getInstance({
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
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);

        manager = await HugggManager.getInstance({
            entityId: ids.entity_id,
            userId: this.userManager.getUserId(),
        });
    });

    it('should go through Oauth flow', async () => {
        manager.should.have.property('userId');
        manager.should.have.property('entity');
    });

    it('should refresh and update invalid token', async () => {
        const pretoken = manager.api.access_token;
        manager.api.access_token = 'nolongervalid';
        const response = await manager.testAuth();

        const posttoken = manager.api.access_token;
        pretoken.should.not.equal(posttoken);
        const credential = await manager.credentialMO.get(
            manager.entity.credential
        );
        credential.access_token.should.equal(posttoken);

        return response;
    });

    it('should fail to refresh token and mark auth as invalid', async () => {
        try {
            manager.api.access_token = 'nolongervalid';
            manager.api.refresh_token = 'nolongervalid';
            const response = await manager.testAuth();
        } catch (e) {
            e.message.should.equal(
                'HugggAPI --Error: Error Refreshing Credentials'
            );
            const credential = await manager.credentialMO.get(
                manager.entity.credential
            );
            credential.auth_is_valid.should.equal(false);
        }
    });
});
