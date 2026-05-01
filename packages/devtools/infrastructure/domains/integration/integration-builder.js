/**
 * Integration Builder
 *
 * Domain Layer - Hexagonal Architecture
 *
 * Responsible for:
 * - Creating SQS queues for each integration (CloudFormation resources)
 * - Creating InternalErrorQueue (dead letter queue)
 * - Creating Lambda function definitions (serverless template code)
 * - Creating queue worker Lambda functions
 * - Creating webhook handler functions
 * - Configuring integration-specific routes and handlers
 *
 * Uses ownership-based architecture to support both stack-managed
 * and externally-provided SQS queues.
 */

const {
    InfrastructureBuilder,
    ValidationResult,
} = require('../shared/base-builder');
const IntegrationResourceResolver = require('./integration-resolver');
const {
    createEmptyDiscoveryResult,
    ResourceOwnership,
} = require('../shared/types');

/**
 * Bounds-check Definition.queue knobs against AWS SQS limits.
 * Throws on out-of-range values so we fail at template-generation time
 * instead of waiting for an opaque CloudFormation rejection.
 */
function validateQueueConfig(integrationName, queueConfig) {
    const inRange = (val, min, max) =>
        val === undefined || (Number.isFinite(val) && val >= min && val <= max);
    const checks = [
        ['visibilityTimeout', queueConfig.visibilityTimeout, 0, 43200],
        ['messageRetentionPeriod', queueConfig.messageRetentionPeriod, 60, 1209600],
        ['maxReceiveCount', queueConfig.maxReceiveCount, 1, 1000],
    ];
    for (const [key, val, min, max] of checks) {
        if (!inRange(val, min, max)) {
            throw new Error(
                `Integration '${integrationName}': queue.${key}=${val} is out of range [${min}, ${max}]`
            );
        }
    }
}

/**
 * Bounds-check Definition.queue.worker knobs against the serverless
 * framework + AWS Lambda+SQS limits. Mirrors osls's own input schema.
 */
function validateWorkerConfig(integrationName, workerConfig) {
    const inRange = (val, min, max) =>
        val === undefined || (Number.isFinite(val) && val >= min && val <= max);
    const checks = [
        ['batchSize', workerConfig.batchSize, 1, 10000],
        ['maximumBatchingWindow', workerConfig.maximumBatchingWindow, 0, 300],
        ['maximumConcurrency', workerConfig.maximumConcurrency, 2, 1000],
        ['reservedConcurrency', workerConfig.reservedConcurrency, 0, 1000],
        ['timeout', workerConfig.timeout, 1, 900],
    ];
    for (const [key, val, min, max] of checks) {
        if (!inRange(val, min, max)) {
            throw new Error(
                `Integration '${integrationName}': queue.worker.${key}=${val} is out of range [${min}, ${max}]`
            );
        }
    }
}

class IntegrationBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'IntegrationBuilder';
    }

    shouldExecute(appDefinition) {
        return (
            Array.isArray(appDefinition.integrations) &&
            appDefinition.integrations.length > 0
        );
    }

    getDependencies() {
        return []; // No dependencies - integrations can run independently
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        if (!appDefinition.integrations) {
            return result; // Not an error, just no integrations
        }

        if (!Array.isArray(appDefinition.integrations)) {
            result.addError('integrations must be an array');
            return result;
        }

        // Validate each integration
        appDefinition.integrations.forEach((integration, index) => {
            if (!integration?.Definition?.name) {
                result.addError(
                    `Integration at index ${index} is missing Definition or name`
                );
            }
        });

        return result;
    }

    /**
     * Build integration infrastructure using ownership-based architecture
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring integrations...`);
        console.log(
            `  Processing ${appDefinition.integrations.length} integrations...`
        );

        const usePrismaLayer = appDefinition.usePrismaLambdaLayer !== false;

        const result = {
            functions: {},
            resources: {},
            environment: {},
            custom: {},
            iamStatements: [],
        };

        // Get structured discovery result
        const discovery =
            discoveredResources._structured ||
            this.convertFlatDiscoveryToStructured(discoveredResources);

        // Use IntegrationResourceResolver to make ownership decisions
        const resolver = new IntegrationResourceResolver();
        const decisions = resolver.resolveAll(appDefinition, discovery);

        console.log('\n  📋 Resource Ownership Decisions:');
        console.log(
            `     InternalErrorQueue: ${decisions.internalErrorQueue.ownership} - ${decisions.internalErrorQueue.reason}`
        );

        // Log per-integration decisions
        Object.keys(decisions.integrations).forEach((integrationName) => {
            const queueDecision = decisions.integrations[integrationName].queue;
            console.log(
                `     ${integrationName}Queue: ${queueDecision.ownership} - ${queueDecision.reason}`
            );
        });

        // Build resources based on ownership decisions
        await this.buildFromDecisions(
            decisions,
            appDefinition,
            result,
            usePrismaLayer
        );

        console.log(`[${this.name}] ✅ Integration configuration completed`);
        return result;
    }

    /**
     * Convert flat discovery to structured discovery
     * Provides backwards compatibility
     */
    convertFlatDiscoveryToStructured(flatDiscovery) {
        const discovery = createEmptyDiscoveryResult();

        if (!flatDiscovery) {
            return discovery;
        }

        // Check if resources are from CloudFormation stack
        if (flatDiscovery.fromCloudFormationStack) {
            discovery.fromCloudFormation = true;
            discovery.stackName = flatDiscovery.stackName || 'assumed-stack';

            // Add stack-managed resources from existingLogicalIds
            const existingLogicalIds = flatDiscovery.existingLogicalIds || [];
            existingLogicalIds.forEach((logicalId) => {
                let resourceType = '';
                let physicalId = '';

                // Determine resource type and physical ID
                if (logicalId === 'InternalErrorQueue') {
                    resourceType = 'AWS::SQS::Queue';
                    physicalId = flatDiscovery.internalErrorQueueUrl;
                } else if (logicalId.endsWith('Queue')) {
                    // Integration-specific queue (e.g., SlackQueue, HubspotQueue)
                    resourceType = 'AWS::SQS::Queue';
                    const integrationName = logicalId
                        .replace('Queue', '')
                        .toLowerCase();
                    physicalId = flatDiscovery[`${integrationName}QueueUrl`];
                }

                if (physicalId && typeof physicalId === 'string') {
                    discovery.stackManaged.push({
                        logicalId,
                        physicalId,
                        resourceType,
                    });
                }
            });
        }

        return discovery;
    }

    /**
     * Build integration resources based on ownership decisions
     */
    async buildFromDecisions(
        decisions,
        appDefinition,
        result,
        usePrismaLayer = true
    ) {
        // Create package config first — needed by all Lambda functions including DLQ processor
        const functionPackageConfig =
            this.createFunctionPackageConfig(usePrismaLayer);

        // Create InternalErrorQueue if ownership = STACK
        const shouldCreateInternalErrorQueue =
            decisions.internalErrorQueue.ownership === ResourceOwnership.STACK;

        if (shouldCreateInternalErrorQueue) {
            console.log('  → Creating InternalErrorQueue in stack');
            this.createInternalErrorQueue(result, functionPackageConfig);
        } else {
            console.log('  → Using external InternalErrorQueue');
            this.useExternalInternalErrorQueue(
                decisions.internalErrorQueue,
                result,
                functionPackageConfig
            );
        }

        for (const integration of appDefinition.integrations) {
            const integrationName = integration.Definition.name;
            const queueDecision = decisions.integrations[integrationName].queue;

            console.log(`\n    Adding integration: ${integrationName}`);

            // Create Lambda function definitions (serverless template code)
            await this.createFunctionDefinitions(
                integration,
                functionPackageConfig,
                result,
                usePrismaLayer
            );

            // Create or reference SQS queue based on ownership decision
            const shouldCreateQueue =
                queueDecision.ownership === ResourceOwnership.STACK;

            if (shouldCreateQueue) {
                console.log(
                    `      ✓ Creating ${integrationName}Queue in stack`
                );
                this.createIntegrationQueue(
                    integrationName,
                    result,
                    integration.Definition.queue
                );
            } else {
                console.log(`      ✓ Using external ${integrationName}Queue`);
                this.useExternalIntegrationQueue(
                    integrationName,
                    queueDecision,
                    result
                );
            }
        }
    }

    /**
     * Create function package exclusion configuration
     */
    createFunctionPackageConfig(usePrismaLayer = true) {
        return {
            exclude: [
                // Exclude AWS SDK (provided by Lambda runtime)
                'node_modules/aws-sdk/**',
                'node_modules/@aws-sdk/**',

                // Exclude Prisma (provided via Lambda Layer)
                ...(usePrismaLayer
                    ? [
                          'node_modules/@prisma/**',
                          'node_modules/.prisma/**',
                          'node_modules/prisma/**',
                          'node_modules/@friggframework/core/generated/**',
                      ]
                    : []),

                // Exclude ALL nested node_modules
                'node_modules/**/node_modules/**',

                // Exclude build tools (not needed at runtime)
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
                // Note: DO NOT exclude serverless-http - it's a runtime dependency!

                // Exclude dev/test dependencies
                'node_modules/@friggframework/test/**',
                'node_modules/@friggframework/eslint-config/**',
                'node_modules/@friggframework/prettier-config/**',
                'node_modules/jest/**',
                'node_modules/prettier/**',
                'node_modules/eslint/**',

                // Exclude local dev files
                'deploy.log',
                '.env.backup',
                'docker-compose.yml',
                'jest.config.js',
                'jest.unit.config.js',
                '.eslintrc.json',
                '.prettierrc',
                '.prettierignore',
                '.markdownlintignore',
                'package-lock.json',

                // Exclude development/test files (keep src/ - needed for integrations and api-modules)
                'coverage/**',
                'test/**',
                'layers/**',
                // Note: DO NOT exclude src/** - handlers need src/integrations and src/api-modules at runtime
                '**/*.test.js',
                '**/*.spec.js',
                '**/.claude-flow/**',
                '**/.swarm/**',
            ],
        };
    }

    /**
     * Create Lambda function definitions for an integration
     * These are serverless framework template function definitions
     */
    async createFunctionDefinitions(
        integration,
        functionPackageConfig,
        result,
        usePrismaLayer = true
    ) {
        const integrationName = integration.Definition.name;

        // Add webhook handler if enabled (BEFORE catch-all proxy route)
        // CRITICAL: Webhook routes must be defined before the catch-all {proxy+} route
        // to ensure proper route matching in AWS API Gateway/HTTP API
        const webhookConfig = integration.Definition.webhooks;
        if (
            webhookConfig &&
            (webhookConfig === true || webhookConfig.enabled === true)
        ) {
            const webhookFunctionName = `${integrationName}Webhook`;

            result.functions[webhookFunctionName] = {
                handler: `node_modules/@friggframework/core/handlers/routers/integration-webhook-routers.handlers.${integrationName}Webhook.handler`,
                skipEsbuild: true, // Nested exports in node_modules - skip esbuild bundling
                package: functionPackageConfig,
                ...(usePrismaLayer && {
                    layers: [{ Ref: 'PrismaLambdaLayer' }],
                }), // Webhook handlers need Prisma for credential lookups
                events: [
                    {
                        httpApi: {
                            path: `/api/${integrationName}-integration/webhooks`,
                            method: 'POST',
                        },
                    },
                    {
                        httpApi: {
                            path: `/api/${integrationName}-integration/webhooks/{integrationId}`,
                            method: 'POST',
                        },
                    },
                ],
            };
            console.log(`      ✓ Webhook handler function defined`);
        }

        // Create HTTP API handler for integration (catch-all route AFTER webhooks)
        result.functions[integrationName] = {
            handler: `node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.${integrationName}.handler`,
            skipEsbuild: true, // Nested exports in node_modules - skip esbuild bundling
            package: functionPackageConfig,
            ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }), // HTTP handlers need Prisma for integration queries
            events: [
                {
                    httpApi: {
                        path: `/api/${integrationName}-integration/{proxy+}`,
                        method: 'ANY',
                    },
                },
            ],
        };
        console.log(`      ✓ HTTP handler function defined`);

        // Create Queue Worker function
        const queueWorkerName = `${integrationName}QueueWorker`;
        const workerConfig = integration.Definition.queue?.worker || {};
        validateWorkerConfig(integrationName, workerConfig);
        const sqsEvent = {
            arn: {
                'Fn::GetAtt': [
                    `${this.capitalizeFirst(integrationName)}Queue`,
                    'Arn',
                ],
            },
            batchSize: workerConfig.batchSize ?? 1,
            functionResponseType: 'ReportBatchItemFailures',
        };
        // The serverless framework SQS event accepts `maximumBatchingWindow`
        // (not `...InSeconds` — that's the AWS-side CFN property name). osls
        // and serverless@3+ both reject the longer key with a schema error.
        if (workerConfig.maximumBatchingWindow !== undefined) {
            sqsEvent.maximumBatchingWindow =
                workerConfig.maximumBatchingWindow;
        }
        if (workerConfig.maximumConcurrency !== undefined) {
            sqsEvent.maximumConcurrency = workerConfig.maximumConcurrency;
        }
        result.functions[queueWorkerName] = {
            handler: `node_modules/@friggframework/core/handlers/workers/integration-defined-workers.handlers.${integrationName}.queueWorker`,
            skipEsbuild: true, // Nested exports in node_modules - skip esbuild bundling
            package: functionPackageConfig,
            ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }), // Queue workers need Prisma for database operations
            reservedConcurrency: workerConfig.reservedConcurrency ?? 20,
            events: [{ sqs: sqsEvent }],
            timeout: workerConfig.timeout ?? 900, // 15 minutes max for queue workers (Lambda maximum)
        };
        console.log(`      ✓ Queue worker function defined`);
    }

    /**
     * Create InternalErrorQueue CloudFormation resource
     */
    createInternalErrorQueue(result, functionPackageConfig) {
        const queueName =
            '${self:service}-${self:provider.stage}-InternalErrorQueue';

        result.custom.InternalErrorQueue = queueName;

        result.resources.InternalErrorQueue = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: '${self:custom.InternalErrorQueue}',
                MessageRetentionPeriod: 1209600, // 14 days
                VisibilityTimeout: 300, // 5 minutes — must be >= 6x DLQ processor Lambda timeout (30s × 6 = 180s)
            },
        };

        this.createDLQObservability(
            result,
            functionPackageConfig,
            {
                'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
            },
            {
                'Fn::GetAtt': ['InternalErrorQueue', 'QueueName'],
            }
        );

        console.log('  ✓ Created InternalErrorQueue resource');
    }

    /**
     * Use external InternalErrorQueue
     */
    useExternalInternalErrorQueue(decision, result, functionPackageConfig) {
        // Add ARN to environment for Lambda functions
        result.environment.INTERNAL_ERROR_QUEUE_ARN = decision.physicalId;

        // Extract queue name from ARN for CloudWatch dimensions
        const arnParts = decision.physicalId.split(':');
        const queueName = arnParts[arnParts.length - 1];

        this.createDLQObservability(
            result,
            functionPackageConfig,
            decision.physicalId,
            queueName
        );

        console.log(
            `  ✓ Using external InternalErrorQueue: ${decision.physicalId}`
        );
    }

    /**
     * Create DLQ observability resources (alarm + processor Lambda).
     * Called for both stack-owned and external InternalErrorQueues.
     */
    createDLQObservability(result, functionPackageConfig, queueArn, queueName) {
        // CloudWatch Alarm: fires when any message lands in the DLQ
        result.resources.DLQMessageAlarm = {
            Type: 'AWS::CloudWatch::Alarm',
            Properties: {
                AlarmDescription:
                    'Messages in dead-letter queue — integration queue processing failures',
                Namespace: 'AWS/SQS',
                MetricName: 'ApproximateNumberOfMessagesVisible',
                Statistic: 'Maximum',
                Threshold: 500,
                ComparisonOperator: 'GreaterThanThreshold',
                EvaluationPeriods: 1,
                Period: 300,
                AlarmActions: [{ Ref: 'InternalErrorBridgeTopic' }],
                Dimensions: [{ Name: 'QueueName', Value: queueName }],
            },
        };

        // DLQ processor Lambda: logs failed messages with structured context
        result.functions.dlqProcessor = {
            handler:
                'node_modules/@friggframework/core/handlers/workers/dlq-processor.dlqProcessor',
            skipEsbuild: true,
            package: functionPackageConfig,
            reservedConcurrency: 1,
            timeout: 30,
            events: [
                {
                    sqs: {
                        arn: queueArn,
                        batchSize: 10,
                        functionResponseType: 'ReportBatchItemFailures',
                    },
                },
            ],
        };

        console.log('  ✓ Created DLQ CloudWatch alarm');
        console.log('  ✓ Created DLQ processor Lambda');
    }

    /**
     * Create integration-specific SQS queue CloudFormation resource
     */
    createIntegrationQueue(integrationName, result, queueConfig = {}) {
        validateQueueConfig(integrationName, queueConfig);
        const queueReference = `${this.capitalizeFirst(integrationName)}Queue`;
        const queueName = `\${self:service}--\${self:provider.stage}-${queueReference}`;

        result.resources[queueReference] = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: `\${self:custom.${queueReference}}`,
                MessageRetentionPeriod:
                    queueConfig.messageRetentionPeriod ?? 345600, // 4 days (SQS default)
                VisibilityTimeout: queueConfig.visibilityTimeout ?? 1800,
                RedrivePolicy: {
                    maxReceiveCount: queueConfig.maxReceiveCount ?? 3,
                    deadLetterTargetArn: {
                        'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                    },
                },
            },
        };

        // Add queue URL to environment
        result.environment[`${integrationName.toUpperCase()}_QUEUE_URL`] = {
            Ref: queueReference,
        };

        // Add queue name to custom section
        result.custom[queueReference] = queueName;

        console.log(`  ✓ Created ${queueReference} resource`);
    }

    /**
     * Use external integration queue
     */
    useExternalIntegrationQueue(integrationName, decision, result) {
        // Add queue URL to environment for Lambda functions
        result.environment[`${integrationName.toUpperCase()}_QUEUE_URL`] =
            decision.physicalId;

        console.log(`  ✓ Using external queue: ${decision.physicalId}`);
    }

    /**
     * Capitalize first letter of string (e.g., 'slack' -> 'Slack')
     */
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

module.exports = { IntegrationBuilder };
