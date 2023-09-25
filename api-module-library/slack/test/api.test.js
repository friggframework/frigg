const { Api } = require('../api');
const Authenticator = require('@friggframework/test-environment/Authenticator');
const config = require('../defaultConfig.json');
require('dotenv').config();

describe(`Should fully test the ${config.label} API Class`, () => {
    let api;
    beforeAll(async () => {
        api = new Api({ access_token: process.env.TEST_ACCESS_TOKEN });
    });

    afterAll(async () => {});

    describe('Authentication Tests', () => {
        it('should return auth requirements', async () => {
            const authUri = await api.getAuthUri();
            expect(authUri).exists;
        });

        it.skip('should generate an access_token from a code', async () => {
            const authUri = await api.getAuthUri();
            const response = await Authenticator.oauth2(authUri);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;

            const authRes = await api.getTokenFromCode(response.data.code);
            expect(api.access_token).toBeTruthy();
        });

        it('should test auth using access token', async () => {
            const clientId = api.client_id;
            const clientSecret = api.client_secret;
            const redirectUri = api.redirect_uri;

            expect(clientId).exists;
            expect(clientSecret).exists;
            expect(redirectUri).exists;

            const response = await api.authTest();
            expect(response.ok).toBeTruthy();
        });
        it.skip('should refresh auth when token expires', async () => {
            api.access_token = 'broken';
            await api.refreshToken();
            expect(api.access_token).to.not.equal('broken');
        });
    });

    describe('Channel Tests', () => {
        it('should return channels', async () => {
            const channels = await api.listChannels();

            expect(channels.ok).toBeTruthy();
        });
        describe('Direct Message Channel Tests', () => {
            let messageChannel;
            let messageResponse;
            beforeEach(async () => {
                const userEmail = process.env.TEST_USER_EMAIL;
                const userDetails = await api.lookupUserByEmail(userEmail);
                messageResponse = await api.postMessage({
                    channel: userDetails.user.id,
                    text: 'Hello World!',
                });
                expect(messageResponse.ok).toBeTruthy();
                messageChannel = messageResponse.channel;
            });
            afterEach(async () => {
                await api.deleteMessage({
                    channel: messageChannel,
                    ts: messageResponse.ts,
                    asUser: true,
                });
            });
            it('should create a direct message to a user', async () => {
                expect(messageResponse.ok).toBeTruthy();
            });
            it('should return channel history', async () => {
                const history = await api.getChannelHistory({
                    channel: messageChannel,
                    latest: messageResponse.ts,
                    oldest: messageResponse.ts,
                    inclusive: true,
                });
                expect(history.ok).toBeTruthy();
            });
            it('should return channel members', async () => {
                const members = await api.getChannelMembers({
                    channel: messageChannel
                });
                expect(members.ok).toBeTruthy();
            });
        });
    });
});
