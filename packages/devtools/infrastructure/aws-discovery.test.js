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
                { SubnetId: 'subnet-private-1', VpcId: mockVpcId },
                { SubnetId: 'subnet-private-2', VpcId: mockVpcId }
            ];

            mockEC2Send
                .mockResolvedValueOnce({ Subnets: mockSubnets }) // DescribeSubnets
                .mockResolvedValue({ RouteTables: [] }); // DescribeRouteTables (private)

            const result = await discovery.findPrivateSubnets(mockVpcId);

            expect(result).toHaveLength(2);
            expect(result[0].SubnetId).toBe('subnet-private-1');
            expect(result[1].SubnetId).toBe('subnet-private-2');
        });

        it('should return at least 2 subnets even if mixed private/public', async () => {
            const mockSubnets = [
                { SubnetId: 'subnet-1', VpcId: mockVpcId },
                { SubnetId: 'subnet-2', VpcId: mockVpcId },
                { SubnetId: 'subnet-3', VpcId: mockVpcId }
            ];

            mockEC2Send
                .mockResolvedValueOnce({ Subnets: mockSubnets }) // DescribeSubnets
                .mockResolvedValue({ // Only one private subnet
                    RouteTables: [{
                        Routes: [] // No IGW route = private
                    }]
                });

            const result = await discovery.findPrivateSubnets(mockVpcId);

            expect(result).toHaveLength(2);
        });

        it('should throw error when no subnets found', async () => {
            mockEC2Send.mockResolvedValue({ Subnets: [] });

            await expect(discovery.findPrivateSubnets(mockVpcId)).rejects.toThrow(`No subnets found in VPC ${mockVpcId}`);
        });
    });

    describe('isSubnetPrivate', () => {
        const mockSubnetId = 'subnet-12345678';

        it('should return false for public subnet (has IGW route)', async () => {
            mockEC2Send.mockResolvedValue({
                RouteTables: [{
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
            mockEC2Send.mockResolvedValue({
                RouteTables: [{
                    Routes: [{
                        GatewayId: 'local',
                        DestinationCidrBlock: '10.0.0.0/16'
                    }]
                }]
            });

            const result = await discovery.isSubnetPrivate(mockSubnetId);

            expect(result).toBe(true);
        });

        it('should default to private on error', async () => {
            mockEC2Send.mockRejectedValue(new Error('Route table error'));

            const result = await discovery.isSubnetPrivate(mockSubnetId);

            expect(result).toBe(true);
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

    describe('discoverResources', () => {
        it('should discover all AWS resources successfully', async () => {
            const mockVpc = { VpcId: 'vpc-12345678' };
            const mockSubnets = [
                { SubnetId: 'subnet-1' }, 
                { SubnetId: 'subnet-2' }
            ];
            const mockSecurityGroup = { GroupId: 'sg-12345678' };
            const mockRouteTable = { RouteTableId: 'rtb-12345678' };
            const mockKmsArn = 'arn:aws:kms:us-east-1:123456789012:key/12345678';

            // Mock all the discovery methods
            jest.spyOn(discovery, 'findDefaultVpc').mockResolvedValue(mockVpc);
            jest.spyOn(discovery, 'findPrivateSubnets').mockResolvedValue(mockSubnets);
            jest.spyOn(discovery, 'findDefaultSecurityGroup').mockResolvedValue(mockSecurityGroup);
            jest.spyOn(discovery, 'findPrivateRouteTable').mockResolvedValue(mockRouteTable);
            jest.spyOn(discovery, 'findDefaultKmsKey').mockResolvedValue(mockKmsArn);

            const result = await discovery.discoverResources();

            expect(result).toEqual({
                defaultVpcId: 'vpc-12345678',
                defaultSecurityGroupId: 'sg-12345678',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                privateRouteTableId: 'rtb-12345678',
                defaultKmsKeyId: mockKmsArn
            });

            // Verify all methods were called
            expect(discovery.findDefaultVpc).toHaveBeenCalled();
            expect(discovery.findPrivateSubnets).toHaveBeenCalledWith('vpc-12345678');
            expect(discovery.findDefaultSecurityGroup).toHaveBeenCalledWith('vpc-12345678');
            expect(discovery.findPrivateRouteTable).toHaveBeenCalledWith('vpc-12345678');
            expect(discovery.findDefaultKmsKey).toHaveBeenCalled();
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