/**
 * Tests for HealthScoreCalculator Domain Service
 *
 * Updated for percentage-based health scoring (2025-10-26)
 *
 * NEW SYSTEM (Percentage-Based):
 * - Critical issues: up to 50 points (% of total resources)
 * - Functional drift: up to 30 points (% of critical resources)
 * - Infrastructure drift: up to 20 points (% of infra resources)
 * - Example: 16/16 Lambdas drifted = 100% × 30 = 30 penalty → 70/100 ✅
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

    describe('critical issues (orphaned, missing)', () => {
        it('should penalize based on percentage of resources that are orphaned', () => {
            // 10 resources, 1 orphaned = 10% critical impact
            const resources = Array.from({ length: 10 }, (_, i) =>
                new Resource({
                    logicalId: `Resource${i}`,
                    physicalId: `resource-${i}`,
                    resourceType: 'AWS::EC2::VPC',
                    state: ResourceState.IN_STACK,
                })
            );

            const issues = [
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-123',
                    description: 'Orphaned cluster',
                }),
            ];

            const score = calculator.calculate({ resources, issues });
            // Critical impact: 1/10 = 10% → penalty: 10% × 50 = 5
            // Score: 100 - 5 = 95
            expect(score.value).toBe(95);
        });

        it('should penalize based on percentage of resources that are missing', () => {
            // 10 resources, 2 missing = 20% critical impact
            const resources = Array.from({ length: 10 }, (_, i) =>
                new Resource({
                    logicalId: `Resource${i}`,
                    physicalId: `resource-${i}`,
                    resourceType: 'AWS::KMS::Key',
                    state: ResourceState.IN_STACK,
                })
            );

            const issues = [
                Issue.missingResource({
                    resourceType: 'AWS::KMS::Key',
                    resourceId: 'MissingKey1',
                    description: 'Missing key 1',
                }),
                Issue.missingResource({
                    resourceType: 'AWS::KMS::Key',
                    resourceId: 'MissingKey2',
                    description: 'Missing key 2',
                }),
            ];

            const score = calculator.calculate({ resources, issues });
            // Critical impact: 2/10 = 20% → penalty: 20% × 50 = 10
            // Score: 100 - 10 = 90
            expect(score.value).toBe(90);
        });

        it('should apply higher penalties for larger percentages of orphaned resources', () => {
            // 10 resources, 4 orphaned = 40% critical impact
            const resources = Array.from({ length: 10 }, (_, i) =>
                new Resource({
                    logicalId: `Resource${i}`,
                    physicalId: `resource-${i}`,
                    resourceType: 'AWS::RDS::DBCluster',
                    state: ResourceState.IN_STACK,
                })
            );

            const issues = Array.from({ length: 4 }, (_, i) =>
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: `orphan-${i}`,
                    description: `Orphaned cluster ${i}`,
                })
            );

            const score = calculator.calculate({ resources, issues });
            // Critical impact: 4/10 = 40% → penalty: 40% × 50 = 20
            // Score: 100 - 20 = 80
            expect(score.value).toBe(80);
        });
    });

    describe('functional drift (critical resources)', () => {
        it('should penalize drift on Lambda functions', () => {
            // 10 Lambda, 10 VPC; 1 Lambda drifted = 10% functional drift
            const resources = [
                ...Array.from({ length: 10 }, (_, i) =>
                    new Resource({
                        logicalId: `Lambda${i}`,
                        physicalId: `lambda-${i}`,
                        resourceType: 'AWS::Lambda::Function',
                        state: ResourceState.IN_STACK,
                    })
                ),
                ...Array.from({ length: 10 }, (_, i) =>
                    new Resource({
                        logicalId: `VPC${i}`,
                        physicalId: `vpc-${i}`,
                        resourceType: 'AWS::EC2::VPC',
                        state: ResourceState.IN_STACK,
                    })
                ),
            ];

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Environment',
                expectedValue: { VAR: 'expected' },
                actualValue: { VAR: 'actual' },
                mutability: PropertyMutability.MUTABLE,
            });

            const issues = [
                Issue.propertyMismatch({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'lambda-0',
                    mismatch,
                }),
            ];

            const score = calculator.calculate({ resources, issues });
            // Functional drift: 1/10 = 10% → penalty: 10% × 30 = 3
            // Score: 100 - 3 = 97
            expect(score.value).toBe(97);
        });

        it('should count unique drifted resources when multiple properties drifted', () => {
            // 10 Lambda; 1 Lambda with 2 property mismatches = 10% functional drift (not 20%)
            const resources = Array.from({ length: 10 }, (_, i) =>
                new Resource({
                    logicalId: `Lambda${i}`,
                    physicalId: `lambda-${i}`,
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.IN_STACK,
                })
            );

            const mismatch1 = new PropertyMismatch({
                propertyPath: 'Properties.Environment',
                expectedValue: { VAR: 'expected' },
                actualValue: { VAR: 'actual' },
                mutability: PropertyMutability.MUTABLE,
            });

            const mismatch2 = new PropertyMismatch({
                propertyPath: 'Properties.Timeout',
                expectedValue: 30,
                actualValue: 60,
                mutability: PropertyMutability.MUTABLE,
            });

            const issues = [
                Issue.propertyMismatch({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'lambda-0',
                    mismatch: mismatch1,
                }),
                Issue.propertyMismatch({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'lambda-0',
                    mismatch: mismatch2,
                }),
            ];

            const score = calculator.calculate({ resources, issues });
            // Functional drift: 1/10 = 10% (unique resources) → penalty: 10% × 30 = 3
            // Score: 100 - 3 = 97
            expect(score.value).toBe(97);
        });
    });

    describe('infrastructure drift (non-critical resources)', () => {
        it('should penalize drift on VPC/networking resources with lower weight', () => {
            // 10 VPC, 10 Lambda; 5 VPC drifted = 50% infrastructure drift
            const resources = [
                ...Array.from({ length: 10 }, (_, i) =>
                    new Resource({
                        logicalId: `Lambda${i}`,
                        physicalId: `lambda-${i}`,
                        resourceType: 'AWS::Lambda::Function',
                        state: ResourceState.IN_STACK,
                    })
                ),
                ...Array.from({ length: 10 }, (_, i) =>
                    new Resource({
                        logicalId: `VPC${i}`,
                        physicalId: `vpc-${i}`,
                        resourceType: 'AWS::EC2::VPC',
                        state: ResourceState.IN_STACK,
                    })
                ),
            ];

            const issues = Array.from({ length: 5 }, (_, i) => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'Properties.Tags',
                    expectedValue: ['tag1'],
                    actualValue: ['tag2'],
                    mutability: PropertyMutability.MUTABLE,
                });

                return Issue.propertyMismatch({
                    resourceType: 'AWS::EC2::VPC',
                    resourceId: `vpc-${i}`,
                    mismatch,
                });
            });

            const score = calculator.calculate({ resources, issues });
            // Infra drift: 5/10 = 50% → penalty: 50% × 20 = 10
            // Score: 100 - 10 = 90
            expect(score.value).toBe(90);
        });
    });

    describe('mixed issues', () => {
        it('should correctly combine penalties from different categories', () => {
            // 20 resources: 10 Lambda, 10 VPC
            // 1 orphaned, 2 Lambda drifted, 5 VPC drifted
            const resources = [
                ...Array.from({ length: 10 }, (_, i) =>
                    new Resource({
                        logicalId: `Lambda${i}`,
                        physicalId: `lambda-${i}`,
                        resourceType: 'AWS::Lambda::Function',
                        state: ResourceState.IN_STACK,
                    })
                ),
                ...Array.from({ length: 10 }, (_, i) =>
                    new Resource({
                        logicalId: `VPC${i}`,
                        physicalId: `vpc-${i}`,
                        resourceType: 'AWS::EC2::VPC',
                        state: ResourceState.IN_STACK,
                    })
                ),
            ];

            const orphanedIssue = Issue.orphanedResource({
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'orphan-123',
                description: 'Orphaned cluster',
            });

            const lambdaDriftIssues = Array.from({ length: 2 }, (_, i) => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'Properties.Environment',
                    expectedValue: { VAR: 'expected' },
                    actualValue: { VAR: 'actual' },
                    mutability: PropertyMutability.MUTABLE,
                });

                return Issue.propertyMismatch({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: `lambda-${i}`,
                    mismatch,
                });
            });

            const vpcDriftIssues = Array.from({ length: 5 }, (_, i) => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'Properties.Tags',
                    expectedValue: ['tag1'],
                    actualValue: ['tag2'],
                    mutability: PropertyMutability.MUTABLE,
                });

                return Issue.propertyMismatch({
                    resourceType: 'AWS::EC2::VPC',
                    resourceId: `vpc-${i}`,
                    mismatch,
                });
            });

            const issues = [orphanedIssue, ...lambdaDriftIssues, ...vpcDriftIssues];

            const score = calculator.calculate({ resources, issues });
            // Critical impact: 1/20 = 5% → penalty: 5% × 50 = 2.5
            // Functional drift: 2/10 = 20% → penalty: 20% × 30 = 6
            // Infra drift: 5/10 = 50% → penalty: 50% × 20 = 10
            // Total: 2.5 + 6 + 10 = 18.5 → Score: 100 - 19 = 81 (rounded)
            expect(score.value).toBeGreaterThanOrEqual(81);
            expect(score.value).toBeLessThanOrEqual(82);
        });
    });

    describe('minimum score (0)', () => {
        it('should not go below 0', () => {
            // 2 resources, 10 critical issues = 500% critical impact (capped at 100%)
            const resources = [
                new Resource({
                    logicalId: 'Resource1',
                    physicalId: 'resource-1',
                    resourceType: 'AWS::RDS::DBCluster',
                    state: ResourceState.IN_STACK,
                }),
                new Resource({
                    logicalId: 'Resource2',
                    physicalId: 'resource-2',
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.IN_STACK,
                }),
            ];

            const issues = Array.from({ length: 10 }, (_, i) =>
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: `orphan-${i}`,
                    description: `Orphaned cluster ${i}`,
                })
            );

            const score = calculator.calculate({ resources, issues });
            // Critical impact: 10/2 = 500% (but max penalty is 50)
            // Penalty: min(500% × 50, 50) = 50
            // Score: max(0, 100 - 50) = 50
            // But with such extreme issues, score should be very low
            expect(score.value).toBeGreaterThanOrEqual(0);
            expect(score.value).toBeLessThanOrEqual(50);
        });
    });

    describe('penalty configuration', () => {
        it('should use custom max penalty configuration', () => {
            const customCalculator = new HealthScoreCalculator({
                maxPenalties: {
                    criticalIssues: 40, // Custom: 40 instead of default 50
                    functionalDrift: 35, // Custom: 35 instead of default 30
                    infrastructureDrift: 25, // Custom: 25 instead of default 20
                },
            });

            // 10 resources, 5 orphaned = 50% critical impact
            const resources = Array.from({ length: 10 }, (_, i) =>
                new Resource({
                    logicalId: `Resource${i}`,
                    physicalId: `resource-${i}`,
                    resourceType: 'AWS::RDS::DBCluster',
                    state: ResourceState.IN_STACK,
                })
            );

            const issues = Array.from({ length: 5 }, (_, i) =>
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: `orphan-${i}`,
                    description: `Orphaned cluster ${i}`,
                })
            );

            const score = customCalculator.calculate({ resources, issues });
            // Critical impact: 5/10 = 50% → penalty: 50% × 40 (custom) = 20
            // Score: 100 - 20 = 80
            expect(score.value).toBe(80);
        });
    });

    describe('explainScore', () => {
        it('should explain score with percentage-based breakdown', () => {
            // 20 resources: 10 Lambda, 10 VPC
            // 1 orphaned, 2 Lambda drifted, 5 VPC drifted
            const resources = [
                ...Array.from({ length: 10 }, (_, i) =>
                    new Resource({
                        logicalId: `Lambda${i}`,
                        physicalId: `lambda-${i}`,
                        resourceType: 'AWS::Lambda::Function',
                        state: ResourceState.IN_STACK,
                    })
                ),
                ...Array.from({ length: 10 }, (_, i) =>
                    new Resource({
                        logicalId: `VPC${i}`,
                        physicalId: `vpc-${i}`,
                        resourceType: 'AWS::EC2::VPC',
                        state: ResourceState.IN_STACK,
                    })
                ),
            ];

            const orphanedIssue = Issue.orphanedResource({
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'orphan-123',
                description: 'Orphaned cluster',
            });

            const lambdaDriftIssues = Array.from({ length: 2 }, (_, i) => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'Properties.Environment',
                    expectedValue: { VAR: 'expected' },
                    actualValue: { VAR: 'actual' },
                    mutability: PropertyMutability.MUTABLE,
                });

                return Issue.propertyMismatch({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: `lambda-${i}`,
                    mismatch,
                });
            });

            const vpcDriftIssues = Array.from({ length: 5 }, (_, i) => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'Properties.Tags',
                    expectedValue: ['tag1'],
                    actualValue: ['tag2'],
                    mutability: PropertyMutability.MUTABLE,
                });

                return Issue.propertyMismatch({
                    resourceType: 'AWS::EC2::VPC',
                    resourceId: `vpc-${i}`,
                    mismatch,
                });
            });

            const issues = [orphanedIssue, ...lambdaDriftIssues, ...vpcDriftIssues];

            const explanation = calculator.explainScore({ resources, issues });

            expect(explanation.startingScore).toBe(100);
            expect(explanation.finalScore).toBeGreaterThanOrEqual(81);
            expect(explanation.finalScore).toBeLessThanOrEqual(82);
            expect(explanation.breakdown).toHaveProperty('criticalIssues');
            expect(explanation.breakdown).toHaveProperty('functionalDrift');
            expect(explanation.breakdown).toHaveProperty('infrastructureDrift');
            expect(explanation.breakdown.criticalIssues.count).toBe(1);
            expect(explanation.breakdown.functionalDrift.count).toBe(2);
            expect(explanation.breakdown.infrastructureDrift.count).toBe(5);
            expect(explanation.resourceCounts).toEqual({
                total: 20,
                critical: 10,
                infrastructure: 10,
            });
        });

        it('should explain perfect score', () => {
            const explanation = calculator.explainScore({ resources: [], issues: [] });

            expect(explanation).toEqual({
                finalScore: 100,
                startingScore: 100,
                totalPenalty: 0,
                breakdown: {
                    criticalIssues: { count: 0, impactPercent: 0, penalty: 0 },
                    functionalDrift: { count: 0, impactPercent: 0, penalty: 0 },
                    infrastructureDrift: { count: 0, impactPercent: 0, penalty: 0 },
                },
            });
        });
    });
});
