const { validateAppDefinition } = require('../index');

const baseDefinition = {
    name: 'test-app',
    provider: 'aws',
    integrations: [],
};

describe('app-definition schema: SSM offload surface', () => {
    describe('environment values', () => {
        it('accepts boolean values (existing behavior)', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                environment: { MY_VAR: true, OTHER_VAR: false },
            });
            expect(result.valid).toBe(true);
        });

        it("accepts the 'ssm' marker to offload a variable", () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: { enable: true },
                environment: { MY_SECRET: 'ssm', PLAIN_VAR: true },
            });
            expect(result.valid).toBe(true);
        });

        it('rejects arbitrary string values', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                environment: { MY_VAR: 'yes' },
            });
            expect(result.valid).toBe(false);
        });
    });

    describe('ssm section', () => {
        it('accepts parameterPrefix', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: { enable: true, parameterPrefix: '/custom/prefix' },
            });
            expect(result.valid).toBe(true);
        });

        it('accepts kmsKeyArn', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: {
                    enable: true,
                    kmsKeyArn:
                        'arn:aws:kms:us-east-1:123456789012:key/abc-123',
                },
            });
            expect(result.valid).toBe(true);
        });

        it('accepts restrictIamToPrefix', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: { enable: true, restrictIamToPrefix: true },
            });
            expect(result.valid).toBe(true);
        });

        it('still accepts typed parameters', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: {
                    enable: true,
                    parameters: {
                        MY_SECRET: {
                            type: 'SecureString',
                            description: 'An API key',
                        },
                    },
                },
            });
            expect(result.valid).toBe(true);
        });

        it('rejects unknown ssm properties', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: { enable: true, bogus: true },
            });
            expect(result.valid).toBe(false);
        });

        it('accepts a per-key parameter tier', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: {
                    enable: true,
                    parameters: {
                        MY_SECRET: {
                            type: 'SecureString',
                            tier: 'advanced',
                        },
                    },
                },
            });
            expect(result.valid).toBe(true);
        });

        it('rejects an invalid parameter tier', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: {
                    enable: true,
                    parameters: {
                        MY_SECRET: { tier: 'premium' },
                    },
                },
            });
            expect(result.valid).toBe(false);
        });

        it('rejects lowercase parameter keys', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: {
                    enable: true,
                    parameters: { 'my-secret': { type: 'String' } },
                },
            });
            expect(result.valid).toBe(false);
        });

        it('rejects parameter keys containing slashes', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                ssm: {
                    enable: true,
                    parameters: { 'path/to/secret': { type: 'String' } },
                },
            });
            expect(result.valid).toBe(false);
        });
    });

    describe('lambda section', () => {
        it('accepts lambda.scopedEnvironment', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                lambda: { scopedEnvironment: true },
            });
            expect(result.valid).toBe(true);
        });

        it('rejects unknown lambda properties', () => {
            const result = validateAppDefinition({
                ...baseDefinition,
                lambda: { bogus: true },
            });
            expect(result.valid).toBe(false);
        });
    });

    it('still rejects unknown top-level properties', () => {
        const result = validateAppDefinition({
            ...baseDefinition,
            notARealSection: {},
        });
        expect(result.valid).toBe(false);
    });
});
