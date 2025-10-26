/**
 * TDD Test for MismatchAnalyzer Method Name Bug
 *
 * Bug: RunHealthCheckUseCase calls this.mismatchAnalyzer.analyzePropertyMismatches()
 * but the actual method is analyze()
 *
 * This test ensures the correct method name is used.
 */

const RunHealthCheckUseCase = require('../run-health-check-use-case');
const StackIdentifier = require('../../../domain/value-objects/stack-identifier');
const MismatchAnalyzer = require('../../../domain/services/mismatch-analyzer');
const HealthScore = require('../../../domain/value-objects/health-score');

describe('MismatchAnalyzer Method Name Bug Fix', () => {
    let useCase;
    let mockStackRepository;
    let mockResourceDetector;
    let mockHealthScoreCalculator;
    let realMismatchAnalyzer;

    beforeEach(() => {
        // Use REAL MismatchAnalyzer to catch method name errors
        realMismatchAnalyzer = new MismatchAnalyzer();

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

        mockHealthScoreCalculator = {
            calculate: jest.fn().mockReturnValue(new HealthScore(100)),
        };

        useCase = new RunHealthCheckUseCase({
            stackRepository: mockStackRepository,
            resourceDetector: mockResourceDetector,
            mismatchAnalyzer: realMismatchAnalyzer, // Use REAL analyzer
            healthScoreCalculator: mockHealthScoreCalculator,
        });
    });

    test('should call MismatchAnalyzer.analyze() method correctly when resource has drifted properties', async () => {
        // Arrange
        const stackIdentifier = new StackIdentifier({
            stackName: 'test-stack',
            region: 'us-east-1',
        });

        // Mock stack with drift
        mockStackRepository.getStack.mockResolvedValue({
            stackName: 'test-stack',
            stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
            status: 'UPDATE_COMPLETE',
        });

        mockStackRepository.detectStackDrift.mockResolvedValue({
            stackDriftStatus: 'DRIFTED',
            driftedResourcesCount: 1,
        });

        // Resource with drift
        mockStackRepository.listResources.mockResolvedValue([
            {
                logicalId: 'MyBucket',
                physicalId: 's3-bucket-123',
                resourceType: 'AWS::S3::Bucket',
                driftStatus: 'MODIFIED',
            },
        ]);

        // Resource drift details
        mockStackRepository.getResourceDrift.mockResolvedValue({
            logicalId: 'MyBucket',
            physicalId: 's3-bucket-123',
            resourceType: 'AWS::S3::Bucket',
            driftStatus: 'MODIFIED',
            propertyDifferences: [
                {
                    propertyPath: 'BucketEncryption.Rules[0].BucketKeyEnabled',
                    expectedValue: true,
                    actualValue: false,
                    differenceType: 'NOT_EQUAL',
                },
            ],
        });

        mockResourceDetector.detectResources.mockResolvedValue([]);
        mockResourceDetector.findOrphanedResources.mockResolvedValue([]);

        // Spy on the MismatchAnalyzer to ensure correct method is called
        const analyzeSpy = jest.spyOn(realMismatchAnalyzer, 'analyze');

        // Act
        // This will FAIL if the use case calls analyzePropertyMismatches() instead of analyze()
        const report = await useCase.execute({ stackIdentifier });

        // Assert
        expect(analyzeSpy).toHaveBeenCalled();
        expect(report).toBeDefined();
        expect(report.getDriftedResourceCount()).toBe(1);
    });

    test('should successfully execute when using correct analyze() method', async () => {
        // Arrange
        const stackIdentifier = new StackIdentifier({
            stackName: 'test-stack',
            region: 'us-east-1',
        });

        mockStackRepository.getStack.mockResolvedValue({
            stackName: 'test-stack',
            stackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
            status: 'UPDATE_COMPLETE',
        });

        mockStackRepository.detectStackDrift.mockResolvedValue({
            stackDriftStatus: 'DRIFTED',
            driftedResourcesCount: 1,
        });

        mockStackRepository.listResources.mockResolvedValue([
            {
                logicalId: 'MyBucket',
                physicalId: 's3-bucket-123',
                resourceType: 'AWS::S3::Bucket',
                driftStatus: 'MODIFIED',
            },
        ]);

        mockStackRepository.getResourceDrift.mockResolvedValue({
            logicalId: 'MyBucket',
            physicalId: 's3-bucket-123',
            resourceType: 'AWS::S3::Bucket',
            driftStatus: 'MODIFIED',
            expectedProperties: { BucketEncryption: { enabled: true } },
            actualProperties: { BucketEncryption: { enabled: false } },
            propertyDifferences: [
                {
                    propertyPath: 'BucketEncryption.enabled',
                    expectedValue: true,
                    actualValue: false,
                    differenceType: 'NOT_EQUAL',
                },
            ],
        });

        mockResourceDetector.detectResources.mockResolvedValue([]);
        mockResourceDetector.findOrphanedResources.mockResolvedValue([]);

        // Act
        // This succeeds because we're using the correct analyze() method
        const report = await useCase.execute({ stackIdentifier });

        // Assert
        expect(report).toBeDefined();
        expect(report.getDriftedResourceCount()).toBe(1);
        expect(report.resources[0].state.value).toBe('DRIFTED');
    });
});
