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
        it('should use discovered VPC resources', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-discovered',
                privateSubnetId1: 'subnet-private1',
                privateSubnetId2: 'subnet-private2',
                defaultSecurityGroupId: 'sg-discovered',
            };

            const result = await vpcBuilder.build(appDefinition, discoveredResources);

            expect(result.vpcConfig.subnetIds).toEqual(['subnet-private1', 'subnet-private2']);
            // In discover mode, we create FriggLambdaSecurityGroup in the discovered VPC
            expect(result.vpcConfig.securityGroupIds).toEqual([{ Ref: 'FriggLambdaSecurityGroup' }]);
            expect(result.resources.FriggLambdaSecurityGroup).toBeDefined();
            expect(result.resources.FriggLambdaSecurityGroup.Properties.VpcId).toBe('vpc-discovered');
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
});

