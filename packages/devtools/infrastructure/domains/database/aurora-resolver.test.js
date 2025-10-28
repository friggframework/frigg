/**
 * Aurora Resource Resolver Tests
 *
 * Tests the ownership resolution logic for Aurora resources.
 */

const AuroraResourceResolver = require('./aurora-resolver');
const { ResourceOwnership } = require('../shared/types/resource-ownership');

describe('AuroraResourceResolver', () => {
    let resolver;

    beforeEach(() => {
        resolver = new AuroraResourceResolver();
    });

    describe('resolveCluster', () => {
        it('should resolve to EXTERNAL with user-provided cluster identifier', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        ownership: { cluster: 'external' },
                        external: { clusterIdentifier: 'prod-aurora-cluster' }
                    }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveCluster(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('prod-aurora-cluster');
        });

        it('should resolve to STACK when cluster found in stack', () => {
            const appDefinition = { database: { postgres: { ownership: { cluster: 'auto' } } } };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggAuroraCluster', physicalId: 'frigg-cluster-prod', resourceType: 'AWS::RDS::DBCluster' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decision = resolver.resolveCluster(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('frigg-cluster-prod');
            expect(decision.reason).toContain('Found FriggAuroraCluster in CloudFormation stack');
        });

        it('should auto-resolve to EXTERNAL when cluster found externally', () => {
            const appDefinition = { database: { postgres: { ownership: { cluster: 'auto' } } } };
            const discovery = {
                stackManaged: [],
                external: [
                    { physicalId: 'shared-aurora-cluster', resourceType: 'AWS::RDS::DBCluster', source: 'aws-discovery' }
                ],
                fromCloudFormation: false
            };

            const decision = resolver.resolveCluster(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('shared-aurora-cluster');
        });

        it('should auto-resolve to STACK when not found (create new)', () => {
            const appDefinition = { database: { postgres: { ownership: { cluster: 'auto' } } } };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveCluster(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeFalsy(); // null or undefined
            expect(decision.reason).toContain('No existing Aurora cluster');
        });
    });

    describe('resolveInstance', () => {
        it('should resolve to EXTERNAL with user-provided instance identifier', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        ownership: { instance: 'external' },
                        external: { instanceIdentifier: 'prod-aurora-instance-1' }
                    }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveInstance(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('prod-aurora-instance-1');
        });

        it('should resolve to STACK when instance found in stack', () => {
            const appDefinition = { database: { postgres: { ownership: { instance: 'auto' } } } };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggAuroraInstance', physicalId: 'frigg-instance-1', resourceType: 'AWS::RDS::DBInstance' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decision = resolver.resolveInstance(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('frigg-instance-1');
        });
    });

    describe('resolveSubnetGroup', () => {
        it('should resolve to EXTERNAL with user-provided subnet group name', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        ownership: { subnetGroup: 'external' },
                        external: { subnetGroupName: 'prod-db-subnet-group' }
                    }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveSubnetGroup(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('prod-db-subnet-group');
        });

        it('should resolve to STACK when subnet group found in stack', () => {
            const appDefinition = { database: { postgres: { ownership: { subnetGroup: 'auto' } } } };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggDBSubnetGroup', physicalId: 'frigg-db-subnet-group', resourceType: 'AWS::RDS::DBSubnetGroup' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decision = resolver.resolveSubnetGroup(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('frigg-db-subnet-group');
        });

        it('should always create subnet group for new deployments', () => {
            const appDefinition = { database: { postgres: { ownership: { subnetGroup: 'auto' } } } };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveSubnetGroup(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeFalsy(); // null or undefined
            expect(decision.reason).toContain('No existing DB subnet group');
        });
    });

    describe('resolveSecret', () => {
        it('should resolve to EXTERNAL with user-provided secret ARN', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        ownership: { secret: 'external' },
                        external: { secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:prod-db-creds' }
                    }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveSecret(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('arn:aws:secretsmanager:us-east-1:123456789012:secret:prod-db-creds');
        });

        it('should resolve to STACK when secret found in stack', () => {
            const appDefinition = { database: { postgres: { ownership: { secret: 'auto' } } } };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggDBSecret', physicalId: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:frigg-db', resourceType: 'AWS::SecretsManager::Secret' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decision = resolver.resolveSecret(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('arn:aws:secretsmanager:us-east-1:123456789012:secret:frigg-db');
        });
    });

    describe('resolveAll', () => {
        it('should resolve all Aurora resources at once', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        ownership: {}
                    }
                }
            };
            const discovery = {
                stackManaged: [],
                external: [],
                fromCloudFormation: false
            };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            expect(decisions.cluster).toBeDefined();
            expect(decisions.instance).toBeDefined();
            expect(decisions.subnetGroup).toBeDefined();
            expect(decisions.secret).toBeDefined();

            // All should be STACK (create new)
            expect(decisions.cluster.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.instance.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.subnetGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.secret.ownership).toBe(ResourceOwnership.STACK);
        });

        it('should handle mixed ownership scenarios', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        ownership: {
                            cluster: 'external',
                            instance: 'auto',
                            subnetGroup: 'stack',
                            secret: 'stack'
                        },
                        external: {
                            clusterIdentifier: 'shared-cluster'
                        }
                    }
                }
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggDBSubnetGroup', physicalId: 'subnet-group-1', resourceType: 'AWS::RDS::DBSubnetGroup' },
                    { logicalId: 'FriggDBSecret', physicalId: 'arn:aws:secret-1', resourceType: 'AWS::SecretsManager::Secret' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            expect(decisions.cluster.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decisions.cluster.physicalId).toBe('shared-cluster');
            expect(decisions.instance.ownership).toBe(ResourceOwnership.STACK); // Not found, create new
            expect(decisions.subnetGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.subnetGroup.physicalId).toBe('subnet-group-1');
            expect(decisions.secret.ownership).toBe(ResourceOwnership.STACK);
        });
    });

    describe('real-world scenarios', () => {
        it('scenario: fresh deploy, no Aurora exists', () => {
            const appDefinition = {
                database: { postgres: { enable: true, ownership: {} } }
            };
            const discovery = {
                stackManaged: [],
                external: [],
                fromCloudFormation: false
            };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            // All resources should be created in stack
            expect(decisions.cluster.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.cluster.physicalId).toBeFalsy(); // null or undefined
            expect(decisions.instance.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.subnetGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.secret.ownership).toBe(ResourceOwnership.STACK);
        });

        it('scenario: redeploy existing stack with Aurora', () => {
            const appDefinition = {
                database: { postgres: { enable: true, ownership: {} } }
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggAuroraCluster', physicalId: 'cluster-1', resourceType: 'AWS::RDS::DBCluster' },
                    { logicalId: 'FriggAuroraInstance', physicalId: 'instance-1', resourceType: 'AWS::RDS::DBInstance' },
                    { logicalId: 'FriggDBSubnetGroup', physicalId: 'subnet-group-1', resourceType: 'AWS::RDS::DBSubnetGroup' },
                    { logicalId: 'FriggDBSecret', physicalId: 'arn:aws:secret-1', resourceType: 'AWS::SecretsManager::Secret' }
                ],
                external: [],
                fromCloudFormation: true,
                stackName: 'frigg-production'
            };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            // All resources in stack, should reuse with STACK ownership
            expect(decisions.cluster.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.cluster.physicalId).toBe('cluster-1');
            expect(decisions.instance.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.instance.physicalId).toBe('instance-1');
            expect(decisions.subnetGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.secret.ownership).toBe(ResourceOwnership.STACK);
        });

        it('scenario: use shared Aurora cluster with new stack resources', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        ownership: {
                            cluster: 'external',
                            instance: 'external',
                            subnetGroup: 'auto',
                            secret: 'auto'
                        },
                        external: {
                            clusterIdentifier: 'shared-production-aurora',
                            instanceIdentifier: 'shared-production-aurora-instance-1'
                        }
                    }
                }
            };
            const discovery = {
                stackManaged: [],
                external: [],
                fromCloudFormation: false
            };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            // Cluster and instance are external
            expect(decisions.cluster.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decisions.cluster.physicalId).toBe('shared-production-aurora');
            expect(decisions.instance.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decisions.instance.physicalId).toBe('shared-production-aurora-instance-1');

            // Subnet group and secret are created in our stack
            expect(decisions.subnetGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.secret.ownership).toBe(ResourceOwnership.STACK);
        });
    });
});
