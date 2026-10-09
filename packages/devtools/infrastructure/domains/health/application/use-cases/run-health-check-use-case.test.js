/**
 * Tests for RunHealthCheckUseCase
 *
 * Use case for orchestrating complete stack health check (frigg doctor command)
 */

const RunHealthCheckUseCase = require('./run-health-check-use-case');
const StackIdentifier = require('../../domain/value-objects/stack-identifier');
const ResourceState = require('../../domain/value-objects/resource-state');
const PropertyMutability = require('../../domain/value-objects/property-mutability');
const PropertyMismatch = require('../../domain/entities/property-mismatch');
const HealthScore = require('../../domain/value-objects/health-score');

describe('RunHealthCheckUseCase', () => {
    let useCase;
    let mockStackRepository;
    let mockResourceDetector;
    let mockMismatchAnalyzer;
    let mockHealthScoreCalculator;

    beforeEach(() => {
        // Mock repositories
        mockStackRepository = {
            getStack: jest.fn(),
            listResources: jest.fn(),
            detectStackDrift: jest.fn(),
            getResourceDrift: jest.fn(),
        };

        mockResourceDetector = {
            detectResources: jest.fn(),
            findOrphanedResources: jest.fn(),
        };

        mockMismatchAnalyzer = {
            analyze: jest.fn(),
        };

        mockHealthScoreCalculator = {
            calculate: jest.fn(),
        };

        useCase = new RunHealthCheckUseCase({
            stackRepository: mockStackRepository,
            resourceDetector: mockResourceDetector,
            mismatchAnalyzer: mockMismatchAnalyzer,
            healthScoreCalculator: mockHealthScoreCalculator,
        });
    });

    describe('execute', () => {
        it('should return healthy report for stack with no issues', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            // Mock stack exists and is healthy
            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
                status: 'UPDATE_COMPLETE',
                createdTime: new Date('2024-01-01'),
                lastUpdatedTime: new Date('2024-01-15'),
                parameters: [],
                outputs: [],
                tags: [],
            });

            // Mock no drift
            mockStackRepository.detectStackDrift.mockResolvedValue({
                stackDriftStatus: 'IN_SYNC',
                driftedResourcesCount: 0,
            });

            // Mock resources in stack
            mockStackRepository.listResources.mockResolvedValue([
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    status: 'UPDATE_COMPLETE',
                    driftStatus: 'IN_SYNC',
                },
            ]);

            // Mock no orphaned resources
            mockResourceDetector.findOrphanedResources.mockResolvedValue([]);

            // Mock healthy score
            mockHealthScoreCalculator.calculate.mockReturnValue(new HealthScore(100));

            const report = await useCase.execute({ stackIdentifier });

            expect(report.stackIdentifier.stackName).toBe('my-app-prod');
            expect(report.healthScore.value).toBe(100);
            expect(report.issues).toHaveLength(0);
            expect(report.resources).toHaveLength(1);
            expect(report.getIssueCount()).toBe(0);
            expect(report.getCriticalIssueCount()).toBe(0);
        });

        it('should detect and report property drift', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
                status: 'UPDATE_COMPLETE',
                createdTime: new Date('2024-01-01'),
            });

            mockStackRepository.detectStackDrift.mockResolvedValue({
                stackDriftStatus: 'DRIFTED',
                driftedResourcesCount: 1,
            });

            mockStackRepository.listResources.mockResolvedValue([
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    status: 'UPDATE_COMPLETE',
                    driftStatus: 'MODIFIED',
                },
            ]);

            // Mock drift details
            mockStackRepository.getResourceDrift.mockResolvedValue({
                driftStatus: 'MODIFIED',
                propertyDifferences: [
                    {
                        propertyPath: 'Properties.EnableDnsSupport',
                        expectedValue: true,
                        actualValue: false,
                        differenceType: 'NOT_EQUAL',
                    },
                ],
            });

            // Mock property mismatch analysis
            const propertyMismatch = new PropertyMismatch({
                propertyPath: 'Properties.EnableDnsSupport',
                expectedValue: true,
                actualValue: false,
                mutability: PropertyMutability.MUTABLE,
            });

            mockMismatchAnalyzer.analyze.mockReturnValue([propertyMismatch]);

            mockResourceDetector.findOrphanedResources.mockResolvedValue([]);

            mockHealthScoreCalculator.calculate.mockReturnValue(new HealthScore(85));

            const report = await useCase.execute({ stackIdentifier });

            expect(report.healthScore.value).toBe(85);
            expect(report.issues).toHaveLength(1);
            expect(report.issues[0].type).toBe('PROPERTY_MISMATCH');
            expect(report.issues[0].severity).toBe('warning');
            expect(report.resources[0].state.value).toBe('DRIFTED');
        });

        it('should detect and report orphaned resources', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
                status: 'UPDATE_COMPLETE',
                createdTime: new Date('2024-01-01'),
            });

            mockStackRepository.detectStackDrift.mockResolvedValue({
                stackDriftStatus: 'IN_SYNC',
                driftedResourcesCount: 0,
            });

            mockStackRepository.listResources.mockResolvedValue([
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    status: 'UPDATE_COMPLETE',
                    driftStatus: 'IN_SYNC',
                },
            ]);

            // Mock orphaned RDS cluster
            mockResourceDetector.findOrphanedResources.mockResolvedValue([
                {
                    physicalId: 'my-orphan-cluster',
                    resourceType: 'AWS::RDS::DBCluster',
                    properties: {
                        Engine: 'aurora-postgresql',
                        EngineVersion: '13.7',
                    },
                    tags: [
                        { Key: 'frigg:stack', Value: 'my-app-prod' },
                    ],
                    createdTime: new Date('2024-01-10'),
                },
            ]);

            mockHealthScoreCalculator.calculate.mockReturnValue(new HealthScore(75));

            const report = await useCase.execute({ stackIdentifier });

            expect(report.healthScore.value).toBe(75);
            expect(report.issues).toHaveLength(1);
            expect(report.issues[0].type).toBe('ORPHANED_RESOURCE');
            expect(report.issues[0].severity).toBe('critical');
            expect(report.issues[0].resourceId).toBe('my-orphan-cluster');
            expect(report.getOrphanedResourceCount()).toBe(1);
        });

        it('should detect missing resources', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
                status: 'UPDATE_COMPLETE',
                createdTime: new Date('2024-01-01'),
            });

            mockStackRepository.detectStackDrift.mockResolvedValue({
                stackDriftStatus: 'DRIFTED',
                driftedResourcesCount: 1,
            });

            mockStackRepository.listResources.mockResolvedValue([
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    status: 'UPDATE_COMPLETE',
                    driftStatus: 'IN_SYNC',
                },
                {
                    logicalId: 'MySubnet',
                    physicalId: null, // Missing resource
                    resourceType: 'AWS::EC2::Subnet',
                    status: 'DELETE_COMPLETE',
                    driftStatus: 'DELETED',
                },
            ]);

            mockResourceDetector.findOrphanedResources.mockResolvedValue([]);

            mockHealthScoreCalculator.calculate.mockReturnValue(new HealthScore(60));

            const report = await useCase.execute({ stackIdentifier });

            expect(report.healthScore.value).toBe(60);
            expect(report.issues).toHaveLength(1);
            expect(report.issues[0].type).toBe('MISSING_RESOURCE');
            expect(report.issues[0].severity).toBe('critical');
            expect(report.resources[1].state.value).toBe('MISSING');
        });

        it('should handle multiple issue types simultaneously', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
                status: 'UPDATE_COMPLETE',
                createdTime: new Date('2024-01-01'),
            });

            mockStackRepository.detectStackDrift.mockResolvedValue({
                stackDriftStatus: 'DRIFTED',
                driftedResourcesCount: 2,
            });

            mockStackRepository.listResources.mockResolvedValue([
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    status: 'UPDATE_COMPLETE',
                    driftStatus: 'MODIFIED',
                },
                {
                    logicalId: 'MySubnet',
                    physicalId: null,
                    resourceType: 'AWS::EC2::Subnet',
                    status: 'DELETE_COMPLETE',
                    driftStatus: 'DELETED',
                },
            ]);

            // Mock drift for VPC
            mockStackRepository.getResourceDrift.mockResolvedValue({
                driftStatus: 'MODIFIED',
                propertyDifferences: [
                    {
                        propertyPath: 'Properties.EnableDnsSupport',
                        expectedValue: true,
                        actualValue: false,
                        differenceType: 'NOT_EQUAL',
                    },
                ],
            });

            const propertyMismatch = new PropertyMismatch({
                propertyPath: 'Properties.EnableDnsSupport',
                expectedValue: true,
                actualValue: false,
                mutability: PropertyMutability.MUTABLE,
            });

            mockMismatchAnalyzer.analyze.mockReturnValue([propertyMismatch]);

            // Mock orphaned resources
            mockResourceDetector.findOrphanedResources.mockResolvedValue([
                {
                    physicalId: 'my-orphan-cluster',
                    resourceType: 'AWS::RDS::DBCluster',
                    properties: {},
                    tags: [{ Key: 'frigg:stack', Value: 'my-app-prod' }],
                    createdTime: new Date('2024-01-10'),
                },
            ]);

            mockHealthScoreCalculator.calculate.mockReturnValue(new HealthScore(40));

            const report = await useCase.execute({ stackIdentifier });

            expect(report.healthScore.value).toBe(40);
            expect(report.issues.length).toBeGreaterThanOrEqual(3);
            expect(report.getIssueCount()).toBeGreaterThanOrEqual(3);
            expect(report.getCriticalIssueCount()).toBeGreaterThanOrEqual(1);
            expect(report.getDriftedResourceCount()).toBe(1);
            expect(report.getOrphanedResourceCount()).toBe(1);
            expect(report.getMissingResourceCount()).toBe(1);
        });

        it('should throw error if stack does not exist', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'non-existent-stack',
                region: 'us-east-1',
            });

            mockStackRepository.getStack.mockRejectedValue(
                new Error('Stack non-existent-stack does not exist')
            );

            await expect(useCase.execute({ stackIdentifier })).rejects.toThrow(
                'Stack non-existent-stack does not exist'
            );
        });

        it('should include timestamp in report', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
                status: 'UPDATE_COMPLETE',
                createdTime: new Date('2024-01-01'),
            });

            mockStackRepository.detectStackDrift.mockResolvedValue({
                stackDriftStatus: 'IN_SYNC',
                driftedResourcesCount: 0,
            });

            mockStackRepository.listResources.mockResolvedValue([]);
            mockResourceDetector.findOrphanedResources.mockResolvedValue([]);

            mockHealthScoreCalculator.calculate.mockReturnValue(new HealthScore(100));

            const beforeExecution = new Date();
            const report = await useCase.execute({ stackIdentifier });
            const afterExecution = new Date();

            expect(report.timestamp).toBeInstanceOf(Date);
            expect(report.timestamp.getTime()).toBeGreaterThanOrEqual(beforeExecution.getTime());
            expect(report.timestamp.getTime()).toBeLessThanOrEqual(afterExecution.getTime());
        });
    });

    describe('constructor', () => {
        it('should require stackRepository', () => {
            expect(() => {
                new RunHealthCheckUseCase({
                    resourceDetector: mockResourceDetector,
                    mismatchAnalyzer: mockMismatchAnalyzer,
                    healthScoreCalculator: mockHealthScoreCalculator,
                });
            }).toThrow('stackRepository is required');
        });

        it('should require resourceDetector', () => {
            expect(() => {
                new RunHealthCheckUseCase({
                    stackRepository: mockStackRepository,
                    mismatchAnalyzer: mockMismatchAnalyzer,
                    healthScoreCalculator: mockHealthScoreCalculator,
                });
            }).toThrow('resourceDetector is required');
        });

        it('should require mismatchAnalyzer', () => {
            expect(() => {
                new RunHealthCheckUseCase({
                    stackRepository: mockStackRepository,
                    resourceDetector: mockResourceDetector,
                    healthScoreCalculator: mockHealthScoreCalculator,
                });
            }).toThrow('mismatchAnalyzer is required');
        });

        it('should require healthScoreCalculator', () => {
            expect(() => {
                new RunHealthCheckUseCase({
                    stackRepository: mockStackRepository,
                    resourceDetector: mockResourceDetector,
                    mismatchAnalyzer: mockMismatchAnalyzer,
                });
            }).toThrow('healthScoreCalculator is required');
        });
    });
});
