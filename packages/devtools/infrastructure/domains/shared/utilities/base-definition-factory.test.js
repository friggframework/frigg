/**
 * Tests for Base Definition Factory
 * 
 * Tests creation of base serverless configuration
 */

const { createBaseDefinition } = require('./base-definition-factory');

describe('Base Definition Factory', () => {
    beforeEach(() => {
        delete process.env.AWS_REGION;
        delete process.env.AWS_PROFILE;
    });

    describe('createBaseDefinition()', () => {
        it('should create base serverless definition with minimal app definition', () => {
            const appDefinition = {
                name: 'test-app',
            };
            const appEnvironmentVars = {};
            const discoveredResources = {};

            const result = createBaseDefinition(appDefinition, appEnvironmentVars, discoveredResources);

            expect(result.service).toBe('test-app');
            expect(result.frameworkVersion).toBe('>=3.17.0');
            expect(result.provider.name).toBe('aws');
            expect(result.provider.runtime).toBe('nodejs22.x');
            expect(result.provider.timeout).toBe(29);
            expect(result.provider.stage).toBe('${opt:stage}');
        });

        it('should default service name to create-frigg-app', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.service).toBe('create-frigg-app');
        });

        it('should use custom provider if specified', () => {
            const appDefinition = {
                provider: 'custom-provider',
            };

            const result = createBaseDefinition(appDefinition, {}, {});

            expect(result.provider.name).toBe('custom-provider');
        });

        it('should use AWS_REGION environment variable', () => {
            process.env.AWS_REGION = 'eu-west-1';

            const result = createBaseDefinition({}, {}, {});

            expect(result.provider.region).toBe('eu-west-1');
            expect(result.custom['serverless-offline-sqs'].region).toBe('eu-west-1');
        });

        it('should default to us-east-1 region', () => {
            delete process.env.AWS_REGION;

            const result = createBaseDefinition({}, {}, {});

            expect(result.provider.region).toBe('us-east-1');
        });

        it('should include AWS_PROFILE if set', () => {
            process.env.AWS_PROFILE = 'my-profile';

            const result = createBaseDefinition({}, {}, {});

            expect(result.provider.profile).toBe('my-profile');
        });

        it('should not include AWS_PROFILE if not set', () => {
            delete process.env.AWS_PROFILE;

            const result = createBaseDefinition({}, {}, {});

            expect(result.provider.profile).toBeUndefined();
        });

        it('should include core Lambda functions', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.functions.auth).toBeDefined();
            expect(result.functions.user).toBeDefined();
            expect(result.functions.health).toBeDefined();
            // dbMigrate removed - MigrationBuilder now handles migration infrastructure
            expect(result.functions.dbMigrate).toBeUndefined();
        });

        it('should configure auth function correctly', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.functions.auth.handler).toBe('node_modules/@friggframework/core/handlers/routers/auth.handler');
            expect(result.functions.auth.layers).toEqual([{ Ref: 'PrismaLambdaLayer' }]);
            expect(result.functions.auth.events).toHaveLength(3);
        });

        it('should NOT include legacy dbMigrate function', () => {
            const result = createBaseDefinition({}, {}, {});

            // dbMigrate is legacy - MigrationBuilder handles migration infrastructure
            expect(result.functions.dbMigrate).toBeUndefined();
        });

        it('should include Prisma Lambda Layer', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.layers.prisma).toBeDefined();
            expect(result.layers.prisma.path).toBe('layers/prisma');
            expect(result.layers.prisma.description).toContain('runtime client only');
        });

        it('should include error handling resources', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.resources.Resources.InternalErrorQueue).toBeDefined();
            expect(result.resources.Resources.InternalErrorBridgeTopic).toBeDefined();
            expect(result.resources.Resources.InternalErrorBridgePolicy).toBeDefined();
            expect(result.resources.Resources.ApiGatewayAlarm5xx).toBeDefined();
        });

        it('should include base IAM permissions', () => {
            const result = createBaseDefinition({}, {}, {});

            const snsPermission = result.provider.iamRoleStatements.find(
                stmt => stmt.Action.includes('sns:Publish')
            );
            expect(snsPermission).toBeDefined();

            const sqsPermission = result.provider.iamRoleStatements.find(
                stmt => stmt.Action.includes('sqs:SendMessage')
            );
            expect(sqsPermission).toBeDefined();
        });

        it('should include required plugins', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.plugins).toContain('serverless-esbuild');
            // serverless-dotenv-plugin is conditionally loaded only in offline mode
            expect(result.plugins).toContain('serverless-offline-sqs');
            expect(result.plugins).toContain('serverless-offline');
            expect(result.plugins).toContain('@friggframework/serverless-plugin');
        });

        it('should configure esbuild correctly', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.custom.esbuild.bundle).toBe(true);
            expect(result.custom.esbuild.minify).toBe(true);
            expect(result.custom.esbuild.target).toBe('node22');
            expect(result.custom.esbuild.external).toContain('@aws-sdk/*');
            expect(result.custom.esbuild.external).toContain('@prisma/client');
        });

        it('should configure CORS for HTTP API', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.provider.httpApi.cors.allowedOrigins).toEqual(['*']);
            expect(result.provider.httpApi.cors.allowedMethods).toEqual(['*']);
        });

        it('should merge app environment variables', () => {
            const appEnvironmentVars = {
                API_KEY: "${env:API_KEY, ''}",
                CUSTOM_VAR: "${env:CUSTOM_VAR, ''}",
            };

            const result = createBaseDefinition({}, appEnvironmentVars, {});

            expect(result.provider.environment.API_KEY).toBe("${env:API_KEY, ''}");
            expect(result.provider.environment.CUSTOM_VAR).toBe("${env:CUSTOM_VAR, ''}");
        });

        it('should add standard Frigg environment variables', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.provider.environment.FRIGG_STACK).toBe('${self:service}');
            expect(result.provider.environment.FRIGG_STAGE).toBe('${self:provider.stage}');
            expect(result.provider.environment.FRIGG_REGION).toBe('${self:provider.region}');
        });

        it('should add KMS key ARN from discovered resources', () => {
            const discoveredResources = {
                kmsKeyId: 'arn:aws:kms:us-east-1:123:key/abc',
            };

            const result = createBaseDefinition({}, {}, discoveredResources);

            expect(result.provider.environment.KMS_KEY_ARN).toBe('arn:aws:kms:us-east-1:123:key/abc');
        });

        it('should add database connection info from discovered resources', () => {
            const discoveredResources = {
                auroraClusterEndpoint: 'db.example.com',
                auroraPort: 5432,
            };

            const result = createBaseDefinition({}, {}, discoveredResources);

            expect(result.provider.environment.DATABASE_HOST).toBe('db.example.com');
            expect(result.provider.environment.DATABASE_PORT).toBe('5432');
        });

        it('should add database secret ARN from discovered resources', () => {
            const discoveredResources = {
                databaseSecretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
            };

            const result = createBaseDefinition({}, {}, discoveredResources);

            expect(result.provider.environment.DATABASE_SECRET_ARN).toBe('arn:aws:secretsmanager:us-east-1:123:secret:db');
        });

        it('should configure serverless-offline ports', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.custom['serverless-offline'].httpPort).toBe(3001);
            expect(result.custom['serverless-offline'].lambdaPort).toBe(4001);
            expect(result.custom['serverless-offline'].websocketPort).toBe(3002);
        });

        it('should configure serverless-offline-sqs for LocalStack', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.custom['serverless-offline-sqs'].endpoint).toBe('http://localhost:4566');
            expect(result.custom['serverless-offline-sqs'].accessKeyId).toBe('root');
            expect(result.custom['serverless-offline-sqs'].secretAccessKey).toBe('root');
        });

        it('should set package.individually to true', () => {
            const result = createBaseDefinition({}, {}, {});

            expect(result.package.individually).toBe(true);
        });

        it('should enable dotenv only in offline mode', () => {
            const result = createBaseDefinition({}, {}, {});

            // useDotenv is conditional - only true when process.argv includes 'offline'
            expect(result.useDotenv).toBeDefined();
            expect(typeof result.useDotenv).toBe('boolean');
        });

        describe('usePrismaLayer configuration', () => {
            it('should include Prisma layer by default (usePrismaLayer=true)', () => {
                const result = createBaseDefinition({}, {}, {}, true);

                // Layer definition should exist
                expect(result.layers.prisma).toBeDefined();
                expect(result.layers.prisma.path).toBe('layers/prisma');

                // Functions should reference the layer
                expect(result.functions.auth.layers).toEqual([{ Ref: 'PrismaLambdaLayer' }]);
                expect(result.functions.user.layers).toEqual([{ Ref: 'PrismaLambdaLayer' }]);
                expect(result.functions.health.layers).toEqual([{ Ref: 'PrismaLambdaLayer' }]);

                // Prisma should be excluded from packages
                expect(result.functions.auth.package.exclude).toEqual(
                    expect.arrayContaining([
                        'node_modules/@prisma/**',
                        'node_modules/.prisma/**',
                        'node_modules/prisma/**',
                        'node_modules/@friggframework/core/generated/**',
                    ])
                );

                // Prisma should be external in esbuild
                expect(result.custom.esbuild.external).toContain('@prisma/client');
                expect(result.custom.esbuild.external).toContain('prisma');
                expect(result.custom.esbuild.exclude).toContain('@prisma/client');
                expect(result.custom.esbuild.exclude).toContain('prisma');
            });

            it('should NOT include Prisma layer when usePrismaLayer=false', () => {
                const result = createBaseDefinition({}, {}, {}, false);

                // Layer definition should NOT exist
                expect(result.layers).toEqual({});

                // Functions should NOT have layer references
                expect(result.functions.auth.layers).toBeUndefined();
                expect(result.functions.user.layers).toBeUndefined();
                expect(result.functions.health.layers).toBeUndefined();
            });

            it('should bundle Prisma with functions when usePrismaLayer=false', () => {
                const result = createBaseDefinition({}, {}, {}, false);

                // Prisma should NOT be excluded from packages
                expect(result.functions.auth.package.exclude).not.toEqual(
                    expect.arrayContaining([
                        'node_modules/@prisma/**',
                        'node_modules/.prisma/**',
                        'node_modules/prisma/**',
                        'node_modules/@friggframework/core/generated/**',
                    ])
                );

                // Prisma should NOT be external in esbuild
                expect(result.custom.esbuild.external).not.toContain('@prisma/client');
                expect(result.custom.esbuild.external).not.toContain('prisma');
                expect(result.custom.esbuild.external).not.toContain('.prisma/*');
                expect(result.custom.esbuild.exclude).not.toContain('@prisma/client');
                expect(result.custom.esbuild.exclude).not.toContain('prisma');
            });

            it('should default to usePrismaLayer=true when parameter not provided', () => {
                // Call without 4th parameter
                const result = createBaseDefinition({}, {}, {});

                // Should behave as if usePrismaLayer=true
                expect(result.layers.prisma).toBeDefined();
                expect(result.functions.auth.layers).toEqual([{ Ref: 'PrismaLambdaLayer' }]);
            });
        });
    });
});

