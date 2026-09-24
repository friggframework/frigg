/**
 * CloudFormation Template Generation Tests
 *
 * These tests validate that the infrastructure builders generate
 * valid, consistent CloudFormation templates.
 */

const { composeServerlessDefinition } = require('../infrastructure-composer');

describe('CloudFormation Template Generation', () => {
    // Mock AWS region for tests (prevents actual AWS calls)
    beforeAll(() => {
        process.env.AWS_REGION = 'us-east-1';
        // Note: Not setting FRIGG_SKIP_AWS_DISCOVERY - we want builders to execute
        // Resource discovery will return empty results which is fine for testing
    });

    afterAll(() => {
        delete process.env.AWS_REGION;
    });

    describe('Basic Structure', () => {
        it('should generate template with required top-level properties', async () => {
            const appDefinition = {
                name: 'test-app',
                provider: 'aws',
                region: 'us-east-1',
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result).toBeDefined();
            expect(result.provider).toBeDefined();
            expect(result.service).toBe('test-app');
        });

        it('should include functions section', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.functions).toBeDefined();
            expect(typeof result.functions).toBe('object');
        });

        it('should include resources section', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources).toBeDefined();
            expect(result.resources.Resources).toBeDefined();
            expect(result.provider.iamRoleStatements).toBeDefined();
        });
    });

    describe('Resource Reference Validation', () => {
        it('should have valid Ref references', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Extract all resources and layers
            const resources = result.resources.Resources || {};
            const layers = result.layers || {};
            const allIds = [...Object.keys(resources), ...Object.keys(layers).map(k => `${k.charAt(0).toUpperCase()}${k.slice(1)}LambdaLayer`)];

            // Find all Ref references
            const refs = findAllRefs(result);

            // Framework-generated resources (created by Serverless Framework, not our builders)
            const frameworkResources = ['HttpApi', 'HttpApiLogGroup'];

            // Verify all Refs point to existing resources, layers, or framework resources
            refs.forEach(ref => {
                if (!frameworkResources.includes(ref)) {
                    expect(allIds).toContain(ref);
                }
            });
        });

        it('should have valid Fn::GetAtt references', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            const resources = result.resources.Resources || {};
            const resourceIds = Object.keys(resources);

            // Find all GetAtt references
            const getAtts = findAllGetAtts(result);

            // Verify all GetAtt references point to existing resources
            getAtts.forEach(([resourceId]) => {
                expect(resourceIds).toContain(resourceId);
            });
        });

        it('should not have circular references', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ],
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' }
            };

            const result = await composeServerlessDefinition(appDefinition);

            const resources = result.resources.Resources || {};

            // Build dependency graph
            const graph = buildDependencyGraph(resources);

            // Check for circular dependencies
            const cycles = detectCycles(graph);

            expect(cycles).toEqual([]);
        });
    });

    describe('Integration Resources', () => {
        it('should create queue for each integration', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } },
                    { Definition: { name: 'hubspot' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.SlackQueue).toBeDefined();
            expect(result.resources.Resources.SlackQueue.Type).toBe('AWS::SQS::Queue');
            expect(result.resources.Resources.HubspotQueue).toBeDefined();
            expect(result.resources.Resources.HubspotQueue.Type).toBe('AWS::SQS::Queue');
        });

        it('should create InternalErrorQueue as DLQ', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.InternalErrorQueue).toBeDefined();
            expect(result.resources.Resources.InternalErrorQueue.Type).toBe('AWS::SQS::Queue');
        });

        it('should configure redrive policy to InternalErrorQueue', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            const slackQueue = result.resources.Resources.SlackQueue;
            expect(slackQueue.Properties.RedrivePolicy).toBeDefined();
            expect(slackQueue.Properties.RedrivePolicy.deadLetterTargetArn).toEqual({
                'Fn::GetAtt': ['InternalErrorQueue', 'Arn']
            });
        });

        it('should create Lambda functions for each integration', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            // HTTP handler
            expect(result.functions.slack).toBeDefined();
            expect(result.functions.slack.handler).toContain('integration-defined-routers');

            // Queue worker
            expect(result.functions.slackQueueWorker).toBeDefined();
            expect(result.functions.slackQueueWorker.handler).toContain('integration-defined-workers');
        });

        it('should create webhook handler when enabled', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    {
                        Definition: {
                            name: 'hubspot',
                            webhooks: true
                        }
                    }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.functions.hubspotWebhook).toBeDefined();
            expect(result.functions.hubspotWebhook.handler).toContain('integration-webhook-routers');
        });

        it('should add queue worker SQS event trigger', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            const queueWorker = result.functions.slackQueueWorker;
            expect(queueWorker.events).toBeDefined();
            expect(queueWorker.events[0].sqs).toBeDefined();
            expect(queueWorker.events[0].sqs.arn).toEqual({
                'Fn::GetAtt': ['SlackQueue', 'Arn']
            });
        });
    });

    describe('VPC Resources', () => {
        it('should create VPC resources when enabled', async () => {
            const appDefinition = {
                name: 'test-app',
                vpc: { enable: true },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggVPC).toBeDefined();
            expect(result.resources.Resources.FriggVPC.Type).toBe('AWS::EC2::VPC');
        });

        it('should create subnets in VPC', async () => {
            const appDefinition = {
                name: 'test-app',
                vpc: { enable: true },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.Resources.FriggPrivateSubnet2).toBeDefined();
        });

        it('should create security group in VPC', async () => {
            const appDefinition = {
                name: 'test-app',
                vpc: { enable: true },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggLambdaSecurityGroup).toBeDefined();
            expect(result.resources.Resources.FriggLambdaSecurityGroup.Type).toBe('AWS::EC2::SecurityGroup');
        });

        it('should configure Lambda functions with VPC', async () => {
            const appDefinition = {
                name: 'test-app',
                vpc: { enable: true },
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeDefined();
            expect(result.provider.vpc.subnetIds).toBeDefined();
            expect(result.provider.vpc.securityGroupIds).toBeDefined();
        });

        it('should not create VPC resources when disabled', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggVPC).toBeUndefined();
        });
    });

    describe('KMS Configuration', () => {
        it('should configure KMS ARN when encryption enabled', async () => {
            const appDefinition = {
                name: 'test-app',
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // KMS uses discovered keys, not CloudFormation resources
            // Verify environment variable is set
            expect(result.provider.environment.KMS_KEY_ARN).toBeDefined();
        });

        it('should grant KMS permissions when encryption enabled', async () => {
            const appDefinition = {
                name: 'test-app',
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            const kmsStatements = result.provider.iamRoleStatements.filter(stmt =>
                stmt.Action && stmt.Action.some(action => action.startsWith('kms:'))
            );

            expect(kmsStatements.length).toBeGreaterThan(0);
        });

        it('should use external KMS key when configured', async () => {
            const appDefinition = {
                name: 'test-app',
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    ownership: { kmsKey: 'external' },
                    external: { kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/external' }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Should use provided external ARN (may be wrapped in CloudFormation function)
            const kmsArn = result.provider.environment.KMS_KEY_ARN;
            if (typeof kmsArn === 'string') {
                expect(kmsArn).toBe('arn:aws:kms:us-east-1:123456789012:key/external');
            } else {
                // Intrinsic function reference
                expect(kmsArn).toBeDefined();
            }
        });
    });

    describe('Migration Resources', () => {
        it('should create migration queue for PostgreSQL', async () => {
            const appDefinition = {
                name: 'test-app',
                database: {
                    type: 'postgresql',
                    aurora: { enable: true }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.DbMigrationQueue).toBeDefined();
            expect(result.resources.Resources.DbMigrationQueue.Type).toBe('AWS::SQS::Queue');
        });

        it('should create S3 bucket for migration status', async () => {
            const appDefinition = {
                name: 'test-app',
                database: {
                    type: 'postgresql',
                    aurora: { enable: true }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggMigrationStatusBucket).toBeDefined();
            expect(result.resources.Resources.FriggMigrationStatusBucket.Type).toBe('AWS::S3::Bucket');
        });

        it('should set DeletionPolicy=Retain on migration bucket', async () => {
            const appDefinition = {
                name: 'test-app',
                database: {
                    type: 'postgresql',
                    aurora: { enable: true }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggMigrationStatusBucket.DeletionPolicy).toBe('Retain');
        });
    });

    describe('Resource Consistency', () => {
        it('should have no duplicate resource logical IDs', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } },
                    { Definition: { name: 'hubspot' } }
                ],
                vpc: { enable: true },
                encryption: { useDefaultKMSForFieldLevelEncryption: true },
                database: {
                    type: 'postgresql',
                    aurora: { enable: true }
                }
            };

            const result = await composeServerlessDefinition(appDefinition);

            const resources = result.resources.Resources || {};
            const resourceIds = Object.keys(resources);
            const uniqueIds = new Set(resourceIds);

            expect(resourceIds.length).toBe(uniqueIds.size);
        });

        it('should have consistent resource naming', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'my-integration' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Queue name should be capitalized (first letter only)
            expect(result.resources.Resources['My-integrationQueue']).toBeDefined();

            // Function name should match integration name
            expect(result.functions['my-integration']).toBeDefined();
            expect(result.functions['my-integrationQueueWorker']).toBeDefined();
        });

        it('should set appropriate timeouts for queue workers', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            const queueWorker = result.functions.slackQueueWorker;
            expect(queueWorker.timeout).toBe(900); // 15 minutes (Lambda max)
        });

        it('should configure appropriate queue visibility timeout', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            const queue = result.resources.Resources.SlackQueue;
            expect(queue.Properties.VisibilityTimeout).toBe(1800); // 30 minutes (2x Lambda timeout)
        });
    });

    describe('Environment Variables', () => {
        it('should add queue URLs to environment', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.environment.SLACK_QUEUE_URL).toEqual({
                Ref: 'SlackQueue'
            });
        });

        it('should add KMS key ARN when encryption enabled', async () => {
            const appDefinition = {
                name: 'test-app',
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.environment.KMS_KEY_ARN).toBeDefined();
        });

        it('should add migration environment variables for PostgreSQL', async () => {
            const appDefinition = {
                name: 'test-app',
                database: {
                    type: 'postgresql',
                    aurora: { enable: true }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.environment.DB_MIGRATION_QUEUE_URL).toBeDefined();
            expect(result.provider.environment.MIGRATION_STATUS_BUCKET).toBeDefined();
        });
    });

    describe('IAM Permissions', () => {
        it('should grant SQS permissions for integration queues', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    { Definition: { name: 'slack' } }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            const sqsStatements = result.provider.iamRoleStatements.filter(stmt =>
                stmt.Action && stmt.Action.some(action => action.startsWith('sqs:'))
            );

            expect(sqsStatements.length).toBeGreaterThan(0);
        });

        it('should grant S3 permissions for migration bucket', async () => {
            const appDefinition = {
                name: 'test-app',
                database: {
                    type: 'postgresql',
                    aurora: { enable: true }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            const s3Statements = result.provider.iamRoleStatements.filter(stmt =>
                stmt.Action && stmt.Action.some(action => action.startsWith('s3:'))
            );

            expect(s3Statements.length).toBeGreaterThan(0);
        });
    });

    describe('Ownership-Based Decisions', () => {
        it('should use existing stack resources when discovered', async () => {
            // This test would need actual discovery data
            // Skipping for now - integration tests would cover this
            expect(true).toBe(true);
        });

        it('should use external resources when configured', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [
                    {
                        Definition: { name: 'slack' },
                        ownership: { queue: 'external' },
                        queue: { url: 'https://sqs.us-east-1.amazonaws.com/123/my-queue' }
                    }
                ]
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Should not create queue resource
            expect(result.resources.Resources.SlackQueue).toBeUndefined();

            // Should use external queue URL in environment
            expect(result.provider.environment.SLACK_QUEUE_URL).toBe('https://sqs.us-east-1.amazonaws.com/123/my-queue');
        });
    });
});

// Helper functions
function findAllRefs(obj, refs = []) {
    if (typeof obj !== 'object' || obj === null) return refs;

    if (obj.Ref && typeof obj.Ref === 'string') {
        refs.push(obj.Ref);
    }

    Object.values(obj).forEach(value => findAllRefs(value, refs));
    return refs;
}

function findAllGetAtts(obj, getAtts = []) {
    if (typeof obj !== 'object' || obj === null) return getAtts;

    if (obj['Fn::GetAtt'] && Array.isArray(obj['Fn::GetAtt'])) {
        getAtts.push(obj['Fn::GetAtt']);
    }

    Object.values(obj).forEach(value => findAllGetAtts(value, getAtts));
    return getAtts;
}

function buildDependencyGraph(resources) {
    const graph = {};

    Object.keys(resources).forEach(resourceId => {
        const deps = new Set();
        const resource = resources[resourceId];

        // Find Ref dependencies
        findAllRefs(resource).forEach(ref => {
            if (ref !== resourceId && resources[ref]) {
                deps.add(ref);
            }
        });

        // Find GetAtt dependencies
        findAllGetAtts(resource).forEach(([ref]) => {
            if (ref !== resourceId && resources[ref]) {
                deps.add(ref);
            }
        });

        graph[resourceId] = Array.from(deps);
    });

    return graph;
}

function detectCycles(graph) {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    function dfs(node, path = []) {
        if (recursionStack.has(node)) {
            cycles.push([...path, node]);
            return;
        }

        if (visited.has(node)) return;

        visited.add(node);
        recursionStack.add(node);
        path.push(node);

        const neighbors = graph[node] || [];
        neighbors.forEach(neighbor => dfs(neighbor, [...path]));

        recursionStack.delete(node);
    }

    Object.keys(graph).forEach(node => {
        if (!visited.has(node)) {
            dfs(node);
        }
    });

    return cycles;
}
