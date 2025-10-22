/**
 * Tests for CloudFormation-based Resource Discovery
 * 
 * Tests discovering resources from existing CloudFormation stacks
 * before falling back to direct AWS API discovery.
 */

const { CloudFormationDiscovery } = require('./cloudformation-discovery');

describe('CloudFormationDiscovery', () => {
    let cfDiscovery;
    let mockProvider;

    beforeEach(() => {
        mockProvider = {
            describeStack: jest.fn(),
            listStackResources: jest.fn(),
        };
        cfDiscovery = new CloudFormationDiscovery(mockProvider);
    });

    describe('discoverFromStack()', () => {
        it('should return null when stack does not exist', async () => {
            mockProvider.describeStack.mockRejectedValue(
                new Error('Stack with id test-stack does not exist')
            );

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toBeNull();
            expect(mockProvider.describeStack).toHaveBeenCalledWith('test-stack');
        });

        it('should extract VPC resources from stack outputs', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [
                    { OutputKey: 'VpcId', OutputValue: 'vpc-123' },
                    { OutputKey: 'PrivateSubnetIds', OutputValue: 'subnet-1,subnet-2' },
                    { OutputKey: 'PublicSubnetId', OutputValue: 'subnet-3' },
                    { OutputKey: 'SecurityGroupId', OutputValue: 'sg-123' },
                ],
            };

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue([]);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toEqual({
                defaultVpcId: 'vpc-123', // VpcBuilder expects 'defaultVpcId', not 'vpcId'
                privateSubnetIds: ['subnet-1', 'subnet-2'],
                publicSubnetId: 'subnet-3',
                securityGroupId: 'sg-123',
            });
        });

        it('should extract KMS key from stack outputs', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [
                    { OutputKey: 'KMS_KEY_ARN', OutputValue: 'arn:aws:kms:us-east-1:123456789:key/abc' },
                ],
            };

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue([]);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toEqual({
                defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789:key/abc',
            });
        });

        it('should extract VPC subnets from stack resources', async () => {
            const mockStack = { StackName: 'test-stack', Outputs: [] };
            const mockResources = [
                { LogicalResourceId: 'FriggPrivateSubnet1', PhysicalResourceId: 'subnet-priv-1', ResourceType: 'AWS::EC2::Subnet' },
                { LogicalResourceId: 'FriggPrivateSubnet2', PhysicalResourceId: 'subnet-priv-2', ResourceType: 'AWS::EC2::Subnet' },
                { LogicalResourceId: 'FriggPublicSubnet', PhysicalResourceId: 'subnet-pub-1', ResourceType: 'AWS::EC2::Subnet' },
                { LogicalResourceId: 'FriggPublicSubnet2', PhysicalResourceId: 'subnet-pub-2', ResourceType: 'AWS::EC2::Subnet' },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result.privateSubnetId1).toBe('subnet-priv-1');
            expect(result.privateSubnetId2).toBe('subnet-priv-2');
            expect(result.publicSubnetId1).toBe('subnet-pub-1');
            expect(result.publicSubnetId2).toBe('subnet-pub-2');
        });

        it('should extract route tables and VPC endpoints from stack resources', async () => {
            const mockStack = { StackName: 'test-stack', Outputs: [] };
            const mockResources = [
                { LogicalResourceId: 'FriggLambdaRouteTable', PhysicalResourceId: 'rtb-123', ResourceType: 'AWS::EC2::RouteTable' },
                { LogicalResourceId: 'FriggVPCEndpointSecurityGroup', PhysicalResourceId: 'sg-vpce-123', ResourceType: 'AWS::EC2::SecurityGroup' },
                { LogicalResourceId: 'FriggS3VPCEndpoint', PhysicalResourceId: 'vpce-s3-123', ResourceType: 'AWS::EC2::VPCEndpoint' },
                { LogicalResourceId: 'FriggDynamoDBVPCEndpoint', PhysicalResourceId: 'vpce-ddb-123', ResourceType: 'AWS::EC2::VPCEndpoint' },
                { LogicalResourceId: 'FriggKMSVPCEndpoint', PhysicalResourceId: 'vpce-kms-123', ResourceType: 'AWS::EC2::VPCEndpoint' },
                { LogicalResourceId: 'FriggSecretsManagerVPCEndpoint', PhysicalResourceId: 'vpce-sm-123', ResourceType: 'AWS::EC2::VPCEndpoint' },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result.routeTableId).toBe('rtb-123');
            expect(result.vpcEndpointSecurityGroupId).toBe('sg-vpce-123');
            expect(result.s3VpcEndpointId).toBe('vpce-s3-123');
            expect(result.dynamoDbVpcEndpointId).toBe('vpce-ddb-123');
            expect(result.kmsVpcEndpointId).toBe('vpce-kms-123');
            expect(result.secretsManagerVpcEndpointId).toBe('vpce-sm-123');
        });

        it('should extract Aurora cluster from stack resources', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggAuroraCluster',
                    PhysicalResourceId: 'test-cluster',
                    ResourceType: 'AWS::RDS::DBCluster',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toEqual({
                auroraClusterId: 'test-cluster',
            });
        });

        it('should extract subnets from stack resources', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggPrivateSubnet1',
                    PhysicalResourceId: 'subnet-private-1',
                    ResourceType: 'AWS::EC2::Subnet',
                },
                {
                    LogicalResourceId: 'FriggPrivateSubnet2',
                    PhysicalResourceId: 'subnet-private-2',
                    ResourceType: 'AWS::EC2::Subnet',
                },
                {
                    LogicalResourceId: 'FriggPublicSubnet',
                    PhysicalResourceId: 'subnet-public-1',
                    ResourceType: 'AWS::EC2::Subnet',
                },
                {
                    LogicalResourceId: 'FriggPublicSubnet2',
                    PhysicalResourceId: 'subnet-public-2',
                    ResourceType: 'AWS::EC2::Subnet',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result.privateSubnetId1).toBe('subnet-private-1');
            expect(result.privateSubnetId2).toBe('subnet-private-2');
            expect(result.publicSubnetId1).toBe('subnet-public-1');
            expect(result.publicSubnetId2).toBe('subnet-public-2');
        });

        it('should extract S3 migration bucket from stack resources', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggMigrationStatusBucket',
                    PhysicalResourceId: 'test-migration-bucket',
                    ResourceType: 'AWS::S3::Bucket',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toEqual({
                migrationStatusBucket: 'test-migration-bucket',
            });
        });

        it('should extract SQS migration queue from stack resources', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'DbMigrationQueue',
                    PhysicalResourceId: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
                    ResourceType: 'AWS::SQS::Queue',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toEqual({
                migrationQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
            });
        });

        it('should extract NAT Gateway from stack resources', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggNatGateway',
                    PhysicalResourceId: 'nat-0123456789',
                    ResourceType: 'AWS::EC2::NatGateway',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toEqual({
                natGatewayId: 'nat-0123456789',
            });
        });

        it('should combine outputs and resources correctly', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [
                    { OutputKey: 'VpcId', OutputValue: 'vpc-123' },
                    { OutputKey: 'KMS_KEY_ARN', OutputValue: 'arn:aws:kms:us-east-1:123456789:key/abc' },
                ],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggAuroraCluster',
                    PhysicalResourceId: 'test-cluster',
                    ResourceType: 'AWS::RDS::DBCluster',
                },
                {
                    LogicalResourceId: 'FriggNatGateway',
                    PhysicalResourceId: 'nat-123',
                    ResourceType: 'AWS::EC2::NatGateway',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toEqual({
                defaultVpcId: 'vpc-123', // VpcBuilder expects 'defaultVpcId'
                defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789:key/abc',
                auroraClusterId: 'test-cluster',
                natGatewayId: 'nat-123',
            });
        });

        it('should handle stack with no relevant resources', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue([
                {
                    LogicalResourceId: 'SomeOtherResource',
                    PhysicalResourceId: 'some-id',
                    ResourceType: 'AWS::Lambda::Function',
                },
            ]);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toEqual({});
        });
    });
});

