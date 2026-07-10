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

        it('should create S3 migration status bucket', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            expect(result.resources.FriggMigrationStatusBucket).toBeDefined();
            expect(result.resources.FriggMigrationStatusBucket.Type).toBe('AWS::S3::Bucket');
            expect(result.resources.FriggMigrationStatusBucket.DeletionPolicy).toBe('Retain');
            expect(result.resources.FriggMigrationStatusBucket.Properties.VersioningConfiguration.Status).toBe('Enabled');
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

        it('should add S3 IAM permissions including ListBucket', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            // Should have object-level permissions
            expect(result.iamStatements).toContainEqual(
                expect.objectContaining({
                    Effect: 'Allow',
                    Action: expect.arrayContaining([
                        's3:PutObject',
                        's3:GetObject',
                        's3:DeleteObject',
                    ]),
                    Resource: expect.objectContaining({
                        'Fn::Join': expect.anything(),
                    }),
                })
            );

            // Should have bucket-level ListBucket permission (needed to check if objects exist)
            expect(result.iamStatements).toContainEqual(
                expect.objectContaining({
                    Effect: 'Allow',
                    Action: ['s3:ListBucket'],
                    Resource: { 'Fn::GetAtt': ['FriggMigrationStatusBucket', 'Arn'] },
                })
            );
        });

        it('should create dbMigrationRouter function definition', async () => {
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
            expect(result.functions.dbMigrationRouter.skipEsbuild).toBe(true);
            expect(result.functions.dbMigrationRouter.timeout).toBe(30);
            expect(result.functions.dbMigrationRouter.memorySize).toBe(512);
            expect(result.functions.dbMigrationRouter.events).toHaveLength(3);
            // Must match core's Express router mounted under /admin/db-migrate.
            expect(result.functions.dbMigrationRouter.events).toContainEqual({
                httpApi: { path: '/admin/db-migrate/status', method: 'GET' },
            });
            expect(result.functions.dbMigrationRouter.events).toContainEqual({
                httpApi: { path: '/admin/db-migrate', method: 'POST' },
            });
            expect(result.functions.dbMigrationRouter.events).toContainEqual({
                httpApi: { path: '/admin/db-migrate/{processId}', method: 'GET' },
            });
        });

        it('should create dbMigrationWorker function definition', async () => {
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
            expect(result.functions.dbMigrationWorker.skipEsbuild).toBe(true);
            expect(result.functions.dbMigrationWorker.reservedConcurrency).toBe(1);
            expect(result.functions.dbMigrationWorker.timeout).toBe(900);
            expect(result.functions.dbMigrationWorker.memorySize).toBe(1024);
            expect(result.functions.dbMigrationWorker.layers).toEqual([{ Ref: 'PrismaLambdaLayer' }]);
            expect(result.functions.dbMigrationWorker.events).toHaveLength(1);
            expect(result.functions.dbMigrationWorker.events[0].sqs).toEqual({
                arn: { 'Fn::GetAtt': ['DbMigrationQueue', 'Arn'] },
                batchSize: 1,
            });
        });

        it('should add WORKER_FUNCTION_NAME to router environment', async () => {
            const appDef = {
                database: {
                    postgres: {
                        enable: true,
                    },
                },
            };

            const result = await builder.build(appDef, {});

            expect(result.functions.dbMigrationRouter.environment.WORKER_FUNCTION_NAME).toEqual({
                Ref: 'DbMigrationWorkerLambdaFunction',
            });
        });
    });

    describe('getName', () => {
        it('should return MigrationBuilder', () => {
            expect(builder.getName()).toBe('MigrationBuilder');
        });
    });

    describe('usePrismaLayer configuration', () => {
        const baseAppDefinition = {
            database: {
                postgres: { enable: true },
            },
        };

        it('includes Prisma layer by default', async () => {
            const result = await builder.build(baseAppDefinition, {});
            expect(result.functions.dbMigrationWorker.layers).toEqual([{ Ref: 'PrismaLambdaLayer' }]);
        });

        it('omits Prisma layer when disabled', async () => {
            const appDef = { ...baseAppDefinition, usePrismaLambdaLayer: false };
            const result = await builder.build(appDef, {});
            expect(result.functions.dbMigrationWorker.layers).toBeUndefined();
        });

        it('bundles Prisma runtime when layer disabled', async () => {
            const appDef = { ...baseAppDefinition, usePrismaLambdaLayer: false };
            const result = await builder.build(appDef, {});
            expect(result.functions.dbMigrationWorker.package.exclude).not.toEqual(
                expect.arrayContaining(['node_modules/@prisma/client/**'])
            );
        });
    });

    describe('scoped environment (lambda.scopedEnvironment)', () => {
        beforeEach(() => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        });

        it('scopes migration vars to the migration functions, keeping DB_TYPE global', async () => {
            const result = await builder.build(
                { lambda: { scopedEnvironment: true } },
                {}
            );

            expect(result.environment.S3_BUCKET_NAME).toBeUndefined();
            expect(result.environment.MIGRATION_STATUS_BUCKET).toBeUndefined();
            expect(result.environment.DB_MIGRATION_QUEUE_URL).toBeUndefined();
            expect(result.environment.DB_TYPE).toBe('postgresql');

            for (const fnName of ['dbMigrationRouter', 'dbMigrationWorker']) {
                expect(result.functionEnvironments[fnName]).toMatchObject({
                    S3_BUCKET_NAME: { Ref: 'FriggMigrationStatusBucket' },
                    MIGRATION_STATUS_BUCKET: {
                        Ref: 'FriggMigrationStatusBucket',
                    },
                    DB_MIGRATION_QUEUE_URL: { Ref: 'DbMigrationQueue' },
                });
            }
        });

        it('broadcasts app-wide when the flag is off', async () => {
            const result = await builder.build({}, {});

            expect(result.environment.S3_BUCKET_NAME).toEqual({
                Ref: 'FriggMigrationStatusBucket',
            });
            expect(result.environment.DB_MIGRATION_QUEUE_URL).toEqual({
                Ref: 'DbMigrationQueue',
            });
            expect(result.functionEnvironments).toBeUndefined();
        });
    });
});

