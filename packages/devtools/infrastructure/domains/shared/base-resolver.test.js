const BaseResourceResolver = require('./base-resolver');
const { ResourceOwnership } = require('./types');

describe('BaseResourceResolver', () => {
    let resolver;

    beforeEach(() => {
        resolver = new BaseResourceResolver();
    });

    describe('helper methods', () => {
        const mockDiscovery = {
            stackManaged: [
                { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' },
                { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-456', resourceType: 'AWS::EC2::SecurityGroup' }
            ],
            external: [
                { physicalId: 'vpc-external', resourceType: 'AWS::EC2::VPC', source: 'tag-search' }
            ],
            fromCloudFormation: true
        };

        describe('findInStack', () => {
            it('should find resource in stack', () => {
                const resource = resolver.findInStack('FriggVPC', mockDiscovery);

                expect(resource).toEqual({
                    logicalId: 'FriggVPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC'
                });
            });

            it('should return null if not found', () => {
                const resource = resolver.findInStack('NonExistent', mockDiscovery);
                expect(resource).toBeNull();
            });
        });

        describe('findExternal', () => {
            it('should find external resource by type', () => {
                const resource = resolver.findExternal('AWS::EC2::VPC', mockDiscovery);

                expect(resource).toEqual({
                    physicalId: 'vpc-external',
                    resourceType: 'AWS::EC2::VPC',
                    source: 'tag-search'
                });
            });

            it('should return null if not found', () => {
                const resource = resolver.findExternal('AWS::RDS::DBCluster', mockDiscovery);
                expect(resource).toBeNull();
            });
        });

        describe('isInStack', () => {
            it('should return true if resource is in stack', () => {
                expect(resolver.isInStack('FriggVPC', mockDiscovery)).toBe(true);
                expect(resolver.isInStack('FriggLambdaSecurityGroup', mockDiscovery)).toBe(true);
            });

            it('should return false if resource is not in stack', () => {
                expect(resolver.isInStack('NonExistent', mockDiscovery)).toBe(false);
            });
        });

        describe('requireExternalIds', () => {
            it('should not throw if IDs are provided', () => {
                expect(() => resolver.requireExternalIds('vpc-123', 'vpcId')).not.toThrow();
                expect(() => resolver.requireExternalIds(['sg-1', 'sg-2'], 'securityGroupIds')).not.toThrow();
            });

            it('should throw if IDs are missing', () => {
                expect(() => resolver.requireExternalIds(undefined, 'vpcId')).toThrow(
                    "ownership='external' for vpcId requires external.vpcId"
                );
                expect(() => resolver.requireExternalIds(null, 'vpcId')).toThrow();
                expect(() => resolver.requireExternalIds([], 'securityGroupIds')).toThrow();
            });
        });
    });

    describe('resolveResourceOwnership', () => {
        describe('with explicit stack intent', () => {
            it('should return STACK ownership', () => {
                const discovery = {
                    stackManaged: [],
                    external: [{ physicalId: 'vpc-ext', resourceType: 'AWS::EC2::VPC', source: 'tag-search' }],
                    fromCloudFormation: false
                };

                const decision = resolver.resolveResourceOwnership(
                    'stack',
                    'FriggVPC',
                    'AWS::EC2::VPC',
                    discovery
                );

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.reason).toContain('User explicitly specified ownership=stack');
            });
        });

        describe('with explicit external intent', () => {
            it('should return EXTERNAL ownership', () => {
                const discovery = {
                    stackManaged: [
                        { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' }
                    ],
                    external: [],
                    fromCloudFormation: true
                };

                const decision = resolver.resolveResourceOwnership(
                    'external',
                    'FriggVPC',
                    'AWS::EC2::VPC',
                    discovery
                );

                expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
                expect(decision.reason).toContain('User explicitly specified ownership=external');
            });
        });

        describe('with auto intent', () => {
            it('should return STACK if resource is in stack (CRITICAL)', () => {
                const discovery = {
                    stackManaged: [
                        { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-069629001ade41c9a', resourceType: 'AWS::EC2::SecurityGroup' }
                    ],
                    external: [],
                    fromCloudFormation: true
                };

                const decision = resolver.resolveResourceOwnership(
                    'auto',
                    'FriggLambdaSecurityGroup',
                    'AWS::EC2::SecurityGroup',
                    discovery
                );

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBe('sg-069629001ade41c9a');
                expect(decision.reason).toContain('Found in CloudFormation stack');
                expect(decision.reason).toContain('must keep in template to avoid deletion');
            });

            it('should return EXTERNAL if found externally but not in stack', () => {
                const discovery = {
                    stackManaged: [],
                    external: [
                        { physicalId: 'vpc-external', resourceType: 'AWS::EC2::VPC', source: 'tag-search' }
                    ],
                    fromCloudFormation: false
                };

                const decision = resolver.resolveResourceOwnership(
                    'auto',
                    'FriggVPC',
                    'AWS::EC2::VPC',
                    discovery
                );

                expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
                expect(decision.physicalId).toBe('vpc-external');
                expect(decision.reason).toContain('Found external resource via discovery');
            });

            it('should return STACK if not found anywhere (create new)', () => {
                const discovery = {
                    stackManaged: [],
                    external: [],
                    fromCloudFormation: false
                };

                const decision = resolver.resolveResourceOwnership(
                    'auto',
                    'FriggVPC',
                    'AWS::EC2::VPC',
                    discovery
                );

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBeUndefined();
                expect(decision.reason).toContain('No existing resource found - will create in stack');
            });
        });

        describe('metadata', () => {
            it('should include complete metadata', () => {
                const discovery = {
                    stackManaged: [
                        { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' }
                    ],
                    external: [],
                    fromCloudFormation: true
                };

                const decision = resolver.resolveResourceOwnership(
                    'auto',
                    'FriggVPC',
                    'AWS::EC2::VPC',
                    discovery
                );

                expect(decision.metadata).toEqual({
                    logicalId: 'FriggVPC',
                    resourceType: 'AWS::EC2::VPC',
                    userIntent: 'auto',
                    inStack: true,
                    foundExternal: false
                });
            });
        });
    });

    describe('createExternalDecision', () => {
        it('should create external decision with single ID', () => {
            const decision = resolver.createExternalDecision('vpc-external');

            expect(decision).toEqual({
                ownership: ResourceOwnership.EXTERNAL,
                physicalId: 'vpc-external',
                physicalIds: ['vpc-external'],
                reason: 'Using external resource reference',
                metadata: {
                    source: 'user-provided'
                }
            });
        });

        it('should create external decision with multiple IDs', () => {
            const decision = resolver.createExternalDecision(['sg-1', 'sg-2'], 'Custom reason');

            expect(decision).toEqual({
                ownership: ResourceOwnership.EXTERNAL,
                physicalId: 'sg-1',
                physicalIds: ['sg-1', 'sg-2'],
                reason: 'Custom reason',
                metadata: {
                    source: 'user-provided'
                }
            });
        });
    });

    describe('createStackDecision', () => {
        it('should create stack decision for new resource', () => {
            const decision = resolver.createStackDecision();

            expect(decision).toEqual({
                ownership: ResourceOwnership.STACK,
                physicalId: null,
                reason: 'Managed by CloudFormation stack',
                metadata: {
                    source: 'new'
                }
            });
        });

        it('should create stack decision for existing resource', () => {
            const decision = resolver.createStackDecision('vpc-123', 'Found in stack');

            expect(decision).toEqual({
                ownership: ResourceOwnership.STACK,
                physicalId: 'vpc-123',
                reason: 'Found in stack',
                metadata: {
                    source: 'discovered'
                }
            });
        });
    });

    describe('backwards compatibility with flat discovery', () => {
        it('should work with old flat discovery structure', () => {
            const flatDiscovery = {
                fromCloudFormationStack: true,
                existingLogicalIds: ['FriggVPC', 'FriggLambdaSecurityGroup'],
                defaultVpcId: 'vpc-123',
                securityGroupId: 'sg-456',
                _structured: {
                    stackManaged: [
                        { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' },
                        { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-456', resourceType: 'AWS::EC2::SecurityGroup' }
                    ],
                    external: [],
                    fromCloudFormation: true
                }
            };

            const decision = resolver.resolveResourceOwnership(
                'auto',
                'FriggLambdaSecurityGroup',
                'AWS::EC2::SecurityGroup',
                flatDiscovery
            );

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('sg-456');
        });
    });
});
