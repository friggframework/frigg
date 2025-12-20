const ResourceDependencyAnalyzer = require('./resource-dependency-analyzer');

describe('ResourceDependencyAnalyzer', () => {
    let analyzer;
    let mockEc2Client;
    let mockElbClient;
    let mockRdsClient;
    let mockLambdaClient;

    beforeEach(() => {
        mockEc2Client = {
            send: jest.fn(),
        };
        mockElbClient = {
            send: jest.fn(),
        };
        mockRdsClient = {
            send: jest.fn(),
        };
        mockLambdaClient = {
            send: jest.fn(),
        };

        analyzer = new ResourceDependencyAnalyzer({
            ec2Client: mockEc2Client,
            elbClient: mockElbClient,
            rdsClient: mockRdsClient,
            lambdaClient: mockLambdaClient,
        });
    });

    describe('constructor', () => {
        it('should require ec2Client', () => {
            expect(() => {
                new ResourceDependencyAnalyzer({
                    elbClient: mockElbClient,
                    rdsClient: mockRdsClient,
                    lambdaClient: mockLambdaClient,
                });
            }).toThrow('ec2Client is required');
        });

        it('should initialize with all required clients', () => {
            expect(analyzer.ec2Client).toBe(mockEc2Client);
            expect(analyzer.elbClient).toBe(mockElbClient);
            expect(analyzer.rdsClient).toBe(mockRdsClient);
            expect(analyzer.lambdaClient).toBe(mockLambdaClient);
        });
    });

    describe('analyzeDependencies', () => {
        it('should return no blocking dependencies for resources without dependencies', async () => {
            const resources = [
                {
                    physicalId: 'subnet-123',
                    resourceType: 'AWS::EC2::Subnet',
                    logicalId: 'FriggPrivateSubnet1',
                },
            ];

            mockEc2Client.send.mockResolvedValue({
                Instances: [],
            });

            const result = await analyzer.analyzeDependencies(resources);

            expect(result.canDeleteAll).toBe(true);
            expect(result.blockedResources).toHaveLength(0);
            expect(result.dependencies['subnet-123']).toEqual({
                hasBlockingDependencies: false,
                blocking: [],
                dependent: [],
            });
        });

        it('should detect VPC with subnet dependencies', async () => {
            const resources = [
                {
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    logicalId: 'FriggVPC',
                },
            ];

            mockEc2Client.send
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-456', DefaultForAz: false }] })
                .mockResolvedValueOnce({ SecurityGroups: [{ GroupId: 'sg-default', GroupName: 'default' }] })
                .mockResolvedValueOnce({ NatGateways: [] })
                .mockResolvedValueOnce({ InternetGateways: [] })
                .mockResolvedValueOnce({ VpcEndpoints: [] });

            const result = await analyzer.analyzeDependencies(resources);

            expect(result.canDeleteAll).toBe(false);
            expect(result.blockedResources).toHaveLength(1);
            expect(result.blockedResources[0].resource.physicalId).toBe('vpc-123');
            expect(result.blockedResources[0].blockingDependencies).toEqual([
                { type: 'subnets', count: 1, ids: ['subnet-456'] },
            ]);
        });

        it('should detect security group in use by EC2 instances', async () => {
            const resources = [
                {
                    physicalId: 'sg-123',
                    resourceType: 'AWS::EC2::SecurityGroup',
                    logicalId: 'FriggLambdaSecurityGroup',
                },
            ];

            mockEc2Client.send.mockResolvedValueOnce({
                Reservations: [
                    {
                        Instances: [{ InstanceId: 'i-123', SecurityGroups: [{ GroupId: 'sg-123' }] }],
                    },
                ],
            });

            mockRdsClient.send.mockResolvedValue({ DBInstances: [] });
            mockLambdaClient.send.mockResolvedValue({ Functions: [] });
            mockElbClient.send.mockResolvedValue({ LoadBalancers: [] });

            const result = await analyzer.analyzeDependencies(resources);

            expect(result.canDeleteAll).toBe(false);
            expect(result.blockedResources).toHaveLength(1);
            expect(result.dependencies['sg-123'].blocking).toEqual([
                { type: 'ec2_instances', count: 1, ids: ['i-123'] },
            ]);
        });

        it('should analyze multiple resources concurrently', async () => {
            const resources = [
                {
                    physicalId: 'subnet-123',
                    resourceType: 'AWS::EC2::Subnet',
                    logicalId: 'FriggPrivateSubnet1',
                },
                {
                    physicalId: 'subnet-456',
                    resourceType: 'AWS::EC2::Subnet',
                    logicalId: 'FriggPrivateSubnet2',
                },
            ];

            mockEc2Client.send.mockResolvedValue({ Instances: [] });

            const result = await analyzer.analyzeDependencies(resources);

            expect(result.canDeleteAll).toBe(true);
            expect(result.dependencies['subnet-123']).toBeDefined();
            expect(result.dependencies['subnet-456']).toBeDefined();
        });
    });

    describe('determineDeletionOrder', () => {
        it('should organize resources into deletion phases', () => {
            const resources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
                { physicalId: 'sg-123', resourceType: 'AWS::EC2::SecurityGroup', logicalId: 'FriggSG' },
                { physicalId: 'vpce-123', resourceType: 'AWS::EC2::VPCEndpoint', logicalId: 'FriggVPCE' },
            ];

            const plan = analyzer.determineDeletionOrder(resources);

            expect(plan.phase1).toHaveLength(1);
            expect(plan.phase1[0].resourceType).toBe('AWS::EC2::VPCEndpoint');

            expect(plan.phase2).toHaveLength(2);
            expect(plan.phase2.map(r => r.resourceType)).toContain('AWS::EC2::Subnet');
            expect(plan.phase2.map(r => r.resourceType)).toContain('AWS::EC2::SecurityGroup');

            expect(plan.phase3).toHaveLength(1);
            expect(plan.phase3[0].resourceType).toBe('AWS::EC2::VPC');
        });

        it('should sort resources within phases by priority', () => {
            const resources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'sg-123', resourceType: 'AWS::EC2::SecurityGroup', logicalId: 'FriggSG' },
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
            ];

            const plan = analyzer.determineDeletionOrder(resources);

            expect(plan.phase2[0].resourceType).toBe('AWS::EC2::Subnet');
            expect(plan.phase2[1].resourceType).toBe('AWS::EC2::SecurityGroup');
        });

        it('should handle empty resource list', () => {
            const plan = analyzer.determineDeletionOrder([]);

            expect(plan.phase1).toHaveLength(0);
            expect(plan.phase2).toHaveLength(0);
            expect(plan.phase3).toHaveLength(0);
        });
    });

    describe('VPC dependency checking', () => {
        it('should ignore default subnets and security groups', async () => {
            const resources = [
                {
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    logicalId: 'FriggVPC',
                },
            ];

            mockEc2Client.send
                .mockResolvedValueOnce({ Subnets: [{ SubnetId: 'subnet-456', DefaultForAz: true }] })
                .mockResolvedValueOnce({ SecurityGroups: [{ GroupId: 'sg-123', GroupName: 'default' }] })
                .mockResolvedValueOnce({ NatGateways: [] })
                .mockResolvedValueOnce({ InternetGateways: [] })
                .mockResolvedValueOnce({ VpcEndpoints: [] });

            const result = await analyzer.analyzeDependencies(resources);

            expect(result.canDeleteAll).toBe(true);
            expect(result.blockedResources).toHaveLength(0);
        });

        it('should detect NAT gateway dependencies', async () => {
            const resources = [
                {
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    logicalId: 'FriggVPC',
                },
            ];

            mockEc2Client.send
                .mockResolvedValueOnce({ Subnets: [] })
                .mockResolvedValueOnce({ SecurityGroups: [] })
                .mockResolvedValueOnce({ NatGateways: [{ NatGatewayId: 'nat-123', State: 'available' }] })
                .mockResolvedValueOnce({ InternetGateways: [] })
                .mockResolvedValueOnce({ VpcEndpoints: [] });

            const result = await analyzer.analyzeDependencies(resources);

            expect(result.canDeleteAll).toBe(false);
            expect(result.dependencies['vpc-123'].blocking).toContainEqual({
                type: 'nat_gateways',
                count: 1,
            });
        });
    });

    describe('SecurityGroup dependency checking', () => {
        it('should detect Lambda function dependencies', async () => {
            const resources = [
                {
                    physicalId: 'sg-123',
                    resourceType: 'AWS::EC2::SecurityGroup',
                    logicalId: 'FriggLambdaSecurityGroup',
                },
            ];

            mockEc2Client.send.mockResolvedValue({ Reservations: [] });
            mockRdsClient.send.mockResolvedValue({ DBInstances: [] });
            mockLambdaClient.send.mockResolvedValue({
                Functions: [
                    {
                        FunctionName: 'my-function',
                        VpcConfig: {
                            SecurityGroupIds: ['sg-123'],
                        },
                    },
                ],
            });
            mockElbClient.send.mockResolvedValue({ LoadBalancers: [] });

            const result = await analyzer.analyzeDependencies(resources);

            expect(result.canDeleteAll).toBe(false);
            expect(result.dependencies['sg-123'].blocking).toContainEqual({
                type: 'lambda_functions',
                count: 1,
                ids: ['my-function'],
            });
        });

        it('should detect RDS instance dependencies', async () => {
            const resources = [
                {
                    physicalId: 'sg-123',
                    resourceType: 'AWS::EC2::SecurityGroup',
                    logicalId: 'FriggRDSSecurityGroup',
                },
            ];

            mockEc2Client.send.mockResolvedValue({ Reservations: [] });
            mockRdsClient.send.mockResolvedValue({
                DBInstances: [
                    {
                        DBInstanceIdentifier: 'my-db',
                        VpcSecurityGroups: [{ VpcSecurityGroupId: 'sg-123' }],
                    },
                ],
            });
            mockLambdaClient.send.mockResolvedValue({ Functions: [] });
            mockElbClient.send.mockResolvedValue({ LoadBalancers: [] });

            const result = await analyzer.analyzeDependencies(resources);

            expect(result.canDeleteAll).toBe(false);
            expect(result.dependencies['sg-123'].blocking).toContainEqual({
                type: 'rds_instances',
                count: 1,
                ids: ['my-db'],
            });
        });
    });

    describe('Subnet dependency checking', () => {
        it('should return no dependencies for unused subnet', async () => {
            const resources = [
                {
                    physicalId: 'subnet-123',
                    resourceType: 'AWS::EC2::Subnet',
                    logicalId: 'FriggPrivateSubnet1',
                },
            ];

            mockEc2Client.send.mockResolvedValue({ Instances: [] });

            const result = await analyzer.analyzeDependencies(resources);

            expect(result.canDeleteAll).toBe(true);
            expect(result.dependencies['subnet-123']).toEqual({
                hasBlockingDependencies: false,
                blocking: [],
                dependent: [],
            });
        });
    });
});
