const VpcResourceResolver = require('./vpc-resolver');
const { ResourceOwnership } = require('../shared/types');

describe('VpcResourceResolver', () => {
    let resolver;

    beforeEach(() => {
        resolver = new VpcResourceResolver();
    });

    describe('resolveVpc', () => {
        it('should resolve to EXTERNAL when user specifies external', () => {
            const appDefinition = {
                vpc: {
                    ownership: { vpc: 'external' },
                    external: { vpcId: 'vpc-external-123' }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveVpc(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('vpc-external-123');
            expect(decision.reason).toContain('User specified ownership=external');
        });

        it('should throw when external specified but vpcId missing', () => {
            const appDefinition = {
                vpc: {
                    ownership: { vpc: 'external' },
                    external: {}
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            expect(() => resolver.resolveVpc(appDefinition, discovery)).toThrow(
                "ownership='external' for vpcId requires external.vpcId"
            );
        });

        it('should resolve to STACK when user specifies stack', () => {
            const appDefinition = {
                vpc: {
                    ownership: { vpc: 'stack' }
                }
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-stack-123', resourceType: 'AWS::EC2::VPC' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decision = resolver.resolveVpc(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('vpc-stack-123');
            expect(decision.reason).toContain('User specified ownership=stack');
        });

        it('should auto-resolve to STACK when VPC in stack (CRITICAL)', () => {
            const appDefinition = {
                vpc: { ownership: { vpc: 'auto' } }
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-in-stack', resourceType: 'AWS::EC2::VPC' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decision = resolver.resolveVpc(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('vpc-in-stack');
            expect(decision.reason).toContain('Found in CloudFormation stack');
        });

        it('should auto-resolve to EXTERNAL when found externally', () => {
            const appDefinition = {
                vpc: { ownership: { vpc: 'auto' } }
            };
            const discovery = {
                stackManaged: [],
                external: [
                    { physicalId: 'vpc-external', resourceType: 'AWS::EC2::VPC', source: 'tag-search' }
                ],
                fromCloudFormation: false
            };

            const decision = resolver.resolveVpc(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('vpc-external');
        });

        it('should auto-resolve to STACK when not found (create new)', () => {
            const appDefinition = {
                vpc: { ownership: { vpc: 'auto' } }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveVpc(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeUndefined();
            expect(decision.reason).toContain('No existing resource found');
        });

        it('should throw error when auto mode finds no VPC and management is not create-new', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    // No management specified - defaults to discover
                    // No ownership specified - defaults to auto
                }
            };
            const discovery = { 
                stackManaged: [], 
                external: [], 
                fromCloudFormation: false 
            };

            // Should throw error instead of trying to create VPC
            expect(() => resolver.resolveVpc(appDefinition, discovery)).toThrow(
                'VPC discovery failed: No VPC found'
            );
        });

        it('should allow creating VPC when management is create-new', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new'
                }
            };
            const discovery = { 
                stackManaged: [], 
                external: [], 
                fromCloudFormation: false 
            };

            // Should NOT throw - create-new explicitly allows VPC creation
            const decision = resolver.resolveVpc(appDefinition, discovery);
            
            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeNull();
        });
    });

    describe('resolveSecurityGroup', () => {
        it('should resolve to EXTERNAL with user-provided IDs', () => {
            const appDefinition = {
                vpc: {
                    ownership: { securityGroup: 'external' },
                    external: { securityGroupIds: ['sg-1', 'sg-2'] }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveSecurityGroup(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalIds).toEqual(['sg-1', 'sg-2']);
        });

        it('should auto-resolve to STACK when FriggLambdaSecurityGroup in stack', () => {
            const appDefinition = { vpc: { ownership: { securityGroup: 'auto' } } };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-069629001ade41c9a', resourceType: 'AWS::EC2::SecurityGroup' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decision = resolver.resolveSecurityGroup(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('sg-069629001ade41c9a');
            expect(decision.reason).toContain('Found FriggLambdaSecurityGroup in CloudFormation stack');
        });
    });

    describe('resolveSubnets', () => {
        it('should resolve to EXTERNAL with user-provided subnet IDs', () => {
            const appDefinition = {
                vpc: {
                    ownership: { subnets: 'external' },
                    external: { subnetIds: ['subnet-1', 'subnet-2', 'subnet-3'] }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveSubnets(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalIds).toEqual(['subnet-1', 'subnet-2', 'subnet-3']);
        });

        it('should resolve to STACK when subnets found in stack', () => {
            const appDefinition = { vpc: { ownership: { subnets: 'auto' } } };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggPrivateSubnet1', physicalId: 'subnet-a', resourceType: 'AWS::EC2::Subnet' },
                    { logicalId: 'FriggPrivateSubnet2', physicalId: 'subnet-b', resourceType: 'AWS::EC2::Subnet' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decision = resolver.resolveSubnets(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalIds).toEqual(['subnet-a', 'subnet-b']);
            expect(decision.metadata.subnet1).toBe('subnet-a');
            expect(decision.metadata.subnet2).toBe('subnet-b');
        });

        it('should resolve to EXTERNAL when found externally', () => {
            const appDefinition = { vpc: { ownership: { subnets: 'auto' } } };
            const discovery = {
                stackManaged: [],
                external: [
                    { physicalId: 'subnet-ext-1', resourceType: 'AWS::EC2::Subnet', source: 'tag-search' },
                    { physicalId: 'subnet-ext-2', resourceType: 'AWS::EC2::Subnet', source: 'tag-search' },
                    { physicalId: 'subnet-ext-3', resourceType: 'AWS::EC2::Subnet', source: 'tag-search' }
                ],
                fromCloudFormation: false
            };

            const decision = resolver.resolveSubnets(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalIds).toHaveLength(2); // Takes first 2
            expect(decision.physicalIds).toEqual(['subnet-ext-1', 'subnet-ext-2']);
        });

        it('should resolve to STACK when no subnets found (create new)', () => {
            const appDefinition = { vpc: { ownership: { subnets: 'auto' } } };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveSubnets(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeNull();
            expect(decision.reason).toContain('No existing subnets found');
        });
    });

    describe('resolveNatGateway', () => {
        it('should return null decision when NAT disabled', () => {
            const appDefinition = {
                vpc: {
                    ownership: { natGateway: 'auto' },
                    config: { natGateway: { enable: false } }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveNatGateway(appDefinition, discovery);

            expect(decision.ownership).toBeNull();
            expect(decision.reason).toContain('NAT Gateway disabled');
        });

        it('should resolve to EXTERNAL with user-provided ID', () => {
            const appDefinition = {
                vpc: {
                    ownership: { natGateway: 'external' },
                    external: { natGatewayId: 'nat-external-123' }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decision = resolver.resolveNatGateway(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('nat-external-123');
        });

        it('should auto-resolve to STACK when found in stack', () => {
            const appDefinition = { vpc: { ownership: { natGateway: 'auto' } } };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggNatGateway', physicalId: 'nat-stack-123', resourceType: 'AWS::EC2::NatGateway' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decision = resolver.resolveNatGateway(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('nat-stack-123');
        });
    });

    describe('resolveVpcEndpoints', () => {
        it('should skip DynamoDB endpoint when application uses MongoDB', () => {
            const appDefinition = {
                vpc: { ownership: { vpcEndpoints: 'auto' } },
                database: { mongoDB: { enable: true } }, // Using MongoDB, not DynamoDB
                encryption: { fieldLevelEncryptionMethod: 'kms' }
            };
            const discovery = {
                stackManaged: [],
                external: [],
                fromCloudFormation: false
            };

            const decisions = resolver.resolveVpcEndpoints(appDefinition, discovery);

            expect(decisions.s3.ownership).toBe('stack'); // S3 always needed
            expect(decisions.dynamodb.ownership).toBeNull(); // DynamoDB NOT needed
            expect(decisions.dynamodb.reason).toContain('MongoDB/PostgreSQL');
            expect(decisions.kms.ownership).toBe('stack'); // KMS needed (encryption enabled)
            expect(decisions.secretsManager.ownership).toBe('stack'); // SM always needed
            expect(decisions.sqs.ownership).toBe('stack'); // SQS always needed
        });

        it('should skip DynamoDB endpoint when application uses PostgreSQL', () => {
            const appDefinition = {
                vpc: { ownership: { vpcEndpoints: 'auto' } },
                database: { postgres: { enable: true } }, // Using PostgreSQL, not DynamoDB
            };
            const discovery = {
                stackManaged: [],
                external: [],
                fromCloudFormation: false
            };

            const decisions = resolver.resolveVpcEndpoints(appDefinition, discovery);

            expect(decisions.dynamodb.ownership).toBeNull();
            expect(decisions.dynamodb.reason).toContain('MongoDB/PostgreSQL');
        });

        it('should create DynamoDB endpoint when explicitly enabled', () => {
            const appDefinition = {
                vpc: { ownership: { vpcEndpoints: 'auto' } },
                database: { dynamodb: { enable: true } }, // Explicitly using DynamoDB
            };
            const discovery = {
                stackManaged: [],
                external: [],
                fromCloudFormation: false
            };

            const decisions = resolver.resolveVpcEndpoints(appDefinition, discovery);

            expect(decisions.dynamodb.ownership).toBe('stack'); // DynamoDB needed
        });

        it('should preserve DynamoDB endpoint if exists in stack even when not needed', () => {
            const appDefinition = {
                vpc: { ownership: { vpcEndpoints: 'auto' } },
                database: { mongoDB: { enable: true } }, // Using MongoDB (DynamoDB not needed)
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggDynamoDBVPCEndpoint', physicalId: 'vpce-ddb-legacy', resourceType: 'AWS::EC2::VPCEndpoint' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decisions = resolver.resolveVpcEndpoints(appDefinition, discovery);

            // Should preserve (not delete) even though not actively needed
            expect(decisions.dynamodb.ownership).toBe('stack');
            expect(decisions.dynamodb.physicalId).toBe('vpce-ddb-legacy');
        });


        it('should return null decisions when endpoints disabled', () => {
            const appDefinition = {
                vpc: {
                    ownership: { vpcEndpoints: 'auto' },
                    config: { enableVpcEndpoints: false }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decisions = resolver.resolveVpcEndpoints(appDefinition, discovery);

            expect(decisions.s3.ownership).toBeNull();
            expect(decisions.dynamodb.ownership).toBeNull();
            expect(decisions.kms.ownership).toBeNull();
            expect(decisions.secretsManager.ownership).toBeNull();
            expect(decisions.sqs.ownership).toBeNull();
        });

        it('should resolve to EXTERNAL with user-provided endpoint IDs', () => {
            const appDefinition = {
                vpc: {
                    ownership: { vpcEndpoints: 'external' },
                    external: {
                        vpcEndpointIds: {
                            s3: 'vpce-s3-123',
                            dynamodb: 'vpce-ddb-456'
                        }
                    }
                }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decisions = resolver.resolveVpcEndpoints(appDefinition, discovery);

            expect(decisions.s3.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decisions.s3.physicalId).toBe('vpce-s3-123');
            expect(decisions.dynamodb.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decisions.dynamodb.physicalId).toBe('vpce-ddb-456');
            expect(decisions.kms.ownership).toBeNull(); // Not provided
        });

        it('should auto-resolve to STACK when endpoints found in stack', () => {
            const appDefinition = { vpc: { ownership: { vpcEndpoints: 'auto' } } };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggS3VPCEndpoint', physicalId: 'vpce-s3-stack', resourceType: 'AWS::EC2::VPCEndpoint' },
                    { logicalId: 'FriggDynamoDBVPCEndpoint', physicalId: 'vpce-ddb-stack', resourceType: 'AWS::EC2::VPCEndpoint' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decisions = resolver.resolveVpcEndpoints(appDefinition, discovery);

            expect(decisions.s3.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.s3.physicalId).toBe('vpce-s3-stack');
            expect(decisions.dynamodb.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.dynamodb.physicalId).toBe('vpce-ddb-stack');
        });

        it('should auto-resolve mixed: some in stack, some new', () => {
            const appDefinition = {
                vpc: { ownership: { vpcEndpoints: 'auto' } },
                encryption: { fieldLevelEncryptionMethod: 'kms' }  // Enable KMS endpoint
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggS3VPCEndpoint', physicalId: 'vpce-s3-stack', resourceType: 'AWS::EC2::VPCEndpoint' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decisions = resolver.resolveVpcEndpoints(appDefinition, discovery);

            expect(decisions.s3.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.s3.physicalId).toBe('vpce-s3-stack');

            // Others not in stack - should create new
            expect(decisions.dynamodb.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.dynamodb.physicalId).toBeUndefined();
            expect(decisions.kms.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.secretsManager.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.sqs.ownership).toBe(ResourceOwnership.STACK);
        });
    });

    describe('resolveAll', () => {
        it('should resolve all VPC resources at once', () => {
            const appDefinition = {
                vpc: {
                    ownership: {
                        vpc: 'auto',
                        securityGroup: 'auto',
                        subnets: 'auto',
                        natGateway: 'auto',
                        vpcEndpoints: 'auto'
                    }
                }
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' },
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-456', resourceType: 'AWS::EC2::SecurityGroup' },
                    { logicalId: 'FriggPrivateSubnet1', physicalId: 'subnet-1', resourceType: 'AWS::EC2::Subnet' },
                    { logicalId: 'FriggPrivateSubnet2', physicalId: 'subnet-2', resourceType: 'AWS::EC2::Subnet' },
                    { logicalId: 'FriggNatGateway', physicalId: 'nat-789', resourceType: 'AWS::EC2::NatGateway' },
                    { logicalId: 'FriggS3VPCEndpoint', physicalId: 'vpce-s3', resourceType: 'AWS::EC2::VPCEndpoint' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            expect(decisions.vpc.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.securityGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.subnets.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.natGateway.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.vpcEndpoints.s3.ownership).toBe(ResourceOwnership.STACK);
        });

        it('should handle mixed ownership scenarios', () => {
            const appDefinition = {
                vpc: {
                    ownership: {
                        vpc: 'external',
                        securityGroup: 'stack',
                        subnets: 'stack',
                        natGateway: 'auto',
                        vpcEndpoints: 'auto'
                    },
                    external: {
                        vpcId: 'vpc-shared-production'
                    }
                }
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-stack', resourceType: 'AWS::EC2::SecurityGroup' },
                    { logicalId: 'FriggPrivateSubnet1', physicalId: 'subnet-1', resourceType: 'AWS::EC2::Subnet' },
                    { logicalId: 'FriggPrivateSubnet2', physicalId: 'subnet-2', resourceType: 'AWS::EC2::Subnet' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            expect(decisions.vpc.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decisions.vpc.physicalId).toBe('vpc-shared-production');
            expect(decisions.securityGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.subnets.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.natGateway.ownership).toBe(ResourceOwnership.STACK); // Not found, create new
        });
    });

    describe('real-world scenarios', () => {
        it('scenario: fresh deploy, no resources exist', () => {
            const appDefinition = {
                vpc: { enable: true, ownership: {} }
            };
            const discovery = { stackManaged: [], external: [], fromCloudFormation: false };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            // All should be STACK (create new)
            expect(decisions.vpc.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.securityGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.subnets.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.natGateway.ownership).toBe(ResourceOwnership.STACK);
        });

        it('scenario: redeploy existing stack (the original bug case)', () => {
            const appDefinition = {
                vpc: { enable: true, ownership: {} }
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' },
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-069629001ade41c9a', resourceType: 'AWS::EC2::SecurityGroup' },
                    { logicalId: 'FriggPrivateSubnet1', physicalId: 'subnet-1', resourceType: 'AWS::EC2::Subnet' },
                    { logicalId: 'FriggPrivateSubnet2', physicalId: 'subnet-2', resourceType: 'AWS::EC2::Subnet' }
                ],
                external: [],
                fromCloudFormation: true,
                stackName: 'create-frigg-app-production'
            };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            // CRITICAL: All resources in stack must get STACK ownership
            expect(decisions.vpc.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.vpc.physicalId).toBe('vpc-123');

            expect(decisions.securityGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.securityGroup.physicalId).toBe('sg-069629001ade41c9a');
            expect(decisions.securityGroup.reason).toContain('Found FriggLambdaSecurityGroup in CloudFormation stack');

            expect(decisions.subnets.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.subnets.physicalIds).toEqual(['subnet-1', 'subnet-2']);
        });

        it('scenario: use shared VPC with stack-managed resources', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    ownership: {
                        vpc: 'external',
                        securityGroup: 'auto',
                        subnets: 'auto'
                    },
                    external: {
                        vpcId: 'vpc-shared-across-stages'
                    }
                }
            };
            const discovery = {
                stackManaged: [
                    { logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-stage-specific', resourceType: 'AWS::EC2::SecurityGroup' },
                    { logicalId: 'FriggPrivateSubnet1', physicalId: 'subnet-1', resourceType: 'AWS::EC2::Subnet' },
                    { logicalId: 'FriggPrivateSubnet2', physicalId: 'subnet-2', resourceType: 'AWS::EC2::Subnet' }
                ],
                external: [],
                fromCloudFormation: true
            };

            const decisions = resolver.resolveAll(appDefinition, discovery);

            // VPC is external
            expect(decisions.vpc.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decisions.vpc.physicalId).toBe('vpc-shared-across-stages');

            // But security group and subnets are stack-managed
            expect(decisions.securityGroup.ownership).toBe(ResourceOwnership.STACK);
            expect(decisions.subnets.ownership).toBe(ResourceOwnership.STACK);
        });
    });
});
