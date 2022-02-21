const chai = require('chai');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);

const fetch = require('node-fetch');
const TestUtils = require('../utils/TestUtils');

const UserManager = require('../../src/managers/UserManager');

const User = require('../../src/models/User');

const loginCredentials = { username: 'admin', password: 'password1' };

describe.skip('UserManager', async function () {
    beforeEach(async () => {
        this.manager = await UserManager.createUser(loginCredentials);
    });
    afterEach(async () => {
        await this.manager.userMO.model.deleteMany();
    });
    it('should create a login token', async () => {
        const token = await this.manager.createUserToken();
        await new UserManager({ token });
    });

    it('should login a user', async () => {
        const testManager = await UserManager.loginUser(loginCredentials);
        expect(testManager.user).to.not.equal(null);
    });

    it('should not login a user with invalid password', async () => {
        await expect(
            UserManager.loginUser({
                username: loginCredentials.username,
                password: 'password2',
            })
        ).to.be.rejected;
    });

    it('should not login a user with invalid username', async () => {
        await expect(
            UserManager.loginUser({
                username: 'admin1',
                password: loginCredentials.password,
            })
        ).to.be.rejected;
    });
});
