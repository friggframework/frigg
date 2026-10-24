/**
 * Tests for VPC Discovery Service
 * 
 * Tests VPC resource discovery with mocked cloud provider
 */

const { VpcDiscovery } = require('./vpc-discovery');

describe('VpcDiscovery', () => {
    let mockProvider;
    let vpcDiscovery;

    beforeEach(() => {
        mockProvider = {
            discoverVpc: jest.fn(),
            getName: jest.fn().mockReturnValue('aws'),
        };
        vpcDiscovery = new VpcDiscovery(mockProvider);
    });

    describe('discover()', () => {
        it('should delegate to provider and transform results', async () => {
            const mockProviderResponse = {
                vpcId: 'vpc-123456',
                vpcCidr: '172.31.0.0/16',
                subnets: [
                    {
                        SubnetId: 'subnet-private1',
                        MapPublicIpOnLaunch: false,
                        AvailabilityZone: 'us-east-1a',
                    },
                    {
                        SubnetId: 'subnet-private2',
                        MapPublicIpOnLaunch: false,
                        AvailabilityZone: 'us-east-1b',
                    },
                    {
                        SubnetId: 'subnet-public1',
                        MapPublicIpOnLaunch: true,
                        AvailabilityZone: 'us-east-1a',
                    },
                ],
                securityGroups: [
                    { GroupId: 'sg-default', GroupName: 'default' },
                    { GroupId: 'sg-custom', GroupName: 'custom' },
                ],
                routeTables: [
                    {
                        RouteTableId: 'rtb-123',
                        Associations: [{ Main: true }],
                    },
                ],
                natGateways: [],
                internetGateways: [
                    { InternetGatewayId: 'igw-123' },
                ],
            };

            mockProvider.discoverVpc.mockResolvedValue(mockProviderResponse);

            const result = await vpcDiscovery.discover({ vpcId: 'vpc-123456' });

            expect(mockProvider.discoverVpc).toHaveBeenCalledWith({ vpcId: 'vpc-123456' });
            expect(result.defaultVpcId).toBe('vpc-123456');
            expect(result.vpcCidr).toBe('172.31.0.0/16');
            expect(result.privateSubnetId1).toBe('subnet-private1');
            expect(result.privateSubnetId2).toBe('subnet-private2');
            expect(result.publicSubnetId).toBe('subnet-public1');
            expect(result.publicSubnetId1).toBe('subnet-public1');
            expect(result.defaultSecurityGroupId).toBe('sg-default');
            expect(result.defaultRouteTableId).toBe('rtb-123');
            expect(result.internetGatewayId).toBe('igw-123');
        });

        it('should handle VPC with only private subnets', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                subnets: [
                    { SubnetId: 'subnet-1', MapPublicIpOnLaunch: false },
                ],
                securityGroups: [],
                routeTables: [],
                natGateways: [],
                internetGateways: [],
            });

            const result = await vpcDiscovery.discover({});

            expect(result.privateSubnetId1).toBe('subnet-1');
            expect(result.privateSubnetId2).toBeUndefined();
            expect(result.publicSubnetId).toBeUndefined();
        });

        it('should handle NAT gateway discovery', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                subnets: [
                    { SubnetId: 'subnet-public', MapPublicIpOnLaunch: true },
                    { SubnetId: 'subnet-private', MapPublicIpOnLaunch: false },
                ],
                securityGroups: [],
                routeTables: [],
                natGateways: [
                    {
                        NatGatewayId: 'nat-123',
                        State: 'available',
                        SubnetId: 'subnet-public',
                        NatGatewayAddresses: [
                            { AllocationId: 'eipalloc-456' },
                        ],
                    },
                ],
                internetGateways: [],
            });

            const result = await vpcDiscovery.discover({});

            expect(result.existingNatGatewayId).toBe('nat-123');
            expect(result.natGatewayInPrivateSubnet).toBe(false);
            expect(result.existingElasticIpAllocationId).toBe('eipalloc-456');
        });

        it('should detect NAT gateway in private subnet (configuration error)', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                subnets: [
                    { SubnetId: 'subnet-private', MapPublicIpOnLaunch: false },
                ],
                securityGroups: [],
                routeTables: [],
                natGateways: [
                    {
                        NatGatewayId: 'nat-misplaced',
                        State: 'available',
                        SubnetId: 'subnet-private',
                        NatGatewayAddresses: [],
                    },
                ],
                internetGateways: [],
            });

            const result = await vpcDiscovery.discover({});

            expect(result.existingNatGatewayId).toBe('nat-misplaced');
            expect(result.natGatewayInPrivateSubnet).toBe(true);
        });

        it('should ignore NAT gateways that are not available', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                subnets: [],
                securityGroups: [],
                routeTables: [],
                natGateways: [
                    {
                        NatGatewayId: 'nat-pending',
                        State: 'pending',
                        SubnetId: 'subnet-public',
                    },
                    {
                        NatGatewayId: 'nat-failed',
                        State: 'failed',
                        SubnetId: 'subnet-public',
                    },
                ],
                internetGateways: [],
            });

            const result = await vpcDiscovery.discover({});

            expect(result.existingNatGatewayId).toBeUndefined();
        });

        it('should handle discovery errors gracefully', async () => {
            mockProvider.discoverVpc.mockRejectedValue(new Error('AWS API Error'));

            const result = await vpcDiscovery.discover({});

            expect(result.defaultVpcId).toBeNull();
            expect(result.vpcCidr).toBeNull();
            expect(result.privateSubnetId1).toBeNull();
        });

        it('should find default route table from main association', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                subnets: [],
                securityGroups: [],
                routeTables: [
                    {
                        RouteTableId: 'rtb-custom',
                        Associations: [{ Main: false }],
                    },
                    {
                        RouteTableId: 'rtb-main',
                        Associations: [{ Main: true }],
                    },
                ],
                natGateways: [],
                internetGateways: [],
            });

            const result = await vpcDiscovery.discover({});

            expect(result.defaultRouteTableId).toBe('rtb-main');
            expect(result.privateRouteTableId).toBe('rtb-main');
        });

        it('should handle multiple public subnets', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                subnets: [
                    { SubnetId: 'subnet-public-1', MapPublicIpOnLaunch: true },
                    { SubnetId: 'subnet-public-2', MapPublicIpOnLaunch: true },
                ],
                securityGroups: [],
                routeTables: [],
                natGateways: [],
                internetGateways: [],
            });

            const result = await vpcDiscovery.discover({});

            expect(result.publicSubnetId).toBe('subnet-public-1');
            expect(result.publicSubnetId1).toBe('subnet-public-1');
            expect(result.publicSubnetId2).toBe('subnet-public-2');
        });

        it('should pass config to provider', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-custom',
                subnets: [],
                securityGroups: [],
                routeTables: [],
                natGateways: [],
                internetGateways: [],
            });

            const config = {
                vpcId: 'vpc-custom',
                serviceName: 'test-service',
                stage: 'prod',
            };

            await vpcDiscovery.discover(config);

            expect(mockProvider.discoverVpc).toHaveBeenCalledWith(config);
        });

        it('should discover all VPC endpoints (S3, DynamoDB, KMS, Secrets Manager, SQS, SSM)', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                subnets: [],
                securityGroups: [],
                routeTables: [],
                natGateways: [],
                internetGateways: [],
                vpcEndpoints: [
                    {
                        VpcEndpointId: 'vpce-s3-123',
                        ServiceName: 'com.amazonaws.us-east-1.s3',
                        State: 'available',
                    },
                    {
                        VpcEndpointId: 'vpce-ddb-456',
                        ServiceName: 'com.amazonaws.us-east-1.dynamodb',
                        State: 'available',
                    },
                    {
                        VpcEndpointId: 'vpce-kms-789',
                        ServiceName: 'com.amazonaws.us-east-1.kms',
                        State: 'available',
                    },
                    {
                        VpcEndpointId: 'vpce-sm-abc',
                        ServiceName: 'com.amazonaws.us-east-1.secretsmanager',
                        State: 'available',
                    },
                    {
                        VpcEndpointId: 'vpce-sqs-def',
                        ServiceName: 'com.amazonaws.us-east-1.sqs',
                        State: 'available',
                    },
                    // ssmmessages must NOT be mistaken for the ssm endpoint
                    {
                        VpcEndpointId: 'vpce-ssmmessages-000',
                        ServiceName: 'com.amazonaws.us-east-1.ssmmessages',
                        State: 'available',
                    },
                    {
                        VpcEndpointId: 'vpce-ssm-ghi',
                        ServiceName: 'com.amazonaws.us-east-1.ssm',
                        State: 'available',
                    },
                ],
            });

            const result = await vpcDiscovery.discover({});

            expect(result.s3VpcEndpointId).toBe('vpce-s3-123');
            expect(result.dynamodbVpcEndpointId).toBe('vpce-ddb-456');
            expect(result.kmsVpcEndpointId).toBe('vpce-kms-789');
            expect(result.secretsManagerVpcEndpointId).toBe('vpce-sm-abc');
            expect(result.sqsVpcEndpointId).toBe('vpce-sqs-def');
            expect(result.ssmVpcEndpointId).toBe('vpce-ssm-ghi');
        });

        it('should handle partial VPC endpoint discovery', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                subnets: [],
                securityGroups: [],
                routeTables: [],
                natGateways: [],
                internetGateways: [],
                vpcEndpoints: [
                    {
                        VpcEndpointId: 'vpce-s3-123',
                        ServiceName: 'com.amazonaws.us-east-1.s3',
                        State: 'available',
                    },
                    {
                        VpcEndpointId: 'vpce-ddb-456',
                        ServiceName: 'com.amazonaws.us-east-1.dynamodb',
                        State: 'available',
                    },
                    // KMS and Secrets Manager are missing
                ],
            });

            const result = await vpcDiscovery.discover({});

            expect(result.s3VpcEndpointId).toBe('vpce-s3-123');
            expect(result.dynamodbVpcEndpointId).toBe('vpce-ddb-456');
            expect(result.kmsVpcEndpointId).toBeUndefined();
            expect(result.secretsManagerVpcEndpointId).toBeUndefined();
        });

        it('should handle no VPC endpoints', async () => {
            mockProvider.discoverVpc.mockResolvedValue({
                vpcId: 'vpc-123',
                vpcCidr: '10.0.0.0/16',
                subnets: [],
                securityGroups: [],
                routeTables: [],
                natGateways: [],
                internetGateways: [],
                vpcEndpoints: [],
            });

            const result = await vpcDiscovery.discover({});

            expect(result.s3VpcEndpointId).toBeUndefined();
            expect(result.dynamodbVpcEndpointId).toBeUndefined();
            expect(result.kmsVpcEndpointId).toBeUndefined();
            expect(result.secretsManagerVpcEndpointId).toBeUndefined();
        });
    });
});

