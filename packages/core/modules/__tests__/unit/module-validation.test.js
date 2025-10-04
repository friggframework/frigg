/**
 * @jest-environment node
 */

const { Module } = require('../../module');

// Mock dependencies
jest.mock('../../../credential/repositories/credential-repository-factory');
jest.mock('../../repositories/module-repository-factory');
jest.mock('../../../core', () => ({
    Delegate: class Delegate {
        constructor() {}
    },
}));

describe('Module - Validation with Optional API Class', () => {
    describe('Minimal module definition (for listing entities)', () => {
        it('should accept module with only moduleName', () => {
            expect(() => {
                new Module({
                    definition: {
                        moduleName: 'hubspot',
                        modelName: 'Hubspot',
                    },
                    userId: 'user-123',
                });
            }).not.toThrow();
        });

        it('should not initialize API when API class is missing', () => {
            const module = new Module({
                definition: {
                    moduleName: 'hubspot',
                    modelName: 'Hubspot',
                },
                userId: 'user-123',
            });

            expect(module.apiClass).toBeUndefined();
            expect(module.api).toBeUndefined();
        });

        it('should reject module without moduleName', () => {
            expect(() => {
                new Module({
                    definition: {
                        // moduleName missing
                        modelName: 'Hubspot',
                    },
                    userId: 'user-123',
                });
            }).toThrow('Module definition requires moduleName');
        });
    });

    describe('Full module definition (for API operations)', () => {
        let MockApiClass;

        beforeEach(() => {
            MockApiClass = jest.fn().mockImplementation(() => ({
                requesterType: 'oauth2',
            }));
            MockApiClass.requesterType = 'oauth2';
        });

        it('should accept module with full definition', () => {
            const definition = {
                moduleName: 'hubspot',
                modelName: 'Hubspot',
                API: MockApiClass,
                requiredAuthMethods: {
                    getToken: jest.fn(),
                    getEntityDetails: jest.fn(),
                    getCredentialDetails: jest.fn(),
                    apiPropertiesToPersist: {
                        credential: ['access_token'],
                        entity: ['externalId'],
                    },
                    testAuthRequest: jest.fn(),
                },
                env: {},
            };

            expect(() => {
                new Module({
                    definition,
                    userId: 'user-123',
                });
            }).not.toThrow();
        });

        it('should initialize API when API class is present', () => {
            const definition = {
                moduleName: 'hubspot',
                modelName: 'Hubspot',
                API: MockApiClass,
                requiredAuthMethods: {
                    getToken: jest.fn(),
                    getEntityDetails: jest.fn(),
                    getCredentialDetails: jest.fn(),
                    apiPropertiesToPersist: {
                        credential: ['access_token'],
                        entity: ['externalId'],
                    },
                    testAuthRequest: jest.fn(),
                },
                env: {},
            };

            const module = new Module({
                definition,
                userId: 'user-123',
            });

            expect(module.apiClass).toBe(MockApiClass);
            expect(module.api).toBeDefined();
            expect(MockApiClass).toHaveBeenCalled();
        });

        it('should validate OAuth2 modules require getToken', () => {
            expect(() => {
                new Module({
                    definition: {
                        moduleName: 'hubspot',
                        modelName: 'Hubspot',
                        API: MockApiClass,
                        requiredAuthMethods: {
                            // getToken missing for OAuth2
                            getEntityDetails: jest.fn(),
                            getCredentialDetails: jest.fn(),
                            apiPropertiesToPersist: {},
                            testAuthRequest: jest.fn(),
                        },
                        env: {},
                    },
                    userId: 'user-123',
                });
            }).toThrow('Module definition requires requiredAuthMethods.getToken');
        });

        it('should require getEntityDetails when requiredAuthMethods present', () => {
            expect(() => {
                new Module({
                    definition: {
                        moduleName: 'hubspot',
                        modelName: 'Hubspot',
                        API: MockApiClass,
                        requiredAuthMethods: {
                            getToken: jest.fn(),
                            // getEntityDetails missing
                            getCredentialDetails: jest.fn(),
                            apiPropertiesToPersist: {},
                            testAuthRequest: jest.fn(),
                        },
                        env: {},
                    },
                    userId: 'user-123',
                });
            }).toThrow(
                'Module definition requires requiredAuthMethods.getEntityDetails'
            );
        });

        it('should require getCredentialDetails when requiredAuthMethods present', () => {
            expect(() => {
                new Module({
                    definition: {
                        moduleName: 'hubspot',
                        modelName: 'Hubspot',
                        API: MockApiClass,
                        requiredAuthMethods: {
                            getToken: jest.fn(),
                            getEntityDetails: jest.fn(),
                            // getCredentialDetails missing
                            apiPropertiesToPersist: {},
                            testAuthRequest: jest.fn(),
                        },
                        env: {},
                    },
                    userId: 'user-123',
                });
            }).toThrow(
                'Module definition requires requiredAuthMethods.getCredentialDetails'
            );
        });
    });

    describe('Hybrid scenarios', () => {
        it('should accept module with API class but without requiredAuthMethods', () => {
            const MockApiClass = jest.fn().mockImplementation(() => ({}));

            expect(() => {
                new Module({
                    definition: {
                        moduleName: 'hubspot',
                        modelName: 'Hubspot',
                        API: MockApiClass,
                        env: {},
                    },
                    userId: 'user-123',
                });
            }).not.toThrow();
        });

        it('should handle entity with credential data', () => {
            const module = new Module({
                definition: {
                    moduleName: 'hubspot',
                    modelName: 'Hubspot',
                },
                userId: 'user-123',
                entity: {
                    id: 'entity-123',
                    externalId: '1944396',
                    credential: {
                        id: 'cred-123',
                        data: {
                            access_token: 'token-abc',
                        },
                    },
                },
            });

            expect(module.entity).toBeDefined();
            expect(module.credential).toBeDefined();
            expect(module.credential.data.access_token).toBe('token-abc');
        });
    });

    describe('Read-only vs API-enabled modules', () => {
        it('should allow read-only module for entity listing', () => {
            const readOnlyModule = new Module({
                definition: {
                    moduleName: 'hubspot',
                    modelName: 'Hubspot',
                },
                userId: 'user-123',
                entity: {
                    id: 'entity-123',
                    name: 'My HubSpot',
                    externalId: '1944396',
                },
            });

            expect(readOnlyModule.name).toBe('hubspot');
            expect(readOnlyModule.entity.name).toBe('My HubSpot');
            expect(readOnlyModule.api).toBeUndefined();
        });

        it('should allow API-enabled module for operations', () => {
            const MockApiClass = jest.fn().mockImplementation(() => ({}));

            const apiModule = new Module({
                definition: {
                    moduleName: 'hubspot',
                    modelName: 'Hubspot',
                    API: MockApiClass,
                    requiredAuthMethods: {
                        getToken: jest.fn(),
                        getEntityDetails: jest.fn(),
                        getCredentialDetails: jest.fn(),
                        apiPropertiesToPersist: {},
                        testAuthRequest: jest.fn(),
                    },
                    env: {},
                },
                userId: 'user-123',
            });

            expect(apiModule.name).toBe('hubspot');
            expect(apiModule.api).toBeDefined();
        });
    });
});
