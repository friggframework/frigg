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
const {
    isScopedEnvironmentActive,
    getIntegrationFunctionNames,
    getAdminFunctionNames,
} = require('../shared/function-environments');

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
                    appDefinition
                );
            } else {
                console.log(`      ✓ Using external ${integrationName}Queue`);
                this.useExternalIntegrationQueue(
                    integrationName,
                    queueDecision,
                    result,
                    appDefinition
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

        // Create HTTP API handler for integration (catch-all route AFTER
        // webhooks). Extension routes get their own functions below.
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

        // One serverless function per extension binding, namespaced under
        // /{bindingKey}. Prisma layer attached only when useDatabase is true.
        const sanitizeBindingKey = (name) =>
            String(name).replace(/[^A-Za-z0-9]/g, '');
        const extensionEntries = Object.entries(
            integration.Definition.extensions || {}
        );
        for (const [bindingKey, binding] of extensionEntries) {
            const extension = binding && binding.extension;
            const routes = (extension && extension.routes) || [];
            if (routes.length === 0) continue;
            const useDatabase =
                binding.useDatabase ??
                (extension && extension.useDatabase) ??
                false;
            // Wire contract: core's integration-defined-routers derives the
            // identical handler key. Keep both in sync.
            const fnName = `${integrationName}__${sanitizeBindingKey(
                bindingKey
            )}`;
            // Distinct binding keys can sanitize to the same fnName — fail loud rather than overwrite.
            if (
                Object.prototype.hasOwnProperty.call(result.functions, fnName)
            ) {
                throw new Error(
                    `Integration "${integrationName}" extension function conflict: ` +
                        `binding "${bindingKey}" sanitizes to "${fnName}", which is already taken. ` +
                        `Use binding keys that are distinct after stripping non-alphanumeric characters.`
                );
            }
            result.functions[fnName] = {
                handler: `node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.${fnName}.handler`,
                skipEsbuild: true,
                package: functionPackageConfig,
                ...(usePrismaLayer &&
                    useDatabase && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
                events: routes.map((route) => ({
                    httpApi: {
                        path: `/api/${integrationName}-integration/${bindingKey}${route.path}`,
                        method: route.method,
                    },
                })),
            };
            console.log(
                `      ✓ Extension handler function defined: ${fnName} (useDatabase: ${useDatabase})`
            );
        }

        // Create Queue Worker function
        const queueWorkerName = `${integrationName}QueueWorker`;
        result.functions[queueWorkerName] = {
            handler: `node_modules/@friggframework/core/handlers/workers/integration-defined-workers.handlers.${integrationName}.queueWorker`,
            skipEsbuild: true, // Nested exports in node_modules - skip esbuild bundling
            package: functionPackageConfig,
            ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }), // Queue workers need Prisma for database operations
            reservedConcurrency: 20,
            events: [
                {
                    sqs: {
                        arn: {
                            'Fn::GetAtt': [
                                `${this.capitalizeFirst(integrationName)}Queue`,
                                'Arn',
                            ],
                        },
                        batchSize: 1,
                        functionResponseType: 'ReportBatchItemFailures',
                    },
                },
            ],
            timeout: 900, // 15 minutes max for queue workers (Lambda maximum)
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
    createIntegrationQueue(integrationName, result, appDefinition) {
        const queueReference = `${this.capitalizeFirst(integrationName)}Queue`;
        const queueName = `\${self:service}--\${self:provider.stage}-${queueReference}`;

        result.resources[queueReference] = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: `\${self:custom.${queueReference}}`,
                MessageRetentionPeriod: 345600, // 4 days (SQS default)
                VisibilityTimeout: 1800,
                RedrivePolicy: {
                    maxReceiveCount: 3,
                    deadLetterTargetArn: {
                        'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                    },
                },
            },
        };

        // Add queue URL to environment
        this.setQueueUrlEnvironment(
            integrationName,
            { Ref: queueReference },
            result,
            appDefinition
        );

        // Add queue name to custom section
        result.custom[queueReference] = queueName;

        console.log(`  ✓ Created ${queueReference} resource`);
    }

    /**
     * Use external integration queue
     */
    useExternalIntegrationQueue(
        integrationName,
        decision,
        result,
        appDefinition
    ) {
        // Add queue URL to environment for Lambda functions
        this.setQueueUrlEnvironment(
            integrationName,
            decision.physicalId,
            result,
            appDefinition
        );

        console.log(`  ✓ Using external queue: ${decision.physicalId}`);
    }

    /**
     * Broadcast the queue URL app-wide, or — with lambda.scopedEnvironment —
     * scope it to the functions that can actually enqueue: the shared auth
     * router (dispatches integration actions synchronously), the admin-script
     * functions (instantiate arbitrary integrations), and the owning
     * integration's own functions.
     */
    setQueueUrlEnvironment(integrationName, value, result, appDefinition) {
        const key = `${integrationName.toUpperCase()}_QUEUE_URL`;

        if (!isScopedEnvironmentActive(appDefinition)) {
            result.environment[key] = value;
            return;
        }

        const integration = appDefinition.integrations.find(
            (entry) => entry.Definition.name === integrationName
        );
        const targets = [
            'auth',
            ...getAdminFunctionNames(appDefinition),
            ...getIntegrationFunctionNames(integration),
        ];

        result.functionEnvironments = result.functionEnvironments || {};
        for (const fnName of targets) {
            result.functionEnvironments[fnName] = {
                ...result.functionEnvironments[fnName],
                [key]: value,
            };
        }
        console.log(`  ✓ Scoped ${key} to: ${targets.join(', ')}`);
    }

    /**
     * Capitalize first letter of string (e.g., 'slack' -> 'Slack')
     */
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

module.exports = { IntegrationBuilder };
