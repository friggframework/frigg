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
                fromCloudFormationStack: true,
                stackName: 'test-stack',
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
                fromCloudFormationStack: true,
                stackName: 'test-stack',
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
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                auroraClusterId: 'test-cluster',
                existingLogicalIds: ['FriggAuroraCluster'],
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
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                migrationStatusBucket: 'test-migration-bucket',
                existingLogicalIds: ['FriggMigrationStatusBucket'],
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
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                migrationQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
                existingLogicalIds: ['DbMigrationQueue'],
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
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                natGatewayId: 'nat-0123456789',
                existingLogicalIds: ['FriggNatGateway'],
            });
        });

        it('should extract VPC directly from stack resources', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggVPC',
                    PhysicalResourceId: 'vpc-037ec55fe87aec1e7',
                    ResourceType: 'AWS::EC2::VPC',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result).toEqual({
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                defaultVpcId: 'vpc-037ec55fe87aec1e7',
                existingLogicalIds: ['FriggVPC'],
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
                fromCloudFormationStack: true,
                stackName: 'test-stack',
                defaultVpcId: 'vpc-123', // VpcBuilder expects 'defaultVpcId'
                defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789:key/abc',
                auroraClusterId: 'test-cluster',
                natGatewayId: 'nat-123',
                existingLogicalIds: ['FriggAuroraCluster', 'FriggNatGateway'],
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

            expect(result).toEqual({
                fromCloudFormationStack: true,
                stackName: 'test-stack',
            });
        });

        it('should query EC2 for subnets when VPC found but no subnet resources in stack', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggLambdaSecurityGroup',
                    PhysicalResourceId: 'sg-123',
                    ResourceType: 'AWS::EC2::SecurityGroup',
                },
            ];

            const mockEC2Client = {
                send: jest.fn(),
            };

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            mockProvider.getEC2Client = jest.fn().mockReturnValue(mockEC2Client);

            // Mock security group query for VPC ID
            mockEC2Client.send.mockResolvedValueOnce({
                SecurityGroups: [{ VpcId: 'vpc-123' }],
            });

            // Mock subnet query
            mockEC2Client.send.mockResolvedValueOnce({
                Subnets: [
                    {
                        SubnetId: 'subnet-private-1',
                        MapPublicIpOnLaunch: false,
                        Tags: [
                            { Key: 'ManagedBy', Value: 'Frigg' },
                            { Key: 'aws:cloudformation:logical-id', Value: 'FriggPrivateSubnet1' },
                        ],
                    },
                    {
                        SubnetId: 'subnet-private-2',
                        MapPublicIpOnLaunch: false,
                        Tags: [
                            { Key: 'ManagedBy', Value: 'Frigg' },
                            { Key: 'aws:cloudformation:logical-id', Value: 'FriggPrivateSubnet2' },
                        ],
                    },
                ],
            });

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result.privateSubnetId1).toBe('subnet-private-1');
            expect(result.privateSubnetId2).toBe('subnet-private-2');
            expect(mockEC2Client.send).toHaveBeenCalledTimes(2);
        });

        it('should handle EC2 subnet query errors gracefully', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggLambdaSecurityGroup',
                    PhysicalResourceId: 'sg-123',
                    ResourceType: 'AWS::EC2::SecurityGroup',
                },
            ];

            const mockEC2Client = {
                send: jest.fn(),
            };

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            mockProvider.getEC2Client = jest.fn().mockReturnValue(mockEC2Client);

            // Mock security group query for VPC ID
            mockEC2Client.send.mockResolvedValueOnce({
                SecurityGroups: [{ VpcId: 'vpc-123' }],
            });

            // Mock subnet query failure
            mockEC2Client.send.mockRejectedValueOnce(new Error('EC2 API Error'));

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result.defaultVpcId).toBe('vpc-123');
            expect(result.privateSubnetId1).toBeUndefined();
        });

        it('should extract KMS key alias from stack resources and query for key ARN', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggKMSKeyAlias',
                    PhysicalResourceId: 'alias/test-service-dev-frigg-kms',
                    ResourceType: 'AWS::KMS::Alias',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            mockProvider.describeKmsKey = jest.fn().mockResolvedValue({
                KeyId: 'abc-123',
                Arn: 'arn:aws:kms:us-east-1:123456789:key/abc-123',
            });

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result.defaultKmsKeyId).toBe('arn:aws:kms:us-east-1:123456789:key/abc-123');
            expect(result.kmsKeyAlias).toBe('alias/test-service-dev-frigg-kms');
            expect(mockProvider.describeKmsKey).toHaveBeenCalledWith('alias/test-service-dev-frigg-kms');
        });

        it('should query AWS API for KMS alias when serviceName and stage are provided', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            mockProvider.region = 'us-east-1';
            mockProvider.describeKmsKey = jest.fn().mockResolvedValue({
                KeyId: 'abc-123',
                Arn: 'arn:aws:kms:us-east-1:123456789:key/abc-123',
            });

            // Pass serviceName and stage to discover alias
            cfDiscovery.serviceName = 'test-service';
            cfDiscovery.stage = 'dev';

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result.defaultKmsKeyId).toBe('arn:aws:kms:us-east-1:123456789:key/abc-123');
            expect(result.kmsKeyAlias).toBe('alias/test-service-dev-frigg-kms');
            expect(mockProvider.describeKmsKey).toHaveBeenCalledWith('alias/test-service-dev-frigg-kms');
        });

        it('should handle KMS alias not found gracefully', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            mockProvider.region = 'us-east-1';
            mockProvider.describeKmsKey = jest.fn().mockRejectedValue(
                new Error('Alias/test-service-dev-frigg-kms is not found')
            );

            cfDiscovery.serviceName = 'test-service';
            cfDiscovery.stage = 'dev';

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result.defaultKmsKeyId).toBeUndefined();
            expect(result.kmsKeyAlias).toBeUndefined();
        });

        it('should prefer KMS key from stack resources over alias query', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggKMSKey',
                    PhysicalResourceId: 'arn:aws:kms:us-east-1:123456789:key/xyz-789',
                    ResourceType: 'AWS::KMS::Key',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            mockProvider.describeKmsKey = jest.fn();

            const result = await cfDiscovery.discoverFromStack('test-stack');

            // Should use the key from stack resources, not query for alias
            expect(result.defaultKmsKeyId).toBe('arn:aws:kms:us-east-1:123456789:key/xyz-789');
            expect(mockProvider.describeKmsKey).not.toHaveBeenCalled();
        });

        it('should use KMS alias from stack resources even if key is also present', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggKMSKey',
                    PhysicalResourceId: 'arn:aws:kms:us-east-1:123456789:key/xyz-789',
                    ResourceType: 'AWS::KMS::Key',
                },
                {
                    LogicalResourceId: 'FriggKMSKeyAlias',
                    PhysicalResourceId: 'alias/test-service-dev-frigg-kms',
                    ResourceType: 'AWS::KMS::Alias',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            mockProvider.describeKmsKey = jest.fn().mockResolvedValue({
                KeyId: 'xyz-789',
                Arn: 'arn:aws:kms:us-east-1:123456789:key/xyz-789',
            });

            const result = await cfDiscovery.discoverFromStack('test-stack');

            expect(result.defaultKmsKeyId).toBe('arn:aws:kms:us-east-1:123456789:key/xyz-789');
            expect(result.kmsKeyAlias).toBe('alias/test-service-dev-frigg-kms');
            expect(mockProvider.describeKmsKey).toHaveBeenCalledWith('alias/test-service-dev-frigg-kms');
        });
    });

    describe('External VPC with routing infrastructure pattern', () => {
        it('should discover routing resources when VPC is external', async () => {
            // This tests the external VPC pattern: external VPC/subnets/KMS,
            // but stack creates routing infrastructure (route table, NAT route, VPC endpoints)
            const mockStack = {
                StackName: 'create-frigg-app-production',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggLambdaRouteTable',
                    PhysicalResourceId: 'rtb-0b83aca77ccde20a6',
                    ResourceType: 'AWS::EC2::RouteTable',
                    ResourceStatus: 'UPDATE_COMPLETE',
                },
                {
                    LogicalResourceId: 'FriggNATRoute',
                    PhysicalResourceId: 'rtb-0b83aca77ccde20a6|0.0.0.0/0',
                    ResourceType: 'AWS::EC2::Route',
                    ResourceStatus: 'UPDATE_COMPLETE',
                },
                {
                    LogicalResourceId: 'FriggSubnet1RouteAssociation',
                    PhysicalResourceId: 'rtbassoc-07245da0b447ca469',
                    ResourceType: 'AWS::EC2::SubnetRouteTableAssociation',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
                {
                    LogicalResourceId: 'FriggSubnet2RouteAssociation',
                    PhysicalResourceId: 'rtbassoc-0806f9783c4ea181f',
                    ResourceType: 'AWS::EC2::SubnetRouteTableAssociation',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
                {
                    LogicalResourceId: 'VPCEndpointS3',
                    PhysicalResourceId: 'vpce-0352ceac2124c14be',
                    ResourceType: 'AWS::EC2::VPCEndpoint',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
                {
                    LogicalResourceId: 'VPCEndpointDynamoDB',
                    PhysicalResourceId: 'vpce-0b06c4f631199ea68',
                    ResourceType: 'AWS::EC2::VPCEndpoint',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('create-frigg-app-production');

            // Verify routing infrastructure was discovered
            expect(result.routeTableId).toBe('rtb-0b83aca77ccde20a6');
            expect(result.privateRouteTableId).toBe('rtb-0b83aca77ccde20a6');
            expect(result.natRoute).toBe('rtb-0b83aca77ccde20a6|0.0.0.0/0');
            expect(result.routeTableAssociations).toEqual([
                'rtbassoc-07245da0b447ca469',
                'rtbassoc-0806f9783c4ea181f',
            ]);

            // Verify VPC endpoints were discovered (both naming conventions)
            expect(result.vpcEndpoints).toBeDefined();
            expect(result.vpcEndpoints.s3).toBe('vpce-0352ceac2124c14be');
            expect(result.vpcEndpoints.dynamodb).toBe('vpce-0b06c4f631199ea68');
            expect(result.s3VpcEndpointId).toBe('vpce-0352ceac2124c14be');
            expect(result.dynamoDbVpcEndpointId).toBe('vpce-0b06c4f631199ea68');

            // Verify NO VPC/KMS resources (they're external)
            expect(result.defaultVpcId).toBeUndefined();
            expect(result.defaultKmsKeyId).toBeUndefined();
        });

        it('should work with legacy VPC endpoint naming (FriggS3VPCEndpoint)', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggS3VPCEndpoint',
                    PhysicalResourceId: 'vpce-legacy-s3',
                    ResourceType: 'AWS::EC2::VPCEndpoint',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
                {
                    LogicalResourceId: 'FriggDynamoDBVPCEndpoint',
                    PhysicalResourceId: 'vpce-legacy-ddb',
                    ResourceType: 'AWS::EC2::VPCEndpoint',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            // Both naming conventions should work
            expect(result.vpcEndpoints.s3).toBe('vpce-legacy-s3');
            expect(result.vpcEndpoints.dynamodb).toBe('vpce-legacy-ddb');
            expect(result.s3VpcEndpointId).toBe('vpce-legacy-s3');
            expect(result.dynamoDbVpcEndpointId).toBe('vpce-legacy-ddb');
        });

        it('should extract FriggLambdaSecurityGroup from stack', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggLambdaSecurityGroup',
                    PhysicalResourceId: 'sg-01002240c6a446202',
                    ResourceType: 'AWS::EC2::SecurityGroup',
                    ResourceStatus: 'UPDATE_COMPLETE',
                },
                {
                    LogicalResourceId: 'FriggLambdaRouteTable',
                    PhysicalResourceId: 'rtb-08af43bbf0775602d',
                    ResourceType: 'AWS::EC2::RouteTable',
                    ResourceStatus: 'UPDATE_COMPLETE',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            // Lambda security group should be extracted
            expect(result.lambdaSecurityGroupId).toBe('sg-01002240c6a446202');
            expect(result.defaultSecurityGroupId).toBe('sg-01002240c6a446202');
            expect(result.existingLogicalIds).toContain('FriggLambdaSecurityGroup');
        });

        it('should support FriggPrivateRoute naming for NAT routes', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggLambdaRouteTable',
                    PhysicalResourceId: 'rtb-123',
                    ResourceType: 'AWS::EC2::RouteTable',
                    ResourceStatus: 'UPDATE_COMPLETE',
                },
                {
                    LogicalResourceId: 'FriggPrivateRoute',
                    PhysicalResourceId: 'rtb-123|0.0.0.0/0',
                    ResourceType: 'AWS::EC2::Route',
                    ResourceStatus: 'UPDATE_COMPLETE',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            // Both FriggNATRoute and FriggPrivateRoute should be recognized
            expect(result.natRoute).toBe('rtb-123|0.0.0.0/0');
            expect(result.routeTableId).toBe('rtb-123');
        });

        it('should extract external references from route table without stackName error', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: [],
            };

            const mockResources = [
                {
                    LogicalResourceId: 'FriggLambdaRouteTable',
                    PhysicalResourceId: 'rtb-real-id',
                    ResourceType: 'AWS::EC2::RouteTable',
                    ResourceStatus: 'UPDATE_COMPLETE',
                },
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            
            // Mock EC2 DescribeRouteTables to return route table with VPC info
            mockProvider.getEC2Client = jest.fn().mockReturnValue({
                send: jest.fn().mockResolvedValue({
                    RouteTables: [{
                        RouteTableId: 'rtb-real-id',
                        VpcId: 'vpc-extracted',
                        Routes: [
                            { NatGatewayId: 'nat-extracted', DestinationCidrBlock: '0.0.0.0/0' }
                        ],
                        Associations: [
                            { SubnetId: 'subnet-1' },
                            { SubnetId: 'subnet-2' }
                        ]
                    }]
                })
            });

            const result = await cfDiscovery.discoverFromStack('test-stack');

            // Should extract VPC, NAT, and subnets from route table
            expect(result.defaultVpcId).toBe('vpc-extracted');
            expect(result.existingNatGatewayId).toBe('nat-extracted');
            expect(result.privateSubnetId1).toBe('subnet-1');
            expect(result.privateSubnetId2).toBe('subnet-2');
            
            // Should NOT throw 'stackName is not defined' error
            expect(result).toBeDefined();
        });
    });

    describe('existingLogicalIds tracking', () => {
        it('should track OLD VPC endpoint logical IDs (VPCEndpointS3 pattern) for backwards compatibility', async () => {
            // CRITICAL: Frontify production uses OLD naming convention
            const mockStack = {
                StackName: 'create-frigg-app-production',
                Outputs: []
            };

            const mockResources = [
                { LogicalResourceId: 'FriggLambdaRouteTable', PhysicalResourceId: 'rtb-123', ResourceType: 'AWS::EC2::RouteTable' },
                { LogicalResourceId: 'FriggNATRoute', PhysicalResourceId: 'rtb-123|0.0.0.0/0', ResourceType: 'AWS::EC2::Route' },
                { LogicalResourceId: 'FriggSubnet1RouteAssociation', PhysicalResourceId: 'rtbassoc-1', ResourceType: 'AWS::EC2::SubnetRouteTableAssociation' },
                { LogicalResourceId: 'FriggSubnet2RouteAssociation', PhysicalResourceId: 'rtbassoc-2', ResourceType: 'AWS::EC2::SubnetRouteTableAssociation' },
                { LogicalResourceId: 'VPCEndpointS3', PhysicalResourceId: 'vpce-s3-123', ResourceType: 'AWS::EC2::VPCEndpoint' },
                { LogicalResourceId: 'VPCEndpointDynamoDB', PhysicalResourceId: 'vpce-ddb-123', ResourceType: 'AWS::EC2::VPCEndpoint' }
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('create-frigg-app-production');

            // CRITICAL: existingLogicalIds MUST contain old VPC endpoint names
            expect(result.existingLogicalIds).toBeDefined();
            expect(result.existingLogicalIds).toContain('FriggNATRoute');
            expect(result.existingLogicalIds).toContain('FriggSubnet1RouteAssociation');
            expect(result.existingLogicalIds).toContain('FriggSubnet2RouteAssociation');
            expect(result.existingLogicalIds).toContain('VPCEndpointS3');  // OLD naming
            expect(result.existingLogicalIds).toContain('VPCEndpointDynamoDB');  // OLD naming

            // Should also have the flat discovery properties
            expect(result.routeTableId).toBe('rtb-123');
            expect(result.natRoute).toBe('rtb-123|0.0.0.0/0');
            expect(result.s3VpcEndpointId).toBe('vpce-s3-123');
            expect(result.dynamodbVpcEndpointId).toBe('vpce-ddb-123');
        });

        it('should track NEW VPC endpoint logical IDs (FriggS3VPCEndpoint pattern) for newer stacks', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: []
            };

            const mockResources = [
                { LogicalResourceId: 'FriggLambdaRouteTable', PhysicalResourceId: 'rtb-456', ResourceType: 'AWS::EC2::RouteTable' },
                { LogicalResourceId: 'FriggPrivateRoute', PhysicalResourceId: 'rtb-456|0.0.0.0/0', ResourceType: 'AWS::EC2::Route' },
                { LogicalResourceId: 'FriggS3VPCEndpoint', PhysicalResourceId: 'vpce-s3-456', ResourceType: 'AWS::EC2::VPCEndpoint' },
                { LogicalResourceId: 'FriggDynamoDBVPCEndpoint', PhysicalResourceId: 'vpce-ddb-456', ResourceType: 'AWS::EC2::VPCEndpoint' },
                { LogicalResourceId: 'FriggKMSVPCEndpoint', PhysicalResourceId: 'vpce-kms-456', ResourceType: 'AWS::EC2::VPCEndpoint' }
            ];

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            // Should track NEW naming pattern in existingLogicalIds
            expect(result.existingLogicalIds).toContain('FriggPrivateRoute');
            expect(result.existingLogicalIds).toContain('FriggS3VPCEndpoint');
            expect(result.existingLogicalIds).toContain('FriggDynamoDBVPCEndpoint');
            expect(result.existingLogicalIds).toContain('FriggKMSVPCEndpoint');
            
            // Should NOT contain old naming patterns
            expect(result.existingLogicalIds).not.toContain('FriggNATRoute');
            expect(result.existingLogicalIds).not.toContain('VPCEndpointS3');
        });
    });

    describe('Subnet extraction from VPC query (OLD reliable approach)', () => {
        it('should extract subnets by querying ALL subnets in VPC then filtering by route table', async () => {
            // CRITICAL: Frontify production scenario - the OLD proven method from aws-discovery.js
            // 1. Query ALL subnets in VPC using vpc-id filter (not association filter!)
            // 2. Query route table by ID (RouteTableIds parameter, not Filters!)
            // 3. Extract subnet IDs from route table's Associations array
            
            const mockStack = {
                StackName: 'test-stack',
                Outputs: []
            };

            const mockResources = [
                { LogicalResourceId: 'FriggLambdaRouteTable', PhysicalResourceId: 'rtb-123', ResourceType: 'AWS::EC2::RouteTable' },
                { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-456', ResourceType: 'AWS::EC2::VPC' }
            ];

            const sendMock = jest.fn();
            sendMock
                .mockResolvedValueOnce({
                    RouteTables: [{
                        RouteTableId: 'rtb-123',
                        VpcId: 'vpc-456',
                        Associations: [],
                        Routes: [{ NatGatewayId: 'nat-789', DestinationCidrBlock: '0.0.0.0/0' }]
                    }]
                })
                .mockResolvedValueOnce({ SecurityGroups: [{ GroupId: 'sg-default' }] })
                .mockResolvedValueOnce({
                    Subnets: [
                        { SubnetId: 'subnet-aaa', VpcId: 'vpc-456', AvailabilityZone: 'us-east-1a' },
                        { SubnetId: 'subnet-bbb', VpcId: 'vpc-456', AvailabilityZone: 'us-east-1b' },
                        { SubnetId: 'subnet-ccc', VpcId: 'vpc-456', AvailabilityZone: 'us-east-1c' }
                    ]
                })
                .mockResolvedValueOnce({
                    RouteTables: [{
                        RouteTableId: 'rtb-123',
                        Associations: [
                            { RouteTableAssociationId: 'rtbassoc-111', SubnetId: 'subnet-aaa' },
                            { RouteTableAssociationId: 'rtbassoc-222', SubnetId: 'subnet-bbb' }
                        ]
                    }]
                });
            
            const mockEC2Client = { send: sendMock };

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            mockProvider.getEC2Client = jest.fn().mockReturnValue(mockEC2Client);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            // Should have extracted subnets using VPC query approach
            expect(result.privateSubnetId1).toBe('subnet-aaa');
            expect(result.privateSubnetId2).toBe('subnet-bbb');
        });

        it('should handle VPC with only 1 associated subnet (use second as fallback)', async () => {
            const mockStack = {
                StackName: 'test-stack',
                Outputs: []
            };

            const mockResources = [
                { LogicalResourceId: 'FriggLambdaRouteTable', PhysicalResourceId: 'rtb-123', ResourceType: 'AWS::EC2::RouteTable' },
                { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-456', ResourceType: 'AWS::EC2::VPC' }
            ];

            const sendMock = jest.fn();
            sendMock
                .mockResolvedValueOnce({
                    RouteTables: [{
                        RouteTableId: 'rtb-123',
                        VpcId: 'vpc-456',
                        Associations: [],
                        Routes: [{ NatGatewayId: 'nat-789', DestinationCidrBlock: '0.0.0.0/0' }]
                    }]
                })
                .mockResolvedValueOnce({ SecurityGroups: [{ GroupId: 'sg-default' }] })
                .mockResolvedValueOnce({
                    Subnets: [
                        { SubnetId: 'subnet-aaa', VpcId: 'vpc-456' },
                        { SubnetId: 'subnet-bbb', VpcId: 'vpc-456' }
                    ]
                })
                .mockResolvedValueOnce({
                    RouteTables: [{
                        RouteTableId: 'rtb-123',
                        Associations: [
                            { RouteTableAssociationId: 'rtbassoc-111', SubnetId: 'subnet-aaa' }
                        ]
                    }]
                });
            
            const mockEC2Client = { send: sendMock };

            mockProvider.describeStack.mockResolvedValue(mockStack);
            mockProvider.listStackResources.mockResolvedValue(mockResources);
            mockProvider.getEC2Client = jest.fn().mockReturnValue(mockEC2Client);

            const result = await cfDiscovery.discoverFromStack('test-stack');

            // Should use first from route table, second from fallback
            expect(result.privateSubnetId1).toBe('subnet-aaa');
            expect(result.privateSubnetId2).toBe('subnet-bbb');
        });
    });
});

