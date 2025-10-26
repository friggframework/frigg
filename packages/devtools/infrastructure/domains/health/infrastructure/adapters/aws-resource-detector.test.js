/**
 * Tests for AWSResourceDetector Adapter
 *
 * Tests AWS resource discovery for EC2, RDS, and KMS resources
 */

const AWSResourceDetector = require('./aws-resource-detector');

// Mock AWS SDK
jest.mock('@aws-sdk/client-ec2', () => ({
    EC2Client: jest.fn(),
    DescribeVpcsCommand: jest.fn(),
    DescribeSubnetsCommand: jest.fn(),
    DescribeSecurityGroupsCommand: jest.fn(),
    DescribeRouteTablesCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-rds', () => ({
    RDSClient: jest.fn(),
    DescribeDBClustersCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-kms', () => ({
    KMSClient: jest.fn(),
    ListKeysCommand: jest.fn(),
    DescribeKeyCommand: jest.fn(),
    ListAliasesCommand: jest.fn(),
}));

describe('AWSResourceDetector', () => {
    let detector;
    let mockEC2Send;
    let mockRDSSend;
    let mockKMSSend;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock EC2 client
        mockEC2Send = jest.fn();
        const { EC2Client } = require('@aws-sdk/client-ec2');
        EC2Client.mockImplementation(() => ({ send: mockEC2Send }));

        // Mock RDS client
        mockRDSSend = jest.fn();
        const { RDSClient } = require('@aws-sdk/client-rds');
        RDSClient.mockImplementation(() => ({ send: mockRDSSend }));

        // Mock KMS client
        mockKMSSend = jest.fn();
        const { KMSClient } = require('@aws-sdk/client-kms');
        KMSClient.mockImplementation(() => ({ send: mockKMSSend }));

        detector = new AWSResourceDetector({ region: 'us-east-1' });
    });

    describe('getSupportedResourceTypes', () => {
        it('should return list of supported resource types', async () => {
            const types = await detector.getSupportedResourceTypes();

            expect(types).toContain('AWS::EC2::VPC');
            expect(types).toContain('AWS::EC2::Subnet');
            expect(types).toContain('AWS::EC2::SecurityGroup');
            expect(types).toContain('AWS::EC2::RouteTable');
            expect(types).toContain('AWS::RDS::DBCluster');
            expect(types).toContain('AWS::KMS::Key');
            expect(types).toHaveLength(6);
        });
    });

    describe('detectResources - VPC', () => {
        it('should detect VPCs', async () => {
            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        VpcId: 'vpc-123',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'Name', Value: 'Main VPC' }],
                    },
                    {
                        VpcId: 'vpc-456',
                        CidrBlock: '10.1.0.0/16',
                        State: 'available',
                        Tags: [],
                    },
                ],
            });

            const resources = await detector.detectResources({
                resourceType: 'AWS::EC2::VPC',
                region: 'us-east-1',
            });

            expect(resources).toHaveLength(2);
            expect(resources[0]).toEqual({
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                properties: {
                    VpcId: 'vpc-123',
                    CidrBlock: '10.0.0.0/16',
                    State: 'available',
                },
                tags: { Name: 'Main VPC' },
                createdTime: expect.any(Date),
            });
        });

        it('should filter VPCs by tags', async () => {
            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        VpcId: 'vpc-123',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'Environment', Value: 'production' }],
                    },
                ],
            });

            const resources = await detector.detectResources({
                resourceType: 'AWS::EC2::VPC',
                region: 'us-east-1',
                filters: { tags: { Environment: 'production' } },
            });

            expect(resources).toHaveLength(1);
            expect(resources[0].tags).toEqual({ Environment: 'production' });
        });
    });

    describe('detectResources - Subnet', () => {
        it('should detect Subnets', async () => {
            mockEC2Send.mockResolvedValue({
                Subnets: [
                    {
                        SubnetId: 'subnet-123',
                        VpcId: 'vpc-123',
                        CidrBlock: '10.0.1.0/24',
                        AvailabilityZone: 'us-east-1a',
                        State: 'available',
                        Tags: [{ Key: 'Name', Value: 'Private Subnet' }],
                    },
                ],
            });

            const resources = await detector.detectResources({
                resourceType: 'AWS::EC2::Subnet',
                region: 'us-east-1',
            });

            expect(resources).toHaveLength(1);
            expect(resources[0].physicalId).toBe('subnet-123');
            expect(resources[0].properties.VpcId).toBe('vpc-123');
        });
    });

    describe('detectResources - SecurityGroup', () => {
        it('should detect SecurityGroups', async () => {
            mockEC2Send.mockResolvedValue({
                SecurityGroups: [
                    {
                        GroupId: 'sg-123',
                        GroupName: 'default',
                        Description: 'Default security group',
                        VpcId: 'vpc-123',
                        Tags: [],
                    },
                ],
            });

            const resources = await detector.detectResources({
                resourceType: 'AWS::EC2::SecurityGroup',
                region: 'us-east-1',
            });

            expect(resources).toHaveLength(1);
            expect(resources[0].physicalId).toBe('sg-123');
        });
    });

    describe('detectResources - RouteTable', () => {
        it('should detect RouteTables', async () => {
            mockEC2Send.mockResolvedValue({
                RouteTables: [
                    {
                        RouteTableId: 'rtb-123',
                        VpcId: 'vpc-123',
                        Routes: [],
                        Associations: [],
                        Tags: [{ Key: 'Name', Value: 'Main Route Table' }],
                    },
                ],
            });

            const resources = await detector.detectResources({
                resourceType: 'AWS::EC2::RouteTable',
                region: 'us-east-1',
            });

            expect(resources).toHaveLength(1);
            expect(resources[0].physicalId).toBe('rtb-123');
        });
    });

    describe('detectResources - RDS DBCluster', () => {
        it('should detect RDS DBClusters', async () => {
            mockRDSSend.mockResolvedValue({
                DBClusters: [
                    {
                        DBClusterIdentifier: 'my-aurora-cluster',
                        DBClusterArn: 'arn:aws:rds:us-east-1:123456789012:cluster:my-aurora-cluster',
                        Engine: 'aurora-postgresql',
                        EngineVersion: '13.7',
                        Status: 'available',
                        ClusterCreateTime: new Date('2024-01-01T00:00:00Z'),
                        TagList: [{ Key: 'Environment', Value: 'production' }],
                    },
                ],
            });

            const resources = await detector.detectResources({
                resourceType: 'AWS::RDS::DBCluster',
                region: 'us-east-1',
            });

            expect(resources).toHaveLength(1);
            expect(resources[0]).toEqual({
                physicalId: 'my-aurora-cluster',
                resourceType: 'AWS::RDS::DBCluster',
                properties: {
                    DBClusterIdentifier: 'my-aurora-cluster',
                    DBClusterArn: 'arn:aws:rds:us-east-1:123456789012:cluster:my-aurora-cluster',
                    Engine: 'aurora-postgresql',
                    EngineVersion: '13.7',
                    Status: 'available',
                },
                tags: { Environment: 'production' },
                createdTime: new Date('2024-01-01T00:00:00Z'),
            });
        });
    });

    describe('detectResources - KMS Key', () => {
        it('should detect KMS Keys', async () => {
            // First call: ListKeys
            mockKMSSend.mockResolvedValueOnce({
                Keys: [
                    { KeyId: 'key-123', KeyArn: 'arn:aws:kms:us-east-1:123456789012:key/key-123' },
                ],
            });

            // Second call: DescribeKey for key-123
            mockKMSSend.mockResolvedValueOnce({
                KeyMetadata: {
                    KeyId: 'key-123',
                    Arn: 'arn:aws:kms:us-east-1:123456789012:key/key-123',
                    CreationDate: new Date('2024-01-01T00:00:00Z'),
                    Enabled: true,
                    KeyState: 'Enabled',
                    KeyManager: 'CUSTOMER',
                },
            });

            // Third call: ListAliases for key-123
            mockKMSSend.mockResolvedValueOnce({
                Aliases: [{ AliasName: 'alias/my-key', TargetKeyId: 'key-123' }],
            });

            const resources = await detector.detectResources({
                resourceType: 'AWS::KMS::Key',
                region: 'us-east-1',
            });

            expect(resources).toHaveLength(1);
            expect(resources[0].physicalId).toBe('key-123');
            expect(resources[0].properties.KeyState).toBe('Enabled');
            expect(mockKMSSend).toHaveBeenCalledTimes(3);
        });
    });

    describe('detectResources - unsupported type', () => {
        it('should throw error for unsupported resource type', async () => {
            await expect(
                detector.detectResources({
                    resourceType: 'AWS::Lambda::Function',
                    region: 'us-east-1',
                })
            ).rejects.toThrow('Resource type AWS::Lambda::Function is not supported');
        });
    });

    describe('getResourceDetails', () => {
        it('should get VPC details', async () => {
            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        VpcId: 'vpc-123',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        EnableDnsHostnames: true,
                        EnableDnsSupport: true,
                        Tags: [{ Key: 'Name', Value: 'Main VPC' }],
                    },
                ],
            });

            const resource = await detector.getResourceDetails({
                resourceType: 'AWS::EC2::VPC',
                physicalId: 'vpc-123',
                region: 'us-east-1',
            });

            expect(resource.physicalId).toBe('vpc-123');
            expect(resource.properties.EnableDnsHostnames).toBe(true);
        });

        it('should get RDS DBCluster details', async () => {
            mockRDSSend.mockResolvedValue({
                DBClusters: [
                    {
                        DBClusterIdentifier: 'my-cluster',
                        Engine: 'aurora-postgresql',
                        EngineVersion: '13.7',
                        Status: 'available',
                        ClusterCreateTime: new Date('2024-01-01T00:00:00Z'),
                    },
                ],
            });

            const resource = await detector.getResourceDetails({
                resourceType: 'AWS::RDS::DBCluster',
                physicalId: 'my-cluster',
                region: 'us-east-1',
            });

            expect(resource.physicalId).toBe('my-cluster');
            expect(resource.properties.Engine).toBe('aurora-postgresql');
        });

        it('should throw error if resource not found', async () => {
            mockEC2Send.mockResolvedValue({ Vpcs: [] });

            await expect(
                detector.getResourceDetails({
                    resourceType: 'AWS::EC2::VPC',
                    physicalId: 'vpc-nonexistent',
                    region: 'us-east-1',
                })
            ).rejects.toThrow('Resource vpc-nonexistent not found');
        });
    });

    describe('resourceExists', () => {
        it('should return true if VPC exists', async () => {
            mockEC2Send.mockResolvedValue({
                Vpcs: [{ VpcId: 'vpc-123' }],
            });

            const exists = await detector.resourceExists({
                resourceType: 'AWS::EC2::VPC',
                physicalId: 'vpc-123',
                region: 'us-east-1',
            });

            expect(exists).toBe(true);
        });

        it('should return false if VPC does not exist', async () => {
            mockEC2Send.mockResolvedValue({ Vpcs: [] });

            const exists = await detector.resourceExists({
                resourceType: 'AWS::EC2::VPC',
                physicalId: 'vpc-nonexistent',
                region: 'us-east-1',
            });

            expect(exists).toBe(false);
        });
    });

    describe('detectResourcesByTags', () => {
        it('should detect resources matching tags', async () => {
            // VPCs
            mockEC2Send.mockResolvedValueOnce({
                Vpcs: [
                    {
                        VpcId: 'vpc-123',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'Environment', Value: 'production' }],
                    },
                ],
            });

            // Subnets
            mockEC2Send.mockResolvedValueOnce({
                Subnets: [
                    {
                        SubnetId: 'subnet-123',
                        VpcId: 'vpc-123',
                        CidrBlock: '10.0.1.0/24',
                        State: 'available',
                        Tags: [{ Key: 'Environment', Value: 'production' }],
                    },
                ],
            });

            const resources = await detector.detectResourcesByTags({
                tags: { Environment: 'production' },
                region: 'us-east-1',
                resourceTypes: ['AWS::EC2::VPC', 'AWS::EC2::Subnet'],
            });

            expect(resources).toHaveLength(2);
            expect(resources[0].physicalId).toBe('vpc-123');
            expect(resources[1].physicalId).toBe('subnet-123');
        });

        it('should detect all supported types if resourceTypes not specified', async () => {
            // Mock responses for all supported types
            mockEC2Send.mockResolvedValueOnce({ Vpcs: [] });
            mockEC2Send.mockResolvedValueOnce({ Subnets: [] });
            mockEC2Send.mockResolvedValueOnce({ SecurityGroups: [] });
            mockEC2Send.mockResolvedValueOnce({ RouteTables: [] });
            mockRDSSend.mockResolvedValueOnce({ DBClusters: [] });
            mockKMSSend.mockResolvedValueOnce({ Keys: [] });

            const resources = await detector.detectResourcesByTags({
                tags: { Team: 'platform' },
                region: 'us-east-1',
            });

            expect(resources).toEqual([]);
            expect(mockEC2Send).toHaveBeenCalledTimes(4);
            expect(mockRDSSend).toHaveBeenCalledTimes(1);
            expect(mockKMSSend).toHaveBeenCalledTimes(1);
        });
    });

    describe('findOrphanedResources', () => {
        it('should find orphaned RDS DBCluster', async () => {
            mockRDSSend.mockResolvedValue({
                DBClusters: [
                    {
                        DBClusterIdentifier: 'orphan-cluster',
                        DBClusterArn: 'arn:aws:rds:us-east-1:123456789012:cluster:orphan-cluster',
                        Engine: 'aurora-postgresql',
                        Status: 'available',
                        ClusterCreateTime: new Date('2024-01-01T00:00:00Z'),
                        TagList: [],
                    },
                ],
            });

            const orphans = await detector.findOrphanedResources({
                region: 'us-east-1',
                resourceTypes: ['AWS::RDS::DBCluster'],
            });

            expect(orphans).toHaveLength(1);
            expect(orphans[0].physicalId).toBe('orphan-cluster');
            expect(orphans[0].isOrphaned).toBe(true);
            expect(orphans[0].reason).toContain('not managed by CloudFormation');
        });

        it('should exclude specified physical IDs', async () => {
            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    { VpcId: 'vpc-123', CidrBlock: '10.0.0.0/16', State: 'available', Tags: [] },
                    { VpcId: 'vpc-456', CidrBlock: '10.1.0.0/16', State: 'available', Tags: [] },
                ],
            });

            const orphans = await detector.findOrphanedResources({
                region: 'us-east-1',
                resourceTypes: ['AWS::EC2::VPC'],
                excludePhysicalIds: ['vpc-123'],
            });

            expect(orphans).toHaveLength(1);
            expect(orphans[0].physicalId).toBe('vpc-456');
        });
    });

    describe('constructor', () => {
        it('should create instance with default region', () => {
            const det = new AWSResourceDetector();
            expect(det).toBeInstanceOf(AWSResourceDetector);
        });

        it('should create instance with custom region', () => {
            const det = new AWSResourceDetector({ region: 'eu-west-1' });
            expect(det).toBeInstanceOf(AWSResourceDetector);
        });
    });
});
