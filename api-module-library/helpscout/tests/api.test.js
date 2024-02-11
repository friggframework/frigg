require('dotenv').config();
const { Api } = require('../api');
// const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('HelpScout API Tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        client_id: process.env.HELPSCOUT_CLIENT_ID,
        client_secret: process.env.HELPSCOUT_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/helpscout`,
        scope: process.env.HELPSCOUT_SCOPE,
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);

    beforeAll(async () => {
        // Note: Bring back the authorization_code flow to test refreshing a token
        // const url = api.getAuthorizationUri();
        // const response = await Authenticator.oauth2(url);
        // await api.getTokenFromCode(response.data.code);

        await api.getTokenFromClientCredentials();
    });
    
    describe('OAuth Flow Tests', () => {
        it('Should generate a token', async () => {
            expect(api.access_token).toBeTruthy();
        });

        it.skip('Should refresh a token', async () => {
            const oldToken = api.access_token;
            await api.refreshAuth();
            expect(api.access_token).toBeTruthy();
            expect(oldToken).not.toBe(api.access_token);
         });
    });

    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUserDetails();
            expect(user).toBeDefined();
        });

        it('Should retrieve information about the token', async () => {
            const tokenDetails = await api.getTokenIdentity();
            expect(tokenDetails.identifier).toBeDefined();
        });
    });

    describe('Customers', () => {
        let createRes;
        beforeAll(async () => {
            const body = {
                firstName : "Any",
                lastName : "Person",
                photoUrl : "https://api.helpscout.net/img/some-avatar.jpg",
                photoType : "twitter",
                jobTitle : "CEO and Co-Founder",
                location : "Greater Dallas/FT Worth Area",
                background : "I've worked with Vernon before and he's really great.",
                age : "30-35",
                gender : "Male",
                organization : "Acme, Inc",
                emails : [ {
                  "type" : "work",
                  "value" : "example1@acme.com"
                } ]
              }
            createRes = await api.createCustomer(body);
        });

        afterAll(async () => {
            const id = createRes.headers.get('location').split('/').pop();
            await api.deleteCustomer(id);
        });

        it('Should get all customers', async () => {
            const customers = await api.listCustomers();
            expect(customers).toBeDefined();
        });

        it('Should create a customer', async () => {
            expect(createRes.status).toBe(201);
            expect(createRes.headers.get('location')).toBeTruthy();
        });

        it("Should fail to create a customer with invalid data", async () => {
            const body = {}
            try {
                await api.createCustomer(body);
            } catch (error) {
                expect(error.response.status).toBe(400);
            }
        });
    });

    describe('Conversations', () => {
        it('Should get all conversations', async () => {
            const conversations = await api.listConversations();
            expect(conversations).toBeDefined();
        });
    });

    describe('Mailboxes', () => {
        it('Should get all mailboxes', async () => {
            const mailboxes = await api.listMailboxes();
            expect(mailboxes).toBeDefined();
        });
    });
}, 20000);
