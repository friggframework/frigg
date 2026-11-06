const { MigrationResourceResolver } = require('./migration-resolver');
const { ResourceOwnership, createEmptyDiscoveryResult } = require('../shared/types');

describe('MigrationResourceResolver', () => {
    let resolver;

    beforeEach(() => {
        resolver = new MigrationResourceResolver();
    });

    describe('resolveBucket', () => {
        describe('Explicit ownership intent', () => {
            it('should respect ownership.bucket=stack when specified', () => {
                const appDefinition = {
                    migration: {
                        ownership: { bucket: 'stack' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                const decision = resolver.resolveBucket(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBeNull();
                expect(decision.reason).toContain('Will create FriggMigrationStatusBucket in stack');
            });

            it('should respect ownership.bucket=external when bucket discovered', () => {
                const appDefinition = {
                    migration: {
                        ownership: { bucket: 'external' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();
                discovery.external.push({
                    physicalId: 'my-migration-bucket',
                    resourceType: 'AWS::S3::Bucket',
                    source: 'aws-discovery'
                });

                const decision = resolver.resolveBucket(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
                expect(decision.physicalId).toBe('my-migration-bucket');
                expect(decision.reason).toContain('external');
            });

            it('should error when ownership.bucket=external but no bucket discovered', () => {
                const appDefinition = {
                    migration: {
                        ownership: { bucket: 'external' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                expect(() => resolver.resolveBucket(appDefinition, discovery))
                    .toThrow('ownership.bucket=external but no S3 bucket discovered');
            });
        });

        describe('Auto resolution (ownership.bucket=auto)', () => {
            it('should use stack bucket when found in CloudFormation', () => {
                const appDefinition = {
                    migration: {
                        ownership: { bucket: 'auto' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();
                discovery.fromCloudFormation = true;
                discovery.stackManaged.push({
                    logicalId: 'FriggMigrationStatusBucket',
                    physicalId: 'stack-migration-bucket',
                    resourceType: 'AWS::S3::Bucket'
                });

                const decision = resolver.resolveBucket(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBe('stack-migration-bucket');
                expect(decision.reason).toContain('Found FriggMigrationStatusBucket in CloudFormation stack');
            });

            it('should use external bucket when found via discovery', () => {
                const appDefinition = {
                    migration: {
                        ownership: { bucket: 'auto' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();
                discovery.external.push({
                    physicalId: 'external-migration-bucket',
                    resourceType: 'AWS::S3::Bucket',
                    source: 'aws-discovery'
                });

                const decision = resolver.resolveBucket(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
                expect(decision.physicalId).toBe('external-migration-bucket');
                expect(decision.reason).toContain('Found external S3 bucket via discovery');
            });

            it('should create new bucket when none found', () => {
                const appDefinition = {
                    migration: {
                        ownership: { bucket: 'auto' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                const decision = resolver.resolveBucket(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBeNull();
                expect(decision.reason).toContain('No existing migration bucket - will create in stack');
            });
        });

        describe('Default behavior (no ownership specified)', () => {
            it('should default to auto resolution', () => {
                const appDefinition = {};
                const discovery = createEmptyDiscoveryResult();

                const decision = resolver.resolveBucket(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.reason).toContain('No existing migration bucket - will create in stack');
            });
        });
    });

    describe('resolveQueue', () => {
        describe('Explicit ownership intent', () => {
            it('should respect ownership.queue=stack when specified', () => {
                const appDefinition = {
                    migration: {
                        ownership: { queue: 'stack' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                const decision = resolver.resolveQueue(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBeNull();
                expect(decision.reason).toContain('Will create DbMigrationQueue in stack');
            });

            it('should respect ownership.queue=external when queue discovered', () => {
                const appDefinition = {
                    migration: {
                        ownership: { queue: 'external' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();
                discovery.external.push({
                    physicalId: 'https://sqs.us-east-1.amazonaws.com/123456789/my-migration-queue',
                    resourceType: 'AWS::SQS::Queue',
                    source: 'aws-discovery'
                });

                const decision = resolver.resolveQueue(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
                expect(decision.physicalId).toBe('https://sqs.us-east-1.amazonaws.com/123456789/my-migration-queue');
                expect(decision.reason).toContain('external');
            });

            it('should error when ownership.queue=external but no queue discovered', () => {
                const appDefinition = {
                    migration: {
                        ownership: { queue: 'external' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                expect(() => resolver.resolveQueue(appDefinition, discovery))
                    .toThrow('ownership.queue=external but no SQS queue discovered');
            });
        });

        describe('Auto resolution (ownership.queue=auto)', () => {
            it('should use stack queue when found in CloudFormation', () => {
                const appDefinition = {
                    migration: {
                        ownership: { queue: 'auto' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();
                discovery.fromCloudFormation = true;
                discovery.stackManaged.push({
                    logicalId: 'DbMigrationQueue',
                    physicalId: 'https://sqs.us-east-1.amazonaws.com/123456789/stack-migration-queue',
                    resourceType: 'AWS::SQS::Queue'
                });

                const decision = resolver.resolveQueue(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBe('https://sqs.us-east-1.amazonaws.com/123456789/stack-migration-queue');
                expect(decision.reason).toContain('Found DbMigrationQueue in CloudFormation stack');
            });

            it('should use external queue when found via discovery', () => {
                const appDefinition = {
                    migration: {
                        ownership: { queue: 'auto' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();
                discovery.external.push({
                    physicalId: 'https://sqs.us-east-1.amazonaws.com/123456789/external-migration-queue',
                    resourceType: 'AWS::SQS::Queue',
                    source: 'aws-discovery'
                });

                const decision = resolver.resolveQueue(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
                expect(decision.physicalId).toBe('https://sqs.us-east-1.amazonaws.com/123456789/external-migration-queue');
                expect(decision.reason).toContain('Found external SQS queue via discovery');
            });

            it('should create new queue when none found', () => {
                const appDefinition = {
                    migration: {
                        ownership: { queue: 'auto' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                const decision = resolver.resolveQueue(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBeNull();
                expect(decision.reason).toContain('No existing migration queue - will create in stack');
            });
        });
    });

    describe('resolveAll', () => {
        it('should return decisions for all migration resources', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true
                    }
                }
            };
            const discovery = createEmptyDiscoveryResult();

            const decisions = resolver.resolveAll(appDefinition, discovery);

            expect(decisions).toHaveProperty('bucket');
            expect(decisions).toHaveProperty('queue');
            expect(decisions.bucket.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.queue.ownership).toBe(ResourceOwnership.STACK);
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle managementMode=managed scenario (create resources)', () => {
            // In managed mode, we want to create resources in stack
            const appDefinition = {
                managementMode: 'managed',
                migration: {
                    ownership: { bucket: 'stack', queue: 'stack' }
                }
            };
            const discovery = createEmptyDiscoveryResult();

            const decisions = resolver.resolveAll(appDefinition, discovery);

            expect(decisions.bucket.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.bucket.physicalId).toBeNull();
            expect(decisions.queue.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.queue.physicalId).toBeNull();
        });

        it('should handle existing stack resources (reuse)', () => {
            // Stack already has migration resources from previous deployment
            const appDefinition = {
                migration: {
                    ownership: { bucket: 'auto', queue: 'auto' }
                }
            };
            const discovery = createEmptyDiscoveryResult();
            discovery.fromCloudFormation = true;
            discovery.stackManaged.push({
                logicalId: 'FriggMigrationStatusBucket',
                physicalId: 'my-stack-bucket',
                resourceType: 'AWS::S3::Bucket'
            });
            discovery.stackManaged.push({
                logicalId: 'DbMigrationQueue',
                physicalId: 'https://sqs.us-east-1.amazonaws.com/123/my-queue',
                resourceType: 'AWS::SQS::Queue'
            });

            const decisions = resolver.resolveAll(appDefinition, discovery);

            expect(decisions.bucket.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.bucket.physicalId).toBe('my-stack-bucket');
            expect(decisions.queue.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.queue.physicalId).toBe('https://sqs.us-east-1.amazonaws.com/123/my-queue');
        });

        it('should handle shared migration resources scenario', () => {
            // Using shared infrastructure migration resources
            const appDefinition = {
                managementMode: 'managed',
                vpcIsolation: 'shared',
                migration: {
                    ownership: { bucket: 'auto', queue: 'auto' }
                }
            };
            const discovery = createEmptyDiscoveryResult();
            discovery.external.push({
                physicalId: 'shared-migration-bucket',
                resourceType: 'AWS::S3::Bucket',
                source: 'aws-discovery'
            });
            discovery.external.push({
                physicalId: 'https://sqs.us-east-1.amazonaws.com/123/shared-queue',
                resourceType: 'AWS::SQS::Queue',
                source: 'aws-discovery'
            });

            const decisions = resolver.resolveAll(appDefinition, discovery);

            expect(decisions.bucket.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decisions.bucket.physicalId).toBe('shared-migration-bucket');
            expect(decisions.queue.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decisions.queue.physicalId).toBe('https://sqs.us-east-1.amazonaws.com/123/shared-queue');
        });
    });
});
