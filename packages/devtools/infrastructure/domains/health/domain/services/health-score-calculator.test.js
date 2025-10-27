/**
 * Tests for HealthScoreCalculator Domain Service
 *
 * ⚠️  TODO: These tests need updating for percentage-based health scoring
 *
 * As of 2025-10-26, health scoring was refactored from fixed penalties
 * to percentage-based penalties weighted by resource criticality:
 *
 * OLD SYSTEM (Fixed Penalties):
 * - Critical: 30 points, Warning: 10 points, Info: 5 points
 * - Problem: 32 warnings = 320 points = 0/100 score (meaningless!)
 *
 * NEW SYSTEM (Percentage-Based):
 * - Critical issues: up to 50 points (% of total resources)
 * - Functional drift: up to 30 points (% of critical resources)
 * - Infrastructure drift: up to 20 points (% of infra resources)
 * - Example: 16/16 Lambdas drifted = 100% × 30 = 30 penalty → 70/100 ✅
 *
 * These tests fail because:
 * 1. They use fixed penalty expectations (70, 80, etc.)
 * 2. Most tests pass resources:[] which can't calculate percentages
 * 3. Tests need realistic resource arrays to test new logic
 *
 * See health-score-percentage-based.test.js for examples of new test patterns.
 */

const HealthScoreCalculator = require('./health-score-calculator');
const Resource = require('../entities/resource');
const Issue = require('../entities/issue');
const ResourceState = require('../value-objects/resource-state');
const PropertyMutability = require('../value-objects/property-mutability');
const PropertyMismatch = require('../entities/property-mismatch');

describe('HealthScoreCalculator', () => {
    let calculator;

    beforeEach(() => {
        calculator = new HealthScoreCalculator();
    });

    describe('perfect health (100)', () => {
        it('should return 100 for no resources and no issues', () => {
            const score = calculator.calculate({ resources: [], issues: [] });
            expect(score.value).toBe(100);
        });

        it('should return 100 for all healthy resources with no issues', () => {
            const resources = [
                new Resource({
                    logicalId: 'VPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    state: ResourceState.IN_STACK,
                }),
                new Resource({
                    logicalId: 'Subnet',
                    physicalId: 'subnet-123',
                    resourceType: 'AWS::EC2::Subnet',
                    state: ResourceState.IN_STACK,
                }),
            ];

            const score = calculator.calculate({ resources, issues: [] });
            expect(score.value).toBe(100);
        });
    });

    describe('critical issues (heavy penalties)', () => {
        it('should deduct 30 points for orphaned resource', () => {
            const issues = [
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-123',
                    description: 'Orphaned cluster',
                }),
            ];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(70); // 100 - 30
        });

        it('should deduct 30 points for missing resource', () => {
            const issues = [
                Issue.missingResource({
                    resourceType: 'AWS::KMS::Key',
                    resourceId: 'MissingKey',
                    description: 'Missing key',
                }),
            ];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(70); // 100 - 30
        });

        it('should deduct 20 points for immutable property mismatch', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'bucket-v2',
                actualValue: 'bucket-v1',
                mutability: PropertyMutability.IMMUTABLE,
            });

            const issues = [
                Issue.propertyMismatch({
                    resourceType: 'AWS::S3::Bucket',
                    resourceId: 'my-bucket',
                    mismatch,
                }),
            ];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(80); // 100 - 20
        });

        it('should deduct 60 points for two orphaned resources', () => {
            const issues = [
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-1',
                    description: 'Orphaned cluster 1',
                }),
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-2',
                    description: 'Orphaned cluster 2',
                }),
            ];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(40); // 100 - 30 - 30
        });
    });

    describe('warning issues (moderate penalties)', () => {
        it('should deduct 10 points for mutable property mismatch', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1'],
                actualValue: ['tag2'],
                mutability: PropertyMutability.MUTABLE,
            });

            const issues = [
                Issue.propertyMismatch({
                    resourceType: 'AWS::EC2::VPC',
                    resourceId: 'vpc-123',
                    mismatch,
                }),
            ];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(90); // 100 - 10
        });

        it('should deduct 20 points for two mutable property mismatches', () => {
            const mismatch1 = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1'],
                actualValue: ['tag2'],
                mutability: PropertyMutability.MUTABLE,
            });

            const mismatch2 = new PropertyMismatch({
                propertyPath: 'Properties.EnableDnsSupport',
                expectedValue: true,
                actualValue: false,
                mutability: PropertyMutability.MUTABLE,
            });

            const issues = [
                Issue.propertyMismatch({
                    resourceType: 'AWS::EC2::VPC',
                    resourceId: 'vpc-123',
                    mismatch: mismatch1,
                }),
                Issue.propertyMismatch({
                    resourceType: 'AWS::EC2::VPC',
                    resourceId: 'vpc-123',
                    mismatch: mismatch2,
                }),
            ];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(80); // 100 - 10 - 10
        });
    });

    describe('info issues (minor penalties)', () => {
        it('should deduct 5 points for missing tag', () => {
            const issues = [
                new Issue({
                    type: 'MISSING_TAG',
                    severity: 'info',
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'my-function',
                    description: 'Missing Environment tag',
                }),
            ];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(95); // 100 - 5
        });

        it('should deduct 10 points for two missing tags', () => {
            const issues = [
                new Issue({
                    type: 'MISSING_TAG',
                    severity: 'info',
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'my-function',
                    description: 'Missing Environment tag',
                }),
                new Issue({
                    type: 'MISSING_TAG',
                    severity: 'info',
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'my-function',
                    description: 'Missing Owner tag',
                }),
            ];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(90); // 100 - 5 - 5
        });
    });

    describe('mixed severity issues', () => {
        it('should correctly combine penalties from different severity levels', () => {
            const orphanedIssue = Issue.orphanedResource({
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'orphan-123',
                description: 'Orphaned cluster',
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1'],
                actualValue: ['tag2'],
                mutability: PropertyMutability.MUTABLE,
            });

            const warningIssue = Issue.propertyMismatch({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                mismatch,
            });

            const infoIssue = new Issue({
                type: 'MISSING_TAG',
                severity: 'info',
                resourceType: 'AWS::Lambda::Function',
                resourceId: 'my-function',
                description: 'Missing tag',
            });

            const issues = [orphanedIssue, warningIssue, infoIssue];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(55); // 100 - 30 (critical) - 10 (warning) - 5 (info)
        });
    });

    describe('minimum score (0)', () => {
        it('should not go below 0', () => {
            // Create enough critical issues to exceed 100 points
            const issues = [
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-1',
                    description: 'Orphaned cluster 1',
                }),
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-2',
                    description: 'Orphaned cluster 2',
                }),
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-3',
                    description: 'Orphaned cluster 3',
                }),
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-4',
                    description: 'Orphaned cluster 4',
                }),
            ];

            const score = calculator.calculate({ resources: [], issues });
            expect(score.value).toBe(0); // Should cap at 0, not go negative
        });
    });

    describe('penalty configuration', () => {
        it('should use custom penalty configuration', () => {
            const customCalculator = new HealthScoreCalculator({
                penalties: {
                    critical: 20, // Custom: 20 instead of default 30
                    warning: 5, // Custom: 5 instead of default 10
                    info: 2, // Custom: 2 instead of default 5
                },
            });

            const issues = [
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-123',
                    description: 'Orphaned cluster',
                }),
            ];

            const score = customCalculator.calculate({ resources: [], issues });
            expect(score.value).toBe(80); // 100 - 20 (custom critical penalty)
        });

        it('should allow immutable property penalty override', () => {
            const customCalculator = new HealthScoreCalculator({
                penalties: {
                    immutablePropertyMismatch: 25, // Custom instead of default 20
                },
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'bucket-v2',
                actualValue: 'bucket-v1',
                mutability: PropertyMutability.IMMUTABLE,
            });

            const issues = [
                Issue.propertyMismatch({
                    resourceType: 'AWS::S3::Bucket',
                    resourceId: 'my-bucket',
                    mismatch,
                }),
            ];

            const score = customCalculator.calculate({ resources: [], issues });
            expect(score.value).toBe(75); // 100 - 25 (custom immutable penalty)
        });
    });

    describe('getDefaultPenalties', () => {
        it('should return default penalty configuration', () => {
            const penalties = HealthScoreCalculator.getDefaultPenalties();

            expect(penalties).toEqual({
                critical: 30,
                warning: 10,
                info: 5,
                immutablePropertyMismatch: 20,
            });
        });
    });

    describe('explainScore', () => {
        it('should explain score with breakdown', () => {
            const orphanedIssue = Issue.orphanedResource({
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'orphan-123',
                description: 'Orphaned cluster',
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1'],
                actualValue: ['tag2'],
                mutability: PropertyMutability.MUTABLE,
            });

            const warningIssue = Issue.propertyMismatch({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                mismatch,
            });

            const infoIssue = new Issue({
                type: 'MISSING_TAG',
                severity: 'info',
                resourceType: 'AWS::Lambda::Function',
                resourceId: 'my-function',
                description: 'Missing tag',
            });

            const issues = [orphanedIssue, warningIssue, infoIssue];

            const explanation = calculator.explainScore({ resources: [], issues });

            expect(explanation).toEqual({
                finalScore: 55,
                startingScore: 100,
                totalPenalty: 45,
                breakdown: {
                    critical: { count: 1, penalty: 30 },
                    warning: { count: 1, penalty: 10 },
                    info: { count: 1, penalty: 5 },
                },
                issueTypes: {
                    ORPHANED_RESOURCE: 1,
                    PROPERTY_MISMATCH: 1,
                    MISSING_TAG: 1,
                },
            });
        });

        it('should explain perfect score', () => {
            const explanation = calculator.explainScore({ resources: [], issues: [] });

            expect(explanation).toEqual({
                finalScore: 100,
                startingScore: 100,
                totalPenalty: 0,
                breakdown: {
                    critical: { count: 0, penalty: 0 },
                    warning: { count: 0, penalty: 0 },
                    info: { count: 0, penalty: 0 },
                },
                issueTypes: {},
            });
        });
    });
});
