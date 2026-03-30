const {ApiModule} = require('../../../domain/entities/ApiModule');
const {DomainException} = require('../../../domain/exceptions/DomainException');

describe('ApiModule Entity', () => {
    describe('create()', () => {
        test('successfully creates a new API module with required fields', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                displayName: 'Salesforce',
                apiConfig: {
                    baseUrl: 'https://api.salesforce.com',
                    authType: 'oauth2',
                    version: 'v1'
                }
            });

            expect(apiModule.name).toBe('salesforce');
            expect(apiModule.displayName).toBe('Salesforce');
            expect(apiModule.apiConfig.baseUrl).toBe('https://api.salesforce.com');
            expect(apiModule.apiConfig.authType).toBe('oauth2');
            expect(apiModule.apiConfig.version).toBe('v1');
            expect(apiModule.version.value).toBe('1.0.0');
            expect(apiModule.entities).toEqual({});
            expect(apiModule.scopes).toEqual([]);
            expect(apiModule.credentials).toEqual([]);
        });

        test('generates displayName from name if not provided', () => {
            const apiModule = ApiModule.create({
                name: 'stripe-payment-api',
                apiConfig: {authType: 'api-key'}
            });

            expect(apiModule.displayName).toBe('Stripe Payment Api');
        });

        test('accepts semantic version', () => {
            const apiModule = ApiModule.create({
                name: 'hubspot',
                version: '2.5.0',
                apiConfig: {authType: 'oauth2'}
            });

            expect(apiModule.version.value).toBe('2.5.0');
        });

        test('throws error when name is missing', () => {
            expect(() => {
                ApiModule.create({
                    apiConfig: {authType: 'oauth2'}
                });
            }).toThrow(DomainException);
        });

        test('throws error when name is invalid', () => {
            expect(() => {
                ApiModule.create({
                    name: 'Invalid Name!',
                    apiConfig: {authType: 'oauth2'}
                });
            }).toThrow();
        });

        test('throws error when authType is missing', () => {
            expect(() => {
                ApiModule.create({
                    name: 'salesforce',
                    apiConfig: {}
                });
            }).toThrow(DomainException);
        });
    });

    describe('addEntity()', () => {
        test('successfully adds an entity', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addEntity('account', {
                label: 'Salesforce Account',
                required: true,
                fields: ['id', 'name', 'email']
            });

            expect(apiModule.hasEntity('account')).toBe(true);
            expect(apiModule.entities.account.label).toBe('Salesforce Account');
            expect(apiModule.entities.account.required).toBe(true);
            expect(apiModule.entities.account.fields).toEqual(['id', 'name', 'email']);
        });

        test('generates label from entity name if not provided', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addEntity('contact', {});

            expect(apiModule.entities.contact.label).toBe('contact');
        });

        test('sets required to true by default', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addEntity('lead', {});

            expect(apiModule.entities.lead.required).toBe(true);
        });

        test('throws error when entity already exists', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addEntity('account', {});

            expect(() => {
                apiModule.addEntity('account', {});
            }).toThrow(DomainException);
            expect(() => {
                apiModule.addEntity('account', {});
            }).toThrow("Entity 'account' already exists");
        });
    });

    describe('addEndpoint()', () => {
        test('successfully adds an endpoint', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addEndpoint('getAccount', {
                method: 'GET',
                path: '/services/data/v1/accounts/:id',
                description: 'Get account by ID'
            });

            expect(apiModule.hasEndpoint('getAccount')).toBe(true);
            expect(apiModule.endpoints.getAccount.method).toBe('GET');
            expect(apiModule.endpoints.getAccount.path).toBe('/services/data/v1/accounts/:id');
        });

        test('throws error when endpoint already exists', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addEndpoint('getAccount', {method: 'GET', path: '/accounts'});

            expect(() => {
                apiModule.addEndpoint('getAccount', {method: 'POST', path: '/accounts'});
            }).toThrow(DomainException);
        });
    });

    describe('addScope()', () => {
        test('successfully adds a scope', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addScope('read:accounts');

            expect(apiModule.scopes).toContain('read:accounts');
        });

        test('prevents duplicate scopes', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addScope('read:accounts');

            expect(() => {
                apiModule.addScope('read:accounts');
            }).toThrow(DomainException);
            expect(() => {
                apiModule.addScope('read:accounts');
            }).toThrow("Scope 'read:accounts' already exists");
        });
    });

    describe('addCredential()', () => {
        test('successfully adds a credential', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addCredential('clientId', {
                type: 'string',
                description: 'OAuth client ID',
                required: true,
                envVar: 'SALESFORCE_CLIENT_ID'
            });

            expect(apiModule.hasCredential('clientId')).toBe(true);
            expect(apiModule.credentials[0].name).toBe('clientId');
            expect(apiModule.credentials[0].type).toBe('string');
            expect(apiModule.credentials[0].required).toBe(true);
        });

        test('sets required to true by default', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addCredential('apiKey', {type: 'string'});

            expect(apiModule.credentials[0].required).toBe(true);
        });

        test('throws error when credential already exists', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });

            apiModule.addCredential('clientId', {type: 'string'});

            expect(() => {
                apiModule.addCredential('clientId', {type: 'string'});
            }).toThrow(DomainException);
        });
    });

    describe('validate()', () => {
        test('validates successfully with required fields', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                displayName: 'Salesforce',
                apiConfig: {
                    authType: 'oauth2',
                    baseUrl: 'https://api.salesforce.com'
                }
            });

            const result = apiModule.validate();

            expect(result.isValid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        test('fails when displayName is empty', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });
            apiModule.displayName = '';

            const result = apiModule.validate();

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Display name is required');
        });

        test('fails when authType is missing', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });
            apiModule.apiConfig.authType = '';

            const result = apiModule.validate();

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Authentication type is required');
        });

        test('fails when authType is invalid', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                apiConfig: {authType: 'oauth2'}
            });
            apiModule.apiConfig.authType = 'invalid-type';

            const result = apiModule.validate();

            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('Invalid auth type');
        });
    });

    describe('toObject()', () => {
        test('converts to plain object with all properties', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                displayName: 'Salesforce',
                description: 'Salesforce CRM API',
                version: '1.2.0',
                apiConfig: {
                    baseUrl: 'https://api.salesforce.com',
                    authType: 'oauth2',
                    version: 'v1'
                }
            });

            apiModule.addEntity('account', {label: 'Account'});
            apiModule.addScope('read:accounts');
            apiModule.addCredential('clientId', {type: 'string'});

            const obj = apiModule.toObject();

            expect(obj.name).toBe('salesforce');
            expect(obj.displayName).toBe('Salesforce');
            expect(obj.description).toBe('Salesforce CRM API');
            expect(obj.version).toBe('1.2.0');
            expect(obj.apiConfig.authType).toBe('oauth2');
            expect(obj.entities).toHaveProperty('account');
            expect(obj.scopes).toContain('read:accounts');
            expect(obj.credentials).toHaveLength(1);
            expect(obj.createdAt).toBeInstanceOf(Date);
            expect(obj.updatedAt).toBeInstanceOf(Date);
        });
    });

    describe('toJSON()', () => {
        test('converts to JSON format for api-module-definition.json', () => {
            const apiModule = ApiModule.create({
                name: 'salesforce',
                displayName: 'Salesforce',
                description: 'Salesforce CRM API',
                version: '1.2.0',
                apiConfig: {
                    baseUrl: 'https://api.salesforce.com',
                    authType: 'oauth2',
                    version: 'v1'
                }
            });

            const json = apiModule.toJSON();

            expect(json.name).toBe('salesforce');
            expect(json.version).toBe('1.2.0');
            expect(json.display.name).toBe('Salesforce');
            expect(json.display.description).toBe('Salesforce CRM API');
            expect(json.api.authType).toBe('oauth2');
        });
    });

    describe('fromObject()', () => {
        test('reconstructs ApiModule from plain object', () => {
            const originalModule = ApiModule.create({
                name: 'salesforce',
                displayName: 'Salesforce',
                version: '1.0.0',
                apiConfig: {authType: 'oauth2'}
            });

            originalModule.addEntity('account', {label: 'Account'});
            originalModule.addScope('read:accounts');

            const obj = originalModule.toObject();
            const reconstructed = ApiModule.fromObject(obj);

            expect(reconstructed.name).toBe('salesforce');
            expect(reconstructed.displayName).toBe('Salesforce');
            expect(reconstructed.hasEntity('account')).toBe(true);
            expect(reconstructed.scopes).toContain('read:accounts');
        });
    });
});
