const AWS = require('aws-sdk');
const { AWSDiscovery } = require('./aws-discovery');

// Mock AWS SDK
jest.mock('@aws-sdk/client-ec2');
jest.mock('@aws-sdk/client-kms');
jest.mock('@aws-sdk/client-sts');

const { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeRouteTablesCommand } = require('@aws-sdk/client-ec2');
const { KMSClient, ListKeysCommand, DescribeKeyCommand } = require('@aws-sdk/client-kms');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

describe('AWSDiscovery', () => {
    let discovery;
    let mockEC2Send;
    let mockKMSSend;
    let mockSTSSend;

    beforeEach(() => {
        discovery = new AWSDiscovery('us-east-1');
        
        // Create mock send functions
        mockEC2Send = jest.fn();
        mockKMSSend = jest.fn();
        mockSTSSend = jest.fn();
        
        // Mock the client constructors and send methods
        EC2Client.mockImplementation(() => ({
            send: mockEC2Send
        }));
        
        KMSClient.mockImplementation(() => ({
            send: mockKMSSend
        }));
        
        STSClient.mockImplementation(() => ({
            send: mockSTSSend
        }));

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('getAccountId', () => {
        it('should return AWS account ID', async () => {
            const mockAccountId = '123456789012';
            mockSTSSend.mockResolvedValue({
                Account: mockAccountId
            });

            const result = await discovery.getAccountId();

            expect(result).toBe(mockAccountId);
            expect(mockSTSSend).toHaveBeenCalledWith(expect.any(GetCallerIdentityCommand));
        });

        it('should throw error when STS call fails', async () => {
            const error = new Error('STS Error');
            mockSTSSend.mockRejectedValue(error);

            await expect(discovery.getAccountId()).rejects.toThrow('STS Error');
        });
    });

    describe('findDefaultVpc', () => {
        it('should return default VPC when found', async () => {
            const mockVpc = {
                VpcId: 'vpc-12345678',
                IsDefault: true,
                State: 'available'
            };

            mockEC2Send.mockResolvedValue({
                Vpcs: [mockVpc]
            });

            const result = await discovery.findDefaultVpc();

            expect(result).toEqual(mockVpc);
            expect(mockEC2Send).toHaveBeenCalledWith(expect.objectContaining({
                input: {
                    Filters: [{
                        Name: 'is-default',
                        Values: ['true']
                    }]
                }
            }));
        });

        it('should return first available VPC when no default VPC exists', async () => {
            const mockVpc = {
                VpcId: 'vpc-87654321',
                IsDefault: false,
                State: 'available'
            };

            mockEC2Send
                .mockResolvedValueOnce({ Vpcs: [] }) // No default VPC
                .mockResolvedValueOnce({ Vpcs: [mockVpc] }); // All VPCs

            const result = await discovery.findDefaultVpc();

            expect(result).toEqual(mockVpc);
            expect(mockEC2Send).toHaveBeenCalledTimes(2);
        });

        it('should throw error when no VPCs found', async () => {
            mockEC2Send
                .mockResolvedValueOnce({ Vpcs: [] }) // No default VPC
                .mockResolvedValueOnce({ Vpcs: [] }); // No VPCs at all

            await expect(discovery.findDefaultVpc()).rejects.toThrow('No VPC found in the account');
        });
    });

    describe('findPrivateSubnets', () => {
        const mockVpcId = 'vpc-12345678';

        it('should return private subnets when found', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-private-1', VpcId: mockVpcId, AvailabilityZone: 'us-east-1a' },
                { SubnetId: 'subnet-private-2', VpcId: mockVpcId, AvailabilityZone: 'us-east-1b' }
            ];

            mockEC2Send
                .mockResolvedValueOnce({ Subnets: mockSubnets }) // DescribeSubnets
                .mockResolvedValueOnce({ // Check subnet-private-1
                    Subnets: [{ SubnetId: 'subnet-private-1', VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // Route tables for private-1
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-private-1' }],
                        Routes: [{ GatewayId: 'local' }] // No IGW = private
                    }]
                })
                .mockResolvedValueOnce({ // Check subnet-private-2
                    Subnets: [{ SubnetId: 'subnet-private-2', VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // Route tables for private-2
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-private-2' }],
                        Routes: [{ GatewayId: 'local' }] // No IGW = private
                    }]
                });

            const result = await discovery.findPrivateSubnets(mockVpcId, false);

            expect(result).toHaveLength(2);
            expect(result[0].SubnetId).toBe('subnet-private-1');
            expect(result[1].SubnetId).toBe('subnet-private-2');
        });

        it('should handle all public subnets with autoConvert enabled', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-public-1', VpcId: mockVpcId, AvailabilityZone: 'us-east-1a' },
                { SubnetId: 'subnet-public-2', VpcId: mockVpcId, AvailabilityZone: 'us-east-1b' },
                { SubnetId: 'subnet-public-3', VpcId: mockVpcId, AvailabilityZone: 'us-east-1c' }
            ];

            // Mock all subnets as public
            mockEC2Send
                .mockResolvedValueOnce({ Subnets: mockSubnets }) // DescribeSubnets
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-public-1', VpcId: mockVpcId }] })
                .mockResolvedValueOnce({ // Route table for public-1
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-1' }],
                        Routes: [{ GatewayId: 'igw-12345' }] // IGW = public
                    }]
                })
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-public-2', VpcId: mockVpcId }] })
                .mockResolvedValueOnce({ // Route table for public-2
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-2' }],
                        Routes: [{ GatewayId: 'igw-12345' }] // IGW = public
                    }]
                })
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-public-3', VpcId: mockVpcId }] })
                .mockResolvedValueOnce({ // Route table for public-3
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-3' }],
                        Routes: [{ GatewayId: 'igw-12345' }] // IGW = public
                    }]
                });

            // With autoConvert=true, should return subnets to be converted
            const result = await discovery.findPrivateSubnets(mockVpcId, true);

            expect(result).toHaveLength(2);
            // Should return subnets 2 and 3 for conversion (keeping 1 as public for NAT)
            expect(result[0].SubnetId).toBe('subnet-public-2');
            expect(result[1].SubnetId).toBe('subnet-public-3');
        });

        it('should throw error when all subnets are public and autoConvert is false', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-public-1', VpcId: mockVpcId, AvailabilityZone: 'us-east-1a' },
                { SubnetId: 'subnet-public-2', VpcId: mockVpcId, AvailabilityZone: 'us-east-1b' }
            ];

            mockEC2Send
                .mockResolvedValueOnce({ Subnets: mockSubnets })
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-public-1', VpcId: mockVpcId }] })
                .mockResolvedValueOnce({ // Public route table
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-1' }],
                        Routes: [{ GatewayId: 'igw-12345' }]
                    }]
                })
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-public-2', VpcId: mockVpcId }] })
                .mockResolvedValueOnce({ // Public route table
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-2' }],
                        Routes: [{ GatewayId: 'igw-12345' }]
                    }]
                });

            await expect(discovery.findPrivateSubnets(mockVpcId, false)).rejects.toThrow(
                `No private subnets found in VPC ${mockVpcId}`
            );
        });

        it('should handle mixed private/public subnets correctly', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-private-1', VpcId: mockVpcId, AvailabilityZone: 'us-east-1a' },
                { SubnetId: 'subnet-public-1', VpcId: mockVpcId, AvailabilityZone: 'us-east-1b' },
                { SubnetId: 'subnet-public-2', VpcId: mockVpcId, AvailabilityZone: 'us-east-1c' }
            ];

            mockEC2Send
                .mockResolvedValueOnce({ Subnets: mockSubnets })
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-private-1', VpcId: mockVpcId }] })
                .mockResolvedValueOnce({ // Private route table
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-private-1' }],
                        Routes: [{ GatewayId: 'local' }] // No IGW
                    }]
                })
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-public-1', VpcId: mockVpcId }] })
                .mockResolvedValueOnce({ // Public route table
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-1' }],
                        Routes: [{ GatewayId: 'igw-12345' }]
                    }]
                })
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-public-2', VpcId: mockVpcId }] })
                .mockResolvedValueOnce({ // Public route table
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-2' }],
                        Routes: [{ GatewayId: 'igw-12345' }]
                    }]
                });

            const result = await discovery.findPrivateSubnets(mockVpcId, false);

            expect(result).toHaveLength(2);
            // Should return the one private and one public subnet for HA
            expect(result[0].SubnetId).toBe('subnet-private-1');
            expect(result[1].SubnetId).toBe('subnet-public-1');
        });

        it('should throw error when no subnets found', async () => {
            mockEC2Send.mockResolvedValue({ Subnets: [] });

            await expect(discovery.findPrivateSubnets(mockVpcId)).rejects.toThrow(`No subnets found in VPC ${mockVpcId}`);
        });
    });

    describe('isSubnetPrivate', () => {
        const mockSubnetId = 'subnet-12345678';
        const mockVpcId = 'vpc-12345678';

        it('should return false for public subnet (has IGW route)', async () => {
            mockEC2Send
                .mockResolvedValueOnce({ // DescribeSubnets
                    Subnets: [{ SubnetId: mockSubnetId, VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // DescribeRouteTables
                    RouteTables: [{
                        Associations: [{ SubnetId: mockSubnetId }],
                        Routes: [{
                            GatewayId: 'igw-12345678',
                            DestinationCidrBlock: '0.0.0.0/0'
                        }]
                    }]
                });

            const result = await discovery.isSubnetPrivate(mockSubnetId);

            expect(result).toBe(false);
        });

        it('should return true for private subnet (no IGW route)', async () => {
            mockEC2Send
                .mockResolvedValueOnce({ // DescribeSubnets
                    Subnets: [{ SubnetId: mockSubnetId, VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // DescribeRouteTables
                    RouteTables: [{
                        Associations: [{ SubnetId: mockSubnetId }],
                        Routes: [{
                            GatewayId: 'local',
                            DestinationCidrBlock: '10.0.0.0/16'
                        }]
                    }]
                });

            const result = await discovery.isSubnetPrivate(mockSubnetId);

            expect(result).toBe(true);
        });

        it('should use main route table if no explicit association', async () => {
            mockEC2Send
                .mockResolvedValueOnce({ // DescribeSubnets
                    Subnets: [{ SubnetId: mockSubnetId, VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // DescribeRouteTables
                    RouteTables: [{
                        Associations: [{ Main: true }], // Main route table
                        Routes: [{
                            GatewayId: 'igw-12345678',
                            DestinationCidrBlock: '0.0.0.0/0'
                        }]
                    }]
                });

            const result = await discovery.isSubnetPrivate(mockSubnetId);

            expect(result).toBe(false); // Public because main route has IGW
        });

        it('should default to private on error', async () => {
            mockEC2Send
                .mockResolvedValueOnce({ // DescribeSubnets
                    Subnets: [{ SubnetId: mockSubnetId, VpcId: mockVpcId }]
                })
                .mockRejectedValue(new Error('Route table error'));

            const result = await discovery.isSubnetPrivate(mockSubnetId);

            expect(result).toBe(true);
        });

        it('should throw error when subnet not found', async () => {
            mockEC2Send.mockResolvedValueOnce({ Subnets: [] });

            await expect(discovery.isSubnetPrivate(mockSubnetId)).rejects.toThrow(
                `Subnet ${mockSubnetId} not found`
            );
        });
    });

    describe('findDefaultSecurityGroup', () => {
        const mockVpcId = 'vpc-12345678';

        it('should return Frigg security group when found', async () => {
            const mockFriggSg = {
                GroupId: 'sg-frigg-123',
                GroupName: 'frigg-lambda-sg',
                VpcId: mockVpcId
            };

            mockEC2Send.mockResolvedValue({
                SecurityGroups: [mockFriggSg]
            });

            const result = await discovery.findDefaultSecurityGroup(mockVpcId);

            expect(result).toEqual(mockFriggSg);
            expect(mockEC2Send).toHaveBeenCalledWith(expect.objectContaining({
                input: {
                    Filters: [
                        { Name: 'vpc-id', Values: [mockVpcId] },
                        { Name: 'group-name', Values: ['frigg-lambda-sg'] }
                    ]
                }
            }));
        });

        it('should fallback to default security group', async () => {
            const mockDefaultSg = {
                GroupId: 'sg-default-123',
                GroupName: 'default',
                VpcId: mockVpcId
            };

            mockEC2Send
                .mockResolvedValueOnce({ SecurityGroups: [] }) // No Frigg SG
                .mockResolvedValueOnce({ SecurityGroups: [mockDefaultSg] }); // Default SG

            const result = await discovery.findDefaultSecurityGroup(mockVpcId);

            expect(result).toEqual(mockDefaultSg);
            expect(mockEC2Send).toHaveBeenCalledTimes(2);
        });

        it('should throw error when no security groups found', async () => {
            mockEC2Send.mockResolvedValue({ SecurityGroups: [] });

            await expect(discovery.findDefaultSecurityGroup(mockVpcId)).rejects.toThrow(`No security group found for VPC ${mockVpcId}`);
        });
    });

    describe('findDefaultKmsKey', () => {
        it('should return customer managed key when found', async () => {
            const mockKeyId = 'key-12345678';
            const mockKeyArn = 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012';

            mockKMSSend
                .mockResolvedValueOnce({ // ListKeys
                    Keys: [{ KeyId: mockKeyId }]
                })
                .mockResolvedValueOnce({ // DescribeKey
                    KeyMetadata: {
                        KeyId: mockKeyId,
                        Arn: mockKeyArn,
                        KeyManager: 'CUSTOMER',
                        KeyState: 'Enabled'
                    }
                });

            mockSTSSend.mockResolvedValue({ Account: '123456789012' });

            const result = await discovery.findDefaultKmsKey();

            expect(result).toBe(mockKeyArn);
        });

        it('should return wildcard pattern when no customer keys found', async () => {
            mockKMSSend.mockResolvedValue({ Keys: [] });
            mockSTSSend.mockResolvedValue({ Account: '123456789012' });

            const result = await discovery.findDefaultKmsKey();

            expect(result).toBe('arn:aws:kms:us-east-1:123456789012:key/*');
        });

        it('should return fallback on error', async () => {
            mockKMSSend.mockRejectedValue(new Error('KMS Error'));

            const result = await discovery.findDefaultKmsKey();

            expect(result).toBe('*');
        });
    });

    describe('findExistingNatGateway', () => {
        const mockVpcId = 'vpc-12345678';

        it('should return NAT Gateway in public subnet', async () => {
            const mockNatGateway = {
                NatGatewayId: 'nat-12345678',
                SubnetId: 'subnet-public-1',
                State: 'available',
                NatGatewayAddresses: [{ AllocationId: 'eipalloc-12345' }],
                Tags: []
            };

            mockEC2Send
                .mockResolvedValueOnce({ // DescribeNatGateways
                    NatGateways: [mockNatGateway]
                })
                .mockResolvedValueOnce({ // DescribeSubnets for NAT's subnet
                    Subnets: [{ SubnetId: 'subnet-public-1', VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // DescribeRouteTables
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-1' }],
                        Routes: [{ GatewayId: 'igw-12345' }] // Has IGW = public
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

            mockEC2Send
                .mockResolvedValueOnce({ // DescribeNatGateways
                    NatGateways: [mockNatGateway]
                })
                .mockResolvedValueOnce({ // DescribeSubnets for NAT's subnet
                    Subnets: [{ SubnetId: 'subnet-private-1', VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // DescribeRouteTables
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-private-1' }],
                        Routes: [{ GatewayId: 'local' }] // No IGW = private
                    }]
                });

            const result = await discovery.findExistingNatGateway(mockVpcId);

            expect(result).toBeDefined();
            expect(result.NatGatewayId).toBe('nat-12345678');
            expect(result._isInPrivateSubnet).toBe(true); // Should be marked as in private subnet
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

            mockEC2Send
                .mockResolvedValueOnce({ // DescribeNatGateways
                    NatGateways: mockNatGateways
                })
                // First NAT Gateway (private subnet check)
                .mockResolvedValueOnce({ // DescribeSubnets
                    Subnets: [{ SubnetId: 'subnet-private-1', VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // DescribeRouteTables
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-private-1' }],
                        Routes: [{ GatewayId: 'local' }] // Private
                    }]
                })
                // Second NAT Gateway (public subnet check)
                .mockResolvedValueOnce({ // DescribeSubnets
                    Subnets: [{ SubnetId: 'subnet-public-1', VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // DescribeRouteTables
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-1' }],
                        Routes: [{ GatewayId: 'igw-12345' }] // Public
                    }]
                });

            const result = await discovery.findExistingNatGateway(mockVpcId);

            expect(result).toBeDefined();
            expect(result.NatGatewayId).toBe('nat-good-12345'); // Should return the public one
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

            mockEC2Send
                .mockResolvedValueOnce({ // DescribeNatGateways
                    NatGateways: mockNatGateways
                })
                // Frigg NAT Gateway check (should be checked first due to sorting)
                .mockResolvedValueOnce({ // DescribeSubnets
                    Subnets: [{ SubnetId: 'subnet-public-2', VpcId: mockVpcId }]
                })
                .mockResolvedValueOnce({ // DescribeRouteTables
                    RouteTables: [{
                        Associations: [{ SubnetId: 'subnet-public-2' }],
                        Routes: [{ GatewayId: 'igw-12345' }] // Public
                    }]
                });

            const result = await discovery.findExistingNatGateway(mockVpcId);

            expect(result).toBeDefined();
            expect(result.NatGatewayId).toBe('nat-frigg-12345'); // Should return Frigg-managed one
            expect(result._isInPrivateSubnet).toBe(false);
        });

        it('should return null when no NAT Gateways found', async () => {
            mockEC2Send.mockResolvedValueOnce({ NatGateways: [] });

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
                NatGatewayAddresses: [{ AllocationId: 'eipalloc-12345' }]
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
                .mockResolvedValueOnce(false) // subnet-1 is actually public
                .mockResolvedValueOnce(true); // subnet-2 is private

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
            const mockSecurityGroup = { GroupId: 'sg-12345678' };
            const mockRouteTable = { RouteTableId: 'rtb-12345678' };
            const mockKmsArn = 'arn:aws:kms:us-east-1:123456789012:key/12345678';

            jest.spyOn(discovery, 'findDefaultVpc').mockResolvedValue(mockVpc);
            jest.spyOn(discovery, 'findPrivateSubnets').mockResolvedValue(mockSubnets);
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