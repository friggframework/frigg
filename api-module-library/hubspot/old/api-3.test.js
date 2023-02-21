/**
 * @group interactive
 */

const _ = require('lodash');
// const Authenticator = require('../utils/Authenticator');
// const UserManager = require('../../src/managers/UserManager');
const { Manager } = require('./manager');

// const app = require('../../app');
// const auth = require('../../src/routers/auth');
// const user = require('../../src/routers/user');

// app.use(auth);
// app.use(user);

const loginCredentials = { username: 'test', password: 'test' };

describe('Hubspot API ', () => {
    // this.timeout(20000);
    let hsManager;
    beforeAll(async () => {
        // await (new User()).model.deleteMany();
        // this.userManager = await UserManager.createUser(loginCredentials);
        try {
            this.userManager = await UserManager.loginUser(loginCredentials);
        } catch (e) {
            //User may not exist
            this.userManager = await UserManager.createUser(loginCredentials);
        }
        const loginRes = await chai
            .request(app)
            .post('/user/login')
            .set('Content-Type', 'application/json')
            .send(loginCredentials);
        this.token = loginRes.body.token;

        let res = await chai
            .request(app)
            .get('/api/authorize')
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${this.token}`)
            .query({ entityType: 'hubspot', connectingEntityType: 'hubspot' });
        expect(res.status).toBe(200);
        chai.assert.hasAnyKeys(res.body, ['url', 'type']);
        const { url } = res.body;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        res = await chai
            .request(app)
            .post('/api/authorize')
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${this.token}`)
            .send(response);

        chai.assert.hasAnyKeys(res.body, ['id', 'type']);

        let user_id = this.userManager.getUserId();
        hsManager = await ModuleManager.getInstance({
            entity: res.body.id,
            userId: user_id,
        });

        // api = new HubspotApi({
        //   key : process.env.HUBSPOT_CLIENT_ID,
        //   secret : process.env.HUBSPOT_CLIENT_SECRET,
        //   redirectUri : process.env.HUBSPOT_OAUTH_REDIRECT_URI,
        //   authorizationUri : `https://app.hubspot.com/oauth/authorize?client_id=${process.env.HUBSPOT_CLIENT_ID}&` +
        //   `redirect_uri=${process.env.REDIRECT_URI}&scope=contacts%20oauth&state=app:HUBSPOT`,
        //   baseURL : process.env.H0UBSPOT_BASE_URL,
        //   access_token: this.access_token
        // });
    });

    // xdescribe('getAuthUri', function() {
    //   it('should return the url for authorization', async () => {
    //     let response = await hsManager.api.getAuthUri();
    //     expect(response).to.contain.path('/oauth/authorize');
    //   });
    // });

    // xdescribe('getTokenFromCode', function() {
    //   it('should return', async () => {
    //     let response = await hsManager.api.getTokenFromCode('5ea03340-d7b1-4ab2-9328-311f7ffc3844');
    //     expect(response).to.have.property('refresh_token');
    //     expect(response).to.have.property('access_token');
    //     expect(response).to.have.property('expires_in');
    //   });
    // });

    // xdescribe('refreshToken', function() {
    //   it('should return', async () => {
    //     let response = await hsManager.api.refreshAccessToken({ refresh_token: 'a2dde12c-2c3b-4f91-92e0-ceaff5fa38d1'});
    //     expect(response).to.have.property('refresh_token');
    //     expect(response).to.have.property('access_token');
    //     expect(response).to.have.property('expires_in');
    //   });
    // });

    describe('HS User Info', () => {
        it('should return the user details', async () => {
            let response = await hsManager.api.getUserDetails();
            expect(response).toHaveProperty('portalId');
            expect(response).toHaveProperty('token');
            expect(response).toHaveProperty('app_id');
        });
    });

    describe('HS Deals', () => {
        it('should return a deal by id', async () => {
            let deal_id = '2022088696';
            let response = await hsManager.api.getDealById(deal_id);
            expect(response.id).toBe(deal_id);
            // expect(response.properties.amount).to.eq('100000');
            // expect(response.properties.dealname).to.eq('Test');
            // expect(response.properties.dealstage).to.eq('appointmentscheduled');
        });

        it('should return all deals of a company', async () => {
            let response = await hsManager.api.listDeals();
            expect(response.results[0]).toHaveProperty('id');
            expect(response.results[0]).toHaveProperty('properties');
            expect(response.results[0].properties).toHaveProperty('amount');
            expect(response.results[0].properties).toHaveProperty('dealname');
            expect(response.results[0].properties).toHaveProperty('dealstage');
        });
    });

    describe('HS Companies', () => {
        let createRes;
        beforeAll(async () => {
            let body = {
                domain: 'gitlab.com',
                name: 'Gitlab',
            };
            createRes = await hsManager.api.createCompany(body);
        });

        afterAll(async () => {
            await hsManager.api.deleteCompany(createRes.id);
        });

        it('should create a Company', async () => {
            expect(createRes.properties.domain).toBe('gitlab.com');
            expect(createRes.properties.name).toBe('Gitlab');
        });

        it('should return the company info', async () => {
            let company_id = createRes.id;
            let response = await hsManager.api.getCompanyById(company_id);
            expect(response.id).toBe(company_id);
            // expect(response.properties.domain).to.eq('golabstech.com');
            // expect(response.properties.name).to.eq('Golabs');
        });

        it('should list Companies', async () => {
            let response = await hsManager.api.listCompanies();
            expect(response.results[0]).toHaveProperty('id');
            expect(response.results[0]).toHaveProperty('properties');
            expect(response.results[0].properties).toHaveProperty('domain');
            expect(response.results[0].properties).toHaveProperty('name');
            expect(response.results[0].properties).toHaveProperty(
                'hs_object_id'
            );
        });

        it('should update Company', async () => {
            let body = {
                name: 'Facebook 1',
            };
            let response = await hsManager.api.updateCompany(
                createRes.id,
                body
            );
            expect(response.properties.name).toBe('Facebook 1');
        });

        it('should delete a company', async () => {
            // Hope the after works!
        });
    });

    describe('HS Companies BATCH', () => {
        let createResponse;
        beforeAll(async () => {
            let body = [
                {
                    properties: {
                        domain: 'gitlab.com',
                        name: 'Gitlab',
                    },
                },
                {
                    properties: {
                        domain: 'facebook.com',
                        name: 'Facebook',
                    },
                },
            ];
            createResponse = await hsManager.api.createABatchCompanies(body);
        });

        afterAll(async () => {
            createResponse.results.forEach(async (company) => {
                await hsManager.api.deleteCompany(company.id);
            });
        });

        it('should create a Batch of Companies', async () => {
            let results = _.sortBy(createResponse.results, [
                function (o) {
                    return o.properties.name;
                },
            ]);
            expect(createResponse.status).toBe('COMPLETE');
            expect(results[0].properties.name).toBe('Facebook');
            expect(results[0].properties.domain).toBe('facebook.com');
            expect(results[1].properties.name).toBe('Gitlab');
            expect(results[1].properties.domain).toBe('gitlab.com');
        });

        it('should update a Batch of Companies', async () => {
            let body = [
                {
                    properties: {
                        name: 'Facebook 2',
                    },
                    id: createResponse.results[0].id,
                },
                {
                    properties: {
                        name: 'Gitlab 2',
                    },
                    id: createResponse.results[1].id,
                },
            ];
            let response = await hsManager.api.updateBatchCompany(body);

            let results = _.sortBy(response.results, [
                function (o) {
                    return o.properties.name;
                },
            ]);
            expect(response.status).toBe('COMPLETE');
            expect(results[0].properties.name).toBe('Facebook 2');
            expect(results[1].properties.name).toBe('Gitlab 2');
        });
    });

    describe('HS Contacts', () => {
        let createResponse;
        beforeAll(async () => {
            let body = {
                email: 'jose.miguel@hubspot.com',
                firstname: 'Miguel',
                lastname: 'Delgado',
            };
            createResponse = await hsManager.api.createContact(body);
        });

        afterAll(async () => {
            let response = await hsManager.api.deleteContact(createResponse.id);
            expect(response.status).toBe(204);
        });

        it('should create a Contact', async () => {
            expect(createResponse).toHaveProperty('id');
            expect(createResponse.properties.firstname).toBe('Miguel');
            expect(createResponse.properties.lastname).toBe('Delgado');
        });

        it('should list Contacts', async () => {
            let response = await hsManager.api.listContacts();
            expect(response.results[0]).toHaveProperty('id');
            expect(response.results[0]).toHaveProperty('properties');
            expect(response.results[0].properties).toHaveProperty('firstname');
        });

        it('should update a Contact', async () => {
            let body = {
                lastname: 'Johnson (Sample Contact) 1',
            };
            let response = await hsManager.api.updateContact(
                body,
                createResponse.id
            );
            expect(response.properties.lastname).toBe(
                'Johnson (Sample Contact) 1'
            );
        });

        it('should delete a contact', async () => {
            // hope the after works!
        });
    });

    describe('HS Contacts BATCH', () => {
        let createResponse;
        beforeAll(async () => {
            let body = [
                {
                    properties: {
                        email: 'jose.miguel3@hubspot.com',
                        firstname: 'Miguel',
                        lastname: 'Delgado',
                    },
                },
                {
                    properties: {
                        email: 'jose.miguel2@hubspot.com',
                        firstname: 'Miguel',
                        lastname: 'Delgado',
                    },
                },
            ];
            createResponse = await hsManager.api.createbatchContacts(body);
        });

        afterAll(async () => {
            createResponse.results.forEach(async (contact) => {
                await hsManager.api.deleteContact(contact.id);
            });
        });

        it('should create a batch of Contacts', async () => {
            let results = _.sortBy(createResponse.results, [
                function (o) {
                    return o.properties.email;
                },
            ]);
            expect(createResponse.status).toBe('COMPLETE');
            expect(results[0].properties.email).toBe(
                'jose.miguel2@hubspot.com'
            );
            expect(results[0].properties.firstname).toBe('Miguel');
        });

        it('should update a batch of Contacts', async () => {
            let body = [
                {
                    properties: {
                        firstname: 'Miguel 3',
                    },
                    id: createResponse.results[0].id,
                },
                {
                    properties: {
                        firstname: 'Miguel 2',
                    },
                    id: createResponse.results[1].id,
                },
            ];

            let response = await hsManager.api.updateBatchContact(body);
            let results = _.sortBy(response.results, [
                function (o) {
                    return o.properties.firstname;
                },
            ]);
            expect(response.status).toBe('COMPLETE');
            expect(results[0].properties.firstname).toBe('Miguel 2');
            expect(results[1].properties.firstname).toBe('Miguel 3');
        });
    });
});
