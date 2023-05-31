const mongoose = require('mongoose');
const nock = require('nock');
const querystring = require('querystring');
const Manager = require('./manager');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const config = require('./defaultConfig.json');

jest.mock('@friggframework/logs');

describe(`Should fully test the ${config.label} Manager`, () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
    });

    afterEach(async () => {
        await Manager.Credential.deleteMany();
        await Manager.Entity.deleteMany();
        jest.resetAllMocks();
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    describe('#getName', () => {
        it('should return manager name', () => {
            expect(Manager.getName()).toEqual('frontify');
        });
    });

    describe('#getInstance', () => {
        describe('Create new instance', () => {
            let manager;

            beforeEach(async () => {
                manager = await Manager.getInstance({
                    userId: new mongoose.Types.ObjectId(),
                });
            });

            it('can create an instance of Module Manger', async () => {
                expect(manager).toBeDefined();
                expect(manager.api).toBeDefined();
                expect(manager.api.client_id).toEqual('frontify_client_id_test');
                expect(manager.api.client_secret).toEqual('frontify_client_secret_test');
                expect(manager.api.redirect_uri).toEqual('http://redirect_uri_test/frontify');
                expect(manager.api.scope).toEqual('frontify_scope_test');
                expect(manager.api.delegate).toEqual(manager);
            });
        });

        describe('Create new instance with entity Id', () => {
            let manager;

            beforeEach(async () => {
                const userId = new mongoose.Types.ObjectId();

                const creden = await Credential.create({
                    user: userId,
                    accessToken: 'accessToken',
                    refreshToken: 'refreshToken',
                    auth_is_valid: true,
                });

                const enti = await Entity.create({
                    credential: creden.id,
                    user: userId,
                    name: 'name',
                    externalId: 'externalId',
                });

                manager = await Manager.getInstance({
                    entityId: enti.id,
                    userId
                });
            });

            it('can create an instance of Module Manger with credentials', async () => {
                expect(manager).toBeDefined();
                expect(manager.api).toBeDefined();
                expect(manager.api.access_token).toEqual('accessToken');
                expect(manager.api.refresh_token).toEqual('refreshToken');
            });
        });
    });

    describe('#testAuth', () => {
        describe('Perform test request', () => {
            const baseUrl = 'https://mine-domain/graphql';
            let manager, scope;

            beforeEach(async () => {
                manager = await Manager.getInstance({
                    userId: new mongoose.Types.ObjectId(),
                });

                manager.api.setDomain('mine-domain');

                scope = nock(baseUrl)
                    .post('', {
                        query: 'query CurrentUser { currentUser { id email name }}',
                    })
                    .reply(200, {
                        data: {
                            currentUser: 'currentUser'
                        }
                    });
            });

            it('should return true', async () => {
                const res = await manager.testAuth();
                expect(res).toBe(true);
                expect(scope.isDone()).toBe(true);
            });
        });

        describe('Perform test request to wrong URL', () => {
            const baseUrl = 'https://mine-domain/graphql';
            let manager, scope;

            beforeEach(async () => {
                manager = await Manager.getInstance({
                    userId: new mongoose.Types.ObjectId(),
                });

                manager.api.setDomain('mine-domain');

                scope = nock(baseUrl)
                    .post('/any')
                    .reply(200, {
                        sites: 'sites'
                    });
            });

            it('should return false', async () => {
                const res = await manager.testAuth();
                expect(res).toBe(false);
                expect(scope.isDone()).toBe(false);
            });
        });
    });

    describe('#getAuthorizationRequirements', () => {
        let manager;

        beforeEach(async () => {
            manager = await Manager.getInstance({
                userId: new mongoose.Types.ObjectId(),
            });
        });

        it('should return auth requirements', () => {
            const queryParams = querystring.stringify({
                client_id: 'frontify_client_id_test',
                response_type: 'code',
                redirect_uri: 'http://redirect_uri_test/frontify',
                scope: 'frontify_scope_test',
                state: ''
            });

            const requirements = manager.getAuthorizationRequirements();
            expect(requirements).toBeDefined();
            expect(requirements.type).toEqual('oauth2');
            expect(requirements.url).toEqual(`https://{{domain}}/api/oauth/authorize?${queryParams}`);
            expect(requirements.data).toEqual({
                jsonSchema: {
                    title: 'Auth Form',
                    type: 'object',
                    required: ['domain'],
                    properties: {
                        domain: {
                            type: 'string',
                            title: 'Your Frontify Domain',
                        }
                    }
                },
                uiSchema: {
                    domain: {
                        'ui:help':
                        'An Frontify domain, e.g: lefthook.frontify.com',
                        'ui:placeholder': 'Your Frontify domain...',
                    },
                }
            });
        });
    });
});