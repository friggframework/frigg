/**
 * Tests for SSM Builder
 * 
 * Tests SSM Parameter Store configuration
 */

const { SsmBuilder } = require('./ssm-builder');
const { ValidationResult } = require('../shared/base-builder');

describe('SsmBuilder', () => {
    let ssmBuilder;

    beforeEach(() => {
        ssmBuilder = new SsmBuilder();
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    afterEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    describe('shouldExecute()', () => {
        it('should return true when SSM is enabled', () => {
            const appDefinition = {
                ssm: { enable: true },
            };

            expect(ssmBuilder.shouldExecute(appDefinition)).toBe(true);
        });

        it('should return false when SSM is disabled', () => {
            const appDefinition = {
                ssm: { enable: false },
            };

            expect(ssmBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when SSM is not defined', () => {
            const appDefinition = {};

            expect(ssmBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when FRIGG_SKIP_AWS_DISCOVERY is set (local mode)', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
            const appDefinition = {
                ssm: { enable: true },
            };

            expect(ssmBuilder.shouldExecute(appDefinition)).toBe(false);
        });
    });

    describe('validate()', () => {
        it('should pass validation for valid SSM config', () => {
            const appDefinition = {
                ssm: {
                    enable: true,
                },
            };

            const result = ssmBuilder.validate(appDefinition);

            expect(result).toBeInstanceOf(ValidationResult);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should pass validation with parameters object', () => {
            const appDefinition = {
                ssm: {
                    enable: true,
                    parameters: {
                        DATABASE_URL: '/my-app/database-url',
                        API_KEY: '/my-app/api-key',
                    },
                },
            };

            const result = ssmBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should error if SSM configuration is missing', () => {
            const appDefinition = {};

            const result = ssmBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('SSM configuration is missing');
        });

        it('should error if parameters is not an object', () => {
            const appDefinition = {
                ssm: {
                    enable: true,
                    parameters: 'invalid',
                },
            };

            const result = ssmBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('ssm.parameters must be an object');
        });

        it('should error if parameters is an array', () => {
            const appDefinition = {
                ssm: {
                    enable: true,
                    parameters: ['param1', 'param2'],
                },
            };

            const result = ssmBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
        });
    });

    describe('build()', () => {
        it('should add IAM permissions for SSM operations', async () => {
            const appDefinition = {
                ssm: {
                    enable: true,
                },
            };

            const result = await ssmBuilder.build(appDefinition, {});

            expect(result.iamStatements).toHaveLength(1);
            expect(result.iamStatements[0]).toEqual({
                Effect: 'Allow',
                Action: [
                    'ssm:GetParameter',
                    'ssm:GetParameters',
                    'ssm:GetParametersByPath',
                ],
                Resource: {
                    'Fn::Sub': 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/*',
                },
            });
        });

        it('should return environment object even if empty', async () => {
            const appDefinition = {
                ssm: {
                    enable: true,
                },
            };

            const result = await ssmBuilder.build(appDefinition, {});

            expect(result.environment).toBeDefined();
            expect(typeof result.environment).toBe('object');
        });

        it('should not depend on discovered resources', async () => {
            const appDefinition = {
                ssm: {
                    enable: true,
                },
            };

            const result1 = await ssmBuilder.build(appDefinition, {});
            const result2 = await ssmBuilder.build(appDefinition, { someResource: 'value' });

            expect(result1.iamStatements).toEqual(result2.iamStatements);
        });
    });

    describe('getDependencies()', () => {
        it('should have no dependencies', () => {
            const deps = ssmBuilder.getDependencies();

            expect(deps).toEqual([]);
        });
    });

    describe('getName()', () => {
        it('should return SsmBuilder', () => {
            expect(ssmBuilder.getName()).toBe('SsmBuilder');
        });
    });
});

