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

            expect(result.resources.TestQueue.Properties.MessageRetentionPeriod).toBe(60);
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
                maxReceiveCount: 1,
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
});

