require('../../utils/TestUtils');
const chai = require('chai');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);
const _ = require('lodash');
// const app = require('../../../app.js');
// const auth = require('../../../src/routers/auth');

// app.use(auth);

const Authenticator = require('../../utils/Authenticator');
const UserManager = require('../../../src/managers/UserManager');
const MondayManager = require('../../../src/managers/entities/MondayManager.js');

const loginCredentials = { username: 'test', password: 'test' };

describe.skip('Monday Manager', async () => {
    let mondayManager;
    before(async () => {
        try {
            this.userManager = await UserManager.loginUser(loginCredentials);
        } catch (e) {
            // User may not exist
            this.userManager = await UserManager.createUser(loginCredentials);
        }
        // TODO verify instance with API class associated
        mondayManager = await MondayManager.getInstance({
            userId: this.userManager.getUserId(),
        });
    });

    describe('Authentication Requests', async () => {
        let authorizeUrl;
        it('Should return Auth Requirements', async () => {
            const res = await mondayManager.getAuthorizationRequirements();

            chai.assert.hasAnyKeys(res, ['url', 'type']);
            authorizeUrl = res.url;
        });
        it('Should go through OAuth Flow and processAuthorizationCallback', async () => {
            const response = await Authenticator.oauth2(authorizeUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;

            const ids = await mondayManager.processAuthorizationCallback({
                userId: this.userManager.getUserId(),
                data: response.data,
            });

            // TODO Should not be empty (any key)
            chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
        });
    });
});
