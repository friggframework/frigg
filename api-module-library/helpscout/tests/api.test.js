require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('HelpScout API Tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        client_id: process.env.HELPSCOUT_CLIENT_ID,
        client_secret: process.env.HELPSCOUT_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/helpscout`,
        scope: process.env.HELPSCOUT_SCOPE,
        // access_token: process.env.HELPSCOUT_ACCESS_TOKEN
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);

    //Disabling auth flow for speed (access tokens expire after ten years)
    beforeAll(async () => {
        const url = api.getAuthorizationUri();
        const response = await Authenticator.oauth2(url, 3000, 'google chrome');
        await api.getTokenFromCode(response.data.code);
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate a token', async () => {
            expect(api.access_token).toBeTruthy();
        });
    });
    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUserDetails();
            expect(user).toBeDefined();
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
                  "value" : "bear118@acme.com"
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
});
