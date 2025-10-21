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
                vpcId: 'vpc-123',
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
                vpcId: 'vpc-123',
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

