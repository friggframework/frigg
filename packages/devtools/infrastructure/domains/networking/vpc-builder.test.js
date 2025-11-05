/**
 * Tests for VPC Builder
 * 
 * Tests VPC infrastructure building with various management modes
 */

const { VpcBuilder } = require('./vpc-builder');
const { ValidationResult } = require('../shared/base-builder');

describe('VpcBuilder', () => {
    let vpcBuilder;

    beforeEach(() => {
        vpcBuilder = new VpcBuilder();
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    afterEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    describe('shouldExecute()', () => {
        it('should return true when VPC is enabled', () => {
            const appDefinition = {
                vpc: { enable: true },
            };

            expect(vpcBuilder.shouldExecute(appDefinition)).toBe(true);
        });

        it('should return false when VPC is disabled', () => {
            const appDefinition = {
                vpc: { enable: false },
            };

            expect(vpcBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when VPC is not defined', () => {
            const appDefinition = {};

            expect(vpcBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when FRIGG_SKIP_AWS_DISCOVERY is set (local mode)', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
            const appDefinition = {
                vpc: { enable: true },
            };

            expect(vpcBuilder.shouldExecute(appDefinition)).toBe(false);
        });
    });

    describe('validate()', () => {
        it('should pass validation for valid discover mode config', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result).toBeInstanceOf(ValidationResult);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should pass validation for valid create-new mode config', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should pass validation for valid use-existing mode with vpcId', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    vpcId: 'vpc-123456',
                    securityGroupIds: ['sg-123'],
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should error if VPC configuration is missing', () => {
            const appDefinition = {};

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('VPC configuration is missing');
        });

        it('should error for invalid management mode', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'invalid-mode',
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors.some(err => err.includes('Invalid vpc.management'))).toBe(true);
        });

        it('should error when use-existing mode without vpcId', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                'vpc.vpcId is required when management="use-existing"'
            );
        });

        it('should warn when use-existing mode without security groups', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    vpcId: 'vpc-123',
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.warnings.some(warn => warn.includes('securityGroupIds not provided'))).toBe(true);
        });

        it('should error for invalid CIDR block format', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    cidrBlock: 'invalid-cidr',
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors.some(err => err.includes('Invalid CIDR block format'))).toBe(true);
        });

        it('should accept valid CIDR block formats', () => {
            const validCidrs = ['10.0.0.0/16', '172.31.0.0/16', '192.168.0.0/24'];

            validCidrs.forEach(cidr => {
                const appDefinition = {
                    vpc: {
                        enable: true,
                        cidrBlock: cidr,
                    },
                };

                const result = vpcBuilder.validate(appDefinition);
                expect(result.valid).toBe(true);
            });
        });

        it('should error when use-existing subnets without subnet IDs', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    subnets: {
                        management: 'use-existing',
                    },
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors.some(err => err.includes('At least 2 subnet IDs required'))).toBe(true);
        });

        it('should error when use-existing subnets with only 1 subnet', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    subnets: {
                        management: 'use-existing',
                        ids: ['subnet-1'],
                    },
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
        });

        it('should pass when use-existing subnets with 2+ subnets', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    subnets: {
                        management: 'use-existing',
                        ids: ['subnet-1', 'subnet-2'],
                    },
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should default to discover mode when management not specified', () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                },
            };

            const result = vpcBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });
    });

    describe('build() - discover mode', () => {
        it('should reuse stack-managed subnets when discovered from CloudFormation', async () => {
            const appDefinition = {
                vpc: { enable: true },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-discovered',
                privateSubnetId1: 'subnet-stack-private-1',
                privateSubnetId2: 'subnet-stack-private-2',
                publicSubnetId1: 'subnet-stack-public-1',
                publicSubnetId2: 'subnet-stack-public-2',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should use discovered VPC
            expect(result.vpcId).toBe('vpc-discovered');

            // Should reuse stack-managed subnets (not create new ones)
            expect(result.vpcConfig.subnetIds).toEqual([
                'subnet-stack-private-1',
                'subnet-stack-private-2',
            ]);

            // Should NOT create new subnet resources
            expect(result.resources.FriggPrivateSubnet1).toBeUndefined();
            expect(result.resources.FriggPrivateSubnet2).toBeUndefined();
        });

        it('should use discovered VPC but create stage-specific subnets when no stack subnets exist', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-discovered',
                // No stack-managed subnets, so create new ones for stage isolation
                defaultSecurityGroupId: 'sg-discovered',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should create new stage-specific subnets for isolation (prevent route table conflicts)
            expect(result.vpcConfig.subnetIds).toEqual([
                { Ref: 'FriggPrivateSubnet1' },
                { Ref: 'FriggPrivateSubnet2' },
            ]);
            expect(result.resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2).toBeDefined();
            // In discover mode, we create FriggLambdaSecurityGroup in the discovered VPC
            expect(result.vpcConfig.securityGroupIds).toEqual([{ Ref: 'FriggLambdaSecurityGroup' }]);
            expect(result.resources.FriggLambdaSecurityGroup).toBeDefined();
            expect(result.resources.FriggLambdaSecurityGroup.Properties.VpcId).toBe('vpc-discovered');
        });

        it('should allow sharing discovered subnets when explicitly configured', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    subnets: {
                        management: 'discover', // Explicitly opt-in to subnet sharing
                    },
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-discovered',
                privateSubnetId1: 'subnet-shared-1',
                privateSubnetId2: 'subnet-shared-2',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // OLD BEHAVIOR: When explicitly set to 'discover', reuse discovered subnets
            expect(result.vpcConfig.subnetIds).toEqual(['subnet-shared-1', 'subnet-shared-2']);
            expect(result.resources.FriggPrivateSubnet1).toBeUndefined();
        });

        it('should create VPC endpoints in discover mode with selfHeal when none exist', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    selfHeal: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-discovered',
                privateSubnetId1: 'subnet-private1',
                privateSubnetId2: 'subnet-private2',
                existingNatGatewayId: 'nat-123',
                // No VPC endpoints discovered
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // With selfHeal enabled and no VPC endpoints found, they should be created
            expect(result.resources.FriggS3VPCEndpoint).toBeDefined();
            expect(result.resources.FriggDynamoDBVPCEndpoint).toBeDefined();
            expect(result.resources.FriggLambdaRouteTable).toBeDefined();
        });

        it('should NOT create VPC endpoints in discover mode when they already exist', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    selfHeal: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-discovered',
                privateSubnetId1: 'subnet-private1',
                privateSubnetId2: 'subnet-private2',
                existingNatGatewayId: 'nat-123',
                // VPC endpoints already exist
                s3VpcEndpointId: 'vpce-s3-123',
                dynamodbVpcEndpointId: 'vpce-dynamodb-456',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // With existing VPC endpoints discovered, they should NOT be recreated
            expect(result.resources.FriggS3VPCEndpoint).toBeUndefined();
            expect(result.resources.FriggDynamoDBVPCEndpoint).toBeUndefined();
        });

        it('should create VPC endpoints with selfHeal when missing', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    selfHeal: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                defaultSecurityGroupId: 'sg-123',
                // No VPC endpoints discovered - selfHeal should create them
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggS3VPCEndpoint).toBeDefined();
            expect(result.resources.FriggS3VPCEndpoint.Type).toBe('AWS::EC2::VPCEndpoint');
            expect(result.resources.FriggS3VPCEndpoint.Properties.VpcId).toBe('vpc-123');
        });

        it('should add stack-managed security group back to template to prevent deletion', async () => {
            const appDefinition = {
                vpc: { enable: true },
            };
            
            const discoveredResources = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: ['FriggLambdaSecurityGroup'],
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                lambdaSecurityGroupId: 'sg-existing-stack', // Existing in stack
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // CRITICAL: Must RE-ADD stack-managed SG to template or CloudFormation will DELETE it
            expect(result.resources.FriggLambdaSecurityGroup).toBeDefined();
            expect(result.resources.FriggLambdaSecurityGroup.Type).toBe('AWS::EC2::SecurityGroup');
            expect(result.resources.FriggLambdaSecurityGroup.Properties.VpcId).toBe('vpc-123');
            expect(result.resources.FriggLambdaSecurityGroup.Properties.GroupDescription).toBeDefined();
            
            // Should use Ref in Lambda config (not recreating)
            expect(result.vpcConfig.securityGroupIds).toContainEqual({ Ref: 'FriggLambdaSecurityGroup' });
        });

        it('should add stack-managed subnets back to template to prevent deletion', async () => {
            const appDefinition = {
                vpc: { enable: true },
            };
            
            const discoveredResources = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: ['FriggPrivateSubnet1', 'FriggPrivateSubnet2'],
                defaultVpcId: 'vpc-123',
                // Subnets exist in stack with specific IDs
                privateSubnetId1: 'subnet-existing-1',
                privateSubnetId2: 'subnet-existing-2',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // CRITICAL: Must RE-ADD stack-managed subnets to template or CloudFormation will DELETE them
            expect(result.resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.FriggPrivateSubnet1.Type).toBe('AWS::EC2::Subnet');
            expect(result.resources.FriggPrivateSubnet1.Properties.VpcId).toBe('vpc-123');
            
            expect(result.resources.FriggPrivateSubnet2).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2.Type).toBe('AWS::EC2::Subnet');
            expect(result.resources.FriggPrivateSubnet2.Properties.VpcId).toBe('vpc-123');
            
            // Should use Refs (not external IDs)
            expect(result.vpcConfig.subnetIds).toEqual([
                { Ref: 'FriggPrivateSubnet1' },
                { Ref: 'FriggPrivateSubnet2' }
            ]);
        });

        it('should add stack-managed VPC endpoints back to template to prevent deletion', async () => {
            const appDefinition = {
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
            };
            
            // Structured discovery from CloudFormation
            const discoveredResources = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: [
                    'FriggLambdaSecurityGroup',
                    'FriggLambdaRouteTable',
                    'FriggS3VPCEndpoint',
                    'FriggDynamoDBVPCEndpoint',
                    'FriggKMSVPCEndpoint',
                    'FriggSecretsManagerVPCEndpoint',
                    'FriggSQSVPCEndpoint'
                ],
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                routeTableId: 'rtb-123',
                lambdaSecurityGroupId: 'sg-123',
                // VPC endpoints discovered in stack
                s3VpcEndpointId: 'vpce-s3-stack',
                dynamodbVpcEndpointId: 'vpce-ddb-stack',
                kmsVpcEndpointId: 'vpce-kms-stack',
                secretsManagerVpcEndpointId: 'vpce-sm-stack',
                sqsVpcEndpointId: 'vpce-sqs-stack',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // CRITICAL: Must RE-ADD stack-managed endpoints to template or CloudFormation will DELETE them
            expect(result.resources.FriggS3VPCEndpoint).toBeDefined();
            expect(result.resources.FriggS3VPCEndpoint.Type).toBe('AWS::EC2::VPCEndpoint');
            expect(result.resources.FriggS3VPCEndpoint.Properties.VpcEndpointType).toBe('Gateway');
            
            expect(result.resources.FriggDynamoDBVPCEndpoint).toBeDefined();
            expect(result.resources.FriggDynamoDBVPCEndpoint.Type).toBe('AWS::EC2::VPCEndpoint');
            expect(result.resources.FriggDynamoDBVPCEndpoint.Properties.VpcEndpointType).toBe('Gateway');
            
            expect(result.resources.FriggKMSVPCEndpoint).toBeDefined();
            expect(result.resources.FriggKMSVPCEndpoint.Type).toBe('AWS::EC2::VPCEndpoint');
            expect(result.resources.FriggKMSVPCEndpoint.Properties.VpcEndpointType).toBe('Interface');
            
            expect(result.resources.FriggSecretsManagerVPCEndpoint).toBeDefined();
            expect(result.resources.FriggSecretsManagerVPCEndpoint.Type).toBe('AWS::EC2::VPCEndpoint');
            expect(result.resources.FriggSecretsManagerVPCEndpoint.Properties.VpcEndpointType).toBe('Interface');
            
            expect(result.resources.FriggSQSVPCEndpoint).toBeDefined();
            expect(result.resources.FriggSQSVPCEndpoint.Type).toBe('AWS::EC2::VPCEndpoint');
            expect(result.resources.FriggSQSVPCEndpoint.Properties.VpcEndpointType).toBe('Interface');

            // Should create VPC Endpoint Security Group for interface endpoints
            expect(result.resources.FriggVPCEndpointSecurityGroup).toBeDefined();
            expect(result.resources.FriggVPCEndpointSecurityGroup.Type).toBe('AWS::EC2::SecurityGroup');
        });

        it('should create VPC endpoints when discovered from AWS but not stack', async () => {
            const appDefinition = {
                vpc: { enable: true, enableVPCEndpoints: true, selfHeal: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
            };
            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                // No VPC endpoints in stack (would be strings)
                // existingEndpoints will be passed as empty
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should create CloudFormation resources (not in stack)
            expect(result.resources.FriggS3VPCEndpoint).toBeDefined();
            expect(result.resources.FriggDynamoDBVPCEndpoint).toBeDefined();
            expect(result.resources.FriggKMSVPCEndpoint).toBeDefined();
            expect(result.resources.FriggSecretsManagerVPCEndpoint).toBeDefined();
            expect(result.resources.FriggSQSVPCEndpoint).toBeDefined();
        });

        it('should skip VPC endpoints when disabled', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    enableVPCEndpoints: false,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggS3VPCEndpoint).toBeUndefined();
        });

        it('should create route table associations when VPC endpoints exist but no NAT Gateway', async () => {
            const appDefinition = {
                vpc: { enable: true, enableVPCEndpoints: true, selfHeal: true },
            };
            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                // No NAT Gateway, so associations won't be created by NAT Gateway routing
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Route table should be created for VPC endpoints
            expect(result.resources.FriggLambdaRouteTable).toBeDefined();
            expect(result.resources.FriggLambdaRouteTable.Type).toBe('AWS::EC2::RouteTable');

            // Subnet associations should be created (healing)
            expect(result.resources.FriggPrivateSubnet1RouteTableAssociation).toBeDefined();
            expect(result.resources.FriggPrivateSubnet1RouteTableAssociation.Type).toBe('AWS::EC2::SubnetRouteTableAssociation');
            expect(result.resources.FriggPrivateSubnet1RouteTableAssociation.Properties.SubnetId).toBe('subnet-1');

            expect(result.resources.FriggPrivateSubnet2RouteTableAssociation).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2RouteTableAssociation.Properties.SubnetId).toBe('subnet-2');
        });

        it('should include IAM permissions for VPC operations', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-priv1',
                privateSubnetId2: 'subnet-priv2',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            const vpcPermissions = result.iamStatements.find(stmt =>
                stmt.Action.includes('ec2:CreateNetworkInterface')
            );

            expect(vpcPermissions).toBeDefined();
            expect(vpcPermissions.Action).toContain('ec2:DescribeNetworkInterfaces');
            expect(vpcPermissions.Action).toContain('ec2:DeleteNetworkInterface');
        });
    });

    describe('build() - create-new mode', () => {
        it('should create complete VPC infrastructure', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            expect(result.resources.FriggVPC).toBeDefined();
            expect(result.resources.FriggVPC.Type).toBe('AWS::EC2::VPC');
            expect(result.resources.FriggVPC.Properties.CidrBlock).toBe('10.0.0.0/16');
        });

        it('should create private and public subnets', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            expect(result.resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2).toBeDefined();
            expect(result.resources.FriggPublicSubnet).toBeDefined();
        });

        it('should create security group for Lambda functions', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            expect(result.resources.FriggLambdaSecurityGroup).toBeDefined();
            expect(result.resources.FriggLambdaSecurityGroup.Type).toBe('AWS::EC2::SecurityGroup');
        });

        it('should use CloudFormation references for new resources', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            expect(result.vpcConfig.securityGroupIds).toEqual([{ Ref: 'FriggLambdaSecurityGroup' }]);
            expect(result.vpcConfig.subnetIds).toContainEqual({ Ref: 'FriggPrivateSubnet1' });
            expect(result.vpcConfig.subnetIds).toContainEqual({ Ref: 'FriggPrivateSubnet2' });
        });

        it('should use custom CIDR block if provided', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                    cidrBlock: '192.168.0.0/16',
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            expect(result.resources.FriggVPC.Properties.CidrBlock).toBe('192.168.0.0/16');
        });
    });

    describe('build() - use-existing mode', () => {
        it('should use provided VPC and subnet IDs', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    vpcId: 'vpc-custom',
                    subnets: {
                        ids: ['subnet-a', 'subnet-b'],
                    },
                    securityGroupIds: ['sg-custom'],
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            expect(result.vpcConfig.subnetIds).toEqual(['subnet-a', 'subnet-b']);
            expect(result.vpcConfig.securityGroupIds).toEqual(['sg-custom']);
        });

        it('should not create VPC resources in use-existing mode', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    vpcId: 'vpc-custom',
                    subnets: {
                        ids: ['subnet-a', 'subnet-b'],
                    },
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            expect(result.resources.FriggVPC).toBeUndefined();
            expect(result.resources.FriggPrivateSubnet1).toBeUndefined();
        });
    });

    describe('getDependencies()', () => {
        it('should have no dependencies', () => {
            const deps = vpcBuilder.getDependencies();

            expect(deps).toEqual([]);
        });
    });

    describe('getName()', () => {
        it('should return VpcBuilder', () => {
            expect(vpcBuilder.getName()).toBe('VpcBuilder');
        });
    });

    describe('NAT Gateway handling', () => {
        it('should create NAT gateway when management is createAndManage', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'createAndManage',
                    },
                    selfHeal: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                publicSubnetId: 'subnet-public',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggNATGateway).toBeDefined();
            expect(result.resources.FriggNATGateway.Type).toBe('AWS::EC2::NatGateway');
        });

        it('should create route table associations for private subnets with NAT Gateway', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    subnets: { management: 'create' },
                    natGateway: {
                        management: 'createAndManage',
                    },
                    selfHeal: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                publicSubnetId: 'subnet-public',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Verify route table is created
            expect(result.resources.FriggLambdaRouteTable).toBeDefined();
            expect(result.resources.FriggLambdaRouteTable.Type).toBe('AWS::EC2::RouteTable');

            // Verify route to NAT Gateway
            expect(result.resources.FriggPrivateRoute).toBeDefined();
            expect(result.resources.FriggPrivateRoute.Properties.NatGatewayId).toEqual({ Ref: 'FriggNATGateway' });

            // Verify subnet route table associations
            expect(result.resources.FriggPrivateSubnet1RouteTableAssociation).toBeDefined();
            expect(result.resources.FriggPrivateSubnet1RouteTableAssociation.Type).toBe('AWS::EC2::SubnetRouteTableAssociation');
            expect(result.resources.FriggPrivateSubnet1RouteTableAssociation.Properties.SubnetId).toEqual({ Ref: 'FriggPrivateSubnet1' });
            expect(result.resources.FriggPrivateSubnet1RouteTableAssociation.Properties.RouteTableId).toEqual({ Ref: 'FriggLambdaRouteTable' });

            expect(result.resources.FriggPrivateSubnet2RouteTableAssociation).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2RouteTableAssociation.Type).toBe('AWS::EC2::SubnetRouteTableAssociation');
            expect(result.resources.FriggPrivateSubnet2RouteTableAssociation.Properties.SubnetId).toEqual({ Ref: 'FriggPrivateSubnet2' });
            expect(result.resources.FriggPrivateSubnet2RouteTableAssociation.Properties.RouteTableId).toEqual({ Ref: 'FriggLambdaRouteTable' });
        });

        it('should not create NAT when existing NAT is properly placed', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: {
                        management: 'createAndManage',
                    },
                    selfHeal: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: 'nat-good',
                natGatewayInPrivateSubnet: false,
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggNATGateway).toBeUndefined();
        });

        it('should create new NAT when existing is in private subnet', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: {
                        management: 'createAndManage',
                    },
                    selfHeal: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: 'nat-misplaced',
                natGatewayInPrivateSubnet: true, // WRONG placement
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggNATGateway).toBeDefined();
        });

        it('should create new NAT Gateway when existing is in private subnet', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: {
                        management: 'createAndManage',
                    },
                    selfHeal: false,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-priv1',
                privateSubnetId2: 'subnet-priv2',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: 'nat-misplaced',
                natGatewayInPrivateSubnet: true,
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should create new NAT Gateway instead of using the misplaced one
            expect(result.resources.FriggNATGateway).toBeDefined();
            expect(result.resources.FriggNATGateway.Type).toBe('AWS::EC2::NatGateway');
        });

        it('should reuse existing elastic IP allocation', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: {
                        management: 'createAndManage',
                    },
                    selfHeal: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                publicSubnetId: 'subnet-public',
                existingElasticIpAllocationId: 'eipalloc-123',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            if (result.resources.FriggNATGateway) {
                // When reusing existing EIP, it should be a CloudFormation reference
                expect(result.resources.FriggNATGateway.Properties.AllocationId).toEqual(
                    { 'Fn::GetAtt': ['FriggNATGatewayEIP', 'AllocationId'] }
                );
            }
        });
    });

    describe('VPC Endpoints', () => {
        it('should create KMS endpoint when KMS encryption is enabled', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            const discoveredResources = {};

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggKMSVPCEndpoint).toBeDefined();
        });

        it('should create Secrets Manager endpoint when enabled', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
                secretsManager: {
                    enable: true,
                },
            };

            const discoveredResources = {};

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggSecretsManagerVPCEndpoint).toBeDefined();
        });

        it('should not create KMS endpoint when encryption is AES', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
                encryption: {
                    fieldLevelEncryptionMethod: 'aes',
                },
            };

            const discoveredResources = {};

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggKMSVPCEndpoint).toBeUndefined();
        });
    });

    describe('Self-healing', () => {
        it('should create missing subnets when selfHeal is enabled', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    selfHeal: true,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: null,
                privateSubnetId2: null,
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2).toBeDefined();
        });

        it('should throw error for missing subnets without selfHeal', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    subnets: { management: 'discover' },
                    selfHeal: false,
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: null,
                privateSubnetId2: null,
            };

            await expect(vpcBuilder.build(appDefinition, discoveredResources)).rejects.toThrow(
                'No subnets discovered'
            );
        });
    });

    describe('Management Mode (Simplified API)', () => {
        it('should reuse stack VPC when managementMode=managed + vpcIsolation=isolated AND stack has VPC', async () => {
            const appDefinition = {
                managementMode: 'managed',
                vpcIsolation: 'isolated',
                vpc: {
                    enable: true,
                    management: 'create-new',  // Should be IGNORED
                },
            };

            // CloudFormation stack has VPC (from previous deployment of this stage)
            const discoveredResources = {
                defaultVpcId: 'vpc-stack-dev',  // CloudFormation discovery sets this
                privateSubnetId1: 'subnet-private-1',
                privateSubnetId2: 'subnet-private-2',
                publicSubnetId1: 'subnet-public-1',
                publicSubnetId2: 'subnet-public-2',
            };

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should warn about ignored options
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("managementMode='managed' ignoring")
            );

            // Should log reusing stack VPC
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("stack has VPC, reusing")
            );

            // Should keep VPC definition in template (CloudFormation idempotency)
            // Even though VPC exists, we include the definition - CF won't recreate it
            expect(result.vpcId).toEqual({ Ref: 'FriggVPC' });
            expect(result.resources.FriggVPC).toBeDefined();
            expect(result.resources.FriggVPC.Type).toBe('AWS::EC2::VPC');

            // Should keep subnet definitions in template and use Refs
            expect(result.vpcConfig.subnetIds).toEqual([
                { Ref: 'FriggPrivateSubnet1' },
                { Ref: 'FriggPrivateSubnet2' }
            ]);
            expect(result.resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2).toBeDefined();

            consoleLogSpy.mockRestore();
        });

        it('should create new VPC when managementMode=managed + vpcIsolation=isolated AND stack has NO VPC', async () => {
            const appDefinition = {
                managementMode: 'managed',
                vpcIsolation: 'isolated',
                vpc: {
                    enable: true,
                    management: 'discover',  // Should be IGNORED
                },
            };

            // No VPC in CloudFormation stack (fresh deployment)
            // Default VPC might exist in AWS, but not stack-managed
            const discoveredResources = {
                // No defaultVpcId means no VPC in CloudFormation stack
            };

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should warn about ignored options
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("managementMode='managed' ignoring")
            );

            // Should log creating new VPC
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("no stack VPC, creating new")
            );

            // Should create new isolated VPC
            expect(result.vpcId).toEqual({ Ref: 'FriggVPC' });
            expect(result.resources.FriggVPC).toBeDefined();

            // Subnets should use CloudFormation Fn::Cidr
            expect(result.resources.FriggPrivateSubnet1.Properties.CidrBlock).toEqual({
                'Fn::Select': [0, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }]
            });

            consoleLogSpy.mockRestore();
        });

        it('should use managementMode=managed with vpcIsolation=shared to discover VPC', async () => {
            const appDefinition = {
                managementMode: 'managed',
                vpcIsolation: 'shared',
                vpc: {
                    enable: true,
                    subnets: { management: 'use-existing' },  // Should be IGNORED
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-existing',
            };

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should warn about ignored options
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("ignoring")
            );

            // Should discover existing VPC
            expect(result.vpcId).toBe('vpc-existing');
            expect(result.resources.FriggVPC).toBeUndefined();

            // Should create new stage-specific subnets
            expect(result.resources.FriggPrivateSubnet1).toBeDefined();

            consoleLogSpy.mockRestore();
        });

        it('should default to discover mode for backwards compatibility', async () => {
            const appDefinition = {
                // No managementMode specified
                vpc: {
                    enable: true,
                    management: 'create-new',  // Should be RESPECTED
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            // Should respect legacy vpc.management
            expect(result.vpcId).toEqual({ Ref: 'FriggVPC' });
            expect(result.resources.FriggVPC).toBeDefined();
        });
    });

    describe('VPC Sharing Control', () => {
        it('should share VPC across stages when shareAcrossStages is true (default)', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    shareAcrossStages: true, // Explicit opt-in to sharing
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-shared',
                natGatewayId: 'nat-shared',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should use discovered VPC (not create new one)
            expect(result.vpcId).toBe('vpc-shared');
            expect(result.resources.FriggVPC).toBeUndefined();

            // Should create stage-specific subnets for isolation
            expect(result.resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2).toBeDefined();

            // Should reuse discovered NAT Gateway
            expect(result.resources.FriggNATGateway).toBeUndefined();
        });

        it('should create isolated VPC when shareAcrossStages is false', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    shareAcrossStages: false, // Explicit opt-out of sharing
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-shared',
                natGatewayId: 'nat-shared',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should create new VPC (ignore discovered resources)
            expect(result.vpcId).toEqual({ Ref: 'FriggVPC' });
            expect(result.resources.FriggVPC).toBeDefined();
            expect(result.resources.FriggVPC.Properties.CidrBlock).toBe('10.0.0.0/16');

            // Should create stage-specific subnets with Fn::Cidr (dynamic from VPC CIDR)
            expect(result.resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2).toBeDefined();

            // Subnets should use CloudFormation Fn::Cidr, NOT hardcoded 172.31.x.x
            expect(result.resources.FriggPrivateSubnet1.Properties.CidrBlock).toEqual({
                'Fn::Select': [0, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }]
            });
            expect(result.resources.FriggPrivateSubnet2.Properties.CidrBlock).toEqual({
                'Fn::Select': [1, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }]
            });

            // Should create new NAT Gateway
            expect(result.resources.FriggNATGateway).toBeDefined();
        });

        it('should default to shared VPC when shareAcrossStages is not specified', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    // shareAcrossStages not specified - should default to true
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-discovered',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Should use discovered VPC by default (backwards compatibility)
            expect(result.vpcId).toBe('vpc-discovered');
            expect(result.resources.FriggVPC).toBeUndefined();
        });
    });

    describe('generateSubnetCidrs()', () => {
        it('should use CloudFormation Fn::Cidr for create-new mode', () => {
            const cidrs = vpcBuilder.generateSubnetCidrs('create-new', {});

            expect(cidrs.private1).toEqual({
                'Fn::Select': [0, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }]
            });
            expect(cidrs.private2).toEqual({
                'Fn::Select': [1, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }]
            });
            expect(cidrs.public1).toEqual({
                'Fn::Select': [2, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }]
            });
            expect(cidrs.public2).toEqual({
                'Fn::Select': [3, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }]
            });
        });

        it('should use default static CIDRs when no existing subnets in VPC', () => {
            const discoveredResources = {
                subnets: []
            };

            const cidrs = vpcBuilder.generateSubnetCidrs('discover', discoveredResources);

            expect(cidrs.private1).toBe('172.31.240.0/24');
            expect(cidrs.private2).toBe('172.31.241.0/24');
            expect(cidrs.public1).toBe('172.31.250.0/24');
            expect(cidrs.public2).toBe('172.31.251.0/24');
        });

        it('should avoid CIDR conflicts with existing subnets', () => {
            const discoveredResources = {
                subnets: [
                    { CidrBlock: '172.31.240.0/24' },  // Conflicts with default private1
                    { CidrBlock: '172.31.241.0/24' },  // Conflicts with default private2
                    { CidrBlock: '172.31.0.0/20' },    // Default VPC subnet
                    { CidrBlock: '172.31.16.0/20' },   // Default VPC subnet
                ]
            };

            const cidrs = vpcBuilder.generateSubnetCidrs('discover', discoveredResources);

            // Should skip 240 and 241 (already taken), use 242-243 for private, 250-251 for public
            expect(cidrs.private1).toBe('172.31.242.0/24');
            expect(cidrs.private2).toBe('172.31.243.0/24');
            expect(cidrs.public1).toBe('172.31.250.0/24');  // Public range starts at 250
            expect(cidrs.public2).toBe('172.31.251.0/24');
        });

        it('should find first available CIDR blocks when some in range are taken', () => {
            const discoveredResources = {
                subnets: [
                    { CidrBlock: '172.31.240.0/24' },
                    { CidrBlock: '172.31.242.0/24' },
                    { CidrBlock: '172.31.244.0/24' },
                ]
            };

            const cidrs = vpcBuilder.generateSubnetCidrs('discover', discoveredResources);

            // Should use 241, 243 for private (filling gaps), 250, 251 for public
            expect(cidrs.private1).toBe('172.31.241.0/24');
            expect(cidrs.private2).toBe('172.31.243.0/24');
            expect(cidrs.public1).toBe('172.31.250.0/24');   // Public range starts at 250
            expect(cidrs.public2).toBe('172.31.251.0/24');
        });

        it('should handle missing discoveredResources gracefully', () => {
            const cidrs = vpcBuilder.generateSubnetCidrs('discover', null);

            // Should fallback to default CIDRs
            expect(cidrs.private1).toBe('172.31.240.0/24');
            expect(cidrs.private2).toBe('172.31.241.0/24');
        });

        it('should handle discoveredResources without subnets array', () => {
            const discoveredResources = { vpcId: 'vpc-123' };

            const cidrs = vpcBuilder.generateSubnetCidrs('discover', discoveredResources);

            // Should fallback to default CIDRs
            expect(cidrs.private1).toBe('172.31.240.0/24');
            expect(cidrs.private2).toBe('172.31.241.0/24');
        });
    });

    describe('Outputs', () => {
        it.skip('should generate VPC ID output', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            expect(result.outputs.VpcId).toBeDefined();
        });

        it.skip('should generate subnet outputs', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                },
            };

            const result = await vpcBuilder.build(appDefinition, {});

            expect(result.outputs.PrivateSubnet1Id).toBeDefined();
            expect(result.outputs.PrivateSubnet2Id).toBeDefined();
        });
    });

    describe('External VPC with stack-managed routing infrastructure pattern', () => {
        it('should correctly handle external VPC with stack-managed routing infrastructure', async () => {
            // This pattern occurs when VPC/subnets/NAT are external but routing (route tables,
            // VPC endpoints, security groups) are managed by CloudFormation stack
            const appDefinition = {
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
            };
            
            // Discovery results from real-world production scenario
            const discoveredResources = {
                fromCloudFormationStack: true,
                stackName: 'test-production-stack',
                existingLogicalIds: [
                    'FriggLambdaSecurityGroup',
                    'FriggLambdaRouteTable',
                    'FriggPrivateRoute',
                    'FriggPrivateSubnet1RouteTableAssociation',
                    'FriggPrivateSubnet2RouteTableAssociation',
                    'FriggS3VPCEndpoint',
                    'FriggDynamoDBVPCEndpoint',
                    'FriggKMSVPCEndpoint'
                ],
                // Stack resources (from CloudFormation)
                lambdaSecurityGroupId: 'sg-01002240c6a446202',
                routeTableId: 'rtb-08af43bbf0775602d',
                s3VpcEndpointId: 'vpce-0d1ecb2c53ce9b4b8',
                dynamodbVpcEndpointId: 'vpce-0fb749b207f1020b0',
                kmsVpcEndpointId: 'vpce-0e38c25155b86de22',
                // External resources (discovered via queries)
                defaultVpcId: 'vpc-0cd17c0e06cb28b28',
                privateSubnetId1: 'subnet-034f6562dbbc16348',
                privateSubnetId2: 'subnet-0b8be2b82aeb5cdec',
                existingNatGatewayId: 'nat-022660c36a47e2d79'
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // === ASSERTIONS: Template Structure ===
            
            // 1. VPC should be external (not in template)
            expect(result.resources.FriggVPC).toBeUndefined();
            expect(result.vpcId).toBe('vpc-0cd17c0e06cb28b28');
            
            // 2. Security Group MUST be in template (stack-managed)
            expect(result.resources.FriggLambdaSecurityGroup).toBeDefined();
            expect(result.resources.FriggLambdaSecurityGroup.Type).toBe('AWS::EC2::SecurityGroup');
            expect(result.vpcConfig.securityGroupIds).toEqual([{ Ref: 'FriggLambdaSecurityGroup' }]);
            
            // 3. Subnets should be external (use hardcoded IDs, not in template)
            expect(result.resources.FriggPrivateSubnet1).toBeUndefined();
            expect(result.resources.FriggPrivateSubnet2).toBeUndefined();
            expect(result.vpcConfig.subnetIds).toEqual([
                'subnet-034f6562dbbc16348',
                'subnet-0b8be2b82aeb5cdec'
            ]);
            
            // 4. NAT Gateway should be external (not in template)
            expect(result.resources.FriggNATGateway).toBeUndefined();
            expect(result.resources.FriggNATGatewayEIP).toBeUndefined();
            expect(result.natGatewayId).toBe('nat-022660c36a47e2d79');
            
            // 5. Route table MUST be in template (stack-managed)
            expect(result.resources.FriggLambdaRouteTable).toBeDefined();
            expect(result.resources.FriggLambdaRouteTable.Type).toBe('AWS::EC2::RouteTable');
            
            // 6. Route table associations MUST be in template
            expect(result.resources.FriggPrivateSubnet1RouteTableAssociation).toBeDefined();
            expect(result.resources.FriggPrivateSubnet2RouteTableAssociation).toBeDefined();
            
            // 7. VPC Endpoints MUST be in template (stack-managed, prevents deletion)
            expect(result.resources.FriggS3VPCEndpoint).toBeDefined();
            expect(result.resources.FriggS3VPCEndpoint.Properties.VpcEndpointType).toBe('Gateway');
            
            expect(result.resources.FriggDynamoDBVPCEndpoint).toBeDefined();
            expect(result.resources.FriggDynamoDBVPCEndpoint.Properties.VpcEndpointType).toBe('Gateway');
            
            expect(result.resources.FriggKMSVPCEndpoint).toBeDefined();
            expect(result.resources.FriggKMSVPCEndpoint.Properties.VpcEndpointType).toBe('Interface');
            
            // 8. VPC Endpoint Security Group needed for interface endpoints
            expect(result.resources.FriggVPCEndpointSecurityGroup).toBeDefined();
            
            // === ASSERTIONS: Resource Count ===
            const resourceKeys = Object.keys(result.resources);
            const friggResources = resourceKeys.filter(k => k.startsWith('Frigg') || k.startsWith('VPC'));
            
            // Should have routing infrastructure + endpoints + security groups
            // NOT full VPC (no FriggVPC, FriggPrivateSubnet1/2, FriggNATGateway)
            expect(friggResources).toContain('FriggLambdaSecurityGroup');
            expect(friggResources).toContain('FriggLambdaRouteTable');
            expect(friggResources).toContain('FriggS3VPCEndpoint');
            expect(friggResources).toContain('FriggDynamoDBVPCEndpoint');
            expect(friggResources).toContain('FriggKMSVPCEndpoint');
            expect(friggResources).not.toContain('FriggVPC');
            expect(friggResources).not.toContain('FriggPrivateSubnet1');
            expect(friggResources).not.toContain('FriggNATGateway');
        });
    });

    describe('convertFlatDiscoveryToStructured - Direct Properties', () => {
        it('should copy flat discovery properties to structured discovery for resolver access', () => {
            const flatDiscovery = {
                fromCloudFormationStack: true,
                defaultVpcId: 'vpc-123',
                defaultSecurityGroupId: 'sg-default-456',
                lambdaSecurityGroupId: 'sg-lambda-789',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                natGatewayId: 'nat-123'
            };

            const result = vpcBuilder.convertFlatDiscoveryToStructured(flatDiscovery);

            // Direct properties should be copied for resolver access
            expect(result.defaultVpcId).toBe('vpc-123');
            expect(result.defaultSecurityGroupId).toBe('sg-default-456');
            expect(result.lambdaSecurityGroupId).toBe('sg-lambda-789');
            expect(result.privateSubnetId1).toBe('subnet-1');
            expect(result.privateSubnetId2).toBe('subnet-2');
            expect(result.natGatewayId).toBe('nat-123');
        });
    });

    describe('convertFlatDiscoveryToStructured - VPC Endpoints from CloudFormation', () => {
        it('should add VPC endpoints to stackManaged when in existingLogicalIds', () => {
            const flatDiscovery = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: [
                    'FriggS3VPCEndpoint',
                    'FriggDynamoDBVPCEndpoint',
                    'FriggKMSVPCEndpoint'
                ],
                s3VpcEndpointId: 'vpce-s3-stack',
                dynamodbVpcEndpointId: 'vpce-ddb-stack',
                kmsVpcEndpointId: 'vpce-kms-stack'
            };

            const result = vpcBuilder.convertFlatDiscoveryToStructured(flatDiscovery);

            // VPC endpoints should be in stackManaged (not external)
            expect(result.stackManaged).toContainEqual(
                expect.objectContaining({
                    logicalId: 'FriggS3VPCEndpoint',
                    physicalId: 'vpce-s3-stack',
                    resourceType: 'AWS::EC2::VPCEndpoint'
                })
            );
            expect(result.stackManaged).toContainEqual(
                expect.objectContaining({
                    logicalId: 'FriggDynamoDBVPCEndpoint',
                    physicalId: 'vpce-ddb-stack',
                    resourceType: 'AWS::EC2::VPCEndpoint'
                })
            );
            expect(result.stackManaged).toContainEqual(
                expect.objectContaining({
                    logicalId: 'FriggKMSVPCEndpoint',
                    physicalId: 'vpce-kms-stack',
                    resourceType: 'AWS::EC2::VPCEndpoint'
                })
            );

            // Should NOT be in external array
            expect(result.external.some(r => r.physicalId === 'vpce-s3-stack')).toBe(false);
            expect(result.external.some(r => r.physicalId === 'vpce-ddb-stack')).toBe(false);
            expect(result.external.some(r => r.physicalId === 'vpce-kms-stack')).toBe(false);
        });

        it('should add VPC endpoints to external when NOT in existingLogicalIds', () => {
            const flatDiscovery = {
                fromCloudFormationStack: false, // AWS API discovery
                s3VpcEndpointId: 'vpce-s3-external',
                dynamodbVpcEndpointId: 'vpce-ddb-external'
            };

            const result = vpcBuilder.convertFlatDiscoveryToStructured(flatDiscovery);

            // Should be in external (AWS discovery)
            expect(result.external).toContainEqual(
                expect.objectContaining({
                    physicalId: 'vpce-s3-external',
                    resourceType: 'AWS::EC2::VPCEndpoint',
                    source: 'aws-discovery'
                })
            );

            // Should NOT be in stackManaged
            expect(result.stackManaged.some(r => r.physicalId === 'vpce-s3-external')).toBe(false);
        });

        it('should preserve existing VPC endpoints and only create missing ones', async () => {
            const appDefinition = {
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
            };
            
            const discoveredResources = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: [
                    'FriggS3VPCEndpoint',      // In stack
                    'FriggDynamoDBVPCEndpoint', // In stack
                    'FriggKMSVPCEndpoint'       // In stack
                    // SecretsManager and SQS NOT in stack (were deleted)
                ],
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                lambdaSecurityGroupId: 'sg-123',
                routeTableId: 'rtb-123',
                // Endpoints in stack
                s3VpcEndpointId: 'vpce-s3-existing',
                dynamodbVpcEndpointId: 'vpce-ddb-existing',
                kmsVpcEndpointId: 'vpce-kms-existing'
                // secretsManagerVpcEndpointId and sqsVpcEndpointId NOT present
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            // Existing endpoints MUST be in template (re-added)
            expect(result.resources.FriggS3VPCEndpoint).toBeDefined();
            expect(result.resources.FriggS3VPCEndpoint.Properties.VpcId).toBe('vpc-123');
            
            expect(result.resources.FriggDynamoDBVPCEndpoint).toBeDefined();
            expect(result.resources.FriggDynamoDBVPCEndpoint.Properties.VpcId).toBe('vpc-123');
            
            expect(result.resources.FriggKMSVPCEndpoint).toBeDefined();
            expect(result.resources.FriggKMSVPCEndpoint.Properties.VpcId).toBe('vpc-123');

            // Missing endpoints should also be created
            expect(result.resources.FriggSecretsManagerVPCEndpoint).toBeDefined();
            expect(result.resources.FriggSQSVPCEndpoint).toBeDefined();
            
            // VPC Endpoint Security Group should be created
            expect(result.resources.FriggVPCEndpointSecurityGroup).toBeDefined();
        });
    });

    describe('convertFlatDiscoveryToStructured - CloudFormation query results', () => {
        it('should add VPC from CloudFormation query to external array', () => {
            const flatDiscovery = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: ['FriggLambdaRouteTable', 'FriggLambdaSecurityGroup'],
                // VPC ID was extracted from security group query (NOT a stack resource)
                defaultVpcId: 'vpc-extracted-from-sg',
                lambdaSecurityGroupId: 'sg-123',
                routeTableId: 'rtb-123'
            };

            const result = vpcBuilder.convertFlatDiscoveryToStructured(flatDiscovery);

            // VPC should be in external array (discovered via query, not in stack)
            const vpcExternal = result.external.find(r => r.resourceType === 'AWS::EC2::VPC');
            expect(vpcExternal).toBeDefined();
            expect(vpcExternal.physicalId).toBe('vpc-extracted-from-sg');
            expect(vpcExternal.source).toBe('cloudformation-query');

            // Security group SHOULD be in stackManaged (is in stack)
            const sgStack = result.stackManaged.find(r => r.logicalId === 'FriggLambdaSecurityGroup');
            expect(sgStack).toBeDefined();
            expect(sgStack.physicalId).toBe('sg-123');
        });

        it('should add subnets from route table associations to external array', () => {
            const flatDiscovery = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: ['FriggLambdaRouteTable'],
                routeTableId: 'rtb-123',
                // Subnets extracted from route table associations (NOT stack resources)
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2'
            };

            const result = vpcBuilder.convertFlatDiscoveryToStructured(flatDiscovery);

            // Subnets should be in external array
            const subnet1 = result.external.find(r => r.physicalId === 'subnet-1');
            const subnet2 = result.external.find(r => r.physicalId === 'subnet-2');
            
            expect(subnet1).toBeDefined();
            expect(subnet1.resourceType).toBe('AWS::EC2::Subnet');
            expect(subnet1.source).toBe('cloudformation-query');
            
            expect(subnet2).toBeDefined();
            expect(subnet2.resourceType).toBe('AWS::EC2::Subnet');
            expect(subnet2.source).toBe('cloudformation-query');
        });

        it('should add NAT Gateway from route table queries to external array', () => {
            const flatDiscovery = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: ['FriggLambdaRouteTable', 'FriggPrivateRoute'],
                routeTableId: 'rtb-123',
                // NAT Gateway extracted from route table routes (NOT a stack resource)
                existingNatGatewayId: 'nat-extracted'
            };

            const result = vpcBuilder.convertFlatDiscoveryToStructured(flatDiscovery);

            // NAT should be in external array
            const natExternal = result.external.find(r => r.resourceType === 'AWS::EC2::NatGateway');
            expect(natExternal).toBeDefined();
            expect(natExternal.physicalId).toBe('nat-extracted');
            expect(natExternal.source).toBe('cloudformation-query');
        });

        it('should NOT add resources to external if they are in stack', () => {
            const flatDiscovery = {
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                existingLogicalIds: ['FriggVPC', 'FriggPrivateSubnet1'],
                // These ARE in the stack
                defaultVpcId: 'vpc-in-stack',
                privateSubnetId1: 'subnet-in-stack'
            };

            const result = vpcBuilder.convertFlatDiscoveryToStructured(flatDiscovery);

            // Should be in stackManaged, NOT external
            expect(result.stackManaged.some(r => r.logicalId === 'FriggVPC')).toBe(true);
            expect(result.stackManaged.some(r => r.logicalId === 'FriggPrivateSubnet1')).toBe(true);
            
            // Should NOT be in external
            expect(result.external.some(r => r.physicalId === 'vpc-in-stack')).toBe(false);
            expect(result.external.some(r => r.physicalId === 'subnet-in-stack')).toBe(false);
        });

        it('should handle external VPC pattern: stack resources + queried external references', () => {
            const flatDiscovery = {
                fromCloudFormationStack: true,
                stackName: 'test-production-stack',
                existingLogicalIds: [
                    'FriggLambdaSecurityGroup',
                    'FriggLambdaRouteTable',
                    'FriggPrivateRoute',
                    'FriggPrivateSubnet1RouteTableAssociation',
                    'FriggPrivateSubnet2RouteTableAssociation',
                    'FriggS3VPCEndpoint',
                    'FriggDynamoDBVPCEndpoint',
                    'FriggKMSVPCEndpoint'
                ],
                // Stack resources
                lambdaSecurityGroupId: 'sg-stack-123',
                routeTableId: 'rtb-stack-456',
                s3VpcEndpointId: 'vpce-s3-stack',
                // External resources (discovered via queries)
                defaultVpcId: 'vpc-external-123',
                privateSubnetId1: 'subnet-external-1',
                privateSubnetId2: 'subnet-external-2',
                existingNatGatewayId: 'nat-external-789'
            };

            const result = vpcBuilder.convertFlatDiscoveryToStructured(flatDiscovery);

            // Stack resources should be in stackManaged
            expect(result.stackManaged).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ logicalId: 'FriggLambdaSecurityGroup', physicalId: 'sg-stack-123' }),
                    expect.objectContaining({ logicalId: 'FriggLambdaRouteTable', physicalId: 'rtb-stack-456' }),
                    expect.objectContaining({ logicalId: 'FriggS3VPCEndpoint', physicalId: 'vpce-s3-stack' })
                ])
            );

            // External resources should be in external array
            expect(result.external).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ physicalId: 'vpc-external-123', resourceType: 'AWS::EC2::VPC', source: 'cloudformation-query' }),
                    expect.objectContaining({ physicalId: 'subnet-external-1', resourceType: 'AWS::EC2::Subnet', source: 'cloudformation-query' }),
                    expect.objectContaining({ physicalId: 'subnet-external-2', resourceType: 'AWS::EC2::Subnet', source: 'cloudformation-query' }),
                    expect.objectContaining({ physicalId: 'nat-external-789', resourceType: 'AWS::EC2::NatGateway', source: 'cloudformation-query' })
                ])
            );
        });
    });
});

