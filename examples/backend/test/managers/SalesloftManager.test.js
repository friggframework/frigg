const TestUtils = require('../utils/TestUtils');
const chai = require('chai');

const { expect } = chai;
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);
const _ = require('lodash');

// const app = require('../../app');.
// const auth = require('../../src/routers/auth');
// const user = require('../../src/routers/user');

// app.use(auth);
// app.use(user);

const Authenticator = require('../utils/Authenticator');
const UserManager = require('../../src/managers/UserManager');
const SalesloftManager = require('../../src/modules/Salesloft/Manager');

const loginCredentials = { username: 'test', password: 'test' };

describe.skip('Salesloft Manager', async () => {
    let slManager;
    before(async () => {
        try {
            this.userManager = await UserManager.loginUser(loginCredentials);
        } catch (e) {
            this.userManager = await UserManager.createUser(loginCredentials);
        }

        slManager = await SalesloftManager.getInstance({
            userId: this.userManager.getUserId(),
        });
        const res = await slManager.getAuthorizationRequirements();

        chai.assert.hasAnyKeys(res, ['url', 'type']);
        const { url } = res;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const ids = await slManager.processAuthorizationCallback({
            userId: 0,
            data: response.data,
        });
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);

        slManager = await SalesloftManager.getInstance({
            entityId: ids.entity_id,
            userId: this.userManager.getUserId(),
        });
    });

    it('should go through Oauth flow', async () => {
        slManager.should.have.property('userId');
        slManager.should.have.property('entity');
    });

    it('should refresh and update invalid token', async () => {
        const pretoken = slManager.api.access_token;
        slManager.api.access_token = 'nolongervalid';
        await slManager.testAuth();

        const posttoken = slManager.api.access_token;
        pretoken.should.not.equal(posttoken);
        const credential = await slManager.credentialMO.get(
            slManager.entity.credential
        );
        credential.access_token.should.equal(posttoken);
    });

    it('should fail to refresh token and mark auth as invalid', async () => {
        try {
            slManager.api.access_token = 'nolongervalid';
            slManager.api.refresh_token = 'nolongervalid';
            await slManager.testAuth();
            throw new Error('Expected an error');
        } catch (e) {
            e.message.should.equal(
                'SalesloftAPI --Error: Error Refreshing Credentials'
            );
            const credential = await slManager.credentialMO.get(
                slManager.entity.credential
            );
            credential.auth_is_valid.should.equal(false);
        }
    });
});
