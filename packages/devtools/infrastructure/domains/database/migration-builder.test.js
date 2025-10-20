/**
 * Tests for MigrationBuilder
 */

const { MigrationBuilder } = require('./migration-builder');

describe('MigrationBuilder', () => {
    let builder;
    let originalEnv;

    beforeEach(() => {
        builder = new MigrationBuilder();
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('shouldExecute', () => {
        it('should return true for PostgreSQL by default', () => {
            const appDef = {
                database: {},
            };

            expect(builder.shouldExecute(appDef)).toBe(true);
        });

        it('should return true when PostgreSQL is explicitly enabled', () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            expect(builder.shouldExecute(appDef)).toBe(true);
        });

        it('should return false when PostgreSQL is explicitly disabled', () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: false,
                    },
                },
            };

            expect(builder.shouldExecute(appDef)).toBe(false);
        });

        it('should return false in local mode', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            expect(builder.shouldExecute(appDef)).toBe(false);
        });

        it('should return true for MongoDB-only (defaults to PostgreSQL)', () => {
            const appDef = {
                database: {
                    mongodb: {
                        enable: true,
                    },
                },
            };

            expect(builder.shouldExecute(appDef)).toBe(true);
        });
    });

    describe('getDependencies', () => {
        it('should have no dependencies', () => {
            expect(builder.getDependencies()).toEqual([]);
        });
    });

    describe('validate', () => {
        it('should always return valid', () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = builder.validate(appDef);

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });
    });

    describe('build', () => {
        it('should create SQS queue resource', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            expect(result.resources.DbMigrationQueue).toBeDefined();
            expect(result.resources.DbMigrationQueue.Type).toBe('AWS::SQS::Queue');
            expect(result.resources.DbMigrationQueue.Properties.QueueName).toBe(
                '${self:service}-${self:provider.stage}-DbMigrationQueue'
            );
            expect(result.resources.DbMigrationQueue.Properties.VisibilityTimeout).toBe(900);
        });

        it('should create migration worker function', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            expect(result.functions.dbMigrationWorker).toBeDefined();
            expect(result.functions.dbMigrationWorker.handler).toBe(
                'node_modules/@friggframework/core/handlers/workers/db-migration.handler'
            );
            expect(result.functions.dbMigrationWorker.timeout).toBe(900);
            expect(result.functions.dbMigrationWorker.memorySize).toBe(1024);
            expect(result.functions.dbMigrationWorker.reservedConcurrency).toBe(1);
            expect(result.functions.dbMigrationWorker.events).toEqual([
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': ['DbMigrationQueue', 'Arn'] },
                        batchSize: 1,
                    },
                },
            ]);
        });

        it('should create migration router function', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            expect(result.functions.dbMigrationRouter).toBeDefined();
            expect(result.functions.dbMigrationRouter.handler).toBe(
                'node_modules/@friggframework/core/handlers/routers/db-migration.handler'
            );
            expect(result.functions.dbMigrationRouter.timeout).toBe(30);
            expect(result.functions.dbMigrationRouter.events).toContainEqual({
                httpApi: { path: '/db-migrate', method: 'POST' },
            });
            expect(result.functions.dbMigrationRouter.events).toContainEqual({
                httpApi: { path: '/db-migrate/{processId}', method: 'GET' },
            });
        });

        it('should configure package exclusions for migration functions to reduce Lambda size', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            // Worker and router now have DIFFERENT package configs (split for size optimization)
            expect(result.functions.dbMigrationWorker.package).toBeDefined();
            expect(result.functions.dbMigrationRouter.package).toBeDefined();
            expect(result.functions.dbMigrationWorker.package).not.toBe(result.functions.dbMigrationRouter.package);

            const workerPackage = result.functions.dbMigrationWorker.package;
            const routerPackage = result.functions.dbMigrationRouter.package;
            
            // Verify worker excludes Prisma client (in layer) but keeps CLI
            expect(workerPackage.exclude).toContain('node_modules/@prisma/client/**');
            expect(workerPackage.exclude).toContain('node_modules/@friggframework/core/generated/**');
            
            // Verify router excludes ALL WASM files (doesn't run migrations)
            expect(routerPackage.exclude).toContain('**/*.wasm*');
            
            // Verify common exclusions for both
            expect(workerPackage.exclude).toContain('node_modules/**/node_modules/**');
            expect(workerPackage.exclude).toContain('**/*.test.js');
            expect(workerPackage.exclude).toContain('src/**');

            // Should NOT exclude migration handlers - they're needed!
            expect(workerPackage.exclude).not.toContain('node_modules/@friggframework/core/handlers/routers/**');
            expect(workerPackage.exclude).not.toContain('node_modules/@friggframework/core/handlers/workers/**');
        });

        it('should add queue URL to environment', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            expect(result.environment.DB_MIGRATION_QUEUE_URL).toEqual({
                Ref: 'DbMigrationQueue',
            });
        });

        it('should add SQS IAM permissions', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            expect(result.iamStatements).toContainEqual({
                Effect: 'Allow',
                Action: [
                    'sqs:SendMessage',
                    'sqs:GetQueueUrl',
                    'sqs:GetQueueAttributes',
                ],
                Resource: { 'Fn::GetAtt': ['DbMigrationQueue', 'Arn'] },
            });
        });

        it('should include Prisma layer in both functions', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            expect(result.functions.dbMigrationWorker.layers).toEqual([{ Ref: 'PrismaLambdaLayer' }]);
            expect(result.functions.dbMigrationRouter.layers).toEqual([{ Ref: 'PrismaLambdaLayer' }]);
        });

        it('should set skipEsbuild for both functions', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            expect(result.functions.dbMigrationWorker.skipEsbuild).toBe(true);
            expect(result.functions.dbMigrationRouter.skipEsbuild).toBe(true);
        });
    });

    describe('getName', () => {
        it('should return MigrationBuilder', () => {
            expect(builder.getName()).toBe('MigrationBuilder');
        });
    });
});

