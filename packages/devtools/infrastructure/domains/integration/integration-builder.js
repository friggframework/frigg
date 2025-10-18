/**
 * Integration Builder
 * 
 * Domain Layer - Hexagonal Architecture
 * 
 * Responsible for:
 * - Creating SQS queues for each integration
 * - Creating queue worker Lambda functions
 * - Creating webhook handler functions
 * - Configuring integration-specific routes and handlers
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');

class IntegrationBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'IntegrationBuilder';
    }

    shouldExecute(appDefinition) {
        return Array.isArray(appDefinition.integrations) && appDefinition.integrations.length > 0;
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
                result.addError(`Integration at index ${index} is missing Definition or name`);
            }
        });

        return result;
    }

    /**
     * Build integration infrastructure
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring integrations...`);
        console.log(`  Processing ${appDefinition.integrations.length} integrations...`);

        const result = {
            functions: {},
            resources: {},
            environment: {},
            custom: {},
        };

        const functionPackageConfig = {
            exclude: [
                'node_modules/aws-sdk/**',
                'node_modules/@aws-sdk/**',
                'node_modules/@prisma/**',
                'node_modules/.prisma/**',
                'node_modules/prisma/**',
                'node_modules/@friggframework/core/generated/**',

                // Exclude development/test files
                'coverage/**',
                'test/**',
                'src/**',
                'layers/**',
                '**/*.test.js',
                '**/*.spec.js',
            ],
        };

        for (const integration of appDefinition.integrations) {
            const integrationName = integration.Definition.name;
            const queueReference = `${integrationName.charAt(0).toUpperCase() + integrationName.slice(1)}Queue`;
            const queueName = `\${self:service}--\${self:provider.stage}-${queueReference}`;

            console.log(`    Adding integration: ${integrationName}`);

            // Create HTTP API handler for integration
            result.functions[integrationName] = {
                handler: `node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.${integrationName}.handler`,
                skipEsbuild: true,  // Nested exports in node_modules - skip esbuild bundling
                package: functionPackageConfig,
                events: [
                    {
                        httpApi: {
                            path: `/api/${integrationName}-integration/{proxy+}`,
                            method: 'ANY',
                        },
                    },
                ],
            };

            // Create SQS Queue for integration
            result.resources[queueReference] = {
                Type: 'AWS::SQS::Queue',
                Properties: {
                    QueueName: `\${self:custom.${queueReference}}`,
                    MessageRetentionPeriod: 60,
                    VisibilityTimeout: 1800,
                    RedrivePolicy: {
                        maxReceiveCount: 1,
                        deadLetterTargetArn: {
                            'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                        },
                    },
                },
            };

            // Create Queue Worker function
            const queueWorkerName = `${integrationName}QueueWorker`;
            result.functions[queueWorkerName] = {
                handler: `node_modules/@friggframework/core/handlers/workers/integration-defined-workers.handlers.${integrationName}.queueWorker`,
                skipEsbuild: true,  // Nested exports in node_modules - skip esbuild bundling
                package: functionPackageConfig,
                reservedConcurrency: 5,
                events: [
                    {
                        sqs: {
                            arn: { 'Fn::GetAtt': [queueReference, 'Arn'] },
                            batchSize: 1,
                        },
                    },
                ],
                timeout: 900,  // 15 minutes max for queue workers (Lambda maximum)
            };

            // Add queue URL to environment
            result.environment[`${integrationName.toUpperCase()}_QUEUE_URL`] = {
                Ref: queueReference,
            };

            result.custom[queueReference] = queueName;

            // Add webhook handler if enabled
            const webhookConfig = integration.Definition.webhooks;
            if (webhookConfig && (webhookConfig === true || webhookConfig.enabled === true)) {
                const webhookFunctionName = `${integrationName}Webhook`;

                result.functions[webhookFunctionName] = {
                    handler: `node_modules/@friggframework/core/handlers/routers/integration-webhook-routers.handlers.${integrationName}Webhook.handler`,
                    skipEsbuild: true,  // Nested exports in node_modules - skip esbuild bundling
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
                console.log(`      + Webhook handler enabled`);
            }
        }

        console.log(`  ✅ Configured ${appDefinition.integrations.length} integrations`);
        console.log(`[${this.name}] ✅ Integration configuration completed`);

        return result;
    }
}

module.exports = { IntegrationBuilder };

