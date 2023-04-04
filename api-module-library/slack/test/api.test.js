const { Api } = require('../api');
const Authenticator = require('@friggframework/test-environment/Authenticator');
const config = require('../defaultConfig.json');

describe.skip(`Should fully test the ${config.label} API Class`, () => {
    let api;
    beforeAll(async () => {
        const apiParams = {
            client_id: process.env.HUBSPOT_CLIENT_ID,
            client_secret: process.env.HUBSPOT_CLIENT_SECRET,
            scope: process.env.HUBSPOT_SCOPE,
            redirect_uri: `${process.env.REDIRECT_URI}/hubspot`,
        };
        api = new Api(apiParams);
    });

    afterAll(async () => {});

    describe('Authentication Tests', () => {
        it('should return auth requirements', async () => {
            const authUri = await api.getAuthUri();
            expect(authUri).exists;
            console.log(authUri);
        });

        it('should generate an access_token from a code', async () => {
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

            const response = await api.getUserDetails();
            expect(response).toBeTruthy();
        });
        it('should refresh auth when token expires', async () => {
            api.access_token = 'broken';
            await api.refreshToken();
            expect(api.access_token).to.not.equal('broken');
        });
    });

    describe('CRM Tests', () => {
        describe('Company Tests', () => {
            let company;
            it('should create a new company', async () => {
                const createBody = {};
                const response = await api.createCompany(createBody);
                expect(response).toBeTruthy();
                company = response.data;
            });
            it('should get a list of companies', async () => {
                const response = await api.listCompanies();
                expect(response).toBeTruthy();
            });
            it('should get a single company', async () => {
                const response = await api.getCompany(company.id);
                expect(response).toBeTruthy();
            });
            it('should update a company', async () => {
                const updateBody = {};
                const response = await api.updateCompany(
                    company.id,
                    updateBody
                );
                expect(response).toBeTruthy();
                company = response.data;
                expect(company.name).to.equal(updateBody.name);
            });
            it('should delete a company', async () => {
                const response = await api.deleteCompany(company.id);
                expect(response).toBeTruthy();
            });
        });
        describe('Contact Tests', () => {});
        describe('Deal Tests', () => {});
        describe('Ticket Tests', () => {});
        describe('List Tests', () => {});
    });
});
