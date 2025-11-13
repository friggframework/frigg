const {
    CORE_ENCRYPTION_SCHEMA,
    getEncryptedFields,
    hasEncryptedFields,
    getEncryptedModels,
    registerCustomSchema,
    loadCustomEncryptionSchema,
    validateCustomSchema,
    resetCustomSchema,
} = require('../encryption-schema-registry');

describe('encryption-schema-registry', () => {
    afterEach(() => {
        // Reset after each test to ensure isolation
        resetCustomSchema();
    });

    describe('CORE_ENCRYPTION_SCHEMA', () => {
        it('defines encrypted fields for Credential model', () => {
            expect(CORE_ENCRYPTION_SCHEMA.Credential).toBeDefined();
            expect(CORE_ENCRYPTION_SCHEMA.Credential.fields).toContain('data.access_token');
            expect(CORE_ENCRYPTION_SCHEMA.Credential.fields).toContain('data.refresh_token');
            expect(CORE_ENCRYPTION_SCHEMA.Credential.fields).toContain('data.id_token');
        });

        it('defines encrypted fields for User model', () => {
            expect(CORE_ENCRYPTION_SCHEMA.User).toBeDefined();
            expect(CORE_ENCRYPTION_SCHEMA.User.fields).toContain('hashword');
        });

        it('defines encrypted fields for IntegrationMapping model', () => {
            expect(CORE_ENCRYPTION_SCHEMA.IntegrationMapping).toBeDefined();
            expect(CORE_ENCRYPTION_SCHEMA.IntegrationMapping.fields).toContain('mapping');
        });

        it('defines encrypted fields for Token model', () => {
            expect(CORE_ENCRYPTION_SCHEMA.Token).toBeDefined();
            expect(CORE_ENCRYPTION_SCHEMA.Token.fields).toContain('token');
        });
    });

    describe('getEncryptedFields', () => {
        it('returns core fields for User model', () => {
            const fields = getEncryptedFields('User');
            expect(fields).toContain('hashword');
        });

        it('returns core fields for Credential model', () => {
            const fields = getEncryptedFields('Credential');
            expect(fields).toContain('data.access_token');
            expect(fields).toContain('data.refresh_token');
            expect(fields).toContain('data.id_token');
        });

        it('returns custom fields after registration', () => {
            registerCustomSchema({
                User: { fields: ['username'] }
            });

            const fields = getEncryptedFields('User');
            expect(fields).toContain('username');
        });

        it('merges core and custom fields without duplicates', () => {
            registerCustomSchema({
                User: { fields: ['username'] }
            });

            const fields = getEncryptedFields('User');
            expect(fields).toEqual(expect.arrayContaining(['hashword', 'username']));

            // Check no duplicates
            const uniqueFields = [...new Set(fields)];
            expect(uniqueFields.length).toBe(fields.length);
        });

        it('returns empty array for model with no encrypted fields', () => {
            const fields = getEncryptedFields('NonExistentModel');
            expect(fields).toEqual([]);
        });

        it('returns plain array (not object with .fields property)', () => {
            const fields = getEncryptedFields('User');
            expect(Array.isArray(fields)).toBe(true);
            expect(fields.fields).toBeUndefined(); // Bug fix verification
        });
    });

    describe('hasEncryptedFields', () => {
        it('returns true for User model (has core fields)', () => {
            expect(hasEncryptedFields('User')).toBe(true);
        });

        it('returns true for Credential model (has core fields)', () => {
            expect(hasEncryptedFields('Credential')).toBe(true);
        });

        it('returns false for model with no encrypted fields', () => {
            expect(hasEncryptedFields('NonExistentModel')).toBe(false);
        });

        it('returns true after custom field registered', () => {
            registerCustomSchema({
                CustomModel: { fields: ['customField'] }
            });

            expect(hasEncryptedFields('CustomModel')).toBe(true);
        });
    });

    describe('getEncryptedModels', () => {
        it('returns all core models', () => {
            const models = getEncryptedModels();
            expect(models).toContain('User');
            expect(models).toContain('Credential');
            expect(models).toContain('IntegrationMapping');
            expect(models).toContain('Token');
        });

        it('includes custom models after registration', () => {
            registerCustomSchema({
                CustomModel: { fields: ['customField'] }
            });

            const models = getEncryptedModels();
            expect(models).toContain('CustomModel');
        });

        it('returns unique models (no duplicates)', () => {
            registerCustomSchema({
                User: { fields: ['username'] } // Adds to existing User model
            });

            const models = getEncryptedModels();
            const uniqueModels = [...new Set(models)];
            expect(uniqueModels.length).toBe(models.length);
        });
    });

    describe('validateCustomSchema', () => {
        it('accepts valid schema', () => {
            const schema = {
                User: { fields: ['customField'] }
            };

            const result = validateCustomSchema(schema);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('accepts schema with multiple models', () => {
            const schema = {
                User: { fields: ['username'] },
                CustomModel: { fields: ['field1', 'field2'] }
            };

            const result = validateCustomSchema(schema);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('accepts schema with nested field paths', () => {
            const schema = {
                CustomModel: { fields: ['data.nestedField', 'topLevelField'] }
            };

            const result = validateCustomSchema(schema);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('rejects schema without fields array', () => {
            const schema = {
                User: { notFields: ['field'] }
            };

            const result = validateCustomSchema(schema);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Model "User" must have a "fields" array');
        });

        it('rejects schema with non-array fields', () => {
            const schema = {
                User: { fields: 'not-an-array' }
            };

            const result = validateCustomSchema(schema);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Model "User" must have a "fields" array');
        });

        it('rejects attempt to override core field', () => {
            const schema = {
                User: { fields: ['hashword'] } // Core field
            };

            const result = validateCustomSchema(schema);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Cannot override core encrypted field "hashword"'))).toBe(true);
        });

        it('rejects attempt to override multiple core fields', () => {
            const schema = {
                Credential: { fields: ['data.access_token', 'data.refresh_token'] }
            };

            const result = validateCustomSchema(schema);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('data.access_token'))).toBe(true);
            expect(result.errors.some(e => e.includes('data.refresh_token'))).toBe(true);
        });

        it('rejects schema that is not an object', () => {
            const result = validateCustomSchema('not-an-object');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Custom schema must be an object');
        });

        it('rejects schema with invalid model name', () => {
            const schema = {
                '': { fields: ['field'] }
            };

            const result = validateCustomSchema(schema);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Invalid model name'))).toBe(true);
        });

        it('rejects schema with invalid field path', () => {
            const schema = {
                User: { fields: ['validField', '', 'anotherValid'] }
            };

            const result = validateCustomSchema(schema);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('invalid field path'))).toBe(true);
        });
    });

    describe('registerCustomSchema', () => {
        it('registers valid custom schema', () => {
            registerCustomSchema({
                User: { fields: ['username'] }
            });

            const fields = getEncryptedFields('User');
            expect(fields).toContain('username');
        });

        it('merges with existing core schema', () => {
            registerCustomSchema({
                User: { fields: ['username'] }
            });

            const fields = getEncryptedFields('User');
            expect(fields).toContain('hashword'); // Core field
            expect(fields).toContain('username'); // Custom field
        });

        it('throws on invalid schema', () => {
            expect(() => {
                registerCustomSchema({
                    User: { notFields: ['field'] }
                });
            }).toThrow('Invalid custom encryption schema');
        });

        it('throws when attempting to override core field', () => {
            expect(() => {
                registerCustomSchema({
                    User: { fields: ['hashword'] }
                });
            }).toThrow('Cannot override core encrypted field');
        });

        it('does nothing with empty schema', () => {
            const beforeModels = getEncryptedModels();
            registerCustomSchema({});
            const afterModels = getEncryptedModels();

            expect(afterModels).toEqual(beforeModels);
        });

        it('does nothing with null schema', () => {
            const beforeModels = getEncryptedModels();
            registerCustomSchema(null);
            const afterModels = getEncryptedModels();

            expect(afterModels).toEqual(beforeModels);
        });
    });

    describe('loadCustomEncryptionSchema', () => {
        it('can be called multiple times without error', () => {
            expect(() => {
                loadCustomEncryptionSchema();
                loadCustomEncryptionSchema();
                loadCustomEncryptionSchema();
            }).not.toThrow();
        });

        it('does not throw on missing backend', () => {
            expect(() => loadCustomEncryptionSchema()).not.toThrow();
        });
    });

    describe('resetCustomSchema', () => {
        it('clears custom schema', () => {
            registerCustomSchema({
                CustomModel: { fields: ['customField'] }
            });

            expect(hasEncryptedFields('CustomModel')).toBe(true);

            resetCustomSchema();

            expect(hasEncryptedFields('CustomModel')).toBe(false);
        });

        it('preserves core schema', () => {
            registerCustomSchema({
                User: { fields: ['username'] }
            });

            resetCustomSchema();

            // Core field still there
            expect(hasEncryptedFields('User')).toBe(true);
            expect(getEncryptedFields('User')).toContain('hashword');

            // Custom field removed
            expect(getEncryptedFields('User')).not.toContain('username');
        });
    });
});
