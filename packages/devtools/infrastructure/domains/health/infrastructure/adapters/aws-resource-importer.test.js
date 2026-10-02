/**
 * Tests for AWSResourceImporter Adapter
 *
 * Tests CloudFormation resource import operations using mocked AWS SDK
 */

const AWSResourceImporter = require('./aws-resource-importer');
const StackIdentifier = require('../../domain/value-objects/stack-identifier');

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudformation', () => ({
    CloudFormationClient: jest.fn(),
    CreateChangeSetCommand: jest.fn(),
    DescribeChangeSetCommand: jest.fn(),
    ExecuteChangeSetCommand: jest.fn(),
    GetTemplateCommand: jest.fn(),
}));

describe('AWSResourceImporter', () => {
    let importer;
    let mockSend;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSend = jest.fn();
        const { CloudFormationClient } = require('@aws-sdk/client-cloudformation');
        CloudFormationClient.mockImplementation(() => ({ send: mockSend }));

        importer = new AWSResourceImporter({ region: 'us-east-1' });
    });

    describe('supportsImport', () => {
        it('should return true for VPC', async () => {
            const supports = await importer.supportsImport('AWS::EC2::VPC');
            expect(supports).toBe(true);
        });

        it('should return true for RDS DBCluster', async () => {
            const supports = await importer.supportsImport('AWS::RDS::DBCluster');
            expect(supports).toBe(true);
        });

        it('should return true for KMS Key', async () => {
            const supports = await importer.supportsImport('AWS::KMS::Key');
            expect(supports).toBe(true);
        });

        it('should return false for unsupported type', async () => {
            const supports = await importer.supportsImport('AWS::Lambda::Function');
            expect(supports).toBe(false);
        });
    });

    describe('getIdentifierProperty', () => {
        it('should return VpcId for VPC', async () => {
            const prop = await importer.getIdentifierProperty('AWS::EC2::VPC');
            expect(prop).toBe('VpcId');
        });

        it('should return SubnetId for Subnet', async () => {
            const prop = await importer.getIdentifierProperty('AWS::EC2::Subnet');
            expect(prop).toBe('SubnetId');
        });

        it('should return DBClusterIdentifier for RDS DBCluster', async () => {
            const prop = await importer.getIdentifierProperty('AWS::RDS::DBCluster');
            expect(prop).toBe('DBClusterIdentifier');
        });

        it('should throw error for unsupported type', async () => {
            await expect(
                importer.getIdentifierProperty('AWS::Lambda::Function')
            ).rejects.toThrow('Resource type AWS::Lambda::Function does not support import');
        });
    });

    describe('validateImport', () => {
        it('should validate VPC import', async () => {
            const result = await importer.validateImport({
                resourceType: 'AWS::EC2::VPC',
                physicalId: 'vpc-123',
                region: 'us-east-1',
            });

            expect(result).toEqual({
                canImport: true,
                reason: '',
                warnings: [],
            });
        });

        it('should fail validation for unsupported type', async () => {
            const result = await importer.validateImport({
                resourceType: 'AWS::Lambda::Function',
                physicalId: 'my-function',
                region: 'us-east-1',
            });

            expect(result.canImport).toBe(false);
            expect(result.reason).toContain('not supported');
        });

        it('should warn about missing required properties', async () => {
            const result = await importer.validateImport({
                resourceType: 'AWS::RDS::DBCluster',
                physicalId: 'my-cluster',
                region: 'us-east-1',
            });

            expect(result.canImport).toBe(true);
            expect(result.warnings).toContain(
                'Ensure DBCluster has required properties (Engine, MasterUsername, etc.)'
            );
        });
    });

    describe('importResource', () => {
        it('should import a single VPC resource', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            // Mock CreateChangeSet
            mockSend.mockResolvedValueOnce({
                Id: 'changeset-123',
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
            });

            // Mock ExecuteChangeSet
            mockSend.mockResolvedValueOnce({});

            const result = await importer.importResource({
                stackIdentifier,
                logicalId: 'ImportedVPC',
                resourceType: 'AWS::EC2::VPC',
                physicalId: 'vpc-123',
                properties: {
                    CidrBlock: '10.0.0.0/16',
                    EnableDnsSupport: true,
                },
            });

            expect(result).toEqual({
                operationId: 'changeset-123',
                status: 'IN_PROGRESS',
                message: 'Resource import initiated via change set changeset-123',
            });

            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        it('should throw error for unsupported resource type', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            await expect(
                importer.importResource({
                    stackIdentifier,
                    logicalId: 'MyFunction',
                    resourceType: 'AWS::Lambda::Function',
                    physicalId: 'my-function',
                    properties: {},
                })
            ).rejects.toThrow('Resource type AWS::Lambda::Function does not support import');
        });

        it('should handle import failure', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const error = new Error('Resource already exists in stack');
            error.name = 'AlreadyExistsException';
            mockSend.mockRejectedValue(error);

            await expect(
                importer.importResource({
                    stackIdentifier,
                    logicalId: 'ExistingVPC',
                    resourceType: 'AWS::EC2::VPC',
                    physicalId: 'vpc-123',
                    properties: { CidrBlock: '10.0.0.0/16' },
                })
            ).rejects.toThrow('Resource already exists in stack');
        });
    });

    describe('importMultipleResources', () => {
        it('should import multiple resources in single operation', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const resources = [
                {
                    logicalId: 'ImportedVPC',
                    resourceType: 'AWS::EC2::VPC',
                    physicalId: 'vpc-123',
                    properties: { CidrBlock: '10.0.0.0/16' },
                },
                {
                    logicalId: 'ImportedSubnet',
                    resourceType: 'AWS::EC2::Subnet',
                    physicalId: 'subnet-456',
                    properties: { VpcId: 'vpc-123', CidrBlock: '10.0.1.0/24' },
                },
            ];

            // Mock CreateChangeSet
            mockSend.mockResolvedValueOnce({
                Id: 'changeset-multi-123',
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
            });

            // Mock ExecuteChangeSet
            mockSend.mockResolvedValueOnce({});

            const result = await importer.importMultipleResources({
                stackIdentifier,
                resources,
            });

            expect(result).toEqual({
                operationId: 'changeset-multi-123',
                status: 'IN_PROGRESS',
                importedCount: 2,
                failedCount: 0,
                message: 'Import operation initiated for 2 resources',
                details: [],
            });
        });

        it('should filter out unsupported resource types', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const resources = [
                {
                    logicalId: 'ImportedVPC',
                    resourceType: 'AWS::EC2::VPC',
                    physicalId: 'vpc-123',
                    properties: { CidrBlock: '10.0.0.0/16' },
                },
                {
                    logicalId: 'UnsupportedFunction',
                    resourceType: 'AWS::Lambda::Function',
                    physicalId: 'my-function',
                    properties: {},
                },
            ];

            // Mock CreateChangeSet (only for VPC)
            mockSend.mockResolvedValueOnce({
                Id: 'changeset-filtered-123',
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
            });

            // Mock ExecuteChangeSet
            mockSend.mockResolvedValueOnce({});

            const result = await importer.importMultipleResources({
                stackIdentifier,
                resources,
            });

            expect(result.importedCount).toBe(1);
            expect(result.failedCount).toBe(1);
        });
    });

    describe('getImportStatus', () => {
        it('should get status of in-progress import', async () => {
            mockSend.mockResolvedValue({
                Status: 'CREATE_PENDING',
                ExecutionStatus: 'AVAILABLE',
                StatusReason: 'Change set created',
            });

            const status = await importer.getImportStatus('changeset-123');

            expect(status).toEqual({
                operationId: 'changeset-123',
                status: 'IN_PROGRESS',
                progress: 25,
                message: 'Change set created',
                completedTime: null,
            });
        });

        it('should get status of completed import', async () => {
            const completedTime = new Date('2024-01-15T10:30:00Z');

            mockSend.mockResolvedValue({
                Status: 'CREATE_COMPLETE',
                ExecutionStatus: 'EXECUTE_COMPLETE',
                StatusReason: 'Import completed successfully',
                CreationTime: completedTime,
            });

            const status = await importer.getImportStatus('changeset-123');

            expect(status.status).toBe('COMPLETE');
            expect(status.progress).toBe(100);
            expect(status.completedTime).toEqual(completedTime);
        });

        it('should get status of failed import', async () => {
            mockSend.mockResolvedValue({
                Status: 'FAILED',
                ExecutionStatus: 'EXECUTE_FAILED',
                StatusReason: 'Resource already exists',
            });

            const status = await importer.getImportStatus('changeset-123');

            expect(status.status).toBe('FAILED');
            expect(status.message).toContain('already exists');
        });
    });

    describe('generateTemplateSnippet', () => {
        it('should generate VPC template snippet', async () => {
            const snippet = await importer.generateTemplateSnippet({
                logicalId: 'ImportedVPC',
                resourceType: 'AWS::EC2::VPC',
                properties: {
                    CidrBlock: '10.0.0.0/16',
                    EnableDnsSupport: true,
                    EnableDnsHostnames: true,
                },
            });

            expect(snippet).toEqual({
                ImportedVPC: {
                    Type: 'AWS::EC2::VPC',
                    Properties: {
                        CidrBlock: '10.0.0.0/16',
                        EnableDnsSupport: true,
                        EnableDnsHostnames: true,
                    },
                },
            });
        });

        it('should generate RDS DBCluster template snippet', async () => {
            const snippet = await importer.generateTemplateSnippet({
                logicalId: 'ImportedCluster',
                resourceType: 'AWS::RDS::DBCluster',
                properties: {
                    Engine: 'aurora-postgresql',
                    EngineVersion: '13.7',
                    MasterUsername: 'admin',
                },
            });

            expect(snippet).toEqual({
                ImportedCluster: {
                    Type: 'AWS::RDS::DBCluster',
                    Properties: {
                        Engine: 'aurora-postgresql',
                        EngineVersion: '13.7',
                        MasterUsername: 'admin',
                    },
                },
            });
        });

        it('should throw error for unsupported resource type', async () => {
            await expect(
                importer.generateTemplateSnippet({
                    logicalId: 'MyFunction',
                    resourceType: 'AWS::Lambda::Function',
                    properties: {},
                })
            ).rejects.toThrow('Resource type AWS::Lambda::Function does not support import');
        });
    });

    describe('constructor', () => {
        it('should create instance with default region', () => {
            const imp = new AWSResourceImporter();
            expect(imp).toBeInstanceOf(AWSResourceImporter);
        });

        it('should create instance with custom region', () => {
            const imp = new AWSResourceImporter({ region: 'eu-west-1' });
            expect(imp).toBeInstanceOf(AWSResourceImporter);
        });
    });
});
