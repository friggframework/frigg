const CleanupOrphanedResourcesUseCase = require('./cleanup-orphaned-resources-use-case');

describe('CleanupOrphanedResourcesUseCase', () => {
    let useCase;
    let mockResourceDetector;
    let mockDependencyAnalyzer;
    let mockDeletionPlanner;
    let mockDeleterRepository;
    let mockAuditRepository;

    beforeEach(() => {
        mockResourceDetector = {
            findOrphanedResources: jest.fn(),
        };

        mockDependencyAnalyzer = {
            analyzeDependencies: jest.fn(),
        };

        mockDeletionPlanner = {
            createDeletionPlan: jest.fn(),
        };

        mockDeleterRepository = {
            deleteResourceBatch: jest.fn(),
        };

        mockAuditRepository = {
            logCleanupOperation: jest.fn().mockResolvedValue({ success: true }),
            logDeletionAttempt: jest.fn().mockResolvedValue({ success: true }),
        };

        useCase = new CleanupOrphanedResourcesUseCase({
            resourceDetector: mockResourceDetector,
            dependencyAnalyzer: mockDependencyAnalyzer,
            deletionPlanner: mockDeletionPlanner,
            deleterRepository: mockDeleterRepository,
            auditRepository: mockAuditRepository,
        });
    });

    describe('constructor', () => {
        it('should require resourceDetector', () => {
            expect(() => {
                new CleanupOrphanedResourcesUseCase({
                    dependencyAnalyzer: mockDependencyAnalyzer,
                    deletionPlanner: mockDeletionPlanner,
                    deleterRepository: mockDeleterRepository,
                    auditRepository: mockAuditRepository,
                });
            }).toThrow('resourceDetector is required');
        });

        it('should require dependencyAnalyzer', () => {
            expect(() => {
                new CleanupOrphanedResourcesUseCase({
                    resourceDetector: mockResourceDetector,
                    deletionPlanner: mockDeletionPlanner,
                    deleterRepository: mockDeleterRepository,
                    auditRepository: mockAuditRepository,
                });
            }).toThrow('dependencyAnalyzer is required');
        });
    });

    describe('execute - dry run mode', () => {
        it('should return deletion plan without executing in dry-run mode', async () => {
            const stackIdentifier = {
                stackName: 'test-stack',
                region: 'us-east-1',
            };

            const orphanedResources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'vpc-456', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const deletionPlan = {
                totalResources: 2,
                deletableCount: 2,
                blockedCount: 0,
                phases: { phase1: [], phase2: [], phase3: orphanedResources },
                costSavings: { monthly: 72, annual: 864 },
            };

            mockResourceDetector.findOrphanedResources.mockResolvedValue(orphanedResources);
            mockDependencyAnalyzer.analyzeDependencies.mockResolvedValue(dependencyAnalysis);
            mockDeletionPlanner.createDeletionPlan.mockReturnValue(deletionPlan);

            const result = await useCase.execute({
                stackIdentifier,
                dryRun: true,
            });

            expect(result.dryRun).toBe(true);
            expect(result.deletionPlan).toEqual(deletionPlan);
            expect(mockDeleterRepository.deleteResourceBatch).not.toHaveBeenCalled();
        });

        it('should filter orphaned resources by resource type', async () => {
            const stackIdentifier = {
                stackName: 'test-stack',
                region: 'us-east-1',
            };

            const orphanedResources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
            ];

            mockResourceDetector.findOrphanedResources.mockResolvedValue(orphanedResources);
            mockDependencyAnalyzer.analyzeDependencies.mockResolvedValue({
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            });
            mockDeletionPlanner.createDeletionPlan.mockReturnValue({
                totalResources: 1,
                deletableCount: 1,
                blockedCount: 0,
            });

            await useCase.execute({
                stackIdentifier,
                dryRun: true,
                resourceTypeFilter: 'AWS::EC2::VPC',
            });

            expect(mockDependencyAnalyzer.analyzeDependencies).toHaveBeenCalledWith([
                orphanedResources[0],
            ]);
        });

        it('should filter orphaned resources by logical ID pattern', async () => {
            const stackIdentifier = {
                stackName: 'test-stack',
                region: 'us-east-1',
            };

            const orphanedResources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'vpc-456', resourceType: 'AWS::EC2::VPC', logicalId: 'CustomVPC' },
            ];

            mockResourceDetector.findOrphanedResources.mockResolvedValue(orphanedResources);
            mockDependencyAnalyzer.analyzeDependencies.mockResolvedValue({
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            });
            mockDeletionPlanner.createDeletionPlan.mockReturnValue({
                totalResources: 1,
                deletableCount: 1,
                blockedCount: 0,
            });

            await useCase.execute({
                stackIdentifier,
                dryRun: true,
                logicalIdPattern: 'Frigg*',
            });

            expect(mockDependencyAnalyzer.analyzeDependencies).toHaveBeenCalledWith([
                orphanedResources[0],
            ]);
        });

        it('should return success message when no orphaned resources found', async () => {
            const stackIdentifier = {
                stackName: 'test-stack',
                region: 'us-east-1',
            };

            mockResourceDetector.findOrphanedResources.mockResolvedValue([]);

            const result = await useCase.execute({
                stackIdentifier,
                dryRun: true,
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('No orphaned resources found');
        });
    });

    describe('execute - deletion mode', () => {
        it('should execute deletion and log to audit trail', async () => {
            const stackIdentifier = {
                stackName: 'test-stack',
                region: 'us-east-1',
            };

            const orphanedResources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const deletionPlan = {
                totalResources: 1,
                deletableCount: 1,
                blockedCount: 0,
                phases: {
                    phase1: [],
                    phase2: [orphanedResources[0]],
                    phase3: [],
                },
                costSavings: { monthly: 0, annual: 0 },
            };

            mockResourceDetector.findOrphanedResources.mockResolvedValue(orphanedResources);
            mockDependencyAnalyzer.analyzeDependencies.mockResolvedValue(dependencyAnalysis);
            mockDeletionPlanner.createDeletionPlan.mockReturnValue(deletionPlan);
            mockDeleterRepository.deleteResourceBatch.mockResolvedValue({
                successCount: 1,
                failedCount: 0,
                results: [{ success: true, physicalId: 'subnet-123' }],
            });

            const result = await useCase.execute({
                stackIdentifier,
                dryRun: false,
            });

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(1);
            expect(result.failedCount).toBe(0);
            expect(mockDeleterRepository.deleteResourceBatch).toHaveBeenCalled();
            expect(mockAuditRepository.logCleanupOperation).toHaveBeenCalled();
        });

        it('should delete resources in correct phase order', async () => {
            const stackIdentifier = {
                stackName: 'test-stack',
                region: 'us-east-1',
            };

            const orphanedResources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
                { physicalId: 'vpce-123', resourceType: 'AWS::EC2::VPCEndpoint', logicalId: 'FriggVPCE' },
            ];

            const deletionPlan = {
                totalResources: 3,
                deletableCount: 3,
                blockedCount: 0,
                phases: {
                    phase1: [orphanedResources[2]],
                    phase2: [orphanedResources[1]],
                    phase3: [orphanedResources[0]],
                },
                costSavings: { monthly: 36, annual: 432 },
            };

            mockResourceDetector.findOrphanedResources.mockResolvedValue(orphanedResources);
            mockDependencyAnalyzer.analyzeDependencies.mockResolvedValue({
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            });
            mockDeletionPlanner.createDeletionPlan.mockReturnValue(deletionPlan);
            mockDeleterRepository.deleteResourceBatch.mockResolvedValue({
                successCount: 1,
                failedCount: 0,
                results: [],
            });

            await useCase.execute({
                stackIdentifier,
                dryRun: false,
            });

            expect(mockDeleterRepository.deleteResourceBatch).toHaveBeenCalledTimes(3);
            expect(mockDeleterRepository.deleteResourceBatch.mock.calls[0][0]).toEqual([
                orphanedResources[2],
            ]);
            expect(mockDeleterRepository.deleteResourceBatch.mock.calls[1][0]).toEqual([
                orphanedResources[1],
            ]);
            expect(mockDeleterRepository.deleteResourceBatch.mock.calls[2][0]).toEqual([
                orphanedResources[0],
            ]);
        });

        it('should handle partial deletion failures', async () => {
            const stackIdentifier = {
                stackName: 'test-stack',
                region: 'us-east-1',
            };

            const orphanedResources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet1' },
                { physicalId: 'subnet-456', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet2' },
            ];

            mockResourceDetector.findOrphanedResources.mockResolvedValue(orphanedResources);
            mockDependencyAnalyzer.analyzeDependencies.mockResolvedValue({
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            });
            mockDeletionPlanner.createDeletionPlan.mockReturnValue({
                totalResources: 2,
                deletableCount: 2,
                blockedCount: 0,
                phases: {
                    phase1: [],
                    phase2: orphanedResources,
                    phase3: [],
                },
            });
            mockDeleterRepository.deleteResourceBatch.mockResolvedValue({
                successCount: 1,
                failedCount: 1,
                results: [
                    { success: true, physicalId: 'subnet-123' },
                    { success: false, physicalId: 'subnet-456', error: 'DependencyViolation' },
                ],
            });

            const result = await useCase.execute({
                stackIdentifier,
                dryRun: false,
            });

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(1);
            expect(result.failedCount).toBe(1);
        });

        it('should invoke progress callback during deletion', async () => {
            const stackIdentifier = {
                stackName: 'test-stack',
                region: 'us-east-1',
            };

            const orphanedResources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
            ];

            mockResourceDetector.findOrphanedResources.mockResolvedValue(orphanedResources);
            mockDependencyAnalyzer.analyzeDependencies.mockResolvedValue({
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            });
            mockDeletionPlanner.createDeletionPlan.mockReturnValue({
                totalResources: 1,
                deletableCount: 1,
                blockedCount: 0,
                phases: {
                    phase1: [],
                    phase2: orphanedResources,
                    phase3: [],
                },
            });
            mockDeleterRepository.deleteResourceBatch.mockResolvedValue({
                successCount: 1,
                failedCount: 0,
                results: [],
            });

            const progressCallback = jest.fn();

            await useCase.execute({
                stackIdentifier,
                dryRun: false,
                onProgress: progressCallback,
            });

            expect(progressCallback).toHaveBeenCalled();
        });
    });
});
