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
                        SERVICE_TOKEN: '/my-app/service-token',
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
            expect(result.errors.some(e => e.includes('ssm.parameters must be an object'))).toBe(true);
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
            expect(result.errors.some(e => e.includes('ssm.parameters must be an object'))).toBe(true);
        });

        it('should error when keys are marked for offload but ssm.enable is not true', () => {
            const appDefinition = {
                ssm: { enable: false },
                environment: { FOO: 'ssm' },
            };

            const result = ssmBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('ssm.enable is not true'))).toBe(true);
        });

        it('should error when a blocklisted key is marked for offload', () => {
            const appDefinition = {
                ssm: { enable: true },
                environment: { DATABASE_URL: 'ssm' },
            };

            const result = ssmBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('DATABASE_URL'))).toBe(true);
        });

        it('should error when an invalid env name is marked for offload', () => {
            const appDefinition = {
                ssm: { enable: true },
                environment: { 'bad-name': 'ssm' },
            };

            const result = ssmBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('bad-name'))).toBe(true);
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

        it('should return empty environment when no keys are offloaded', async () => {
            const appDefinition = {
                ssm: { enable: true },
            };

            const result = await ssmBuilder.build(appDefinition, {});

            expect(result.environment).toEqual({});
            expect(result.iamStatements).toHaveLength(1);
        });
    });

    describe('build() - offload active', () => {
        it('should add prefix and offloaded keys env vars', async () => {
            const appDefinition = {
                ssm: { enable: true },
                environment: { FOO: 'ssm', BAR: 'ssm' },
            };

            const result = await ssmBuilder.build(appDefinition, {});

            expect(result.environment.SSM_PARAMETER_PREFIX).toBe(
                '/frigg/${self:service}/${self:provider.stage}'
            );
            expect(result.environment.FRIGG_SSM_OFFLOADED_KEYS).toBe('BAR,FOO');
        });

        it('should add a prefix-scoped read statement while retaining the broad grant by default', async () => {
            const appDefinition = {
                ssm: { enable: true },
                environment: { FOO: 'ssm' },
            };

            const result = await ssmBuilder.build(appDefinition, {});

            const broad = result.iamStatements.find(
                s => s.Resource && s.Resource['Fn::Sub'] === 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/*'
            );
            expect(broad).toBeDefined();

            const scoped = result.iamStatements.find(
                s => s.Resource === 'arn:aws:ssm:${self:provider.region}:${aws:accountId}:parameter/frigg/${self:service}/${self:provider.stage}/*'
            );
            expect(scoped).toBeDefined();
            expect(scoped.Action).toEqual([
                'ssm:GetParameter',
                'ssm:GetParameters',
                'ssm:GetParametersByPath',
            ]);
        });

        it('should drop the broad grant when restrictIamToPrefix is set', async () => {
            const appDefinition = {
                ssm: { enable: true, restrictIamToPrefix: true },
                environment: { FOO: 'ssm' },
            };

            const result = await ssmBuilder.build(appDefinition, {});

            const broad = result.iamStatements.find(
                s => s.Resource && s.Resource['Fn::Sub']
            );
            expect(broad).toBeUndefined();

            const scoped = result.iamStatements.find(
                s => s.Resource === 'arn:aws:ssm:${self:provider.region}:${aws:accountId}:parameter/frigg/${self:service}/${self:provider.stage}/*'
            );
            expect(scoped).toBeDefined();
        });

        it('should add kms:Decrypt when kmsKeyArn is set', async () => {
            const appDefinition = {
                ssm: {
                    enable: true,
                    kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/abc-123',
                },
                environment: { FOO: 'ssm' },
            };

            const result = await ssmBuilder.build(appDefinition, {});

            const decrypt = result.iamStatements.find(
                s => Array.isArray(s.Action) && s.Action.includes('kms:Decrypt')
            );
            expect(decrypt).toEqual({
                Effect: 'Allow',
                Action: ['kms:Decrypt'],
                Resource: 'arn:aws:kms:us-east-1:123456789012:key/abc-123',
            });
        });

        it('should honor a custom parameterPrefix', async () => {
            const appDefinition = {
                ssm: { enable: true, parameterPrefix: '/custom/${self:provider.stage}' },
                environment: { FOO: 'ssm' },
            };

            const result = await ssmBuilder.build(appDefinition, {});

            expect(result.environment.SSM_PARAMETER_PREFIX).toBe(
                '/custom/${self:provider.stage}'
            );
            const scoped = result.iamStatements.find(
                s => s.Resource === 'arn:aws:ssm:${self:provider.region}:${aws:accountId}:parameter/custom/${self:provider.stage}/*'
            );
            expect(scoped).toBeDefined();
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

