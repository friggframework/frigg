/**
 * TDD Test for Percentage-Based Health Score Calculation
 *
 * PROBLEM: Current health score uses fixed penalties per issue:
 * - Critical: 30 points
 * - Warning: 10 points
 * - Info: 5 points
 *
 * This causes misleading scores. Example from quo-integrations-dev:
 * - 111 total resources
 * - 16 Lambda functions with VPC config drift (32 warnings × 10 = 320 points)
 * - Score: 0/100 (meaningless!)
 *
 * The 16 Lambdas with VPC drift are concerning but not catastrophic.
 * VPC config drift on ALL Lambdas should score ~70/100, not 0/100.
 *
 * SOLUTION: Percentage-based scoring with resource criticality weighting:
 *
 * 1. Categorize resources by criticality:
 *    - Critical: Lambda, RDS, DynamoDB (affect application functionality)
 *    - Infrastructure: VPC, Subnet, SecurityGroup, KMS, etc.
 *
 * 2. Calculate impact percentages:
 *    - Critical impact % = critical issues / total resources
 *    - Functional drift % = functional drift / critical resources
 *    - Infra drift % = infra drift / infrastructure resources
 *
 * 3. Weighted penalties (max 100 points):
 *    - Critical issues: up to 50 points (orphaned, missing resources)
 *    - Functional drift: up to 30 points (drift on Lambda/RDS/DynamoDB)
 *    - Infrastructure drift: up to 20 points (drift on VPC/networking/KMS)
 *
 * EXAMPLES:
 *
 * Example 1: quo-integrations-dev
 * - 111 resources (16 Lambda, 95 infrastructure)
 * - 0 critical issues
 * - 16 Lambdas with VPC drift = 100% functional drift
 * - Penalty: (100% × 30) = 30 points
 * - Score: 70/100 ✅ (was 0/100)
 *
 * Example 2: Stack with orphaned resources
 * - 50 resources
 * - 2 orphaned VPCs = 4% critical impact
 * - Penalty: (4% × 50) = 2 points
 * - Score: 98/100 ✅
 *
 * Example 3: Stack with missing Lambda
 * - 10 resources (5 Lambda, 5 infrastructure)
 * - 1 missing Lambda = 10% critical impact
 * - Penalty: (10% × 50) = 5 points
 * - Score: 95/100 ✅
 *
 * Example 4: Complete disaster
 * - 20 resources (10 Lambda, 10 infrastructure)
 * - 5 missing Lambdas = 25% critical impact
 * - 5 Lambdas drifted = 50% functional drift
 * - 10 infrastructure drifted = 100% infra drift
 * - Penalty: (25% × 50) + (50% × 30) + (100% × 20) = 12.5 + 15 + 20 = 47.5
 * - Score: 52.5/100 ✅ (reflects severity)
 */

const HealthScoreCalculator = require('../health-score-calculator');
const HealthScore = require('../../value-objects/health-score');
const Issue = require('../../entities/issue');
const Resource = require('../../entities/resource');
const ResourceState = require('../../value-objects/resource-state');
const PropertyMismatch = require('../../entities/property-mismatch');
const PropertyMutability = require('../../value-objects/property-mutability');

describe('Percentage-Based Health Score Calculation (TDD)', () => {
    let calculator;

    beforeEach(() => {
        calculator = new HealthScoreCalculator();
    });

    describe('Real-world scenario: quo-integrations-dev VPC drift', () => {
        test('should score 70/100 for VPC config drift on all Lambdas (not 0/100)', () => {
            // 111 resources: 16 Lambda functions, 95 infrastructure
            const resources = [
                // 16 Lambda functions with VPC drift
                ...Array.from({ length: 16 }, (_, i) => ({
                    logicalId: `Lambda${i}`,
                    physicalId: `lambda-${i}`,
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.DRIFTED,
                })),
                // 95 infrastructure resources (in sync)
                ...Array.from({ length: 95 }, (_, i) => ({
                    logicalId: `Infra${i}`,
                    physicalId: `infra-${i}`,
                    resourceType: 'AWS::EC2::SecurityGroup',
                    state: ResourceState.IN_STACK,
                })),
            ].map((r) => new Resource(r));

            // 32 warnings: 2 per Lambda (SecurityGroupIds + SubnetIds drift)
            const issues = Array.from({ length: 32 }, (_, i) => {
                const lambdaIndex = Math.floor(i / 2);
                const property = i % 2 === 0 ? 'VpcConfig.SecurityGroupIds' : 'VpcConfig.SubnetIds';

                return Issue.propertyMismatch({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: `lambda-${lambdaIndex}`,
                    mismatch: new PropertyMismatch({
                        propertyPath: property,
                        expectedValue: 'expected',
                        actualValue: 'actual',
                        mutability: PropertyMutability.MUTABLE,
                    }),
                });
            });

            // Act
            const score = calculator.calculate({ resources, issues });

            // Assert
            // Functional drift: 16/16 = 100% of critical resources drifted
            // Penalty: 100% × 30 = 30 points
            // Score: 100 - 30 = 70
            expect(score.value).toBe(70);
            expect(score.isHealthy()).toBe(false); // Below 80 threshold
            expect(score.isDegraded()).toBe(true); // 40-79 is degraded
        });
    });

    describe('Critical issues (orphaned, missing resources)', () => {
        test('should apply minimal penalty for small percentage of orphaned resources', () => {
            // 50 resources, 2 orphaned VPCs
            const resources = [
                ...Array.from({ length: 48 }, (_, i) => ({
                    logicalId: `Resource${i}`,
                    physicalId: `resource-${i}`,
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.IN_STACK,
                })),
                new Resource({
                    logicalId: null,
                    physicalId: 'vpc-orphan-1',
                    resourceType: 'AWS::EC2::VPC',
                    state: ResourceState.ORPHANED,
                }),
                new Resource({
                    logicalId: null,
                    physicalId: 'vpc-orphan-2',
                    resourceType: 'AWS::EC2::VPC',
                    state: ResourceState.ORPHANED,
                }),
            ];

            const issues = [
                Issue.orphanedResource({
                    resourceType: 'AWS::EC2::VPC',
                    resourceId: 'vpc-orphan-1',
                    description: 'Orphaned VPC',
                }),
                Issue.orphanedResource({
                    resourceType: 'AWS::EC2::VPC',
                    resourceId: 'vpc-orphan-2',
                    description: 'Orphaned VPC',
                }),
            ];

            const score = calculator.calculate({ resources, issues });

            // Critical impact: 2/50 = 4%
            // Penalty: 4% × 50 = 2 points
            // Score: 100 - 2 = 98
            expect(score.value).toBe(98);
            expect(score.isHealthy()).toBe(true);
        });

        test('should apply significant penalty for high percentage of missing critical resources', () => {
            // 10 resources: 5 Lambda, 5 infrastructure
            // 2 Lambdas missing
            const resources = [
                ...Array.from({ length: 3 }, (_, i) => ({
                    logicalId: `Lambda${i}`,
                    physicalId: `lambda-${i}`,
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.IN_STACK,
                })),
                ...Array.from({ length: 2 }, (_, i) => ({
                    logicalId: `MissingLambda${i}`,
                    physicalId: `missing-MissingLambda${i}`,
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.MISSING,
                })),
                ...Array.from({ length: 5 }, (_, i) => ({
                    logicalId: `Infra${i}`,
                    physicalId: `infra-${i}`,
                    resourceType: 'AWS::EC2::VPC',
                    state: ResourceState.IN_STACK,
                })),
            ].map((r) => new Resource(r));

            const issues = [
                Issue.missingResource({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'MissingLambda0',
                    description: 'Lambda function missing',
                }),
                Issue.missingResource({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'MissingLambda1',
                    description: 'Lambda function missing',
                }),
            ];

            const score = calculator.calculate({ resources, issues });

            // Critical impact: 2/10 = 20%
            // Penalty: 20% × 50 = 10 points
            // Score: 100 - 10 = 90
            expect(score.value).toBe(90);
            expect(score.isHealthy()).toBe(true);
        });
    });

    describe('Functional drift (Lambda, RDS, DynamoDB)', () => {
        test('should weight functional drift higher than infrastructure drift', () => {
            // 20 resources: 10 Lambda, 10 VPC
            // 5 Lambdas drifted, 10 VPCs drifted
            const resources = [
                ...Array.from({ length: 5 }, (_, i) => ({
                    logicalId: `DriftedLambda${i}`,
                    physicalId: `lambda-${i}`,
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.DRIFTED,
                })),
                ...Array.from({ length: 5 }, (_, i) => ({
                    logicalId: `GoodLambda${i}`,
                    physicalId: `lambda-good-${i}`,
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.IN_STACK,
                })),
                ...Array.from({ length: 10 }, (_, i) => ({
                    logicalId: `DriftedVPC${i}`,
                    physicalId: `vpc-${i}`,
                    resourceType: 'AWS::EC2::VPC',
                    state: ResourceState.DRIFTED,
                })),
            ].map((r) => new Resource(r));

            const issues = [
                ...Array.from({ length: 5 }, (_, i) =>
                    Issue.propertyMismatch({
                        resourceType: 'AWS::Lambda::Function',
                        resourceId: `lambda-${i}`,
                        mismatch: new PropertyMismatch({
                            propertyPath: 'Environment',
                            expectedValue: 'expected',
                            actualValue: 'actual',
                            mutability: PropertyMutability.MUTABLE,
                        }),
                    })
                ),
                ...Array.from({ length: 10 }, (_, i) =>
                    Issue.propertyMismatch({
                        resourceType: 'AWS::EC2::VPC',
                        resourceId: `vpc-${i}`,
                        mismatch: new PropertyMismatch({
                            propertyPath: 'Tags',
                            expectedValue: 'expected',
                            actualValue: 'actual',
                            mutability: PropertyMutability.MUTABLE,
                        }),
                    })
                ),
            ];

            const score = calculator.calculate({ resources, issues });

            // Functional drift: 5/10 = 50% → penalty: 50% × 30 = 15 points
            // Infra drift: 10/10 = 100% → penalty: 100% × 20 = 20 points
            // Total penalty: 15 + 20 = 35 points
            // Score: 100 - 35 = 65
            expect(score.value).toBe(65);
            expect(score.isHealthy()).toBe(false); // Below 80 threshold
            expect(score.isDegraded()).toBe(true); // 40-79 is degraded
        });
    });

    describe('Complete disaster scenario', () => {
        test('should reflect severity when everything is broken', () => {
            // 20 resources: 10 Lambda, 10 infrastructure
            // 5 Lambdas missing, 5 Lambdas drifted, 10 infrastructure drifted
            const resources = [
                ...Array.from({ length: 5 }, (_, i) => ({
                    logicalId: `MissingLambda${i}`,
                    physicalId: `missing-MissingLambda${i}`,
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.MISSING,
                })),
                ...Array.from({ length: 5 }, (_, i) => ({
                    logicalId: `DriftedLambda${i}`,
                    physicalId: `lambda-${i}`,
                    resourceType: 'AWS::Lambda::Function',
                    state: ResourceState.DRIFTED,
                })),
                ...Array.from({ length: 10 }, (_, i) => ({
                    logicalId: `DriftedVPC${i}`,
                    physicalId: `vpc-${i}`,
                    resourceType: 'AWS::EC2::VPC',
                    state: ResourceState.DRIFTED,
                })),
            ].map((r) => new Resource(r));

            const issues = [
                ...Array.from({ length: 5 }, (_, i) =>
                    Issue.missingResource({
                        resourceType: 'AWS::Lambda::Function',
                        resourceId: `MissingLambda${i}`,
                        description: 'Missing Lambda',
                    })
                ),
                ...Array.from({ length: 5 }, (_, i) =>
                    Issue.propertyMismatch({
                        resourceType: 'AWS::Lambda::Function',
                        resourceId: `lambda-${i}`,
                        mismatch: new PropertyMismatch({
                            propertyPath: 'Environment',
                            expectedValue: 'expected',
                            actualValue: 'actual',
                            mutability: PropertyMutability.MUTABLE,
                        }),
                    })
                ),
                ...Array.from({ length: 10 }, (_, i) =>
                    Issue.propertyMismatch({
                        resourceType: 'AWS::EC2::VPC',
                        resourceId: `vpc-${i}`,
                        mismatch: new PropertyMismatch({
                            propertyPath: 'Tags',
                            expectedValue: 'expected',
                            actualValue: 'actual',
                            mutability: PropertyMutability.MUTABLE,
                        }),
                    })
                ),
            ];

            const score = calculator.calculate({ resources, issues });

            // Critical impact: 5/20 = 25% → penalty: 25% × 50 = 12.5 points
            // Functional drift: 5/10 = 50% → penalty: 50% × 30 = 15 points
            // Infra drift: 10/10 = 100% → penalty: 100% × 20 = 20 points
            // Total penalty: 12.5 + 15 + 20 = 47.5 points
            // Score: 100 - 47.5 = 52.5 (rounded to 53)
            expect(score.value).toBeGreaterThanOrEqual(52);
            expect(score.value).toBeLessThanOrEqual(53);
            expect(score.isHealthy()).toBe(false); // Below 80 threshold
            expect(score.isDegraded()).toBe(true); // 40-79 is degraded
        });
    });

    describe('Edge cases', () => {
        test('should handle stack with no resources gracefully', () => {
            const score = calculator.calculate({ resources: [], issues: [] });

            // No resources, no issues = perfect score
            expect(score.value).toBe(100);
        });

        test('should handle stack with no issues', () => {
            const resources = Array.from({ length: 10 }, (_, i) => ({
                logicalId: `Resource${i}`,
                physicalId: `resource-${i}`,
                resourceType: 'AWS::Lambda::Function',
                state: ResourceState.IN_STACK,
            })).map((r) => new Resource(r));

            const score = calculator.calculate({ resources, issues: [] });

            // No issues = perfect score
            expect(score.value).toBe(100);
        });
    });
});
