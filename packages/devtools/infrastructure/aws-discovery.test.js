const { mockClient } = require('aws-sdk-client-mock');
const { AWSDiscovery } = require('./aws-discovery');

// Import AWS SDK commands
const {
    EC2Client,
    DescribeVpcsCommand,
    DescribeSubnetsCommand,
    DescribeSecurityGroupsCommand,
    DescribeRouteTablesCommand,
    DescribeNatGatewaysCommand,
    DescribeAddressesCommand
} = require('@aws-sdk/client-ec2');
const {
    KMSClient,
    ListKeysCommand,
    DescribeKeyCommand
} = require('@aws-sdk/client-kms');
const {
    STSClient,
    GetCallerIdentityCommand
} = require('@aws-sdk/client-sts');

// Create mock clients
const ec2Mock = mockClient(EC2Client);
const kmsMock = mockClient(KMSClient);
const stsMock = mockClient(STSClient);

describe('AWSDiscovery', () => {
    let discovery;

    beforeEach(() => {
        // Reset all mocks before each test
        ec2Mock.reset();
        kmsMock.reset();
        stsMock.reset();

        discovery = new AWSDiscovery('us-east-1');
    });

    describe('getAccountId', () => {
        it('should return AWS account ID', async () => {
            const mockAccountId = '123456789012';
            stsMock.on(GetCallerIdentityCommand).resolves({
                Account: mockAccountId
            });

            const accountId = await discovery.getAccountId();
            expect(accountId).toBe(mockAccountId);
        });

        it('should throw error when STS call fails', async () => {
            stsMock.on(GetCallerIdentityCommand).rejects(new Error('STS error'));

            await expect(discovery.getAccountId()).rejects.toThrow('STS error');
        });
    });

    describe('findDefaultVpc', () => {
        it('should return default VPC when available', async () => {
            const mockVpc = { VpcId: 'vpc-12345678', IsDefault: true };
            ec2Mock.on(DescribeVpcsCommand).resolves({
                Vpcs: [mockVpc]
            });

            const vpc = await discovery.findDefaultVpc();
            expect(vpc).toEqual(mockVpc);
        });

        it('should return first VPC when no default VPC exists', async () => {
            const mockVpc = { VpcId: 'vpc-12345678', IsDefault: false };
            ec2Mock.on(DescribeVpcsCommand).resolves({
                Vpcs: [mockVpc]
            });

            const vpc = await discovery.findDefaultVpc();
            expect(vpc).toEqual(mockVpc);
        });

        it('should throw error when no VPCs found', async () => {
            ec2Mock.on(DescribeVpcsCommand).resolves({
                Vpcs: []
            });

            await expect(discovery.findDefaultVpc()).rejects.toThrow('No VPC found in the account');
        });
    });

    describe('isSubnetPrivate', () => {
        const mockVpcId = 'vpc-12345678';
        const mockSubnetId = 'subnet-12345678';

        it('should return true for private subnet', async () => {
            // Mock subnet lookup first
            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: [{ SubnetId: mockSubnetId, VpcId: mockVpcId }]
            });

            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [{ SubnetId: mockSubnetId }],
                    Routes: [
                        { GatewayId: 'local', DestinationCidrBlock: '10.0.0.0/16' }
                    ]
                }]
            });

            const isPrivate = await discovery.isSubnetPrivate(mockSubnetId, mockVpcId);
            expect(isPrivate).toBe(true);
        });

        it('should return false for public subnet', async () => {
            // Mock subnet lookup first
            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: [{ SubnetId: mockSubnetId, VpcId: mockVpcId }]
            });

            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [{ SubnetId: mockSubnetId }],
                    Routes: [
                        { GatewayId: 'igw-12345', DestinationCidrBlock: '0.0.0.0/0' }
                    ]
                }]
            });

            const isPrivate = await discovery.isSubnetPrivate(mockSubnetId, mockVpcId);
            expect(isPrivate).toBe(false);
        });
    });

    describe('findPrivateSubnets', () => {
        const mockVpcId = 'vpc-12345678';

        it('should return private subnets', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-private-1', AvailabilityZone: 'us-east-1a' },
                { SubnetId: 'subnet-private-2', AvailabilityZone: 'us-east-1b' }
            ];

            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: mockSubnets
            });

            // Mock route tables - no IGW routes (private)
            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [
                        { SubnetId: 'subnet-private-1' },
                        { SubnetId: 'subnet-private-2' }
                    ],
                    Routes: [
                        { GatewayId: 'local', DestinationCidrBlock: '10.0.0.0/16' }
                    ]
                }]
            });

            const subnets = await discovery.findPrivateSubnets(mockVpcId);
            expect(subnets).toEqual(mockSubnets);
        });

        it('should throw error when no private subnets found and autoConvert is false', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-public-1', AvailabilityZone: 'us-east-1a' },
                { SubnetId: 'subnet-public-2', AvailabilityZone: 'us-east-1b' },
                { SubnetId: 'subnet-public-3', AvailabilityZone: 'us-east-1c' }
            ];

            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: mockSubnets
            });

            // Mock route tables - has IGW routes (public)
            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [
                        { SubnetId: 'subnet-public-1' },
                        { SubnetId: 'subnet-public-2' },
                        { SubnetId: 'subnet-public-3' }
                    ],
                    Routes: [
                        { GatewayId: 'igw-12345', DestinationCidrBlock: '0.0.0.0/0' }
                    ]
                }]
            });

            await expect(discovery.findPrivateSubnets(mockVpcId, false))
                .rejects.toThrow('No private subnets found in VPC');
        });

        it('should return public subnets with warning when autoConvert is true', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-public-1', AvailabilityZone: 'us-east-1a' },
                { SubnetId: 'subnet-public-2', AvailabilityZone: 'us-east-1b' }
            ];

            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: mockSubnets
            });

            // Mock route tables - has IGW routes (public)
            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [
                        { SubnetId: 'subnet-public-1' },
                        { SubnetId: 'subnet-public-2' }
                    ],
                    Routes: [
                        { GatewayId: 'igw-12345', DestinationCidrBlock: '0.0.0.0/0' }
                    ]
                }]
            });

            const subnets = await discovery.findPrivateSubnets(mockVpcId, true);
            expect(subnets).toHaveLength(2);
            expect(subnets[0].SubnetId).toBe('subnet-public-1');
        });
    });

    describe('findPublicSubnets', () => {
        const mockVpcId = 'vpc-12345678';

        it('should return public subnet', async () => {
            const mockSubnet = { SubnetId: 'subnet-public-1' };
            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: [mockSubnet]
            });

            // Mock route table check to show it's public
            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [{ SubnetId: 'subnet-public-1' }],
                    Routes: [{ GatewayId: 'igw-12345' }] // Has IGW = public
                }]
            });

            const subnet = await discovery.findPublicSubnets(mockVpcId);
            expect(subnet).toEqual(mockSubnet);
        });

        it('should throw error when no subnets found', async () => {
            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: []
            });

            await expect(discovery.findPublicSubnets(mockVpcId))
                .rejects.toThrow('No subnets found in VPC');
        });
    });

    describe('findDefaultSecurityGroup', () => {
        const mockVpcId = 'vpc-12345678';

        it('should return default security group', async () => {
            const mockSecurityGroup = {
                GroupId: 'sg-12345678',
                GroupName: 'default'
            };

            ec2Mock.on(DescribeSecurityGroupsCommand).resolves({
                SecurityGroups: [mockSecurityGroup]
            });

            const sg = await discovery.findDefaultSecurityGroup(mockVpcId);
            expect(sg).toEqual(mockSecurityGroup);
        });

        it('should throw error when no default security group found', async () => {
            ec2Mock.on(DescribeSecurityGroupsCommand).resolves({
                SecurityGroups: []
            });

            await expect(discovery.findDefaultSecurityGroup(mockVpcId))
                .rejects.toThrow('No security group found for VPC');
        });
    });

    describe('findPrivateRouteTable', () => {
        const mockVpcId = 'vpc-12345678';

        it('should return private route table', async () => {
            const mockRouteTable = {
                RouteTableId: 'rtb-12345678',
                Routes: [
                    { GatewayId: 'local', DestinationCidrBlock: '10.0.0.0/16' }
                ]
            };

            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [mockRouteTable]
            });

            const rt = await discovery.findPrivateRouteTable(mockVpcId);
            expect(rt).toEqual(mockRouteTable);
        });

        it('should return first route table when no private route table found', async () => {
            const mockRouteTable = {
                RouteTableId: 'rtb-12345678',
                Routes: [
                    { GatewayId: 'igw-12345', DestinationCidrBlock: '0.0.0.0/0' }
                ]
            };

            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [mockRouteTable]
            });

            const rt = await discovery.findPrivateRouteTable(mockVpcId);
            expect(rt).toEqual(mockRouteTable);
        });
    });

    describe('findDefaultKmsKey', () => {
        it('should return default KMS key ARN', async () => {
            const mockKeyId = '12345678-1234-1234-1234-123456789012';
            const mockKeyArn = `arn:aws:kms:us-east-1:123456789012:key/${mockKeyId}`;

            kmsMock.on(ListKeysCommand).resolves({
                Keys: [{ KeyId: mockKeyId }]
            });

            kmsMock.on(DescribeKeyCommand).resolves({
                KeyMetadata: {
                    Arn: mockKeyArn,
                    KeyManager: 'CUSTOMER',
                    KeyState: 'Enabled'
                }
            });

            const keyArn = await discovery.findDefaultKmsKey();
            expect(keyArn).toBe(mockKeyArn);
        });

        it('should return null when no AWS-managed keys found', async () => {
            kmsMock.on(ListKeysCommand).resolves({
                Keys: []
            });

            const keyArn = await discovery.findDefaultKmsKey();
            expect(keyArn).toBeNull();
        });
    });

    describe('findAvailableElasticIP', () => {
        it('should return available Elastic IP', async () => {
            const mockElasticIP = {
                AllocationId: 'eipalloc-12345',
                PublicIp: '52.1.2.3'
            };

            ec2Mock.on(DescribeAddressesCommand).resolves({
                Addresses: [mockElasticIP]
            });

            const eip = await discovery.findAvailableElasticIP();
            expect(eip).toEqual(mockElasticIP);
        });

        it('should return null when no available Elastic IPs', async () => {
            ec2Mock.on(DescribeAddressesCommand).resolves({
                Addresses: []
            });

            const eip = await discovery.findAvailableElasticIP();
            expect(eip).toBeNull();
        });
    });

    describe('findExistingNatGateway', () => {
        const mockVpcId = 'vpc-12345678';

        beforeEach(() => {
            // Create a fresh discovery instance for each test
            discovery = new AWSDiscovery('us-east-1');
        });

        it('should return NAT Gateway in public subnet', async () => {
            const mockNatGateway = {
                NatGatewayId: 'nat-12345678',
                SubnetId: 'subnet-public-1',
                State: 'available',
                NatGatewayAddresses: [{ AllocationId: 'eipalloc-12345' }],
                Tags: []
            };

            ec2Mock.on(DescribeNatGatewaysCommand).resolves({
                NatGateways: [mockNatGateway]
            });

            // Mock subnet lookup
            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: [{ SubnetId: 'subnet-public-1', VpcId: mockVpcId }]
            });

            // Mock route table - has IGW (public)
            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [{ SubnetId: 'subnet-public-1' }],
                    Routes: [{ GatewayId: 'igw-12345' }]
                }]
            });

            const result = await discovery.findExistingNatGateway(mockVpcId);

            expect(result).toBeDefined();
            expect(result.NatGatewayId).toBe('nat-12345678');
            expect(result._isInPrivateSubnet).toBe(false);
        });

        it('should detect NAT Gateway in private subnet', async () => {
            const mockNatGateway = {
                NatGatewayId: 'nat-12345678',
                SubnetId: 'subnet-private-1',
                State: 'available',
                NatGatewayAddresses: [{ AllocationId: 'eipalloc-12345' }],
                Tags: [
                    { Key: 'ManagedBy', Value: 'Frigg' }
                ]
            };

            ec2Mock.on(DescribeNatGatewaysCommand).resolves({
                NatGateways: [mockNatGateway]
            });

            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: [{ SubnetId: 'subnet-private-1', VpcId: mockVpcId }]
            });

            // Mock route table - no IGW (private)
            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [{ SubnetId: 'subnet-private-1' }],
                    Routes: [{ GatewayId: 'local' }]
                }]
            });

            const result = await discovery.findExistingNatGateway(mockVpcId);

            expect(result).toBeDefined();
            expect(result.NatGatewayId).toBe('nat-12345678');
            expect(result._isInPrivateSubnet).toBe(true);
        });

        it('should skip non-Frigg NAT Gateway in private subnet', async () => {
            const mockNatGateways = [
                {
                    NatGatewayId: 'nat-other-12345',
                    SubnetId: 'subnet-private-1',
                    State: 'available',
                    Tags: [] // No Frigg tags
                },
                {
                    NatGatewayId: 'nat-good-12345',
                    SubnetId: 'subnet-public-1',
                    State: 'available',
                    Tags: []
                }
            ];

            ec2Mock.on(DescribeNatGatewaysCommand).resolves({
                NatGateways: mockNatGateways
            });

            // First call for subnet-private-1
            ec2Mock.on(DescribeSubnetsCommand)
                .resolvesOnce({
                    Subnets: [{ SubnetId: 'subnet-private-1', VpcId: mockVpcId }]
                })
                // Second call for subnet-public-1
                .resolvesOnce({
                    Subnets: [{ SubnetId: 'subnet-public-1', VpcId: mockVpcId }]
                });

            // First call for private subnet route table
            ec2Mock.on(DescribeRouteTablesCommand)
                .resolvesOnce({
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-private-1' }],
                        Routes: [{ GatewayId: 'local' }] // Private
                    }]
                })
                // Second call for public subnet route table
                .resolvesOnce({
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-1' }],
                        Routes: [{ GatewayId: 'igw-12345' }] // Public
                    }]
                });

            const result = await discovery.findExistingNatGateway(mockVpcId);

            expect(result).toBeDefined();
            expect(result.NatGatewayId).toBe('nat-good-12345');
            expect(result._isInPrivateSubnet).toBe(false);
        });

        it('should prioritize Frigg-managed NAT Gateways', async () => {
            const mockNatGateways = [
                {
                    NatGatewayId: 'nat-other-12345',
                    SubnetId: 'subnet-public-1',
                    State: 'available',
                    Tags: []
                },
                {
                    NatGatewayId: 'nat-frigg-12345',
                    SubnetId: 'subnet-public-2',
                    State: 'available',
                    Tags: [{ Key: 'ManagedBy', Value: 'Frigg' }]
                }
            ];

            ec2Mock.on(DescribeNatGatewaysCommand).resolves({
                NatGateways: mockNatGateways
            });

            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: [{ SubnetId: 'subnet-public-2', VpcId: mockVpcId }]
            });

            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [{ SubnetId: 'subnet-public-2' }],
                    Routes: [{ GatewayId: 'igw-12345' }] // Public
                }]
            });

            const result = await discovery.findExistingNatGateway(mockVpcId);

            expect(result).toBeDefined();
            expect(result.NatGatewayId).toBe('nat-frigg-12345');
            expect(result._isInPrivateSubnet).toBe(false);
        });

        it('should return null when no NAT Gateways found', async () => {
            ec2Mock.on(DescribeNatGatewaysCommand).resolves({
                NatGateways: []
            });

            const result = await discovery.findExistingNatGateway(mockVpcId);
            expect(result).toBeNull();
        });
    });

    describe('discoverResources', () => {
        it('should discover all AWS resources successfully', async () => {
            const mockVpc = { VpcId: 'vpc-12345678' };
            const mockSubnets = [
                { SubnetId: 'subnet-1' },
                { SubnetId: 'subnet-2' }
            ];
            const mockPublicSubnet = { SubnetId: 'subnet-public-1' };
            const mockSecurityGroup = { GroupId: 'sg-12345678' };
            const mockRouteTable = { RouteTableId: 'rtb-12345678' };
            const mockKmsArn = 'arn:aws:kms:us-east-1:123456789012:key/12345678';
            const mockNatGateway = {
                NatGatewayId: 'nat-12345678',
                SubnetId: 'subnet-public-1',
                NatGatewayAddresses: [{ AllocationId: 'eipalloc-12345' }],
                _isInPrivateSubnet: false
            };

            // Mock all the discovery methods
            jest.spyOn(discovery, 'findDefaultVpc').mockResolvedValue(mockVpc);
            jest.spyOn(discovery, 'findPrivateSubnets').mockResolvedValue(mockSubnets);
            jest.spyOn(discovery, 'findPublicSubnets').mockResolvedValue(mockPublicSubnet);
            jest.spyOn(discovery, 'findDefaultSecurityGroup').mockResolvedValue(mockSecurityGroup);
            jest.spyOn(discovery, 'findPrivateRouteTable').mockResolvedValue(mockRouteTable);
            jest.spyOn(discovery, 'findDefaultKmsKey').mockResolvedValue(mockKmsArn);
            jest.spyOn(discovery, 'findExistingNatGateway').mockResolvedValue(mockNatGateway);
            jest.spyOn(discovery, 'isSubnetPrivate')
                .mockResolvedValueOnce(true)  // subnet-1 is private
                .mockResolvedValueOnce(true); // subnet-2 is private

            const result = await discovery.discoverResources();

            expect(result).toMatchObject({
                defaultVpcId: 'vpc-12345678',
                defaultSecurityGroupId: 'sg-12345678',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                publicSubnetId: 'subnet-public-1',
                privateRouteTableId: 'rtb-12345678',
                defaultKmsKeyId: mockKmsArn,
                existingNatGatewayId: 'nat-12345678',
                existingElasticIpAllocationId: 'eipalloc-12345',
                natGatewayInPrivateSubnet: false,
                subnetConversionRequired: false,
                privateSubnetsWithWrongRoutes: []
            });

            // Verify all methods were called
            expect(discovery.findDefaultVpc).toHaveBeenCalled();
            expect(discovery.findPrivateSubnets).toHaveBeenCalledWith('vpc-12345678', false);
            expect(discovery.findPublicSubnets).toHaveBeenCalledWith('vpc-12345678');
            expect(discovery.findDefaultSecurityGroup).toHaveBeenCalledWith('vpc-12345678');
            expect(discovery.findPrivateRouteTable).toHaveBeenCalledWith('vpc-12345678');
            expect(discovery.findDefaultKmsKey).toHaveBeenCalled();
            expect(discovery.findExistingNatGateway).toHaveBeenCalledWith('vpc-12345678');
        });

        it('should detect subnet conversion requirements', async () => {
            const mockVpc = { VpcId: 'vpc-12345678' };
            const mockSubnets = [
                { SubnetId: 'subnet-1' },
                { SubnetId: 'subnet-2' }
            ];
            const mockPublicSubnet = { SubnetId: 'subnet-public-1' };
            const mockSecurityGroup = { GroupId: 'sg-12345678' };
            const mockRouteTable = { RouteTableId: 'rtb-12345678' };

            jest.spyOn(discovery, 'findDefaultVpc').mockResolvedValue(mockVpc);
            jest.spyOn(discovery, 'findPrivateSubnets').mockResolvedValue(mockSubnets);
            jest.spyOn(discovery, 'findPublicSubnets').mockResolvedValue(mockPublicSubnet);
            jest.spyOn(discovery, 'findDefaultSecurityGroup').mockResolvedValue(mockSecurityGroup);
            jest.spyOn(discovery, 'findPrivateRouteTable').mockResolvedValue(mockRouteTable);
            jest.spyOn(discovery, 'findDefaultKmsKey').mockResolvedValue(null);
            jest.spyOn(discovery, 'findExistingNatGateway').mockResolvedValue(null);
            jest.spyOn(discovery, 'findAvailableElasticIP').mockResolvedValue(null);
            jest.spyOn(discovery, 'isSubnetPrivate')
                .mockImplementation((subnetId) => {
                    // subnet-1 is public, subnet-2 is private
                    return Promise.resolve(subnetId === 'subnet-2');
                });

            const result = await discovery.discoverResources({ selfHeal: true });

            expect(result).toMatchObject({
                subnetConversionRequired: true,
                privateSubnetsWithWrongRoutes: ['subnet-1']
            });
        });

        it('should handle selfHeal option', async () => {
            const mockVpc = { VpcId: 'vpc-12345678' };
            const mockSubnets = [
                { SubnetId: 'subnet-public-1' },
                { SubnetId: 'subnet-public-2' }
            ];
            const mockPublicSubnet = { SubnetId: 'subnet-public-3' };
            const mockSecurityGroup = { GroupId: 'sg-12345678' };
            const mockRouteTable = { RouteTableId: 'rtb-12345678' };

            jest.spyOn(discovery, 'findDefaultVpc').mockResolvedValue(mockVpc);
            jest.spyOn(discovery, 'findPrivateSubnets').mockResolvedValue(mockSubnets);
            jest.spyOn(discovery, 'findPublicSubnets').mockResolvedValue(mockPublicSubnet);
            jest.spyOn(discovery, 'findDefaultSecurityGroup').mockResolvedValue(mockSecurityGroup);
            jest.spyOn(discovery, 'findPrivateRouteTable').mockResolvedValue(mockRouteTable);
            jest.spyOn(discovery, 'findDefaultKmsKey').mockResolvedValue(null);
            jest.spyOn(discovery, 'findExistingNatGateway').mockResolvedValue(null);
            jest.spyOn(discovery, 'findAvailableElasticIP').mockResolvedValue(null);
            jest.spyOn(discovery, 'isSubnetPrivate')
                .mockResolvedValue(false); // All subnets are public

            const result = await discovery.discoverResources({ selfHeal: true });

            // Verify that findPrivateSubnets was called with autoConvert=true
            expect(discovery.findPrivateSubnets).toHaveBeenCalledWith('vpc-12345678', true);

            expect(result).toMatchObject({
                subnetConversionRequired: true,
                privateSubnetsWithWrongRoutes: ['subnet-public-1', 'subnet-public-2']
            });
        });

        it('should detect NAT Gateway in private subnet in discoverResources', async () => {
            const mockVpc = { VpcId: 'vpc-12345678' };
            const mockSubnets = [
                { SubnetId: 'subnet-1' },
                { SubnetId: 'subnet-2' }
            ];
            const mockPublicSubnet = { SubnetId: 'subnet-public-1' };
            const mockSecurityGroup = { GroupId: 'sg-12345678' };
            const mockRouteTable = { RouteTableId: 'rtb-12345678' };
            const mockNatGateway = {
                NatGatewayId: 'nat-12345678',
                NatGatewayAddresses: [{ AllocationId: 'eipalloc-12345' }],
                _isInPrivateSubnet: true // NAT is in private subnet
            };

            jest.spyOn(discovery, 'findDefaultVpc').mockResolvedValue(mockVpc);
            jest.spyOn(discovery, 'findPrivateSubnets').mockResolvedValue(mockSubnets);
            jest.spyOn(discovery, 'findPublicSubnets').mockResolvedValue(mockPublicSubnet);
            jest.spyOn(discovery, 'findDefaultSecurityGroup').mockResolvedValue(mockSecurityGroup);
            jest.spyOn(discovery, 'findPrivateRouteTable').mockResolvedValue(mockRouteTable);
            jest.spyOn(discovery, 'findDefaultKmsKey').mockResolvedValue(null);
            jest.spyOn(discovery, 'findExistingNatGateway').mockResolvedValue(mockNatGateway);
            jest.spyOn(discovery, 'isSubnetPrivate')
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(true);

            const result = await discovery.discoverResources();

            expect(result).toMatchObject({
                defaultVpcId: 'vpc-12345678',
                existingNatGatewayId: 'nat-12345678',
                natGatewayInPrivateSubnet: true, // Should be true
                subnetConversionRequired: false,
                privateSubnetsWithWrongRoutes: []
            });
        });

        it('should handle single subnet scenario', async () => {
            const mockVpc = { VpcId: 'vpc-12345678' };
            const mockSubnets = [{ SubnetId: 'subnet-1' }]; // Only one subnet
            const mockPublicSubnet = { SubnetId: 'subnet-public-1' };
            const mockSecurityGroup = { GroupId: 'sg-12345678' };
            const mockRouteTable = { RouteTableId: 'rtb-12345678' };
            const mockKmsArn = 'arn:aws:kms:us-east-1:123456789012:key/12345678';

            jest.spyOn(discovery, 'findDefaultVpc').mockResolvedValue(mockVpc);
            jest.spyOn(discovery, 'findPrivateSubnets').mockResolvedValue(mockSubnets);
            jest.spyOn(discovery, 'findPublicSubnets').mockResolvedValue(mockPublicSubnet);
            jest.spyOn(discovery, 'findDefaultSecurityGroup').mockResolvedValue(mockSecurityGroup);
            jest.spyOn(discovery, 'findPrivateRouteTable').mockResolvedValue(mockRouteTable);
            jest.spyOn(discovery, 'findDefaultKmsKey').mockResolvedValue(mockKmsArn);

            const result = await discovery.discoverResources();

            expect(result.privateSubnetId1).toBe('subnet-1');
            expect(result.privateSubnetId2).toBe('subnet-1'); // Should duplicate single subnet
        });

        it('should throw error when discovery fails', async () => {
            jest.spyOn(discovery, 'findDefaultVpc').mockRejectedValue(new Error('VPC discovery failed'));

            await expect(discovery.discoverResources()).rejects.toThrow('VPC discovery failed');
        });
    });

    describe('constructor', () => {
        it('should initialize with default region', () => {
            const defaultDiscovery = new AWSDiscovery();
            expect(defaultDiscovery.region).toBe('us-east-1');
        });

        it('should initialize with custom region', () => {
            const customDiscovery = new AWSDiscovery('us-west-2');
            expect(customDiscovery.region).toBe('us-west-2');
        });
    });
});