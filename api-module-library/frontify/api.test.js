const Authenticator = require('@friggframework/test-environment/Authenticator');
const { Api } = require('./api');
const config = require('./defaultConfig.json');

describe(`${config.label} API Tests`, () => {

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
});
