const { Api } = require('../api');
const config = require('../defaultConfig.json');

describe(`Should fully test the ${config.label} API Class`, () => {
    let api;
    beforeAll(async () => {
        api = new Api({
            access_token: process.env.SLACK_TEST_TOKEN,
        });
    });

    afterAll(async () => {});

    it('should return auth requirements', async () => {
        const authUri = await api.getAuthUri();
        expect(authUri).exists;
        console.log(authUri);
    });

    it('should test auth using access token', async () => {
        const clientId = api.client_id;
        const clientSecret = api.client_secret;
        const redirectUri = api.redirect_uri;

        expect(clientId).exists;
        expect(clientSecret).exists;
        expect(redirectUri).exists;
        expect(access_token).exists;

        const response = api.authTest();
        expect(response.ok).toBe(true);
        expect(response.url).exists;
        expect(response.team_id).exists;
        expect(response.user_id).exists;

        console.log(response);
    });
});
