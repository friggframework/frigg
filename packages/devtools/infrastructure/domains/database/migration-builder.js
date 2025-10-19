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

        // Package configuration for migration functions (reuse from base-definition-factory)
        const migrationPackageConfig = {
            individually: true,
            exclude: [
                // Exclude ALL nested node_modules
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
                'node_modules/@friggframework/core/handlers/routers/**',
                '**/query-engine-darwin*',
                '**/schema-engine-darwin*',
                '**/libquery_engine-darwin*',
                '**/*-darwin-arm64*',
                '**/*-darwin*',
                '**/runtime/*.wasm',
                '**/*.wasm*',
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
            layers: [{ Ref: 'PrismaLambdaLayer' }],
            skipEsbuild: true,
            timeout: 900, // 15 minutes for long migrations
            memorySize: 1024, // Extra memory for Prisma operations
            reservedConcurrency: 1, // Process one migration at a time (critical for safety)
            description: 'Database migration worker (triggered by SQS queue)',
            package: migrationPackageConfig,
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
            layers: [{ Ref: 'PrismaLambdaLayer' }],
            skipEsbuild: true,
            timeout: 30, // Router just queues jobs, doesn't run migrations
            memorySize: 512,
            description: 'Database migration HTTP API (POST to trigger, GET to check status)',
            package: migrationPackageConfig,
            events: [
                { httpApi: { path: '/db-migrate', method: 'POST' } },
                { httpApi: { path: '/db-migrate/{processId}', method: 'GET' } },
            ],
        };

        console.log('  ✓ Created dbMigrationRouter function');

        // Add queue URL to environment
        result.environment.DB_MIGRATION_QUEUE_URL = { Ref: 'DbMigrationQueue' };

        console.log('  ✓ Added DB_MIGRATION_QUEUE_URL environment variable');

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

        console.log(`[${this.name}] ✅ Migration infrastructure configuration completed`);
        return result;
    }
}

module.exports = {
    MigrationBuilder,
};

