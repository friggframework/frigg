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
const { MigrationResourceResolver } = require('./migration-resolver');
const { createEmptyDiscoveryResult, ResourceOwnership } = require('../shared/types');

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
     * Build migration infrastructure using ownership-based architecture
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring database migration infrastructure...`);

        // Backwards compatibility: Translate old schema to new ownership schema
        appDefinition = this.translateLegacyConfig(appDefinition, discoveredResources);

        const result = {
            resources: {},
            iamStatements: [],
            environment: {},
        };

        // Get structured discovery result
        const discovery = discoveredResources._structured || this.convertFlatDiscoveryToStructured(discoveredResources, appDefinition);

        // Use MigrationResourceResolver to make ownership decisions
        const resolver = new MigrationResourceResolver();
        const decisions = resolver.resolveAll(appDefinition, discovery);

        console.log('\n  📋 Resource Ownership Decisions:');
        console.log(`     Bucket: ${decisions.bucket.ownership} - ${decisions.bucket.reason}`);
        console.log(`     Queue: ${decisions.queue.ownership} - ${decisions.queue.reason}`);

        // Build resources based on ownership decisions
        await this.buildFromDecisions(decisions, appDefinition, discoveredResources, result);

        console.log(`[${this.name}] ✅ Migration infrastructure configuration completed`);
        return result;
    }

    /**
     * Convert flat discovery to structured discovery
     * Provides backwards compatibility for tests
     */
    convertFlatDiscoveryToStructured(flatDiscovery, appDefinition = {}) {
        const discovery = createEmptyDiscoveryResult();

        if (!flatDiscovery) {
            return discovery;
        }

        // Check if resources are from CloudFormation stack
        const isManagedIsolated = appDefinition.managementMode === 'managed' &&
                                   (appDefinition.vpcIsolation === 'isolated' || !appDefinition.vpcIsolation);
        const hasExistingStackResources = isManagedIsolated &&
            (flatDiscovery.migrationStatusBucket || flatDiscovery.migrationQueueUrl);

        if (flatDiscovery.fromCloudFormationStack || hasExistingStackResources) {
            discovery.fromCloudFormation = true;
            discovery.stackName = flatDiscovery.stackName || 'assumed-stack';

            // Add stack-managed resources
            let existingLogicalIds = flatDiscovery.existingLogicalIds || [];

            // Infer logical IDs from physical IDs if needed
            if (hasExistingStackResources && existingLogicalIds.length === 0) {
                if (flatDiscovery.migrationStatusBucket) existingLogicalIds.push('FriggMigrationStatusBucket');
                if (flatDiscovery.migrationQueueUrl) existingLogicalIds.push('DbMigrationQueue');
            }

            existingLogicalIds.forEach(logicalId => {
                let resourceType = '';
                let physicalId = '';

                if (logicalId === 'FriggMigrationStatusBucket') {
                    resourceType = 'AWS::S3::Bucket';
                    physicalId = flatDiscovery.migrationStatusBucket;
                } else if (logicalId === 'DbMigrationQueue') {
                    resourceType = 'AWS::SQS::Queue';
                    physicalId = flatDiscovery.migrationQueueUrl;
                }

                if (physicalId && typeof physicalId === 'string') {
                    discovery.stackManaged.push({
                        logicalId,
                        physicalId,
                        resourceType
                    });
                }
            });
        } else {
            // Resources discovered from AWS API (external)
            if (flatDiscovery.migrationStatusBucket && typeof flatDiscovery.migrationStatusBucket === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.migrationStatusBucket,
                    resourceType: 'AWS::S3::Bucket',
                    source: 'aws-discovery'
                });
            }

            if (flatDiscovery.migrationQueueUrl && typeof flatDiscovery.migrationQueueUrl === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.migrationQueueUrl,
                    resourceType: 'AWS::SQS::Queue',
                    source: 'aws-discovery'
                });
            }
        }

        return discovery;
    }

    /**
     * Translate legacy configuration to ownership-based configuration
     * Provides backwards compatibility
     */
    translateLegacyConfig(appDefinition, discoveredResources) {
        // If already using ownership schema, return as-is
        if (appDefinition.migration?.ownership) {
            return appDefinition;
        }

        const translated = JSON.parse(JSON.stringify(appDefinition));

        // Initialize ownership sections
        if (!translated.migration) translated.migration = {};
        if (!translated.migration.ownership) {
            translated.migration.ownership = {};
        }

        // Handle top-level managementMode
        const globalMode = appDefinition.managementMode || 'discover';
        const vpcIsolation = appDefinition.vpcIsolation || 'shared';

        if (globalMode === 'managed') {
            if (vpcIsolation === 'isolated') {
                const hasStackResources = discoveredResources?.migrationStatusBucket ||
                                         discoveredResources?.migrationQueueUrl;

                if (hasStackResources) {
                    translated.migration.ownership.bucket = 'auto';
                    translated.migration.ownership.queue = 'auto';
                    console.log(`  managementMode='managed' + vpcIsolation='isolated' → stack has migration resources, reusing`);
                } else {
                    translated.migration.ownership.bucket = 'stack';
                    translated.migration.ownership.queue = 'stack';
                    console.log(`  managementMode='managed' + vpcIsolation='isolated' → no stack migration resources, creating new`);
                }
            } else {
                translated.migration.ownership.bucket = 'auto';
                translated.migration.ownership.queue = 'auto';
                console.log(`  managementMode='managed' + vpcIsolation='shared' → discovering migration resources`);
            }
        } else {
            // Default to creating resources (current behavior)
            translated.migration.ownership.bucket = 'stack';
            translated.migration.ownership.queue = 'stack';
        }

        return translated;
    }

    /**
     * Build migration resources based on ownership decisions
     */
    async buildFromDecisions(decisions, appDefinition, discoveredResources, result) {
        // Determine if we need to create resources or use existing ones
        const shouldCreateBucket = decisions.bucket.ownership === ResourceOwnership.STACK;
        const shouldCreateQueue = decisions.queue.ownership === ResourceOwnership.STACK;

        if (shouldCreateBucket && shouldCreateQueue && !decisions.bucket.physicalId && !decisions.queue.physicalId) {
            // Create all new migration infrastructure
            console.log('  → Creating new migration infrastructure in stack');
            await this.createMigrationInfrastructure(appDefinition, result);
        } else if ((decisions.bucket.ownership === ResourceOwnership.STACK && decisions.bucket.physicalId) ||
                   (decisions.queue.ownership === ResourceOwnership.STACK && decisions.queue.physicalId)) {
            // Resources exist in stack - add definitions (CloudFormation idempotency)
            console.log('  → Adding migration definitions to template (existing in stack)');
            await this.createMigrationInfrastructure(appDefinition, result);
        } else {
            // Use external resources
            console.log('  → Using external migration resources');
            await this.useExternalMigrationResources(decisions, appDefinition, result);
        }
    }

    /**
     * Create migration infrastructure CloudFormation resources
     * Only creates S3 bucket and SQS queue - Lambda functions are defined in serverless.yml
     */
    async createMigrationInfrastructure(appDefinition, result) {

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

        // Add S3 bucket name to environment (for migration Lambda functions)
        result.environment.S3_BUCKET_NAME = { Ref: 'FriggMigrationStatusBucket' };
        result.environment.MIGRATION_STATUS_BUCKET = { Ref: 'FriggMigrationStatusBucket' };

        // Add queue URL to environment
        result.environment.DB_MIGRATION_QUEUE_URL = { Ref: 'DbMigrationQueue' };

        // Hardcode DB_TYPE for PostgreSQL-only migrations
        result.environment.DB_TYPE = 'postgresql';

        console.log('  ✓ Added S3_BUCKET_NAME, DB_MIGRATION_QUEUE_URL, and DB_TYPE environment variables');

        // Add IAM permissions for SQS (for Lambda functions)
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

        // Bucket-level permissions (list objects)
        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['s3:ListBucket'],
            Resource: { 'Fn::GetAtt': ['FriggMigrationStatusBucket', 'Arn'] },
        });

        console.log('  ✓ Added S3 IAM permissions for migration status tracking');

        // Add IAM permission for router to invoke worker Lambda
        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['lambda:InvokeFunction'],
            Resource: {
                'Fn::Sub': 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${AWS::StackName}-dbMigrationWorker',
            },
        });

        console.log('  ✓ Added Lambda invocation permissions for router → worker');
    }

    /**
     * Use external migration resources (S3 bucket and SQS queue)
     * Only references external resources - Lambda functions are defined in serverless.yml
     */
    async useExternalMigrationResources(decisions, appDefinition, result) {
        // Reference external bucket
        const bucketName = decisions.bucket.physicalId;
        if (!bucketName) {
            throw new Error('External bucket specified but no migrationStatusBucket discovered');
        }

        // Reference external queue
        const queueUrl = decisions.queue.physicalId;
        if (!queueUrl) {
            throw new Error('External queue specified but no migrationQueueUrl discovered');
        }

        console.log(`  ✓ Using external S3 bucket: ${bucketName}`);
        console.log(`  ✓ Using external SQS queue: ${queueUrl}`);

        // Extract queue ARN from queue URL for IAM permissions
        const queueArn = queueUrl.replace('https://sqs.', 'arn:aws:sqs:')
                                  .replace('.amazonaws.com/', ':')
                                  .replace(/\//g, ':');

        // Add environment variables (using external resource names/URLs)
        result.environment.S3_BUCKET_NAME = bucketName;
        result.environment.MIGRATION_STATUS_BUCKET = bucketName;
        result.environment.DB_MIGRATION_QUEUE_URL = queueUrl;
        result.environment.DB_TYPE = 'postgresql';

        console.log('  ✓ Added S3_BUCKET_NAME, DB_MIGRATION_QUEUE_URL, and DB_TYPE environment variables');

        // Add IAM permissions for external SQS queue
        result.iamStatements.push({
            Effect: 'Allow',
            Action: [
                'sqs:SendMessage',
                'sqs:GetQueueUrl',
                'sqs:GetQueueAttributes',
            ],
            Resource: queueArn,
        });

        console.log('  ✓ Added SQS IAM permissions');

        // Add IAM permissions for external S3 bucket
        const bucketArn = `arn:aws:s3:::${bucketName}`;
        result.iamStatements.push({
            Effect: 'Allow',
            Action: [
                's3:PutObject',
                's3:GetObject',
                's3:DeleteObject',
            ],
            Resource: `${bucketArn}/migrations/*`,
        });

        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['s3:ListBucket'],
            Resource: bucketArn,
        });

        console.log('  ✓ Added S3 IAM permissions for migration status tracking');

        // Add IAM permission for router to invoke worker Lambda
        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['lambda:InvokeFunction'],
            Resource: {
                'Fn::Sub': 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${AWS::StackName}-dbMigrationWorker',
            },
        });

        console.log('  ✓ Added Lambda invocation permissions for router → worker');
    }
}

module.exports = {
    MigrationBuilder,
};

