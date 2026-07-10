/**
 * Tests for Environment Builder Service
 * 
 * Tests environment variable extraction and building
 */

const { getAppEnvironmentVars, buildEnvironment } = require('./environment-builder');

describe('Environment Builder', () => {
    describe('getAppEnvironmentVars()', () => {
        it('should extract environment variables with value true', () => {
            const appDefinition = {
                environment: {
                    API_KEY: true,
                    DATABASE_URL: true,
                    CUSTOM_VAR: true,
                },
            };

            const result = getAppEnvironmentVars(appDefinition);

            expect(result.API_KEY).toBe("${env:API_KEY, ''}");
            expect(result.DATABASE_URL).toBe("${env:DATABASE_URL, ''}");
            expect(result.CUSTOM_VAR).toBe("${env:CUSTOM_VAR, ''}");
        });

        it('should ignore environment variables with value false', () => {
            const appDefinition = {
                environment: {
                    ENABLED_VAR: true,
                    DISABLED_VAR: false,
                },
            };

            const result = getAppEnvironmentVars(appDefinition);

            expect(result.ENABLED_VAR).toBeDefined();
            expect(result.DISABLED_VAR).toBeUndefined();
        });

        it("ignores non-boolean values other than the meaningful 'ssm' marker", () => {
            const appDefinition = {
                environment: {
                    VALID: true,
                    STRING_VALUE: 'some-value',
                    NUMBER_VALUE: 123,
                },
            };

            const result = getAppEnvironmentVars(appDefinition);

            expect(result.VALID).toBeDefined();
            expect(result.STRING_VALUE).toBeUndefined();
            expect(result.NUMBER_VALUE).toBeUndefined();
        });

        it('should skip reserved AWS Lambda variables', () => {
            const appDefinition = {
                environment: {
                    CUSTOM_VAR: true,
                    AWS_REGION: true,
                    AWS_ACCESS_KEY_ID: true,
                    AWS_SECRET_ACCESS_KEY: true,
                    _HANDLER: true,
                    AWS_LAMBDA_FUNCTION_NAME: true,
                },
            };

            const result = getAppEnvironmentVars(appDefinition);

            expect(result.CUSTOM_VAR).toBeDefined();
            expect(result.AWS_REGION).toBeUndefined();
            expect(result.AWS_ACCESS_KEY_ID).toBeUndefined();
            expect(result.AWS_SECRET_ACCESS_KEY).toBeUndefined();
            expect(result._HANDLER).toBeUndefined();
            expect(result.AWS_LAMBDA_FUNCTION_NAME).toBeUndefined();
        });

        it('should return empty object if no environment defined', () => {
            const appDefinition = {};

            const result = getAppEnvironmentVars(appDefinition);

            expect(result).toEqual({});
        });

        it('should handle empty environment object', () => {
            const appDefinition = {
                environment: {},
            };

            const result = getAppEnvironmentVars(appDefinition);

            expect(result).toEqual({});
        });

        it('should create serverless variable references', () => {
            const appDefinition = {
                environment: {
                    MY_VAR: true,
                },
            };

            const result = getAppEnvironmentVars(appDefinition);

            // Should use serverless variable syntax with empty string fallback
            expect(result.MY_VAR).toBe("${env:MY_VAR, ''}");
        });
    });

    describe("getAppEnvironmentVars() - 'ssm' offload", () => {
        const originalSkipDiscovery = process.env.FRIGG_SKIP_AWS_DISCOVERY;

        afterEach(() => {
            if (originalSkipDiscovery === undefined) {
                delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            } else {
                process.env.FRIGG_SKIP_AWS_DISCOVERY = originalSkipDiscovery;
            }
        });

        it("excludes 'ssm' keys when offload is active", () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            const appDefinition = {
                ssm: { enable: true },
                environment: { FOO: 'ssm', BAR: true },
            };

            const result = getAppEnvironmentVars(appDefinition);

            expect(result.FOO).toBeUndefined();
            expect(result.BAR).toBe("${env:BAR, ''}");
        });

        it("falls back to env reference for 'ssm' keys when FRIGG_SKIP_AWS_DISCOVERY is set", () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
            const appDefinition = {
                ssm: { enable: true },
                environment: { FOO: 'ssm' },
            };

            const result = getAppEnvironmentVars(appDefinition);

            expect(result.FOO).toBe("${env:FOO, ''}");
        });

        it("falls back to env reference for 'ssm' keys when ssm is disabled", () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            const appDefinition = {
                ssm: { enable: false },
                environment: { FOO: 'ssm' },
            };

            const result = getAppEnvironmentVars(appDefinition);

            expect(result.FOO).toBe("${env:FOO, ''}");
        });
    });

    describe('buildEnvironment()', () => {
        it('should combine app vars with standard Frigg variables', () => {
            const appEnvironmentVars = {
                API_KEY: "${env:API_KEY, ''}",
            };
            const discoveredResources = {};

            const result = buildEnvironment(appEnvironmentVars, discoveredResources);

            expect(result.API_KEY).toBe("${env:API_KEY, ''}");
            expect(result.STAGE).toBe('${self:provider.stage}');
            expect(result.FRIGG_STACK).toBe('${self:service}');
            expect(result.FRIGG_STAGE).toBe('${self:provider.stage}');
            expect(result.FRIGG_REGION).toBe('${self:provider.region}');
        });

        it('should add KMS key ARN if discovered', () => {
            const appEnvironmentVars = {};
            const discoveredResources = {
                kmsKeyId: 'arn:aws:kms:us-east-1:123456:key/abc-123',
            };

            const result = buildEnvironment(appEnvironmentVars, discoveredResources);

            expect(result.KMS_KEY_ARN).toBe('arn:aws:kms:us-east-1:123456:key/abc-123');
        });

        it('should prefer kmsKeyId over kmsKeyArn if both present', () => {
            const appEnvironmentVars = {};
            const discoveredResources = {
                kmsKeyId: 'arn:aws:kms:us-east-1:123456:key/primary',
                kmsKeyArn: 'arn:aws:kms:us-east-1:123456:key/secondary',
            };

            const result = buildEnvironment(appEnvironmentVars, discoveredResources);

            // Implementation uses if/else-if, so kmsKeyId takes priority
            expect(result.KMS_KEY_ARN).toBe('arn:aws:kms:us-east-1:123456:key/primary');
        });

        it('should add database connection info if discovered', () => {
            const appEnvironmentVars = {};
            const discoveredResources = {
                auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                auroraPort: 5432,
            };

            const result = buildEnvironment(appEnvironmentVars, discoveredResources);

            expect(result.DATABASE_HOST).toBe('cluster.abc.us-east-1.rds.amazonaws.com');
            expect(result.DATABASE_PORT).toBe('5432');
        });

        it('should default database port to 5432 if not specified', () => {
            const appEnvironmentVars = {};
            const discoveredResources = {
                auroraClusterEndpoint: 'cluster.example.com',
            };

            const result = buildEnvironment(appEnvironmentVars, discoveredResources);

            expect(result.DATABASE_HOST).toBe('cluster.example.com');
            expect(result.DATABASE_PORT).toBe('5432');
        });

        it('should add database secret ARN if discovered', () => {
            const appEnvironmentVars = {};
            const discoveredResources = {
                databaseSecretArn: 'arn:aws:secretsmanager:us-east-1:123456:secret:db-secret',
            };

            const result = buildEnvironment(appEnvironmentVars, discoveredResources);

            expect(result.DATABASE_SECRET_ARN).toBe('arn:aws:secretsmanager:us-east-1:123456:secret:db-secret');
        });

        it('should combine all discovered resources', () => {
            const appEnvironmentVars = {
                CUSTOM_VAR: "${env:CUSTOM_VAR, ''}",
            };
            const discoveredResources = {
                kmsKeyArn: 'arn:aws:kms:us-east-1:123456:key/abc',
                auroraClusterEndpoint: 'db.example.com',
                auroraPort: 3306,
                databaseSecretArn: 'arn:aws:secretsmanager:us-east-1:123456:secret:db',
            };

            const result = buildEnvironment(appEnvironmentVars, discoveredResources);

            expect(result.CUSTOM_VAR).toBe("${env:CUSTOM_VAR, ''}");
            expect(result.FRIGG_STACK).toBe('${self:service}');
            expect(result.FRIGG_STAGE).toBe('${self:provider.stage}');
            expect(result.FRIGG_REGION).toBe('${self:provider.region}');
            expect(result.KMS_KEY_ARN).toBe('arn:aws:kms:us-east-1:123456:key/abc');
            expect(result.DATABASE_HOST).toBe('db.example.com');
            expect(result.DATABASE_PORT).toBe('3306');
            expect(result.DATABASE_SECRET_ARN).toBe('arn:aws:secretsmanager:us-east-1:123456:secret:db');
        });

        it('should handle empty discoveredResources', () => {
            const appEnvironmentVars = {
                API_KEY: "${env:API_KEY, ''}",
            };
            const discoveredResources = {};

            const result = buildEnvironment(appEnvironmentVars, discoveredResources);

            expect(result.API_KEY).toBe("${env:API_KEY, ''}");
            expect(result.FRIGG_STACK).toBe('${self:service}');
            expect(result.KMS_KEY_ARN).toBeUndefined();
            expect(result.DATABASE_HOST).toBeUndefined();
        });

        it('should handle empty discoveredResources gracefully', () => {
            const appEnvironmentVars = {};

            const result = buildEnvironment(appEnvironmentVars, {});

            expect(result.FRIGG_STACK).toBe('${self:service}');
            expect(result.KMS_KEY_ARN).toBeUndefined();
        });

        it('should convert database port to string', () => {
            const appEnvironmentVars = {};
            const discoveredResources = {
                auroraClusterEndpoint: 'db.example.com',
                auroraPort: 3306, // Number
            };

            const result = buildEnvironment(appEnvironmentVars, discoveredResources);

            expect(result.DATABASE_PORT).toBe('3306'); // String
            expect(typeof result.DATABASE_PORT).toBe('string');
        });
    });
});

