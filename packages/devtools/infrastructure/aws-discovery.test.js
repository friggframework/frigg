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
    DescribeAddressesCommand,
    DescribeInternetGatewaysCommand,
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

        it('should retry without default filter when default VPC query returns empty', async () => {
            const mockVpc = { VpcId: 'vpc-23456789', IsDefault: false };

            ec2Mock
                .on(DescribeVpcsCommand)
                .resolvesOnce({ Vpcs: [] })
                .resolves({ Vpcs: [mockVpc] });

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

        it('should default to private when no route table found', async () => {
            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: [{ SubnetId: mockSubnetId, VpcId: mockVpcId }]
            });

            ec2Mock.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });

            const isPrivate = await discovery.isSubnetPrivate(mockSubnetId, mockVpcId);
            expect(isPrivate).toBe(true);
        });

        it('should default to private when AWS throws describing subnet', async () => {
            ec2Mock.on(DescribeSubnetsCommand).rejects(new Error('boom'));

            const isPrivate = await discovery.isSubnetPrivate(mockSubnetId, mockVpcId);
            expect(isPrivate).toBe(true);
        });

        it('should log warning when subnet cannot be found', async () => {
            ec2Mock.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const isPrivate = await discovery.isSubnetPrivate(mockSubnetId);

            expect(isPrivate).toBe(true);
            expect(warnSpy).toHaveBeenCalledWith(
                `Could not determine if subnet ${mockSubnetId} is private:`,
                expect.any(Error)
            );

            warnSpy.mockRestore();
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

        it('should duplicate single private subnet when only one available', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-private-1', AvailabilityZone: 'us-east-1a' },
                { SubnetId: 'subnet-public-1', AvailabilityZone: 'us-east-1b' }
            ];

            ec2Mock.on(DescribeSubnetsCommand).resolves({ Subnets: mockSubnets });

            jest
                .spyOn(discovery, 'isSubnetPrivate')
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            const subnets = await discovery.findPrivateSubnets(mockVpcId);
            expect(subnets.map((s) => s.SubnetId)).toEqual([
                'subnet-private-1',
                'subnet-public-1'
            ]);
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

        it('should select converted subnets when autoConvert handles three public subnets', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-public-1' },
                { SubnetId: 'subnet-public-2' },
                { SubnetId: 'subnet-public-3' }
            ];

            ec2Mock.on(DescribeSubnetsCommand).resolves({ Subnets: mockSubnets });
            jest.spyOn(discovery, 'isSubnetPrivate').mockResolvedValue(false);

            const subnets = await discovery.findPrivateSubnets(mockVpcId, true);
            expect(subnets.map((s) => s.SubnetId)).toEqual([
                'subnet-public-2',
                'subnet-public-3'
            ]);
        });

        it('should throw when AWS returns no subnets', async () => {
            ec2Mock.on(DescribeSubnetsCommand).resolves({ Subnets: [] });

            await expect(discovery.findPrivateSubnets(mockVpcId)).rejects.toThrow(
                `No subnets found in VPC ${mockVpcId}`
            );
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

        it('should return null when no public subnets identified', async () => {
            const mockSubnet = { SubnetId: 'subnet-private-1' };
            ec2Mock.on(DescribeSubnetsCommand).resolves({ Subnets: [mockSubnet] });

            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [{
                    Associations: [{ SubnetId: 'subnet-private-1' }],
                    Routes: [{ GatewayId: 'local' }]
                }]
            });

            const subnet = await discovery.findPublicSubnets(mockVpcId);
            expect(subnet).toBeNull();
        });
    });

    describe('findDefaultSecurityGroup', () => {
        const mockVpcId = 'vpc-12345678';

        it('should return default security group', async () => {
            const mockSecurityGroup = {
                GroupId: 'sg-12345678',
                GroupName: 'default'
            };

            ec2Mock
                .on(DescribeSecurityGroupsCommand)
                .resolvesOnce({ SecurityGroups: [] })
                .resolves({ SecurityGroups: [mockSecurityGroup] });

            const sg = await discovery.findDefaultSecurityGroup(mockVpcId);
            expect(sg).toEqual(mockSecurityGroup);
        });

        it('should prefer Frigg-managed security group when present', async () => {
            const friggSg = {
                GroupId: 'sg-frigg',
                GroupName: 'frigg-lambda-sg',
            };

            ec2Mock
                .on(DescribeSecurityGroupsCommand)
                .resolves({ SecurityGroups: [friggSg] });

            const sg = await discovery.findDefaultSecurityGroup(mockVpcId);
            expect(sg).toEqual(friggSg);
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

        it('should throw error when no route tables found', async () => {
            ec2Mock.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });

            await expect(
                discovery.findPrivateRouteTable(mockVpcId)
            ).rejects.toThrow(`No route tables found for VPC ${mockVpcId}`);
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

        it('should return null when only AWS-managed keys exist', async () => {
            kmsMock.on(ListKeysCommand).resolves({
                Keys: [{ KeyId: 'aws-key' }]
            });

            kmsMock.on(DescribeKeyCommand).resolves({
                KeyMetadata: {
                    Arn: 'arn:aws:kms:us-east-1:123456789012:key/aws-key',
                    KeyManager: 'AWS',
                    KeyState: 'Enabled'
                }
            });

            const keyArn = await discovery.findDefaultKmsKey();
            expect(keyArn).toBeNull();
        });

        it('should skip keys that fail to describe', async () => {
            kmsMock.on(ListKeysCommand).resolves({ Keys: [{ KeyId: 'bad-key' }] });
            kmsMock.on(DescribeKeyCommand).rejects(new Error('describe failure'));

            const keyArn = await discovery.findDefaultKmsKey();
            expect(keyArn).toBeNull();
        });

        it('should return null when ListKeys fails', async () => {
            kmsMock.on(ListKeysCommand).rejects(new Error('list failure'));

            const keyArn = await discovery.findDefaultKmsKey();
            expect(keyArn).toBeNull();
        });

        it('should skip customer keys pending deletion', async () => {
            const mockKeyId = 'pending-key';
            kmsMock.on(ListKeysCommand).resolves({ Keys: [{ KeyId: mockKeyId }] });
            kmsMock.on(DescribeKeyCommand).resolves({
                KeyMetadata: {
                    Arn: `arn:aws:kms:us-east-1:123456789012:key/${mockKeyId}`,
                    KeyManager: 'CUSTOMER',
                    KeyState: 'PendingDeletion',
                    DeletionDate: '2024-01-01T00:00:00Z',
                },
            });

            const keyArn = await discovery.findDefaultKmsKey();
            expect(keyArn).toBeNull();
        });

        it('should return null when all customer keys are disabled', async () => {
            const mockKeyId = 'disabled-key';
            kmsMock.on(ListKeysCommand).resolves({ Keys: [{ KeyId: mockKeyId }] });
            kmsMock.on(DescribeKeyCommand).resolves({
                KeyMetadata: {
                    Arn: `arn:aws:kms:us-east-1:123456789012:key/${mockKeyId}`,
                    KeyManager: 'CUSTOMER',
                    KeyState: 'Disabled',
                },
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

        it('should return Frigg-tagged Elastic IP when present', async () => {
            const friggAddress = {
                AllocationId: 'eipalloc-frigg',
                PublicIp: '52.0.0.1',
                NetworkInterfaceId: 'eni-12345',
                Tags: [{ Key: 'Name', Value: 'frigg-shared-ip' }]
            };

            ec2Mock.on(DescribeAddressesCommand).resolves({
                Addresses: [
                    { AllocationId: 'eipalloc-associated', AssociationId: 'assoc-1' },
                    friggAddress,
                ]
            });

            const eip = await discovery.findAvailableElasticIP();
            expect(eip).toEqual(friggAddress);
        });

        it('should return null when DescribeAddresses fails', async () => {
            ec2Mock.on(DescribeAddressesCommand).rejects(new Error('addr failure'));

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

        it('should skip NAT Gateways that are not available', async () => {
            const mockNatGateways = [
                {
                    NatGatewayId: 'nat-pending',
                    SubnetId: 'subnet-public-1',
                    State: 'pending',
                    Tags: [],
                },
            ];

            ec2Mock.on(DescribeNatGatewaysCommand).resolves({
                NatGateways: mockNatGateways,
            });

            const result = await discovery.findExistingNatGateway(mockVpcId);
            expect(result).toBeNull();
        });

        it('should return null when only non-Frigg NAT Gateways are in private subnets', async () => {
            const mockNatGateways = [
                {
                    NatGatewayId: 'nat-private-only',
                    SubnetId: 'subnet-private-1',
                    State: 'available',
                    Tags: [],
                },
            ];

            ec2Mock.on(DescribeNatGatewaysCommand).resolves({
                NatGateways: mockNatGateways,
            });

            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: [{ SubnetId: 'subnet-private-1', VpcId: mockVpcId }],
            });

            ec2Mock.on(DescribeRouteTablesCommand).resolves({
                RouteTables: [
                    {
                        Associations: [{ SubnetId: 'subnet-private-1' }],
                        Routes: [{ GatewayId: 'local' }],
                    },
                ],
            });

            const result = await discovery.findExistingNatGateway(mockVpcId);
            expect(result).toBeNull();
        });

        it('should return null when DescribeNatGateways fails', async () => {
            ec2Mock.on(DescribeNatGatewaysCommand).rejects(new Error('nat failure'));

            const result = await discovery.findExistingNatGateway(mockVpcId);
            expect(result).toBeNull();
        });
    });

    describe('findInternetGateway', () => {
        const mockVpcId = 'vpc-12345678';

        it('should return existing Internet Gateway', async () => {
            const mockIgw = { InternetGatewayId: 'igw-12345' };

            ec2Mock.on(DescribeInternetGatewaysCommand).resolves({
                InternetGateways: [mockIgw]
            });

            const igw = await discovery.findInternetGateway(mockVpcId);
            expect(igw).toEqual(mockIgw);
        });

        it('should return null when no Internet Gateway found', async () => {
            ec2Mock.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });

            const igw = await discovery.findInternetGateway(mockVpcId);
            expect(igw).toBeNull();
        });

        it('should return null when DescribeInternetGateways fails', async () => {
            ec2Mock.on(DescribeInternetGatewaysCommand).rejects(new Error('igw failure'));

            const igw = await discovery.findInternetGateway(mockVpcId);
            expect(igw).toBeNull();
        });
    });

    describe('findFriggManagedResources', () => {
        it('should return tagged resources', async () => {
            const mockNat = { NatGatewayId: 'nat-frigg', Tags: [{ Key: 'ManagedBy', Value: 'Frigg' }] };
            const mockEip = { AllocationId: 'eip-frigg', Tags: [{ Key: 'ManagedBy', Value: 'Frigg' }] };
            const mockRouteTable = { RouteTableId: 'rtb-frigg', Tags: [{ Key: 'ManagedBy', Value: 'Frigg' }] };
            const mockSubnet = { SubnetId: 'subnet-frigg', Tags: [{ Key: 'ManagedBy', Value: 'Frigg' }] };
            const mockSg = { GroupId: 'sg-frigg', Tags: [{ Key: 'ManagedBy', Value: 'Frigg' }] };

            ec2Mock.on(DescribeNatGatewaysCommand).resolves({ NatGateways: [mockNat] });
            ec2Mock.on(DescribeAddressesCommand).resolves({ Addresses: [mockEip] });
            ec2Mock.on(DescribeRouteTablesCommand).resolves({ RouteTables: [mockRouteTable] });
            ec2Mock.on(DescribeSubnetsCommand).resolves({ Subnets: [mockSubnet] });
            ec2Mock.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockSg] });

            const result = await discovery.findFriggManagedResources('service', 'stage');
            expect(result).toMatchObject({
                natGateways: [mockNat],
                elasticIps: [mockEip],
                routeTables: [mockRouteTable],
                subnets: [mockSubnet],
                securityGroups: [mockSg],
            });
        });

        it('should return empty arrays when calls fail', async () => {
            ec2Mock.on(DescribeNatGatewaysCommand).rejects(new Error('error'));
            ec2Mock.on(DescribeAddressesCommand).rejects(new Error('error'));
            ec2Mock.on(DescribeRouteTablesCommand).rejects(new Error('error'));
            ec2Mock.on(DescribeSubnetsCommand).rejects(new Error('error'));
            ec2Mock.on(DescribeSecurityGroupsCommand).rejects(new Error('error'));

            const result = await discovery.findFriggManagedResources('service', 'stage');
            expect(result).toEqual({
                natGateways: [],
                elasticIps: [],
                routeTables: [],
                subnets: [],
                securityGroups: [],
            });
        });
    });

    describe('detectMisconfiguredResources', () => {
        const mockVpcId = 'vpc-12345678';

        it('should capture misconfigured resources', async () => {
            ec2Mock.on(DescribeNatGatewaysCommand).resolves({
                NatGateways: [
                    { NatGatewayId: 'nat-private', SubnetId: 'subnet-private', State: 'available' },
                ],
            });

            ec2Mock.on(DescribeAddressesCommand).resolves({
                Addresses: [
                    {
                        AllocationId: 'eip-123',
                        PublicIp: '52.0.0.1',
                        Tags: [{ Key: 'ManagedBy', Value: 'Frigg' }],
                    },
                ],
            });

            discovery.findPrivateSubnets = jest
                .fn()
                .mockResolvedValue([{ SubnetId: 'subnet-private', AvailabilityZone: 'us-east-1a' }]);
            discovery.findRouteTables = jest.fn().mockResolvedValue([
                {
                    Associations: [],
                    Routes: [],
                },
            ]);

            jest.spyOn(discovery, 'isSubnetPrivate').mockResolvedValue(true);

            const misconfigs = await discovery.detectMisconfiguredResources(mockVpcId);
            expect(misconfigs.natGatewaysInPrivateSubnets).toHaveLength(1);
            expect(misconfigs.orphanedElasticIps).toHaveLength(1);
            expect(misconfigs.privateSubnetsWithoutNatRoute).toHaveLength(1);
        });
    });

    describe('getHealingRecommendations', () => {
        it('should produce ordered recommendations', () => {
            const recs = discovery.getHealingRecommendations({
                natGatewaysInPrivateSubnets: [{ natGatewayId: 'nat-1' }],
                orphanedElasticIps: [{ allocationId: 'eip-1' }],
                privateSubnetsWithoutNatRoute: [{ subnetId: 'subnet-1' }],
            });

            expect(recs[0].severity).toBe('critical');
            expect(recs[0].issue).toContain('NAT Gateway');
            expect(recs[1].severity).toBe('critical');
            expect(recs[2].severity).toBe('warning');
        });

        it('should return empty array for no issues', () => {
            const recs = discovery.getHealingRecommendations({
                natGatewaysInPrivateSubnets: [],
                orphanedElasticIps: [],
                privateSubnetsWithoutNatRoute: [],
            });

            expect(recs).toEqual([]);
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
                defaultVpcId: 'vpc-12345678',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                publicSubnetId: 'subnet-public-1',
                subnetConversionRequired: true,
                privateSubnetsWithWrongRoutes: ['subnet-1']
            });
        });

        it('should surface subnet analysis summary for diagnostic tooling', async () => {
            const mockVpc = { VpcId: 'vpc-987654321', CidrBlock: '10.0.0.0/16' };
            const mockSubnets = [
                { SubnetId: 'subnet-public-a', AvailabilityZone: 'us-east-1a' },
                { SubnetId: 'subnet-private-b', AvailabilityZone: 'us-east-1b' }
            ];
            const mockSecurityGroup = { GroupId: 'sg-22222222' };
            const mockRouteTable = { RouteTableId: 'rtb-22222222' };

            jest.spyOn(discovery, 'findDefaultVpc').mockResolvedValue(mockVpc);
            jest.spyOn(discovery, 'findPrivateSubnets').mockResolvedValue(mockSubnets);
            jest.spyOn(discovery, 'findPublicSubnets').mockResolvedValue({ SubnetId: 'subnet-nat-home' });
            jest.spyOn(discovery, 'findDefaultSecurityGroup').mockResolvedValue(mockSecurityGroup);
            jest.spyOn(discovery, 'findPrivateRouteTable').mockResolvedValue(mockRouteTable);
            jest.spyOn(discovery, 'findDefaultKmsKey').mockResolvedValue(null);
            jest.spyOn(discovery, 'findExistingNatGateway').mockResolvedValue({
                NatGatewayId: 'nat-2222',
                NatGatewayAddresses: [{ AllocationId: 'eipalloc-2222' }],
                _isInPrivateSubnet: false
            });
            jest.spyOn(discovery, 'isSubnetPrivate')
                .mockImplementation((subnetId) => subnetId === 'subnet-private-b');

            const result = await discovery.discoverResources({ selfHeal: true });

            expect(result.defaultVpcId).toBe('vpc-987654321');
            expect(result.subnetConversionRequired).toBe(true);
            expect(result.privateSubnetsWithWrongRoutes).toEqual(['subnet-public-a']);
            expect(result.privateSubnetId1).toBe('subnet-public-a');
            expect(result.privateSubnetId2).toBe('subnet-private-b');
            expect(result.existingNatGatewayId).toBe('nat-2222');
            expect(result.existingElasticIpAllocationId).toBe('eipalloc-2222');
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

        it('should reuse available Elastic IP when no NAT Gateway exists and no public subnet is found', async () => {
            const mockVpc = { VpcId: 'vpc-12345678' };
            const mockSubnets = [
                { SubnetId: 'subnet-a' },
                { SubnetId: 'subnet-b' }
            ];
            const mockSecurityGroup = { GroupId: 'sg-12345678' };
            const mockRouteTable = { RouteTableId: 'rtb-12345678' };
            const mockElasticIp = { AllocationId: 'eipalloc-available' };

            jest.spyOn(discovery, 'findDefaultVpc').mockResolvedValue(mockVpc);
            jest.spyOn(discovery, 'findPrivateSubnets').mockResolvedValue(mockSubnets);
            jest.spyOn(discovery, 'findPublicSubnets').mockResolvedValue(null);
            jest.spyOn(discovery, 'findDefaultSecurityGroup').mockResolvedValue(mockSecurityGroup);
            jest.spyOn(discovery, 'findPrivateRouteTable').mockResolvedValue(mockRouteTable);
            jest.spyOn(discovery, 'findDefaultKmsKey').mockResolvedValue(null);
            jest.spyOn(discovery, 'findExistingNatGateway').mockResolvedValue(null);
            const findAvailableElasticIPSpy = jest
                .spyOn(discovery, 'findAvailableElasticIP')
                .mockResolvedValue(mockElasticIp);
            jest.spyOn(discovery, 'isSubnetPrivate').mockResolvedValue(true);

            const result = await discovery.discoverResources();

            expect(result.publicSubnetId).toBeNull();
            expect(result.existingNatGatewayId).toBeNull();
            expect(result.existingElasticIpAllocationId).toBe('eipalloc-available');
            expect(findAvailableElasticIPSpy).toHaveBeenCalled();
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
