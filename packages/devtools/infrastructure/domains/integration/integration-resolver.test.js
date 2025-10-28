/**
 * Tests for IntegrationResourceResolver
 */

const IntegrationResourceResolver = require('./integration-resolver');
const { ResourceOwnership } = require('../shared/types/resource-ownership');

describe('IntegrationResourceResolver', () => {
    let resolver;

    beforeEach(() => {
        resolver = new IntegrationResourceResolver();
    });

    describe('resolveAll', () => {
        it('should resolve InternalErrorQueue and per-integration queues', () => {
            const appDef = {
                integrations: [
                    { Definition: { name: 'slack' } },
                    { Definition: { name: 'hubspot' } },
                ],
            };

            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            const decisions = resolver.resolveAll(appDef, discovery);

            expect(decisions.internalErrorQueue).toBeDefined();
            expect(decisions.internalErrorQueue.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.integrations.slack).toBeDefined();
            expect(decisions.integrations.slack.queue.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.integrations.hubspot).toBeDefined();
            expect(decisions.integrations.hubspot.queue.ownership).toBe(ResourceOwnership.STACK);
        });

        it('should skip integrations without Definition.name', () => {
            const appDef = {
                integrations: [
                    { Definition: { name: 'slack' } },
                    { Definition: {} }, // Missing name
                    { something: 'else' }, // Missing Definition
                ],
            };

            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            const decisions = resolver.resolveAll(appDef, discovery);

            expect(decisions.integrations.slack).toBeDefined();
            expect(Object.keys(decisions.integrations)).toHaveLength(1);
        });
    });

    describe('resolveInternalErrorQueue', () => {
        it('should create in stack when nothing exists (AUTO)', () => {
            const appDef = { integrations: [] };
            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            const decision = resolver.resolveInternalErrorQueue(appDef, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeNull();
            expect(decision.reason).toContain('will create in stack');
        });

        it('should use stack resource when found (AUTO)', () => {
            const appDef = { integrations: [] };
            const discovery = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: ['InternalErrorQueue'],
                stackManaged: [
                    {
                        logicalId: 'InternalErrorQueue',
                        physicalId: 'https://sqs.us-east-1.amazonaws.com/123456789/internal-error-queue',
                        type: 'AWS::SQS::Queue',
                    },
                ],
                stackResources: {
                    InternalErrorQueue: {
                        logicalId: 'InternalErrorQueue',
                        physicalId: 'https://sqs.us-east-1.amazonaws.com/123456789/internal-error-queue',
                        type: 'AWS::SQS::Queue',
                    },
                },
                external: [],
            };

            const decision = resolver.resolveInternalErrorQueue(appDef, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('https://sqs.us-east-1.amazonaws.com/123456789/internal-error-queue');
            expect(decision.reason).toContain('Found InternalErrorQueue in CloudFormation stack');
        });

        it('should respect explicit STACK ownership', () => {
            const appDef = {
                integrations: {
                    ownership: {
                        internalErrorQueue: ResourceOwnership.STACK,
                    },
                },
            };
            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            const decision = resolver.resolveInternalErrorQueue(appDef, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeNull();
        });

        it('should use external ARN when ownership=EXTERNAL', () => {
            const appDef = {
                integrations: {
                    ownership: {
                        internalErrorQueue: ResourceOwnership.EXTERNAL,
                    },
                    internalErrorQueue: {
                        arn: 'arn:aws:sqs:us-east-1:123456789:my-error-queue',
                    },
                },
            };
            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            const decision = resolver.resolveInternalErrorQueue(appDef, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('arn:aws:sqs:us-east-1:123456789:my-error-queue');
            expect(decision.reason).toContain('Using external InternalErrorQueue ARN');
        });

        it('should throw when EXTERNAL ownership but no ARN provided', () => {
            const appDef = {
                integrations: {
                    ownership: {
                        internalErrorQueue: ResourceOwnership.EXTERNAL,
                    },
                },
            };
            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            expect(() => {
                resolver.resolveInternalErrorQueue(appDef, discovery);
            }).toThrow('InternalErrorQueue configured with ownership=external');
        });
    });

    describe('resolveQueue', () => {
        it('should create in stack when nothing exists (AUTO)', () => {
            const appDef = {
                integrations: [{ Definition: { name: 'slack' } }],
            };
            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            const decision = resolver.resolveQueue('slack', appDef, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeNull();
            expect(decision.reason).toContain('will create in stack');
        });

        it('should use stack resource when found (AUTO)', () => {
            const appDef = {
                integrations: [{ Definition: { name: 'slack' } }],
            };
            const discovery = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: ['SlackQueue'],
                stackManaged: [
                    {
                        logicalId: 'SlackQueue',
                        physicalId: 'https://sqs.us-east-1.amazonaws.com/123456789/slack-queue',
                        type: 'AWS::SQS::Queue',
                    },
                ],
                stackResources: {
                    SlackQueue: {
                        logicalId: 'SlackQueue',
                        physicalId: 'https://sqs.us-east-1.amazonaws.com/123456789/slack-queue',
                        type: 'AWS::SQS::Queue',
                    },
                },
                external: [],
            };

            const decision = resolver.resolveQueue('slack', appDef, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('https://sqs.us-east-1.amazonaws.com/123456789/slack-queue');
            expect(decision.reason).toContain('Found SlackQueue in CloudFormation stack');
        });

        it('should respect per-integration STACK ownership', () => {
            const appDef = {
                integrations: [
                    {
                        Definition: { name: 'slack' },
                        ownership: { queue: ResourceOwnership.STACK },
                    },
                ],
            };
            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            const decision = resolver.resolveQueue('slack', appDef, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeNull();
        });

        it('should use external URL when ownership=EXTERNAL', () => {
            const appDef = {
                integrations: [
                    {
                        Definition: { name: 'slack' },
                        ownership: { queue: ResourceOwnership.EXTERNAL },
                        queue: { url: 'https://sqs.us-east-1.amazonaws.com/123456789/my-slack-queue' },
                    },
                ],
            };
            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            const decision = resolver.resolveQueue('slack', appDef, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('https://sqs.us-east-1.amazonaws.com/123456789/my-slack-queue');
            expect(decision.reason).toContain('Using external queue URL');
        });

        it('should throw when EXTERNAL ownership but no URL provided', () => {
            const appDef = {
                integrations: [
                    {
                        Definition: { name: 'slack' },
                        ownership: { queue: ResourceOwnership.EXTERNAL },
                    },
                ],
            };
            const discovery = {
                fromCloudFormationStack: false,
                stackName: null,
                existingLogicalIds: [],
                stackManaged: [],
                stackResources: {},
                external: [],
            };

            expect(() => {
                resolver.resolveQueue('slack', appDef, discovery);
            }).toThrow("Integration 'slack' configured with ownership=external but queue.url not provided");
        });

        it('should handle multiple integrations with different queues', () => {
            const appDef = {
                integrations: [
                    { Definition: { name: 'slack' } },
                    { Definition: { name: 'hubspot' } },
                ],
            };
            const discovery = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: ['SlackQueue'],
                stackManaged: [
                    {
                        logicalId: 'SlackQueue',
                        physicalId: 'https://sqs.us-east-1.amazonaws.com/123456789/slack-queue',
                        type: 'AWS::SQS::Queue',
                    },
                ],
                stackResources: {
                    SlackQueue: {
                        logicalId: 'SlackQueue',
                        physicalId: 'https://sqs.us-east-1.amazonaws.com/123456789/slack-queue',
                        type: 'AWS::SQS::Queue',
                    },
                },
                external: [],
            };

            const slackDecision = resolver.resolveQueue('slack', appDef, discovery);
            const hubspotDecision = resolver.resolveQueue('hubspot', appDef, discovery);

            expect(slackDecision.ownership).toBe(ResourceOwnership.STACK);
            expect(slackDecision.physicalId).toBe('https://sqs.us-east-1.amazonaws.com/123456789/slack-queue');
            expect(hubspotDecision.ownership).toBe(ResourceOwnership.STACK);
            expect(hubspotDecision.physicalId).toBeNull(); // HubspotQueue not in stack
        });
    });

    describe('capitalizeFirst', () => {
        it('should capitalize first letter', () => {
            expect(resolver.capitalizeFirst('slack')).toBe('Slack');
            expect(resolver.capitalizeFirst('hubspot')).toBe('Hubspot');
            expect(resolver.capitalizeFirst('s')).toBe('S');
        });

        it('should handle already capitalized strings', () => {
            expect(resolver.capitalizeFirst('Slack')).toBe('Slack');
        });

        it('should handle empty string', () => {
            expect(resolver.capitalizeFirst('')).toBe('');
        });
    });
});
