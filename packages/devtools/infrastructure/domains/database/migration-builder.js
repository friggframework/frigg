/**
 * Migration Infrastructure Builder
 * 
 * Domain Layer - Hexagonal Architecture
 * 
 * Responsible for:
 * - SQS queue for migration jobs
 * - Migration worker Lambda function (triggered by SQS)
 * - Migration router Lambda function (HTTP API)
 * - IAM permissions for SQS
 * 
 * Only creates infrastructure when PostgreSQL is enabled.
 * MongoDB uses `db push` which doesn't require migration queue/worker.
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');

class MigrationBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'MigrationBuilder';
    }

    shouldExecute(appDefinition) {
        // Only create migration infrastructure for PostgreSQL
        // MongoDB uses `db push` which doesn't need queue/worker
        // Skip in local mode
        if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
            return false;
        }

        // Default to true if not explicitly disabled
        return appDefinition.database?.postgres?.enable !== false;
    }

    getDependencies() {
        return []; // No dependencies - migrations can run independently
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        // No specific validation needed - PostgreSQL builder handles DB validation
        // This builder just creates the migration infrastructure

        return result;
    }

    /**
     * Build migration infrastructure
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring database migration infrastructure...`);

        const result = {
            resources: {},
            functions: {},
            iamStatements: [],
            environment: {},
        };

        // Create S3 bucket for migration status tracking
        result.resources.FriggMigrationStatusBucket = {
            Type: 'AWS::S3::Bucket',
            DeletionPolicy: 'Retain', // Protect migration history during stack rollbacks/deletions
            UpdateReplacePolicy: 'Retain', // Protect during stack updates that require replacement
            Properties: {
                // Let CloudFormation auto-generate bucket name for global uniqueness
                // Result: ${StackName}-friggmigrationstatusbucket-${randomHash}
                // Example: quo-integrations-prod-friggmigrationstatusbucket-abc123xyz
                // This ensures no conflicts across accounts/regions/stages
                // BucketName: undefined (CloudFormation generates unique name)
                VersioningConfiguration: {
                    Status: 'Enabled', // Enable versioning for audit trail
                },
                LifecycleConfiguration: {
                    Rules: [
                        {
                            Id: 'DeleteOldMigrations',
                            Status: 'Enabled',
                            ExpirationInDays: 90, // Keep migration history for 90 days
                        },
                    ],
                },
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true,
                },
                Tags: [
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Purpose', Value: 'MigrationStatusTracking' },
                ],
            },
        };

        console.log('  ✓ Created FriggMigrationStatusBucket resource');

        // Create SQS queue for migration jobs
        result.resources.DbMigrationQueue = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: '${self:service}-${self:provider.stage}-DbMigrationQueue',
                VisibilityTimeout: 900, // 15 minutes for long-running migrations
                MessageRetentionPeriod: 1209600, // 14 days
                ReceiveMessageWaitTimeSeconds: 20, // Long polling
            },
        };

        console.log('  ✓ Created DbMigrationQueue resource');

        // Package configuration for migration WORKER (needs Prisma CLI with WASM)
        const migrationWorkerPackageConfig = {
            individually: true,
            exclude: [
                // Exclude Prisma runtime client - it's in the Lambda Layer
                'node_modules/@prisma/client/**',
                'node_modules/.prisma/**',
                'node_modules/@friggframework/core/generated/**',
                // But KEEP node_modules/prisma/** (the CLI with WASM)

                // Same base exclusions as router
                'node_modules/**/node_modules/**',
                'node_modules/aws-sdk/**',
                'node_modules/@aws-sdk/**',
                'node_modules/esbuild/**',
                'node_modules/@esbuild/**',
                'node_modules/typescript/**',
                'node_modules/webpack/**',
                'node_modules/osls/**',
                'node_modules/serverless-esbuild/**',
                'node_modules/serverless-jetpack/**',
                'node_modules/serverless-offline/**',
                'node_modules/serverless-offline-sqs/**',
                'node_modules/serverless-dotenv-plugin/**',
                'node_modules/serverless-kms-grants/**',
                'node_modules/@friggframework/test/**',
                'node_modules/@friggframework/eslint-config/**',
                'node_modules/@friggframework/prettier-config/**',
                'node_modules/@friggframework/devtools/**',
                'node_modules/@friggframework/serverless-plugin/**',
                'node_modules/jest/**',
                'node_modules/prettier/**',
                'node_modules/eslint/**',
                'node_modules/@friggframework/core/generated/prisma-mongodb/**',
                'node_modules/@friggframework/core/integrations/**',
                'node_modules/@friggframework/core/user/**',
                '**/query-engine-darwin*',
                '**/schema-engine-darwin*',
                '**/libquery_engine-darwin*',
                '**/*-darwin-arm64*',
                '**/*-darwin*',
                // Note: Migration worker DOES need Prisma CLI WASM files (for migrate deploy)
                // Only exclude runtime engine WASM (query engine internals)
                '**/runtime/*.wasm',
                // Additional size optimizations for worker
                '**/*.map', // Source maps not needed in production
                '**/*.md', // Documentation
                '**/examples/**',
                '**/docs/**',
                '**/*.d.ts', // TypeScript declarations
                'src/**',
                'test/**',
                'layers/**',
                'coverage/**',
                'deploy.log',
                '.env.backup',
                'docker-compose.yml',
                'jest.config.js',
                'jest.unit.config.js',
                'package-lock.json',
                '**/*.test.js',
                '**/*.spec.js',
                '**/.claude-flow/**',
                '**/.swarm/**',
            ],
        };

        // Package configuration for migration ROUTER (doesn't need Prisma CLI)
        const migrationRouterPackageConfig = {
            individually: true,
            exclude: [
                // Router doesn't access database - exclude ALL Prisma
                'node_modules/prisma/**', // Prisma CLI with engines (54MB!)
                'node_modules/@prisma/**', // Prisma engines
                'node_modules/.prisma/**',
                'node_modules/@friggframework/core/generated/**', // Generated clients

                // Base exclusions
                'node_modules/**/node_modules/**',
                'node_modules/aws-sdk/**',
                'node_modules/@aws-sdk/**',
                'node_modules/esbuild/**',
                'node_modules/@esbuild/**',
                'node_modules/typescript/**',
                'node_modules/webpack/**',
                'node_modules/osls/**',
                'node_modules/serverless-esbuild/**',
                'node_modules/serverless-jetpack/**',
                'node_modules/serverless-offline/**',
                'node_modules/serverless-offline-sqs/**',
                'node_modules/serverless-dotenv-plugin/**',
                'node_modules/serverless-kms-grants/**',
                'node_modules/@friggframework/test/**',
                'node_modules/@friggframework/eslint-config/**',
                'node_modules/@friggframework/prettier-config/**',
                'node_modules/@friggframework/devtools/**',
                'node_modules/@friggframework/serverless-plugin/**',
                'node_modules/jest/**',
                'node_modules/prettier/**',
                'node_modules/eslint/**',
                'node_modules/@friggframework/core/generated/prisma-mongodb/**',
                // Note: DO NOT exclude integrations/** - migration router needs process-repository-factory
                'node_modules/@friggframework/core/user/**',
                // Note: DO NOT exclude handlers/routers/** or handlers/workers/** - migration functions need them!
                '**/query-engine-darwin*',
                '**/schema-engine-darwin*',
                '**/libquery_engine-darwin*',
                '**/*-darwin-arm64*',
                '**/*-darwin*',
                // Router doesn't run migrations - exclude ALL WASM files
                '**/runtime/*.wasm',
                '**/*.wasm*', // Exclude all WASM (Prisma CLI + query engine)
                // Additional size optimizations for router
                '**/*.map', // Source maps not needed in production
                '**/*.md', // Documentation
                '**/test/**',
                '**/tests/**',
                '**/__tests__/**',
                '**/examples/**',
                '**/docs/**',
                '**/*.d.ts', // TypeScript declarations
                'src/**',
                'test/**',
                'layers/**',
                'coverage/**',
                'deploy.log',
                '.env.backup',
                'docker-compose.yml',
                'jest.config.js',
                'jest.unit.config.js',
                'package-lock.json',
                '**/*.test.js',
                '**/*.spec.js',
                '**/.claude-flow/**',
                '**/.swarm/**',
            ],
        };

        // Create migration worker Lambda (triggered by SQS)
        result.functions.dbMigrationWorker = {
            handler: 'node_modules/@friggframework/core/handlers/workers/db-migration.handler',
            layers: [{ Ref: 'PrismaLambdaLayer' }], // Use layer for Prisma client runtime
            skipEsbuild: true,
            timeout: 900, // 15 minutes for long migrations
            memorySize: 1024, // Extra memory for Prisma operations
            reservedConcurrency: 1, // Process one migration at a time (critical for safety)
            description: 'Database migration worker (triggered by SQS queue)',
            package: migrationWorkerPackageConfig,
            environment: {
                // Ensure migration functions get DATABASE_URL from provider.environment
                // Note: Serverless will merge this with provider.environment
            },
            events: [
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': ['DbMigrationQueue', 'Arn'] },
                        batchSize: 1, // Process one migration at a time
                    },
                },
            ],
        };

        console.log('  ✓ Created dbMigrationWorker function');

        // Create migration router Lambda (HTTP API)
        result.functions.dbMigrationRouter = {
            handler: 'node_modules/@friggframework/core/handlers/routers/db-migration.handler',
            // No Prisma layer needed - router doesn't access database
            skipEsbuild: true,
            timeout: 30, // Router just queues jobs, doesn't run migrations
            memorySize: 512,
            description: 'Database migration HTTP API (POST to trigger, GET to check status)',
            package: migrationRouterPackageConfig,
            environment: {
                // Ensure migration functions get DATABASE_URL from provider.environment
                // Note: Serverless will merge this with provider.environment
            },
            events: [
                { httpApi: { path: '/db-migrate/status', method: 'GET' } },
                { httpApi: { path: '/db-migrate', method: 'POST' } },
                { httpApi: { path: '/db-migrate/{processId}', method: 'GET' } },
            ],
        };

        console.log('  ✓ Created dbMigrationRouter function');

        // Add S3 bucket name to environment (for migration status tracking)
        result.environment.S3_BUCKET_NAME = { Ref: 'FriggMigrationStatusBucket' };
        result.environment.MIGRATION_STATUS_BUCKET = { Ref: 'FriggMigrationStatusBucket' };

        // Add queue URL to environment
        result.environment.DB_MIGRATION_QUEUE_URL = { Ref: 'DbMigrationQueue' };

        // Hardcode DB_TYPE for PostgreSQL-only migrations
        // Avoids Prisma needing to load app definition to determine database type
        result.environment.DB_TYPE = 'postgresql';

        console.log('  ✓ Added S3_BUCKET_NAME, DB_MIGRATION_QUEUE_URL, and DB_TYPE environment variables');

        // Add worker function name to router environment (for Lambda invocation)
        // Router needs this to invoke worker for database state checks
        if (!result.functions.dbMigrationRouter.environment) {
            result.functions.dbMigrationRouter.environment = {};
        }
        result.functions.dbMigrationRouter.environment.WORKER_FUNCTION_NAME = {
            Ref: 'DbMigrationWorkerLambdaFunction',
        };

        console.log('  ✓ Added WORKER_FUNCTION_NAME environment variable to router');

        // Add IAM permissions for SQS
        result.iamStatements.push({
            Effect: 'Allow',
            Action: [
                'sqs:SendMessage',
                'sqs:GetQueueUrl',
                'sqs:GetQueueAttributes',
            ],
            Resource: { 'Fn::GetAtt': ['DbMigrationQueue', 'Arn'] },
        });

        console.log('  ✓ Added SQS IAM permissions');

        // Add IAM permissions for S3 (migration status storage)
        // Migration functions need to read/write migration status in S3
        // to avoid chicken-and-egg dependency on User/Process tables

        // Object-level permissions (put, get, delete)
        result.iamStatements.push({
            Effect: 'Allow',
            Action: [
                's3:PutObject',
                's3:GetObject',
                's3:DeleteObject',
            ],
            Resource: {
                'Fn::Join': [
                    '',
                    [
                        { 'Fn::GetAtt': ['FriggMigrationStatusBucket', 'Arn'] },
                        '/migrations/*',
                    ],
                ],
            },
        });

        // Bucket-level permissions (list objects, needed to check if migration status exists)
        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['s3:ListBucket'],
            Resource: { 'Fn::GetAtt': ['FriggMigrationStatusBucket', 'Arn'] },
        });

        console.log('  ✓ Added S3 IAM permissions for migration status tracking');

        // Add IAM permission for router to invoke worker Lambda
        // Router invokes worker for database state checks (keeps router lightweight)
        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['lambda:InvokeFunction'],
            Resource: { 'Fn::GetAtt': ['DbMigrationWorkerLambdaFunction', 'Arn'] },
        });

        console.log('  ✓ Added Lambda invocation permissions for router → worker');

        console.log(`[${this.name}] ✅ Migration infrastructure configuration completed`);
        return result;
    }
}

module.exports = {
    MigrationBuilder,
};

