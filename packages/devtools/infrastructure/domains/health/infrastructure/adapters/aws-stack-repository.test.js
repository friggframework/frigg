/**
 * Tests for AWSStackRepository Adapter
 *
 * Tests CloudFormation API integration using mocked AWS SDK clients
 */

const AWSStackRepository = require('./aws-stack-repository');
const StackIdentifier = require('../../domain/value-objects/stack-identifier');

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudformation', () => {
    return {
        CloudFormationClient: jest.fn(),
        DescribeStacksCommand: jest.fn(),
        ListStackResourcesCommand: jest.fn(),
        DescribeStackResourcesCommand: jest.fn(),
        DescribeStackResourceCommand: jest.fn(),
        GetTemplateCommand: jest.fn(),
        DetectStackDriftCommand: jest.fn(),
        DescribeStackDriftDetectionStatusCommand: jest.fn(),
        DescribeStackResourceDriftsCommand: jest.fn(),
    };
});

describe('AWSStackRepository', () => {
    let repository;
    let mockSend;
    let mockClient;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create mock client with send method
        mockSend = jest.fn();
        mockClient = {
            send: mockSend,
        };

        // Mock CloudFormationClient constructor
        const { CloudFormationClient } = require('@aws-sdk/client-cloudformation');
        CloudFormationClient.mockImplementation(() => mockClient);

        repository = new AWSStackRepository();
    });

    describe('getStack', () => {
        it('should get stack information', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            const mockStack = {
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
                StackName: 'my-app-prod',
                StackStatus: 'UPDATE_COMPLETE',
                CreationTime: new Date('2024-01-01T00:00:00Z'),
                LastUpdatedTime: new Date('2024-01-15T00:00:00Z'),
                Parameters: [
                    { ParameterKey: 'Environment', ParameterValue: 'production' },
                ],
                Outputs: [
                    { OutputKey: 'VpcId', OutputValue: 'vpc-123' },
                ],
                Tags: [
                    { Key: 'Team', Value: 'platform' },
                ],
            };

            mockSend.mockResolvedValue({
                Stacks: [mockStack],
            });

            const stack = await repository.getStack(identifier);

            expect(stack).toEqual({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
                stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
                status: 'UPDATE_COMPLETE',
                creationTime: new Date('2024-01-01T00:00:00Z'),
                lastUpdatedTime: new Date('2024-01-15T00:00:00Z'),
                parameters: { Environment: 'production' },
                outputs: { VpcId: 'vpc-123' },
                tags: { Team: 'platform' },
            });

            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it('should throw error if stack does not exist', async () => {
            const identifier = new StackIdentifier({
                stackName: 'non-existent',
                region: 'us-east-1',
            });

            mockSend.mockRejectedValue({
                name: 'ValidationError',
                message: 'Stack does not exist',
            });

            await expect(repository.getStack(identifier)).rejects.toThrow(
                'Stack non-existent does not exist in region us-east-1'
            );
        });

        it('should handle stacks without parameters', async () => {
            const identifier = new StackIdentifier({
                stackName: 'simple-stack',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValue({
                Stacks: [
                    {
                        StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/simple-stack/guid',
                        StackName: 'simple-stack',
                        StackStatus: 'CREATE_COMPLETE',
                        CreationTime: new Date('2024-01-01T00:00:00Z'),
                    },
                ],
            });

            const stack = await repository.getStack(identifier);

            expect(stack.parameters).toEqual({});
            expect(stack.outputs).toEqual({});
            expect(stack.tags).toEqual({});
        });
    });

    describe('listResources', () => {
        it('should list all stack resources', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValue({
                StackResourceSummaries: [
                    {
                        LogicalResourceId: 'MyVPC',
                        PhysicalResourceId: 'vpc-123',
                        ResourceType: 'AWS::EC2::VPC',
                        ResourceStatus: 'CREATE_COMPLETE',
                        LastUpdatedTimestamp: new Date('2024-01-15T00:00:00Z'),
                        DriftInformation: { StackResourceDriftStatus: 'IN_SYNC' },
                    },
                    {
                        LogicalResourceId: 'MySubnet',
                        PhysicalResourceId: 'subnet-456',
                        ResourceType: 'AWS::EC2::Subnet',
                        ResourceStatus: 'CREATE_COMPLETE',
                        LastUpdatedTimestamp: new Date('2024-01-15T00:00:00Z'),
                        DriftInformation: { StackResourceDriftStatus: 'NOT_CHECKED' },
                    },
                ],
            });

            const resources = await repository.listResources(identifier);

            expect(resources).toHaveLength(2);
            expect(resources[0]).toEqual({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                status: 'CREATE_COMPLETE',
                lastUpdatedTime: new Date('2024-01-15T00:00:00Z'),
                driftStatus: 'IN_SYNC',
            });

            expect(resources[1].driftStatus).toBe('NOT_CHECKED');
        });

        it('should handle pagination for large stacks', async () => {
            const identifier = new StackIdentifier({
                stackName: 'large-stack',
                region: 'us-east-1',
            });

            // First page
            mockSend.mockResolvedValueOnce({
                StackResourceSummaries: [
                    {
                        LogicalResourceId: 'Resource1',
                        PhysicalResourceId: 'res-1',
                        ResourceType: 'AWS::EC2::VPC',
                        ResourceStatus: 'CREATE_COMPLETE',
                        LastUpdatedTimestamp: new Date('2024-01-15T00:00:00Z'),
                        DriftInformation: { StackResourceDriftStatus: 'IN_SYNC' },
                    },
                ],
                NextToken: 'token-123',
            });

            // Second page
            mockSend.mockResolvedValueOnce({
                StackResourceSummaries: [
                    {
                        LogicalResourceId: 'Resource2',
                        PhysicalResourceId: 'res-2',
                        ResourceType: 'AWS::EC2::Subnet',
                        ResourceStatus: 'CREATE_COMPLETE',
                        LastUpdatedTimestamp: new Date('2024-01-15T00:00:00Z'),
                        DriftInformation: { StackResourceDriftStatus: 'IN_SYNC' },
                    },
                ],
            });

            const resources = await repository.listResources(identifier);

            expect(resources).toHaveLength(2);
            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        it('should throw error if stack does not exist', async () => {
            const identifier = new StackIdentifier({
                stackName: 'non-existent',
                region: 'us-east-1',
            });

            const error = new Error('Stack does not exist');
            error.name = 'ValidationError';
            mockSend.mockRejectedValue(error);

            await expect(repository.listResources(identifier)).rejects.toThrow('Stack does not exist');
        });
    });

    describe('getResource', () => {
        it('should get resource details', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValue({
                StackResourceDetail: {
                    LogicalResourceId: 'MyVPC',
                    PhysicalResourceId: 'vpc-123',
                    ResourceType: 'AWS::EC2::VPC',
                    ResourceStatus: 'CREATE_COMPLETE',
                    Metadata: '{"Description": "Main VPC"}',
                },
            });

            const resource = await repository.getResource(identifier, 'MyVPC');

            expect(resource).toEqual({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                status: 'CREATE_COMPLETE',
                properties: {},
                metadata: { Description: 'Main VPC' },
            });
        });

        it('should handle resource without metadata', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValue({
                StackResourceDetail: {
                    LogicalResourceId: 'MyVPC',
                    PhysicalResourceId: 'vpc-123',
                    ResourceType: 'AWS::EC2::VPC',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
            });

            const resource = await repository.getResource(identifier, 'MyVPC');

            expect(resource.metadata).toEqual({});
        });

        it('should throw error if resource does not exist', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const error = new Error('Resource does not exist');
            error.name = 'ValidationError';
            mockSend.mockRejectedValue(error);

            await expect(repository.getResource(identifier, 'NonExistent')).rejects.toThrow('Resource does not exist');
        });
    });

    describe('getTemplate', () => {
        it('should get CloudFormation template', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const mockTemplate = {
                Resources: {
                    MyVPC: {
                        Type: 'AWS::EC2::VPC',
                        Properties: {
                            CidrBlock: '10.0.0.0/16',
                        },
                    },
                },
            };

            mockSend.mockResolvedValue({
                TemplateBody: JSON.stringify(mockTemplate),
            });

            const template = await repository.getTemplate(identifier);

            expect(template).toEqual(mockTemplate);
        });

        it('should handle YAML templates', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const yamlTemplate = `
Resources:
  MyVPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
`;

            mockSend.mockResolvedValue({
                TemplateBody: yamlTemplate,
            });

            const template = await repository.getTemplate(identifier);

            expect(template).toHaveProperty('Resources');
            expect(template.Resources).toHaveProperty('MyVPC');
        });
    });

    describe('exists', () => {
        it('should return true if stack exists', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValue({
                Stacks: [{
                    StackName: 'my-app-prod',
                    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
                    StackStatus: 'UPDATE_COMPLETE',
                    CreationTime: new Date('2024-01-01T00:00:00Z'),
                }],
            });

            const exists = await repository.exists(identifier);

            expect(exists).toBe(true);
        });

        it('should return false if stack does not exist', async () => {
            const identifier = new StackIdentifier({
                stackName: 'non-existent',
                region: 'us-east-1',
            });

            const error = new Error('Stack does not exist');
            error.name = 'ValidationError';
            mockSend.mockRejectedValue(error);

            const exists = await repository.exists(identifier);

            expect(exists).toBe(false);
        });

        it('should return false if stack is deleted', async () => {
            const identifier = new StackIdentifier({
                stackName: 'deleted-stack',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValue({
                Stacks: [{
                    StackName: 'deleted-stack',
                    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/deleted-stack/guid',
                    StackStatus: 'DELETE_COMPLETE',
                    CreationTime: new Date('2024-01-01T00:00:00Z'),
                }],
            });

            const exists = await repository.exists(identifier);

            expect(exists).toBe(false);
        });
    });

    describe('detectStackDrift', () => {
        it('should detect stack drift', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            // Mock drift detection initiation
            mockSend.mockResolvedValueOnce({
                StackDriftDetectionId: 'drift-detection-123',
            });

            // Mock drift detection status polling
            mockSend.mockResolvedValueOnce({
                DetectionStatus: 'DETECTION_COMPLETE',
                StackDriftStatus: 'DRIFTED',
                DriftedStackResourceCount: 2,
                Timestamp: new Date('2024-01-15T10:00:00Z'),
            });

            const result = await repository.detectStackDrift(identifier);

            expect(result).toEqual({
                stackDriftStatus: 'DRIFTED',
                driftedResourceCount: 2,
                detectionTime: new Date('2024-01-15T10:00:00Z'),
            });

            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        it('should handle in-sync stacks', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValueOnce({
                StackDriftDetectionId: 'drift-detection-123',
            });

            mockSend.mockResolvedValueOnce({
                DetectionStatus: 'DETECTION_COMPLETE',
                StackDriftStatus: 'IN_SYNC',
                DriftedStackResourceCount: 0,
                Timestamp: new Date('2024-01-15T10:00:00Z'),
            });

            const result = await repository.detectStackDrift(identifier);

            expect(result.stackDriftStatus).toBe('IN_SYNC');
            expect(result.driftedResourceCount).toBe(0);
        });

        it('should poll until detection completes', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValueOnce({
                StackDriftDetectionId: 'drift-detection-123',
            });

            // First poll: in progress
            mockSend.mockResolvedValueOnce({
                DetectionStatus: 'DETECTION_IN_PROGRESS',
            });

            // Second poll: complete
            mockSend.mockResolvedValueOnce({
                DetectionStatus: 'DETECTION_COMPLETE',
                StackDriftStatus: 'IN_SYNC',
                DriftedStackResourceCount: 0,
                Timestamp: new Date('2024-01-15T10:00:00Z'),
            });

            const result = await repository.detectStackDrift(identifier);

            expect(result.stackDriftStatus).toBe('IN_SYNC');
            expect(mockSend).toHaveBeenCalledTimes(3);
        });
    });

    describe('getResourceDrift', () => {
        it('should get resource drift details', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValue({
                StackResourceDrifts: [
                    {
                        LogicalResourceId: 'MyVPC',
                        StackResourceDriftStatus: 'MODIFIED',
                        ExpectedProperties: JSON.stringify({
                            CidrBlock: '10.0.0.0/16',
                            EnableDnsSupport: true,
                        }),
                        ActualProperties: JSON.stringify({
                            CidrBlock: '10.0.0.0/16',
                            EnableDnsSupport: false,
                        }),
                        PropertyDifferences: [
                            {
                                PropertyPath: '/Properties/EnableDnsSupport',
                                ExpectedValue: 'true',
                                ActualValue: 'false',
                                DifferenceType: 'NOT_EQUAL',
                            },
                        ],
                    },
                ],
            });

            const drift = await repository.getResourceDrift(identifier, 'MyVPC');

            expect(drift).toEqual({
                driftStatus: 'MODIFIED',
                expectedProperties: {
                    CidrBlock: '10.0.0.0/16',
                    EnableDnsSupport: true,
                },
                actualProperties: {
                    CidrBlock: '10.0.0.0/16',
                    EnableDnsSupport: false,
                },
                propertyDifferences: [
                    {
                        PropertyPath: '/Properties/EnableDnsSupport',
                        ExpectedValue: 'true',
                        ActualValue: 'false',
                        DifferenceType: 'NOT_EQUAL',
                    },
                ],
            });
        });

        it('should handle resources in sync', async () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockSend.mockResolvedValue({
                StackResourceDrifts: [
                    {
                        LogicalResourceId: 'MyVPC',
                        StackResourceDriftStatus: 'IN_SYNC',
                        ExpectedProperties: JSON.stringify({ CidrBlock: '10.0.0.0/16' }),
                        ActualProperties: JSON.stringify({ CidrBlock: '10.0.0.0/16' }),
                        PropertyDifferences: [],
                    },
                ],
            });

            const drift = await repository.getResourceDrift(identifier, 'MyVPC');

            expect(drift.driftStatus).toBe('IN_SYNC');
            expect(drift.propertyDifferences).toEqual([]);
        });
    });

    describe('constructor', () => {
        it('should create instance with default region', () => {
            const repo = new AWSStackRepository();
            expect(repo).toBeInstanceOf(AWSStackRepository);
        });

        it('should create instance with custom region', () => {
            const repo = new AWSStackRepository({ region: 'eu-west-1' });
            expect(repo).toBeInstanceOf(AWSStackRepository);
        });
    });
});
