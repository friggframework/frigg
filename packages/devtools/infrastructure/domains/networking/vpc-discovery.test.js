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
    });
});

