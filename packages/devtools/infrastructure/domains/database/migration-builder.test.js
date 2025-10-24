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
    });

    describe('getName', () => {
        it('should return MigrationBuilder', () => {
            expect(builder.getName()).toBe('MigrationBuilder');
        });
    });
});

