const { composeServerlessDefinition } = require('../serverless-template');
const { AWSDiscovery } = require('../aws-discovery');

// Mock the AWSDiscovery module
jest.mock('../aws-discovery');

describe('VPC Configuration Integration Tests', () => {
    let mockDiscoveryInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock instance
        mockDiscoveryInstance = {
            discoverResources: jest.fn(),
        };

        // Setup the mock constructor
        AWSDiscovery.mockImplementation(() => mockDiscoveryInstance);
    });

    describe('NAT Gateway and Internet Connectivity', () => {
        it('should maintain internet connectivity with discovered VPC and new NAT Gateway', async () => {
            // This test simulates your current scenario
            mockDiscoveryInstance.discoverResources.mockResolvedValue({
                defaultVpcId: 'vpc-0cd17c0e06cb28b28',
                vpcCidr: '172.31.0.0/16',
                defaultSecurityGroupId: 'sg-05781f54c656ab925',
                privateSubnetId1: 'subnet-006a916e127888305',
                privateSubnetId2: 'subnet-08003f43047d4c854',
                publicSubnetId: 'subnet-0f2ae269d00887da0',
                defaultRouteTableId: 'rtb-existing',
                defaultKmsKeyId: 'arn:aws:kms:eu-central-1:503561437733:key/2e067fd3-44f4-439d-b570-b2fa001bef02',
                existingNatGatewayId: null, // No existing NAT
                existingElasticIpAllocationId: null,
            });

            const appDefinition = {
                name: 'test-app',
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'createAndManage',
                    },
                    selfHeal: true,
                },
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Verify NAT Gateway is created
            expect(result.resources.Resources.FriggNATGateway).toBeDefined();
            expect(result.resources.Resources.FriggNATGatewayEIP).toBeDefined();

            // Verify route table is created
            expect(result.resources.Resources.FriggLambdaRouteTable).toBeDefined();

            // Verify NAT route is created with proper dependency
            expect(result.resources.Resources.FriggNATRoute).toBeDefined();
            expect(result.resources.Resources.FriggNATRoute.Properties.NatGatewayId).toEqual({ Ref: 'FriggNATGateway' });
            expect(result.resources.Resources.FriggNATRoute.DependsOn).toContain('FriggNATGateway');
            expect(result.resources.Resources.FriggNATRoute.DependsOn).toContain('FriggLambdaRouteTable');

            // Verify subnet associations
            expect(result.resources.Resources.FriggSubnet1RouteAssociation).toBeDefined();
            expect(result.resources.Resources.FriggSubnet2RouteAssociation).toBeDefined();

            // Verify VPC endpoints are added to correct route table
            expect(result.resources.Resources.VPCEndpointS3).toBeDefined();
            expect(result.resources.Resources.VPCEndpointS3.Properties.RouteTableIds[0]).toEqual({ Ref: 'FriggLambdaRouteTable' });
            expect(result.resources.Resources.VPCEndpointS3.DependsOn).toBe('FriggLambdaRouteTable');

            // Verify KMS VPC endpoint with correct security group
            expect(result.resources.Resources.VPCEndpointKMS).toBeDefined();
            expect(result.resources.Resources.VPCEndpointSecurityGroup).toBeDefined();

            // Verify security group allows from Lambda SG
            const sgIngress = result.resources.Resources.VPCEndpointSecurityGroup.Properties.SecurityGroupIngress;
            expect(sgIngress).toBeDefined();
            expect(sgIngress.length).toBeGreaterThan(0);

            // Should have rule for Lambda security group
            const lambdaSgRule = sgIngress.find(rule => rule.SourceSecurityGroupId === 'sg-05781f54c656ab925');
            expect(lambdaSgRule).toBeDefined();
            expect(lambdaSgRule.FromPort).toBe(443);
            expect(lambdaSgRule.ToPort).toBe(443);
        });

        it('should reuse existing NAT Gateway when available', async () => {
            mockDiscoveryInstance.discoverResources.mockResolvedValue({
                defaultVpcId: 'vpc-123',
                vpcCidr: '172.31.0.0/16',
                defaultSecurityGroupId: 'sg-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: 'nat-existing',
                existingElasticIpAllocationId: 'eip-existing',
                natGatewayInPrivateSubnet: false, // NAT is correctly placed
            });

            const appDefinition = {
                name: 'test-app',
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'discover',
                    },
                },
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Should NOT create new NAT Gateway
            expect(result.resources.Resources.FriggNATGateway).toBeUndefined();

            // Should use existing NAT in route
            expect(result.resources.Resources.FriggNATRoute).toBeDefined();
            expect(result.resources.Resources.FriggNATRoute.Properties.NatGatewayId).toBe('nat-existing');
            expect(result.resources.Resources.FriggNATRoute.DependsOn).toBe('FriggLambdaRouteTable');
        });

        it('should handle misconfigured NAT Gateway with self-heal', async () => {
            mockDiscoveryInstance.discoverResources.mockResolvedValue({
                defaultVpcId: 'vpc-123',
                vpcCidr: '172.31.0.0/16',
                defaultSecurityGroupId: 'sg-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                publicSubnetId: null, // No public subnet
                existingNatGatewayId: 'nat-bad',
                natGatewayInPrivateSubnet: true, // NAT is misconfigured!
                needsNewNatGateway: true,
                createPublicSubnet: true,
            });

            const appDefinition = {
                name: 'test-app',
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'discover',
                    },
                    selfHeal: true,
                },
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Should create new public subnet
            expect(result.resources.Resources.FriggPublicSubnet).toBeDefined();

            // Should create new NAT Gateway
            expect(result.resources.Resources.FriggNATGateway).toBeDefined();

            // Should create route pointing to new NAT
            expect(result.resources.Resources.FriggNATRoute).toBeDefined();
            expect(result.resources.Resources.FriggNATRoute.Properties.NatGatewayId).toEqual({ Ref: 'FriggNATGateway' });
        });
    });

    describe('Security Group Configuration', () => {
        it('should configure VPC endpoint security group with Lambda SG priority', async () => {
            mockDiscoveryInstance.discoverResources.mockResolvedValue({
                defaultVpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                defaultSecurityGroupId: 'sg-lambda',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                publicSubnetId: 'subnet-public',
                defaultKmsKeyId: 'arn:aws:kms:region:account:key/123',
                existingNatGatewayId: 'nat-existing',  // Add existing NAT to avoid error
            });

            const appDefinition = {
                name: 'test-app',
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'discover',  // Use discover mode with existing NAT
                    },
                },
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            const result = await composeServerlessDefinition(appDefinition);

            const sgIngress = result.resources.Resources.VPCEndpointSecurityGroup.Properties.SecurityGroupIngress;

            // First rule should be Lambda SG
            expect(sgIngress[0].SourceSecurityGroupId).toBe('sg-lambda');
            expect(sgIngress[0].Description).toContain('Lambda security group');

            // May have VPC CIDR as fallback
            if (sgIngress.length > 1) {
                expect(sgIngress[1].CidrIp).toBe('10.0.0.0/16');
                expect(sgIngress[1].Description).toContain('fallback');
            }
        });

        it('should fallback to VPC CIDR when Lambda SG not available', async () => {
            mockDiscoveryInstance.discoverResources.mockResolvedValue({
                defaultVpcId: 'vpc-123',
                vpcCidr: '192.168.0.0/16',
                defaultSecurityGroupId: null, // No security group
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                publicSubnetId: 'subnet-public',
                defaultKmsKeyId: 'arn:aws:kms:region:account:key/123',
                existingNatGatewayId: 'nat-existing',
            });

            const appDefinition = {
                name: 'test-app',
                vpc: {
                    enable: true,
                    management: 'discover',
                    securityGroupIds: [], // Empty
                    natGateway: {
                        management: 'discover',
                    },
                },
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            const result = await composeServerlessDefinition(appDefinition);

            const sgIngress = result.resources.Resources.VPCEndpointSecurityGroup.Properties.SecurityGroupIngress;

            // Should use VPC CIDR
            expect(sgIngress[0].CidrIp).toBe('192.168.0.0/16');
            expect(sgIngress[0].Description).toContain('VPC CIDR');
        });

        it('should use default CIDR as last resort', async () => {
            mockDiscoveryInstance.discoverResources.mockResolvedValue({
                defaultVpcId: 'vpc-123',
                vpcCidr: null, // No VPC CIDR discovered
                defaultSecurityGroupId: null,
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                publicSubnetId: 'subnet-public',
                defaultKmsKeyId: 'arn:aws:kms:region:account:key/123',
                existingNatGatewayId: 'nat-existing',
            });

            const appDefinition = {
                name: 'test-app',
                vpc: {
                    enable: true,
                    management: 'discover',
                    securityGroupIds: [],
                    natGateway: {
                        management: 'discover',
                    },
                },
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            const result = await composeServerlessDefinition(appDefinition);

            const sgIngress = result.resources.Resources.VPCEndpointSecurityGroup.Properties.SecurityGroupIngress;

            // Should use default VPC CIDR
            expect(sgIngress[0].CidrIp).toBe('172.31.0.0/16');
            expect(sgIngress[0].Description).toContain('default VPC');
        });
    });

    describe('Route Table Dependencies', () => {
        it('should set correct dependencies for all resources', async () => {
            mockDiscoveryInstance.discoverResources.mockResolvedValue({
                defaultVpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                defaultSecurityGroupId: 'sg-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: null,
            });

            const appDefinition = {
                name: 'test-app',
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'createAndManage',
                    },
                },
            };

            const result = await composeServerlessDefinition(appDefinition);

            // NAT Route depends on NAT Gateway and Route Table
            expect(result.resources.Resources.FriggNATRoute.DependsOn).toContain('FriggNATGateway');
            expect(result.resources.Resources.FriggNATRoute.DependsOn).toContain('FriggLambdaRouteTable');

            // Subnet associations depend on route table
            expect(result.resources.Resources.FriggSubnet1RouteAssociation.DependsOn).toBe('FriggLambdaRouteTable');
            expect(result.resources.Resources.FriggSubnet2RouteAssociation.DependsOn).toBe('FriggLambdaRouteTable');

            // VPC endpoints depend on route table
            expect(result.resources.Resources.VPCEndpointS3.DependsOn).toBe('FriggLambdaRouteTable');
            expect(result.resources.Resources.VPCEndpointDynamoDB.DependsOn).toBe('FriggLambdaRouteTable');
        });
    });
});