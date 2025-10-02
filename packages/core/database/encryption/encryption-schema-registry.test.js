const {
    CORE_ENCRYPTION_SCHEMA,
    getEncryptedFields,
    hasEncryptedFields,
    getEncryptedModels,
    registerCustomSchema,
    validateCustomSchema,
    resetCustomSchema,
} = require('./encryption-schema-registry');

describe('Encryption Schema Registry', () => {
    afterEach(() => {
        // Reset custom schema after each test
        resetCustomSchema();
    });

    describe('CORE_ENCRYPTION_SCHEMA', () => {
        it('should define encrypted fields for Credential model', () => {
            expect(CORE_ENCRYPTION_SCHEMA.Credential).toBeDefined();
            expect(CORE_ENCRYPTION_SCHEMA.Credential.fields).toContain(
                'data.access_token'
            );
            expect(CORE_ENCRYPTION_SCHEMA.Credential.fields).toContain(
                'data.refresh_token'
            );
            expect(CORE_ENCRYPTION_SCHEMA.Credential.fields).toContain(
                'data.id_token'
            );
        });

        it('should define encrypted fields for IntegrationMapping model', () => {
            expect(CORE_ENCRYPTION_SCHEMA.IntegrationMapping).toBeDefined();
            expect(CORE_ENCRYPTION_SCHEMA.IntegrationMapping.fields).toContain(
                'mapping'
            );
        });

        it('should define encrypted fields for User model', () => {
            expect(CORE_ENCRYPTION_SCHEMA.User).toBeDefined();
            expect(CORE_ENCRYPTION_SCHEMA.User.fields).toContain('hashword');
        });

        it('should define encrypted fields for Token model', () => {
            expect(CORE_ENCRYPTION_SCHEMA.Token).toBeDefined();
            expect(CORE_ENCRYPTION_SCHEMA.Token.fields).toContain('token');
        });
    });

    describe('getEncryptedFields', () => {
        it('should return encrypted fields for Credential model', () => {
            const fields = getEncryptedFields('Credential');

            expect(fields).toEqual([
                'data.access_token',
                'data.refresh_token',
                'data.id_token',
            ]);
        });

        it('should return encrypted fields for User model', () => {
            const fields = getEncryptedFields('User');

            expect(fields).toEqual(['hashword']);
        });

        it('should return empty array for model without encrypted fields', () => {
            const fields = getEncryptedFields('NonExistentModel');

            expect(fields).toEqual([]);
        });

        it('should return empty array for undefined model', () => {
            const fields = getEncryptedFields(undefined);

            expect(fields).toEqual([]);
        });

        it('should return empty array for null model', () => {
            const fields = getEncryptedFields(null);

            expect(fields).toEqual([]);
        });

        it('should support nested JSON paths', () => {
            const fields = getEncryptedFields('Credential');
            const nestedFields = fields.filter((f) => f.includes('.'));

            expect(nestedFields.length).toBeGreaterThan(0);
            expect(nestedFields).toContain('data.access_token');
        });
    });

    describe('hasEncryptedFields', () => {
        it('should return true for models with encrypted fields', () => {
            expect(hasEncryptedFields('Credential')).toBe(true);
            expect(hasEncryptedFields('User')).toBe(true);
            expect(hasEncryptedFields('Token')).toBe(true);
            expect(hasEncryptedFields('IntegrationMapping')).toBe(true);
        });

        it('should return false for models without encrypted fields', () => {
            expect(hasEncryptedFields('State')).toBe(false);
            expect(hasEncryptedFields('NonExistentModel')).toBe(false);
        });

        it('should return false for undefined model', () => {
            expect(hasEncryptedFields(undefined)).toBe(false);
        });

        it('should return false for null model', () => {
            expect(hasEncryptedFields(null)).toBe(false);
        });
    });

    describe('getEncryptedModels', () => {
        it('should return list of all models with encryption', () => {
            const models = getEncryptedModels();

            expect(models).toContain('Credential');
            expect(models).toContain('IntegrationMapping');
            expect(models).toContain('User');
            expect(models).toContain('Token');
        });

        it('should return array with length equal to encrypted models', () => {
            const models = getEncryptedModels();

            expect(models.length).toBe(
                Object.keys(CORE_ENCRYPTION_SCHEMA).length
            );
        });

        it('should return unique model names', () => {
            const models = getEncryptedModels();
            const uniqueModels = [...new Set(models)];

            expect(models.length).toBe(uniqueModels.length);
        });
    });

    describe('Schema Validation', () => {
        it('should have valid field paths (no leading/trailing dots)', () => {
            const models = getEncryptedModels();

            models.forEach((modelName) => {
                const fields = getEncryptedFields(modelName);

                fields.forEach((fieldPath) => {
                    expect(fieldPath).not.toMatch(/^\./);
                    expect(fieldPath).not.toMatch(/\.$/);
                    expect(fieldPath.length).toBeGreaterThan(0);
                });
            });
        });

        it('should not have duplicate field paths within a model', () => {
            const models = getEncryptedModels();

            models.forEach((modelName) => {
                const fields = getEncryptedFields(modelName);
                const uniqueFields = [...new Set(fields)];

                expect(fields.length).toBe(uniqueFields.length);
            });
        });

        it('should have at least one field per encrypted model', () => {
            const models = getEncryptedModels();

            models.forEach((modelName) => {
                const fields = getEncryptedFields(modelName);

                expect(fields.length).toBeGreaterThan(0);
            });
        });
    });

    describe('Custom Schema Registration', () => {
        describe('validateCustomSchema', () => {
            it('should validate a valid custom schema', () => {
                const customSchema = {
                    MyModel: {
                        fields: ['secretField', 'data.apiKey'],
                    },
                };

                const result = validateCustomSchema(customSchema);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
            });

            it('should reject non-object schema', () => {
                const result = validateCustomSchema('invalid');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain(
                    'Custom schema must be an object'
                );
            });

            it('should reject model without fields array', () => {
                const customSchema = {
                    MyModel: {
                        notFields: ['test'],
                    },
                };

                const result = validateCustomSchema(customSchema);

                expect(result.valid).toBe(false);
                expect(result.errors[0]).toContain('must have a "fields" array');
            });

            it('should reject invalid field paths', () => {
                const customSchema = {
                    MyModel: {
                        fields: ['validField', '', null],
                    },
                };

                const result = validateCustomSchema(customSchema);

                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
            });

            it('should prevent overriding core encrypted fields', () => {
                const customSchema = {
                    Credential: {
                        fields: ['data.access_token'], // Core field
                    },
                };

                const result = validateCustomSchema(customSchema);

                expect(result.valid).toBe(false);
                expect(result.errors[0]).toContain('Cannot override core');
                expect(result.errors[0]).toContain('data.access_token');
            });

            it('should allow adding new fields to core models', () => {
                const customSchema = {
                    Credential: {
                        fields: ['data.customField'], // New field
                    },
                };

                const result = validateCustomSchema(customSchema);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
            });
        });

        describe('registerCustomSchema', () => {
            it('should register a valid custom schema', () => {
                const customSchema = {
                    MyCustomModel: {
                        fields: ['secretData', 'apiKey'],
                    },
                };

                expect(() => registerCustomSchema(customSchema)).not.toThrow();

                const fields = getEncryptedFields('MyCustomModel');
                expect(fields).toEqual(['secretData', 'apiKey']);
            });

            it('should throw error for invalid schema', () => {
                const invalidSchema = {
                    MyModel: {
                        fields: ['validField', ''], // Empty string invalid
                    },
                };

                expect(() => registerCustomSchema(invalidSchema)).toThrow(
                    'Invalid custom encryption schema'
                );
            });

            it('should handle empty schema gracefully', () => {
                expect(() => registerCustomSchema({})).not.toThrow();
                expect(() => registerCustomSchema(null)).not.toThrow();
            });

            it('should throw when trying to override core fields', () => {
                const invalidSchema = {
                    User: {
                        fields: ['hashword'], // Core field
                    },
                };

                expect(() => registerCustomSchema(invalidSchema)).toThrow(
                    'Cannot override core'
                );
            });
        });

        describe('Custom schema merging', () => {
            it('should merge custom fields with core fields', () => {
                const customSchema = {
                    Credential: {
                        fields: ['data.customToken', 'data.customSecret'],
                    },
                };

                registerCustomSchema(customSchema);

                const fields = getEncryptedFields('Credential');

                // Should include both core and custom
                expect(fields).toContain('data.access_token'); // Core
                expect(fields).toContain('data.customToken'); // Custom
                expect(fields).toContain('data.customSecret'); // Custom
            });

            it('should deduplicate merged fields', () => {
                const customSchema = {
                    Credential: {
                        fields: ['data.newField'],
                    },
                };

                registerCustomSchema(customSchema);

                const fields = getEncryptedFields('Credential');
                const uniqueFields = [...new Set(fields)];

                expect(fields.length).toBe(uniqueFields.length);
            });

            it('should include custom models in getEncryptedModels', () => {
                const customSchema = {
                    MyCustomModel: {
                        fields: ['secret'],
                    },
                };

                registerCustomSchema(customSchema);

                const models = getEncryptedModels();

                expect(models).toContain('MyCustomModel');
                expect(models).toContain('Credential'); // Core model still there
            });

            it('should report custom models have encrypted fields', () => {
                const customSchema = {
                    MyCustomModel: {
                        fields: ['secret'],
                    },
                };

                registerCustomSchema(customSchema);

                expect(hasEncryptedFields('MyCustomModel')).toBe(true);
            });
        });

        describe('resetCustomSchema', () => {
            it('should clear custom schema', () => {
                const customSchema = {
                    MyModel: {
                        fields: ['secret'],
                    },
                };

                registerCustomSchema(customSchema);
                expect(hasEncryptedFields('MyModel')).toBe(true);

                resetCustomSchema();
                expect(hasEncryptedFields('MyModel')).toBe(false);
            });

            it('should not affect core schema', () => {
                const customSchema = {
                    MyModel: {
                        fields: ['secret'],
                    },
                };

                registerCustomSchema(customSchema);
                resetCustomSchema();

                // Core models still encrypted
                expect(hasEncryptedFields('Credential')).toBe(true);
                expect(hasEncryptedFields('User')).toBe(true);
            });
        });
    });
});
