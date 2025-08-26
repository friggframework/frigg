const { 
    validateAppDefinition, 
    validateIntegrationDefinition, 
    validateApiModuleDefinition,
    validateServerlessConfig,
    validateEnvironmentConfig,
    validateCoreModels,
    getSchemas,
    getSchema,
    formatErrors 
} = require('../index');

describe('@friggframework/schemas', () => {
    describe('Schema Loading', () => {
        test('should load all schemas', () => {
            const schemas = getSchemas();
            expect(schemas).toHaveProperty('app-definition');
            expect(schemas).toHaveProperty('integration-definition');
            expect(schemas).toHaveProperty('api-module-definition');
            expect(schemas).toHaveProperty('serverless-config');
            expect(schemas).toHaveProperty('environment-config');
            expect(schemas).toHaveProperty('core-models');
        });

        test('should get individual schema', () => {
            const appSchema = getSchema('app-definition');
            expect(appSchema).toHaveProperty('$schema');
            expect(appSchema).toHaveProperty('title');
            expect(appSchema.title).toBe('Frigg Application Definition');
        });

        test('should throw error for non-existent schema', () => {
            expect(() => getSchema('non-existent')).toThrow('Schema \'non-existent\' not found');
        });
    });

    describe('App Definition Validation', () => {
        test('should validate minimal valid app definition', () => {
            const appDef = {
                integrations: []
            };
            
            const result = validateAppDefinition(appDef);
            expect(result.valid).toBe(true);
            expect(result.errors).toBe(null);
        });

        test('should validate complete app definition', () => {
            const appDef = {
                integrations: [],
                user: { password: true },
                encryption: { useDefaultKMSForFieldLevelEncryption: true },
                vpc: { enable: true },
                security: {
                    cors: {
                        origin: "http://localhost:3000",
                        credentials: true
                    }
                },
                logging: { level: "info" },
                custom: {
                    appName: "Test App",
                    version: "1.0.0",
                    environment: "development"
                }
            };
            
            const result = validateAppDefinition(appDef);
            expect(result.valid).toBe(true);
        });

        test('should reject invalid app definition', () => {
            const appDef = {
                // Missing required integrations field
                user: { password: "invalid" } // Should be boolean
            };
            
            const result = validateAppDefinition(appDef);
            expect(result.valid).toBe(false);
            expect(result.errors).toBeTruthy();
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('Integration Definition Validation', () => {
        test('should validate minimal integration definition', () => {
            const integrationDef = {
                name: "test-integration",
                version: "1.0.0"
            };
            
            const result = validateIntegrationDefinition(integrationDef);
            expect(result.valid).toBe(true);
        });

        test('should validate complete integration definition', () => {
            const integrationDef = {
                name: "hubspot",
                version: "2.0.0",
                supportedVersions: ["2.0.0", "1.9.0"],
                events: ["contact.created", "deal.updated"],
                options: {
                    type: "api",
                    hasUserConfig: true,
                    display: {
                        name: "HubSpot CRM",
                        description: "CRM integration",
                        category: "CRM"
                    }
                },
                capabilities: {
                    auth: ["oauth2"],
                    webhooks: true
                }
            };
            
            const result = validateIntegrationDefinition(integrationDef);
            expect(result.valid).toBe(true);
        });

        test('should reject invalid integration definition', () => {
            const integrationDef = {
                name: "123-invalid", // Invalid name pattern
                version: "invalid-version" // Invalid version pattern
            };
            
            const result = validateIntegrationDefinition(integrationDef);
            expect(result.valid).toBe(false);
            expect(result.errors).toBeTruthy();
        });
    });

    describe('API Module Definition Validation', () => {
        test('should validate minimal API module definition', () => {
            const apiModuleDef = {
                moduleName: "test-module",
                getName: { type: "function" },
                requiredAuthMethods: {
                    apiPropertiesToPersist: {
                        credential: ["access_token"],
                        entity: []
                    }
                }
            };
            
            const result = validateApiModuleDefinition(apiModuleDef);
            expect(result.valid).toBe(true);
        });

        test('should validate complete API module definition', () => {
            const apiModuleDef = {
                moduleName: "hubspot",
                getName: { type: "function" },
                requiredAuthMethods: {
                    getToken: { type: "function", async: true },
                    apiPropertiesToPersist: {
                        credential: ["access_token", "refresh_token"],
                        entity: ["external_id"]
                    },
                    getCredentialDetails: { type: "function", async: true },
                    testAuthRequest: { type: "function", async: true }
                },
                env: {
                    client_id: "HUBSPOT_CLIENT_ID",
                    client_secret: "HUBSPOT_CLIENT_SECRET",
                    redirect_uri: "https://api.example.com/callback"
                },
                config: {
                    name: "HubSpot",
                    version: "2.0.0",
                    authType: "oauth2"
                }
            };
            
            const result = validateApiModuleDefinition(apiModuleDef);
            expect(result.valid).toBe(true);
        });
    });

    describe('Error Formatting', () => {
        test('should format validation errors', () => {
            const appDef = {
                integrations: "invalid" // Should be array
            };
            
            const result = validateAppDefinition(appDef);
            expect(result.valid).toBe(false);
            
            const formatted = formatErrors(result.errors);
            expect(formatted).toContain('integrations');
            expect(formatted).toContain('must be array');
        });

        test('should handle no errors', () => {
            const formatted = formatErrors(null);
            expect(formatted).toBe('No errors');
        });
    });

    describe('Serverless Configuration Validation', () => {
        test('should validate minimal serverless config', () => {
            const config = {
                service: "test-service",
                provider: {
                    name: "aws",
                    runtime: "nodejs20.x"
                }
            };
            
            const result = validateServerlessConfig(config);
            expect(result.valid).toBe(true);
        });

        test('should validate complete serverless config', () => {
            const config = {
                frameworkVersion: ">=3.17.0",
                service: "frigg-backend",
                provider: {
                    name: "aws",
                    runtime: "nodejs20.x",
                    timeout: 30,
                    region: "us-east-1"
                },
                functions: {
                    api: {
                        handler: "./src/api.handler",
                        events: [{
                            http: {
                                path: "/api/{proxy+}",
                                method: "ANY",
                                cors: true
                            }
                        }]
                    }
                }
            };
            
            const result = validateServerlessConfig(config);
            expect(result.valid).toBe(true);
        });
    });

    describe('Environment Configuration Validation', () => {
        test('should validate environment config', () => {
            const config = {
                environments: {
                    development: {
                        variables: {
                            DATABASE_URL: {
                                value: "mongodb://localhost:27017/test",
                                required: true,
                                sensitive: true,
                                description: "Database connection"
                            }
                        }
                    }
                }
            };
            
            const result = validateEnvironmentConfig(config);
            expect(result.valid).toBe(true);
        });
    });

    describe('Core Models Validation', () => {
        test('should validate user model', () => {
            const models = {
                user: {
                    _id: "507f1f77bcf86cd799439011",
                    email: "test@example.com",
                    role: "user",
                    isActive: true,
                    createdAt: "2023-01-01T00:00:00Z",
                    updatedAt: "2023-01-01T00:00:00Z"
                }
            };
            
            const result = validateCoreModels(models);
            expect(result.valid).toBe(true);
        });

        test('should validate credential model', () => {
            const models = {
                credential: {
                    _id: "507f1f77bcf86cd799439012",
                    userId: "507f1f77bcf86cd799439011",
                    subType: "hubspot",
                    auth_is_valid: true,
                    isActive: true,
                    createdAt: "2023-01-01T00:00:00Z",
                    updatedAt: "2023-01-01T00:00:00Z"
                }
            };
            
            const result = validateCoreModels(models);
            expect(result.valid).toBe(true);
        });

        test('should validate entity model', () => {
            const models = {
                entity: {
                    _id: "507f1f77bcf86cd799439013",
                    credentialId: "507f1f77bcf86cd799439012",
                    userId: "507f1f77bcf86cd799439011",
                    subType: "contact",
                    name: "Test Entity",
                    status: "active",
                    isActive: true,
                    createdAt: "2023-01-01T00:00:00Z",
                    updatedAt: "2023-01-01T00:00:00Z"
                }
            };
            
            const result = validateCoreModels(models);
            expect(result.valid).toBe(true);
        });
    });
});