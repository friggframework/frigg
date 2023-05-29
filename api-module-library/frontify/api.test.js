const Authenticator = require('@friggframework/test-environment/Authenticator');
const nock = require('nock');
const { Api } = require('./api');
const config = require('./defaultConfig.json');

describe(`${config.label} API Tests`, () => {
    const baseUrl = 'https://domain-mine/graphql';

    describe('#constructor', () => {
        describe('Create new API with params', () => {
            let api;

            beforeEach(() => {
                const params = {
                    domain: 'domain',
                };

                api = new Api(params);
            });

            it('should have all properties filled', () => {
                expect(api.domain).toEqual('domain');
                expect(api.baseUrl).toEqual('https://domain/graphql');
                expect(api.tokenUri).toEqual('https://domain/api/oauth/accesstoken');
            });
        });

        describe('Create new API without params', () => {
            let api;

            beforeEach(() => {
                api = new Api();
            });

            it('should have all properties filled', () => {
                expect(api.domain).toBeNull();
                expect(api.baseUrl).not.toBeDefined();
                expect(api.tokenUri).not.toBeDefined();
            });
        });

        describe('Create new API with access token', () => {
            let api;

            beforeEach(() => {
                api = new Api({ access_token: 'access_token' });
            });

            it('should pass params to parent', () => {
                expect(api.access_token).toEqual('access_token');
            });
        });
    });

    describe('#setDomain', () => {
        describe('Set domain', () => {
            let api;

            beforeEach(() => {
                api = new Api();
            });

            it('should set property', () => {
                api.setDomain('my-domain');
                expect(api.domain).toEqual('my-domain');
            });
        });
    });

    describe('#getAuthUri', () => {
        describe('Get with domain property present', () => {
            let api;

            beforeEach(() => {
                api = new Api({
                  client_id: 'client_id',
                  redirect_uri: 'redirect_uri',
                  scope: 'scope',
                  state: 'state',
                  domain: 'other-domain',
                });
            });

            it('should include domain in URL', () => {
                const link = 'https://other-domain/'
                      + 'api/oauth/authorize?'
                      + 'client_id=client_id&response_type=code&redirect_uri=redirect_uri&scope=scope&state=state';
                expect(api.getAuthUri()).toEqual(link);
            });
        });

        describe('Get without domain property present', () => {
            let api;

            beforeEach(() => {
                api = new Api({
                  client_id: 'client_id',
                  redirect_uri: 'redirect_uri',
                  scope: 'scope',
                  state: 'state'
                });
            });

            it('should include domain in URL', () => {
                const link = 'https://{{domain}}/'
                      + 'api/oauth/authorize?'
                      + 'client_id=client_id&response_type=code&redirect_uri=redirect_uri&scope=scope&state=state';
                expect(api.getAuthUri()).toEqual(link);
            });
        });
    });

    describe('HTTP Requests', () => {
        let api;

        beforeAll(() => {
            api = new Api({
                domain: 'domain-mine'
            });
        });

        afterEach(() => {
            nock.cleanAll();
        });

        describe('#getUser', () => {
            describe('Retrieve information about the user', () => {
                let scope;

                beforeEach(() => {
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

                it('should hit the correct endpoint', async () => {
                    const user = await api.getUser();
                    expect(user).toEqual({ user: 'currentUser' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });
    });
});
