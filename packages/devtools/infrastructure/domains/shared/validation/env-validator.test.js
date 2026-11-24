/**
 * Tests for Environment Variable Validator
 * 
 * Tests validation of required environment variables
 */

const { validateEnvironmentVariables } = require('./env-validator');

describe('Environment Validator', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
        // Clear test-related env vars
        delete process.env.TEST_VAR_1;
        delete process.env.TEST_VAR_2;
        delete process.env.NODE_ENV;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('validateEnvironmentVariables()', () => {
        it('should return empty results for app definition without environment', () => {
            const appDefinition = {};

            const result = validateEnvironmentVariables(appDefinition);

            expect(result.valid).toEqual([]);
            expect(result.missing).toEqual([]);
            expect(result.warnings).toEqual([]);
        });

        it('should validate present environment variables', () => {
            process.env.TEST_VAR_1 = 'value1';
            process.env.TEST_VAR_2 = 'value2';

            const appDefinition = {
                environment: {
                    TEST_VAR_1: true,
                    TEST_VAR_2: true,
                },
            };

            const result = validateEnvironmentVariables(appDefinition);

            expect(result.valid).toEqual(['TEST_VAR_1', 'TEST_VAR_2']);
            expect(result.missing).toEqual([]);
        });

        it('should detect missing environment variables', () => {
            process.env.TEST_VAR_1 = 'value1';
            // TEST_VAR_2 not set

            const appDefinition = {
                environment: {
                    TEST_VAR_1: true,
                    TEST_VAR_2: true,
                },
            };

            const result = validateEnvironmentVariables(appDefinition);

            expect(result.valid).toEqual(['TEST_VAR_1']);
            expect(result.missing).toEqual(['TEST_VAR_2']);
        });

        it('should only validate variables with value true', () => {
            process.env.TEST_VAR_1 = 'value1';

            const appDefinition = {
                environment: {
                    TEST_VAR_1: true,
                    TEST_VAR_2: false,
                    TEST_VAR_3: 'string-value',
                },
            };

            const result = validateEnvironmentVariables(appDefinition);

            expect(result.valid).toEqual(['TEST_VAR_1']);
            expect(result.missing).toEqual([]);
        });

        it('should handle NODE_ENV specially with warning', () => {
            // NODE_ENV not set

            const appDefinition = {
                environment: {
                    NODE_ENV: true,
                },
            };

            const result = validateEnvironmentVariables(appDefinition);

            expect(result.missing).not.toContain('NODE_ENV');
            expect(result.warnings).toContain('NODE_ENV not set, defaulting to "production"');
        });

        it('should not warn about NODE_ENV if it is set', () => {
            process.env.NODE_ENV = 'development';

            const appDefinition = {
                environment: {
                    NODE_ENV: true,
                },
            };

            const result = validateEnvironmentVariables(appDefinition);

            expect(result.valid).toContain('NODE_ENV');
            expect(result.warnings).not.toContain('NODE_ENV not set, defaulting to "production"');
        });

        it('should warn about missing variables', () => {
            const appDefinition = {
                environment: {
                    MISSING_VAR_1: true,
                    MISSING_VAR_2: true,
                },
            };

            const result = validateEnvironmentVariables(appDefinition);

            expect(result.missing).toEqual(['MISSING_VAR_1', 'MISSING_VAR_2']);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should handle mixed valid and missing variables', () => {
            process.env.VALID_VAR = 'value';

            const appDefinition = {
                environment: {
                    VALID_VAR: true,
                    MISSING_VAR: true,
                },
            };

            const result = validateEnvironmentVariables(appDefinition);

            expect(result.valid).toEqual(['VALID_VAR']);
            expect(result.missing).toEqual(['MISSING_VAR']);
        });

        it('should handle empty environment object', () => {
            const appDefinition = {
                environment: {},
            };

            const result = validateEnvironmentVariables(appDefinition);

            expect(result.valid).toEqual([]);
            expect(result.missing).toEqual([]);
        });

        it('should handle environment variables with empty string values', () => {
            process.env.TEST_VAR = '';

            const appDefinition = {
                environment: {
                    TEST_VAR: true,
                },
            };

            const result = validateEnvironmentVariables(appDefinition);

            // Empty string is still considered "present"
            expect(result.valid).toContain('TEST_VAR');
        });
    });
});

