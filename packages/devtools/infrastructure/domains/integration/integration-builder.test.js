/**
 * Tests for Integration Builder
 * 
 * Tests integration-specific Lambda functions and SQS queues
 */

const { IntegrationBuilder } = require('./integration-builder');
const { ValidationResult } = require('../shared/base-builder');

describe('IntegrationBuilder', () => {
    let integrationBuilder;

    beforeEach(() => {
        integrationBuilder = new IntegrationBuilder();
    });

    describe('shouldExecute()', () => {
        it('should return true when integrations array has items', () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'test' } },
                ],
            };

            expect(integrationBuilder.shouldExecute(appDefinition)).toBe(true);
        });

        it('should return false when integrations array is empty', () => {
            const appDefinition = {
                integrations: [],
            };

            expect(integrationBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when integrations is not defined', () => {
            const appDefinition = {};

            expect(integrationBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when integrations is not an array', () => {
            const appDefinition = {
                integrations: { name: 'test' },
            };

            expect(integrationBuilder.shouldExecute(appDefinition)).toBe(false);
        });
    });

    describe('validate()', () => {
        it('should pass validation for valid integrations', () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'hubspot' } },
                    { Definition: { name: 'salesforce' } },
                ],
            };

            const result = integrationBuilder.validate(appDefinition);

            expect(result).toBeInstanceOf(ValidationResult);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should pass when integrations is undefined', () => {
            const appDefinition = {};

            const result = integrationBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should error when integrations is not an array', () => {
            const appDefinition = {
                integrations: 'invalid',
            };

            const result = integrationBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('integrations must be an array');
        });

        it('should error when integration is missing Definition', () => {
            const appDefinition = {
                integrations: [
                    { someOtherField: 'value' },
                ],
            };

            const result = integrationBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                'Integration at index 0 is missing Definition or name'
            );
        });

        it('should error when integration Definition is missing name', () => {
            const appDefinition = {
                integrations: [
                    { Definition: {} },
                ],
            };

            const result = integrationBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                'Integration at index 0 is missing Definition or name'
            );
        });

        it('should validate all integrations', () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'valid' } },
                    { Definition: {} }, // Invalid - no name
                    { someField: 'value' }, // Invalid - no Definition
                ],
            };

            const result = integrationBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(2);
        });
    });

    describe('build()', () => {
        it('should create HTTP handler for integration', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'hubspot' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.hubspot).toBeDefined();
            expect(result.functions.hubspot.handler).toBe(
                'node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.hubspot.handler'
            );
        });

        it('should configure HTTP API event for integration', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'salesforce' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.salesforce.events).toEqual([
                {
                    httpApi: {
                        path: '/api/salesforce-integration/{proxy+}',
                        method: 'ANY',
                    },
                },
            ]);
        });

        it('should create SQS queue for integration', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'slack' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.resources.SlackQueue).toBeDefined();
            expect(result.resources.SlackQueue.Type).toBe('AWS::SQS::Queue');
        });

        it('should configure queue with correct retention and visibility timeout', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'test' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.resources.TestQueue.Properties.MessageRetentionPeriod).toBe(345600);
            expect(result.resources.TestQueue.Properties.VisibilityTimeout).toBe(1800);
        });

        it('should configure redrive policy to internal error queue', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'test' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.resources.TestQueue.Properties.RedrivePolicy).toEqual({
                maxReceiveCount: 3,
                deadLetterTargetArn: {
                    'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                },
            });
        });

        it('should create queue worker function', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'hubspot' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.hubspotQueueWorker).toBeDefined();
        });

        it('should configure queue worker with SQS event', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'test' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.testQueueWorker.events).toEqual([
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': ['TestQueue', 'Arn'] },
                        batchSize: 1,
                        functionResponseType: 'ReportBatchItemFailures',
                    },
                },
            ]);
        });

        it('should set queue worker timeout to 600 seconds', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'test' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.testQueueWorker.timeout).toBe(900); // 15 minutes (Lambda max)
        });

        it('should set queue worker reserved concurrency', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'test' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.testQueueWorker.reservedConcurrency).toBe(5);
        });

        it('should add queue URL to environment variables', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'slack' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.environment.SLACK_QUEUE_URL).toEqual({
                Ref: 'SlackQueue',
            });
        });

        it('should add queue name to custom variables', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'stripe' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.custom.StripeQueue).toBe('${self:service}--${self:provider.stage}-StripeQueue');
        });

        it('should handle multiple integrations', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'hubspot' } },
                    { Definition: { name: 'salesforce' } },
                    { Definition: { name: 'slack' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            // Check functions
            expect(result.functions.hubspot).toBeDefined();
            expect(result.functions.salesforce).toBeDefined();
            expect(result.functions.slack).toBeDefined();
            expect(result.functions.hubspotQueueWorker).toBeDefined();
            expect(result.functions.salesforceQueueWorker).toBeDefined();
            expect(result.functions.slackQueueWorker).toBeDefined();

            // Check queues
            expect(result.resources.HubspotQueue).toBeDefined();
            expect(result.resources.SalesforceQueue).toBeDefined();
            expect(result.resources.SlackQueue).toBeDefined();

            // Check environment vars
            expect(result.environment.HUBSPOT_QUEUE_URL).toBeDefined();
            expect(result.environment.SALESFORCE_QUEUE_URL).toBeDefined();
            expect(result.environment.SLACK_QUEUE_URL).toBeDefined();
        });

        it('should capitalize integration name for queue reference', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'myIntegration' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            // Queue name should start with capital letter
            expect(result.resources.MyIntegrationQueue).toBeDefined();
        });

        it('should handle integration names with hyphens', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'my-integration' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions['my-integration']).toBeDefined();
            expect(result.functions['my-integrationQueueWorker']).toBeDefined();
        });

        // ============================================================
        // Theory-proving tests: demonstrate current dangerous config
        // These tests document the root cause of the Modern Midstay bug
        // where POST_CREATE_SETUP messages were silently lost.
        // ============================================================

        it('THEORY: MessageRetentionPeriod is too short for delayed messages', async () => {
            // POST_CREATE_SETUP uses DelaySeconds=35.
            // With MessageRetentionPeriod=60, the message is only visible
            // for 25 seconds before SQS silently deletes it.
            // Messages that expire are NOT sent to DLQ — they vanish.
            const appDefinition = {
                integrations: [{ Definition: { name: 'test' } }],
            };

            const result = await integrationBuilder.build(appDefinition, {});
            const retention = result.resources.TestQueue.Properties.MessageRetentionPeriod;

            // The max SQS DelaySeconds is 900. Retention must comfortably
            // exceed this to ensure delayed messages are never silently lost.
            // Current value (60) fails this check.
            expect(retention).toBeGreaterThan(900);
        });

        it('THEORY: maxReceiveCount=1 means zero retries on transient failures', async () => {
            // A single transient error (network blip, cold start timeout,
            // rate limit) sends the message straight to DLQ with no retry.
            const appDefinition = {
                integrations: [{ Definition: { name: 'test' } }],
            };

            const result = await integrationBuilder.build(appDefinition, {});
            const maxReceiveCount = result.resources.TestQueue.Properties.RedrivePolicy.maxReceiveCount;

            // Should allow at least 2 retries (maxReceiveCount >= 3)
            expect(maxReceiveCount).toBeGreaterThanOrEqual(3);
        });

        it('THEORY: SQS event source should enable ReportBatchItemFailures', async () => {
            // Without this, Lambda can't tell SQS which specific messages
            // failed — it's all-or-nothing for the entire invocation.
            const appDefinition = {
                integrations: [{ Definition: { name: 'test' } }],
            };

            const result = await integrationBuilder.build(appDefinition, {});
            const sqsEvent = result.functions.testQueueWorker.events[0].sqs;

            expect(sqsEvent.functionResponseType).toBe('ReportBatchItemFailures');
        });
    });

    describe('getDependencies()', () => {
        it('should have no dependencies', () => {
            const deps = integrationBuilder.getDependencies();

            expect(deps).toEqual([]);
        });
    });

    describe('getName()', () => {
        it('should return IntegrationBuilder', () => {
            expect(integrationBuilder.getName()).toBe('IntegrationBuilder');
        });
    });

    describe('Webhook Handler Configuration', () => {
        it('should create webhook handler when webhooks enabled with boolean true', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'hubspot',
                            webhooks: true,
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.hubspotWebhook).toBeDefined();
            expect(result.functions.hubspotWebhook.handler).toBe(
                'node_modules/@friggframework/core/handlers/routers/integration-webhook-routers.handlers.hubspotWebhook.handler'
            );
        });

        it('should create webhook handler when webhooks enabled with object', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'salesforce',
                            webhooks: { enabled: true },
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.salesforceWebhook).toBeDefined();
        });

        it('should NOT create webhook handler when webhooks disabled', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'slack',
                            webhooks: false,
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.slackWebhook).toBeUndefined();
        });

        it('should NOT create webhook handler when webhooks explicitly disabled in object', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'test',
                            webhooks: { enabled: false },
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.testWebhook).toBeUndefined();
        });

        it('should configure webhook with both base and ID-specific routes', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'stripe',
                            webhooks: true,
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.stripeWebhook.events).toEqual([
                {
                    httpApi: {
                        path: '/api/stripe-integration/webhooks',
                        method: 'POST',
                    },
                },
                {
                    httpApi: {
                        path: '/api/stripe-integration/webhooks/{integrationId}',
                        method: 'POST',
                    },
                },
            ]);
        });

        it('should define webhook handler BEFORE catch-all proxy route (ordering bug fix)', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'asana',
                            webhooks: true,
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            // Get the keys (function names) in the order they were added
            const functionKeys = Object.keys(result.functions);

            // Webhook handler should be defined before the main integration handler
            const webhookIndex = functionKeys.indexOf('asanaWebhook');
            const integrationIndex = functionKeys.indexOf('asana');

            expect(webhookIndex).toBeGreaterThanOrEqual(0);
            expect(integrationIndex).toBeGreaterThan(0);
            expect(webhookIndex).toBeLessThan(integrationIndex);
        });

        it('should maintain correct function order: webhook, integration, queue worker', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'test',
                            webhooks: true,
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            const functionKeys = Object.keys(result.functions);

            // Expected order: webhook, integration, queueWorker
            expect(functionKeys).toEqual([
                'testWebhook',
                'test',
                'testQueueWorker',
            ]);
        });

        it('should handle multiple integrations with mixed webhook configurations', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'hubspot',
                            webhooks: true,
                        }
                    },
                    {
                        Definition: {
                            name: 'salesforce',
                            webhooks: false,
                        }
                    },
                    {
                        Definition: {
                            name: 'slack',
                            webhooks: { enabled: true },
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            // Hubspot: webhook enabled
            expect(result.functions.hubspotWebhook).toBeDefined();
            expect(result.functions.hubspot).toBeDefined();
            expect(result.functions.hubspotQueueWorker).toBeDefined();

            // Salesforce: webhook disabled
            expect(result.functions.salesforceWebhook).toBeUndefined();
            expect(result.functions.salesforce).toBeDefined();
            expect(result.functions.salesforceQueueWorker).toBeDefined();

            // Slack: webhook enabled via object
            expect(result.functions.slackWebhook).toBeDefined();
            expect(result.functions.slack).toBeDefined();
            expect(result.functions.slackQueueWorker).toBeDefined();
        });

        it('should use skipEsbuild for webhook handlers', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'test',
                            webhooks: true,
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.testWebhook.skipEsbuild).toBe(true);
        });

        it('should apply package configuration to webhook handlers', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'test',
                            webhooks: true,
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.testWebhook.package).toBeDefined();
            expect(result.functions.testWebhook.package.exclude).toContain('node_modules/aws-sdk/**');
            expect(result.functions.testWebhook.package.exclude).toContain('node_modules/@prisma/**');
        });
    });

    describe('Prisma Layer Configuration', () => {
        it('should attach Prisma Lambda layer to queue worker functions', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'hubspot' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            // Queue workers need Prisma layer for database operations
            expect(result.functions.hubspotQueueWorker.layers).toEqual([
                { Ref: 'PrismaLambdaLayer' }
            ]);
        });

        it('should attach Prisma layer to multiple queue workers', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'hubspot' } },
                    { Definition: { name: 'salesforce' } },
                    { Definition: { name: 'slack' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.hubspotQueueWorker.layers).toEqual([
                { Ref: 'PrismaLambdaLayer' }
            ]);
            expect(result.functions.salesforceQueueWorker.layers).toEqual([
                { Ref: 'PrismaLambdaLayer' }
            ]);
            expect(result.functions.slackQueueWorker.layers).toEqual([
                { Ref: 'PrismaLambdaLayer' }
            ]);
        });

        it('should attach Prisma layer to HTTP handlers for database access', async () => {
            const appDefinition = {
                integrations: [
                    { Definition: { name: 'stripe' } },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            // HTTP handlers also need Prisma for integration queries
            expect(result.functions.stripe.layers).toEqual([
                { Ref: 'PrismaLambdaLayer' }
            ]);
        });

        it('should attach Prisma layer to webhook handlers', async () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            name: 'hubspot',
                            webhooks: true,
                        }
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            // Webhook handlers need Prisma for credential lookups
            expect(result.functions.hubspotWebhook.layers).toEqual([
                { Ref: 'PrismaLambdaLayer' }
            ]);
        });

        it('should not attach Prisma layer when usePrismaLambdaLayer=false', async () => {
            const appDefinition = {
                usePrismaLambdaLayer: false,
                integrations: [
                    {
                        Definition: {
                            name: 'asana',
                            webhooks: true,
                        },
                    },
                ],
            };

            const result = await integrationBuilder.build(appDefinition, {});

            expect(result.functions.asana.layers).toBeUndefined();
            expect(result.functions.asanaQueueWorker.layers).toBeUndefined();
            expect(result.functions.asanaWebhook.layers).toBeUndefined();
            expect(result.functions.asana.package.exclude).not.toEqual(
                expect.arrayContaining(['node_modules/@prisma/**'])
            );
        });
    });
});

