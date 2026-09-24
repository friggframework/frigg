/**
 * Tests for RepairViaImportUseCase
 *
 * Use case for importing orphaned resources into CloudFormation stack
 * (frigg repair --import command)
 */

const RepairViaImportUseCase = require('./repair-via-import-use-case');
const StackIdentifier = require('../../domain/value-objects/stack-identifier');

describe('RepairViaImportUseCase', () => {
    let useCase;
    let mockResourceImporter;
    let mockResourceDetector;

    beforeEach(() => {
        // Mock repositories
        mockResourceImporter = {
            validateImport: jest.fn(),
            importResource: jest.fn(),
            importMultipleResources: jest.fn(),
            getImportStatus: jest.fn(),
            generateTemplateSnippet: jest.fn(),
        };

        mockResourceDetector = {
            getResourceDetails: jest.fn(),
        };

        useCase = new RepairViaImportUseCase({
            resourceImporter: mockResourceImporter,
            resourceDetector: mockResourceDetector,
        });
    });

    describe('importSingleResource', () => {
        it('should import a single orphaned resource', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const resourceToImport = {
                logicalId: 'OrphanedDBCluster',
                physicalId: 'my-orphan-cluster',
                resourceType: 'AWS::RDS::DBCluster',
            };

            // Mock validation
            mockResourceImporter.validateImport.mockResolvedValue({
                canImport: true,
                reason: null,
                warnings: [],
            });

            // Mock resource details retrieval
            mockResourceDetector.getResourceDetails.mockResolvedValue({
                physicalId: 'my-orphan-cluster',
                resourceType: 'AWS::RDS::DBCluster',
                properties: {
                    Engine: 'aurora-postgresql',
                    EngineVersion: '13.7',
                    MasterUsername: 'admin',
                },
                tags: [
                    { Key: 'frigg:stack', Value: 'my-app-prod' },
                ],
            });

            // Mock import operation
            mockResourceImporter.importResource.mockResolvedValue({
                operationId: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/import-xyz',
                status: 'IN_PROGRESS',
                message: 'Resource import initiated',
            });

            const result = await useCase.importSingleResource({
                stackIdentifier,
                logicalId: resourceToImport.logicalId,
                physicalId: resourceToImport.physicalId,
                resourceType: resourceToImport.resourceType,
            });

            expect(result.success).toBe(true);
            expect(result.operationId).toBeDefined();
            expect(result.status).toBe('IN_PROGRESS');
            expect(mockResourceImporter.validateImport).toHaveBeenCalledWith({
                resourceType: 'AWS::RDS::DBCluster',
                physicalId: 'my-orphan-cluster',
                region: 'us-east-1',
            });
            expect(mockResourceImporter.importResource).toHaveBeenCalled();
        });

        it('should fail if resource cannot be imported', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            // Mock validation failure
            mockResourceImporter.validateImport.mockResolvedValue({
                canImport: false,
                reason: 'Resource type AWS::Lambda::Function does not support import',
                warnings: [],
            });

            await expect(
                useCase.importSingleResource({
                    stackIdentifier,
                    logicalId: 'MyFunction',
                    physicalId: 'my-function',
                    resourceType: 'AWS::Lambda::Function',
                })
            ).rejects.toThrow('Resource type AWS::Lambda::Function does not support import');
        });

        it('should include warnings in result', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            // Mock validation with warnings
            mockResourceImporter.validateImport.mockResolvedValue({
                canImport: true,
                reason: null,
                warnings: ['Resource has manual configuration changes that may be lost'],
            });

            mockResourceDetector.getResourceDetails.mockResolvedValue({
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                properties: {
                    CidrBlock: '10.0.0.0/16',
                },
                tags: [],
            });

            mockResourceImporter.importResource.mockResolvedValue({
                operationId: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/import-xyz',
                status: 'IN_PROGRESS',
                message: 'Resource import initiated',
            });

            const result = await useCase.importSingleResource({
                stackIdentifier,
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
            });

            expect(result.success).toBe(true);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('manual configuration changes');
        });
    });

    describe('importMultipleResources', () => {
        it('should import multiple orphaned resources in batch', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const resourcesToImport = [
                {
                    logicalId: 'OrphanedVPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                },
                {
                    logicalId: 'OrphanedSubnet',
                    physicalId: 'subnet-456',
                    resourceType: 'AWS::EC2::Subnet',
                },
            ];

            // Mock validation for both resources
            mockResourceImporter.validateImport.mockResolvedValue({
                canImport: true,
                reason: null,
                warnings: [],
            });

            // Mock resource details
            mockResourceDetector.getResourceDetails
                .mockResolvedValueOnce({
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    properties: { CidrBlock: '10.0.0.0/16' },
                    tags: [],
                })
                .mockResolvedValueOnce({
                    physicalId: 'subnet-456',
                    resourceType: 'AWS::EC2::Subnet',
                    properties: { CidrBlock: '10.0.1.0/24' },
                    tags: [],
                });

            // Mock batch import
            mockResourceImporter.importMultipleResources.mockResolvedValue({
                operationId: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/batch-import-xyz',
                status: 'IN_PROGRESS',
                importedCount: 2,
                failedCount: 0,
                message: 'Batch import initiated',
                details: [
                    { logicalId: 'OrphanedVPC', status: 'IN_PROGRESS' },
                    { logicalId: 'OrphanedSubnet', status: 'IN_PROGRESS' },
                ],
            });

            const result = await useCase.importMultipleResources({
                stackIdentifier,
                resources: resourcesToImport,
            });

            expect(result.success).toBe(true);
            expect(result.importedCount).toBe(2);
            expect(result.failedCount).toBe(0);
            expect(mockResourceImporter.importMultipleResources).toHaveBeenCalled();
        });

        it('should handle partial failures in batch import', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const resourcesToImport = [
                {
                    logicalId: 'OrphanedVPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                },
                {
                    logicalId: 'InvalidResource',
                    physicalId: 'invalid-123',
                    resourceType: 'AWS::Lambda::Function',
                },
            ];

            // Mock validation - first passes, second fails
            mockResourceImporter.validateImport
                .mockResolvedValueOnce({
                    canImport: true,
                    reason: null,
                    warnings: [],
                })
                .mockResolvedValueOnce({
                    canImport: false,
                    reason: 'Resource does not exist',
                    warnings: [],
                });

            // Mock resource details for first resource only
            mockResourceDetector.getResourceDetails.mockResolvedValueOnce({
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                properties: { CidrBlock: '10.0.0.0/16' },
                tags: [],
            });

            const result = await useCase.importMultipleResources({
                stackIdentifier,
                resources: resourcesToImport,
            });

            expect(result.success).toBe(false); // Overall failure due to partial failure
            expect(result.importedCount).toBe(0); // No resources actually imported yet
            expect(result.failedCount).toBe(1);
            expect(result.validationErrors).toHaveLength(1);
            expect(result.validationErrors[0].logicalId).toBe('InvalidResource');
        });
    });

    describe('getImportStatus', () => {
        it('should get status of import operation', async () => {
            const operationId = 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/import-xyz';

            mockResourceImporter.getImportStatus.mockResolvedValue({
                operationId,
                status: 'COMPLETE',
                progress: 100,
                message: 'Resource import completed successfully',
                completedTime: new Date('2024-01-15T12:00:00Z'),
            });

            const status = await useCase.getImportStatus({ operationId });

            expect(status.status).toBe('COMPLETE');
            expect(status.progress).toBe(100);
            expect(mockResourceImporter.getImportStatus).toHaveBeenCalledWith(operationId);
        });

        it('should return in-progress status for ongoing import', async () => {
            const operationId = 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/import-xyz';

            mockResourceImporter.getImportStatus.mockResolvedValue({
                operationId,
                status: 'IN_PROGRESS',
                progress: 50,
                message: 'Importing resources...',
                completedTime: null,
            });

            const status = await useCase.getImportStatus({ operationId });

            expect(status.status).toBe('IN_PROGRESS');
            expect(status.progress).toBe(50);
            expect(status.completedTime).toBeNull();
        });
    });

    describe('previewImport', () => {
        it('should preview template changes for import', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            // Mock resource details
            mockResourceDetector.getResourceDetails.mockResolvedValue({
                physicalId: 'my-orphan-cluster',
                resourceType: 'AWS::RDS::DBCluster',
                properties: {
                    Engine: 'aurora-postgresql',
                    EngineVersion: '13.7',
                },
                tags: [],
            });

            // Mock template snippet generation
            mockResourceImporter.generateTemplateSnippet.mockResolvedValue({
                OrphanedDBCluster: {
                    Type: 'AWS::RDS::DBCluster',
                    Properties: {
                        Engine: 'aurora-postgresql',
                        EngineVersion: '13.7',
                    },
                },
            });

            const preview = await useCase.previewImport({
                stackIdentifier,
                logicalId: 'OrphanedDBCluster',
                physicalId: 'my-orphan-cluster',
                resourceType: 'AWS::RDS::DBCluster',
            });

            expect(preview.logicalId).toBe('OrphanedDBCluster');
            expect(preview.physicalId).toBe('my-orphan-cluster');
            expect(preview.templateSnippet).toBeDefined();
            expect(preview.templateSnippet.OrphanedDBCluster.Type).toBe('AWS::RDS::DBCluster');
        });
    });

    describe('constructor', () => {
        it('should require resourceImporter', () => {
            expect(() => {
                new RepairViaImportUseCase({
                    resourceDetector: mockResourceDetector,
                });
            }).toThrow('resourceImporter is required');
        });

        it('should require resourceDetector', () => {
            expect(() => {
                new RepairViaImportUseCase({
                    resourceImporter: mockResourceImporter,
                });
            }).toThrow('resourceDetector is required');
        });
    });
});
