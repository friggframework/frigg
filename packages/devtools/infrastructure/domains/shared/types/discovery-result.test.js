const {
    createEmptyDiscoveryResult,
    findStackResource,
    findExternalResource,
    findAllExternalResources,
    isResourceInStack,
    getStackLogicalIds
} = require('./discovery-result');

describe('Discovery Result Utilities', () => {
    describe('createEmptyDiscoveryResult', () => {
        it('should create empty discovery result with correct structure', () => {
            const result = createEmptyDiscoveryResult();

            expect(result).toEqual({
                stackManaged: [],
                external: [],
                fromCloudFormation: false
            });
        });
    });

    describe('findStackResource', () => {
        it('should find resource by logical ID', () => {
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' },
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-456', resourceType: 'AWS::EC2::SecurityGroup' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const found = findStackResource(discovery, 'FriggLambdaSecurityGroup');

            expect(found).toEqual({
                logicalId: 'FriggLambdaSecurityGroup',
                physicalId: 'sg-456',
                resourceType: 'AWS::EC2::SecurityGroup'
            });
        });

        it('should return null if resource not found', () => {
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const found = findStackResource(discovery, 'NonExistent');

            expect(found).toBeNull();
        });

        it('should return null for empty stack managed resources', () => {
            const discovery = createEmptyDiscoveryResult();
            const found = findStackResource(discovery, 'FriggVPC');

            expect(found).toBeNull();
        });
    });

    describe('findExternalResource', () => {
        it('should find external resource by type', () => {
            const discovery = {
                stackManaged: [],
                external: [
                    { physicalId: 'vpc-external', resourceType: 'AWS::EC2::VPC', source: 'tag-search' },
                    { physicalId: 'sg-external', resourceType: 'AWS::EC2::SecurityGroup', source: 'tag-search' }
                ],
                fromCloudFormation: false
            };

            const found = findExternalResource(discovery, 'AWS::EC2::SecurityGroup');

            expect(found).toEqual({
                physicalId: 'sg-external',
                resourceType: 'AWS::EC2::SecurityGroup',
                source: 'tag-search'
            });
        });

        it('should return null if external resource not found', () => {
            const discovery = createEmptyDiscoveryResult();
            const found = findExternalResource(discovery, 'AWS::EC2::VPC');

            expect(found).toBeNull();
        });

        it('should return first match if multiple resources of same type', () => {
            const discovery = {
                stackManaged: [],
                external: [
                    { physicalId: 'subnet-1', resourceType: 'AWS::EC2::Subnet', source: 'tag-search' },
                    { physicalId: 'subnet-2', resourceType: 'AWS::EC2::Subnet', source: 'tag-search' }
                ],
                fromCloudFormation: false
            };

            const found = findExternalResource(discovery, 'AWS::EC2::Subnet');

            expect(found.physicalId).toBe('subnet-1');
        });
    });

    describe('findAllExternalResources', () => {
        it('should find all external resources of given type', () => {
            const discovery = {
                stackManaged: [],
                external: [
                    { physicalId: 'subnet-1', resourceType: 'AWS::EC2::Subnet', source: 'tag-search' },
                    { physicalId: 'subnet-2', resourceType: 'AWS::EC2::Subnet', source: 'tag-search' },
                    { physicalId: 'sg-1', resourceType: 'AWS::EC2::SecurityGroup', source: 'tag-search' }
                ],
                fromCloudFormation: false
            };

            const found = findAllExternalResources(discovery, 'AWS::EC2::Subnet');

            expect(found).toHaveLength(2);
            expect(found[0].physicalId).toBe('subnet-1');
            expect(found[1].physicalId).toBe('subnet-2');
        });

        it('should return empty array if no resources found', () => {
            const discovery = createEmptyDiscoveryResult();
            const found = findAllExternalResources(discovery, 'AWS::EC2::VPC');

            expect(found).toEqual([]);
        });
    });

    describe('isResourceInStack', () => {
        it('should return true if resource is in stack', () => {
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' },
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-456', resourceType: 'AWS::EC2::SecurityGroup' }
                ],
                external: [],
                fromCloudFormation: true
            };

            expect(isResourceInStack(discovery, 'FriggVPC')).toBe(true);
            expect(isResourceInStack(discovery, 'FriggLambdaSecurityGroup')).toBe(true);
        });

        it('should return false if resource is not in stack', () => {
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' }
                ],
                external: [],
                fromCloudFormation: true
            };

            expect(isResourceInStack(discovery, 'NonExistent')).toBe(false);
        });

        it('should return false for empty stack', () => {
            const discovery = createEmptyDiscoveryResult();

            expect(isResourceInStack(discovery, 'FriggVPC')).toBe(false);
        });
    });

    describe('getStackLogicalIds', () => {
        it('should return all logical IDs from stack', () => {
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' },
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-456', resourceType: 'AWS::EC2::SecurityGroup' },
                    { logicalId: 'FriggAuroraCluster', physicalId: 'cluster-789', resourceType: 'AWS::RDS::DBCluster' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const ids = getStackLogicalIds(discovery);

            expect(ids).toEqual([
                'FriggVPC',
                'FriggLambdaSecurityGroup',
                'FriggAuroraCluster'
            ]);
        });

        it('should return empty array for empty stack', () => {
            const discovery = createEmptyDiscoveryResult();
            const ids = getStackLogicalIds(discovery);

            expect(ids).toEqual([]);
        });
    });

    describe('real-world scenarios', () => {
        it('scenario: fresh deploy, no stack exists', () => {
            const discovery = createEmptyDiscoveryResult();

            expect(discovery.fromCloudFormation).toBe(false);
            expect(discovery.stackManaged).toHaveLength(0);
            expect(discovery.external).toHaveLength(0);

            expect(isResourceInStack(discovery, 'FriggVPC')).toBe(false);
            expect(findStackResource(discovery, 'FriggVPC')).toBeNull();
        });

        it('scenario: redeploy existing stack', () => {
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' },
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-069629001ade41c9a', resourceType: 'AWS::EC2::SecurityGroup' },
                    { logicalId: 'FriggPrivateSubnet1', physicalId: 'subnet-1', resourceType: 'AWS::EC2::Subnet' },
                    { logicalId: 'FriggPrivateSubnet2', physicalId: 'subnet-2', resourceType: 'AWS::EC2::Subnet' },
                    { logicalId: 'FriggAuroraCluster', physicalId: 'cluster-abc', resourceType: 'AWS::RDS::DBCluster' },
                    { logicalId: 'FriggKMSKey', physicalId: 'key-xyz', resourceType: 'AWS::KMS::Key' }
                ],
                external: [],
                fromCloudFormation: true,
                stackName: 'frigg-app-production'
            };

            expect(discovery.fromCloudFormation).toBe(true);
            expect(discovery.stackManaged).toHaveLength(6);

            // All these resources are in stack - MUST be kept in template
            expect(isResourceInStack(discovery, 'FriggLambdaSecurityGroup')).toBe(true);
            expect(isResourceInStack(discovery, 'FriggAuroraCluster')).toBe(true);

            const sg = findStackResource(discovery, 'FriggLambdaSecurityGroup');
            expect(sg.physicalId).toBe('sg-069629001ade41c9a');
        });

        it('scenario: use external VPC with stack-managed resources', () => {
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-456', resourceType: 'AWS::EC2::SecurityGroup' },
                    { logicalId: 'FriggPrivateSubnet1', physicalId: 'subnet-1', resourceType: 'AWS::EC2::Subnet' }
                ],
                external: [
                    { physicalId: 'vpc-external', resourceType: 'AWS::EC2::VPC', source: 'user-provided' }
                ],
                fromCloudFormation: true,
                stackName: 'my-app-dev'
            };

            // VPC is external - should NOT be in template
            expect(isResourceInStack(discovery, 'FriggVPC')).toBe(false);
            const externalVpc = findExternalResource(discovery, 'AWS::EC2::VPC');
            expect(externalVpc.physicalId).toBe('vpc-external');

            // But security group IS in stack - MUST be in template
            expect(isResourceInStack(discovery, 'FriggLambdaSecurityGroup')).toBe(true);
        });
    });
});
