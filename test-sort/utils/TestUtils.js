const UserManager = require('../../src/managers/UserManager');
const fetch = require('node-fetch');
const testUser = {
    username: 'Test',
    hashword: 'McTest',
};

class TestUtils {
    static deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    static async generateJwt() {
        const jwtRes = await fetch(
            `${process.env.AUTH0_BASE_URL}/oauth/token`,
            {
                body: JSON.stringify({
                    audience: process.env.AUTH0_AUDIENCE,
                    client_id: process.env.CROSSBEAM_AUTHCHECK_CLIENT_ID,
                    client_secret:
                        process.env.CROSSBEAM_AUTHCHECK_CLIENT_SECRET,
                    grant_type: 'client_credentials',
                }),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
        const jwt = await jwtRes.json();
        return jwt.access_token;
    }

    static async getLoggedInTestUserManagerInstance(differentUser) {
        if (differentUser) {
            testUser.username = differentUser.username;
            testUser.hashword = differentUser.hashword;
        }
        const userManager = await new UserManager();
        let individualUser =
            await userManager.individualUserMO.getUserByUsername(
                testUser.username
            );
        if (!individualUser) {
            individualUser = await userManager.individualUserMO.create(
                testUser
            );
        }
        userManager.individualUser = individualUser;
        return userManager;
    }
}

module.exports = TestUtils;
