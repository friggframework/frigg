/**
 * Tests for StackHealthReport Aggregate Root
 */

const StackHealthReport = require('./stack-health-report');
const StackIdentifier = require('../value-objects/stack-identifier');
const HealthScore = require('../value-objects/health-score');
const ResourceState = require('../value-objects/resource-state');
const PropertyMutability = require('../value-objects/property-mutability');
const Resource = require('./resource');
const Issue = require('./issue');
const PropertyMismatch = require('./property-mismatch');

describe('StackHealthReport', () => {
    describe('constructor', () => {
        it('should create a health report with all fields', () => {
            const stackId = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            const healthScore = new HealthScore(85);
            const timestamp = new Date('2024-01-15T10:30:00Z');

            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            const report = new StackHealthReport({
                stackIdentifier: stackId,
                healthScore,
                resources: [resource],
                issues: [],
                timestamp,
                metadata: { scanDuration: 5000 },
            });

            expect(report.stackIdentifier).toBe(stackId);
            expect(report.healthScore).toBe(healthScore);
            expect(report.resources).toHaveLength(1);
            expect(report.resources[0]).toBe(resource);
            expect(report.issues).toEqual([]);
            expect(report.timestamp).toBe(timestamp);
            expect(report.metadata.scanDuration).toBe(5000);
        });

        it('should require stackIdentifier', () => {
            expect(() => {
                new StackHealthReport({
                    healthScore: new HealthScore(100),
                });
            }).toThrow('stackIdentifier is required');
        });

        it('should require healthScore', () => {
            expect(() => {
                new StackHealthReport({
                    stackIdentifier: new StackIdentifier({
                        stackName: 'test',
                        region: 'us-east-1',
                    }),
                });
            }).toThrow('healthScore is required');
        });

        it('should validate stackIdentifier is StackIdentifier instance', () => {
            expect(() => {
                new StackHealthReport({
                    stackIdentifier: { stackName: 'test', region: 'us-east-1' },
                    healthScore: new HealthScore(100),
                });
            }).toThrow('stackIdentifier must be a StackIdentifier instance');
        });

        it('should validate healthScore is HealthScore instance', () => {
            expect(() => {
                new StackHealthReport({
                    stackIdentifier: new StackIdentifier({
                        stackName: 'test',
                        region: 'us-east-1',
                    }),
                    healthScore: 85,
                });
            }).toThrow('healthScore must be a HealthScore instance');
        });

        it('should validate resources array contains only Resource instances', () => {
            expect(() => {
                new StackHealthReport({
                    stackIdentifier: new StackIdentifier({
                        stackName: 'test',
                        region: 'us-east-1',
                    }),
                    healthScore: new HealthScore(100),
                    resources: [{ logicalId: 'test', physicalId: 'test' }],
                });
            }).toThrow('All resources must be Resource instances');
        });

        it('should validate issues array contains only Issue instances', () => {
            expect(() => {
                new StackHealthReport({
                    stackIdentifier: new StackIdentifier({
                        stackName: 'test',
                        region: 'us-east-1',
                    }),
                    healthScore: new HealthScore(100),
                    issues: [{ type: 'ORPHANED_RESOURCE', severity: 'critical' }],
                });
            }).toThrow('All issues must be Issue instances');
        });

        it('should default resources to empty array', () => {
            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(100),
            });

            expect(report.resources).toEqual([]);
        });

        it('should default issues to empty array', () => {
            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(100),
            });

            expect(report.issues).toEqual([]);
        });

        it('should default timestamp to current date', () => {
            const before = new Date();
            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(100),
            });
            const after = new Date();

            expect(report.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(report.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
        });

        it('should default metadata to empty object', () => {
            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(100),
            });

            expect(report.metadata).toEqual({});
        });
    });

    describe('resource queries', () => {
        let report;
        let orphanedResource;
        let missingResource;
        let driftedResource;
        let healthyResource;

        beforeEach(() => {
            orphanedResource = new Resource({
                logicalId: null,
                physicalId: 'orphan-123',
                resourceType: 'AWS::RDS::DBCluster',
                state: ResourceState.ORPHANED,
            });

            missingResource = new Resource({
                logicalId: 'MissingKey',
                physicalId: 'key-missing',
                resourceType: 'AWS::KMS::Key',
                state: ResourceState.MISSING,
            });

            driftedResource = new Resource({
                logicalId: 'DriftedVPC',
                physicalId: 'vpc-drift',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.DRIFTED,
            });

            healthyResource = new Resource({
                logicalId: 'HealthyVPC',
                physicalId: 'vpc-healthy',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(70),
                resources: [orphanedResource, missingResource, driftedResource, healthyResource],
            });
        });

        it('should get orphaned resources', () => {
            const orphaned = report.getOrphanedResources();
            expect(orphaned).toHaveLength(1);
            expect(orphaned[0]).toBe(orphanedResource);
        });

        it('should get missing resources', () => {
            const missing = report.getMissingResources();
            expect(missing).toHaveLength(1);
            expect(missing[0]).toBe(missingResource);
        });

        it('should get drifted resources', () => {
            const drifted = report.getDriftedResources();
            expect(drifted).toHaveLength(1);
            expect(drifted[0]).toBe(driftedResource);
        });

        it('should get healthy resources', () => {
            const healthy = report.getHealthyResources();
            expect(healthy).toHaveLength(1);
            expect(healthy[0]).toBe(healthyResource);
        });

        it('should get resources in stack', () => {
            const inStack = report.getResourcesInStack();
            expect(inStack).toHaveLength(1);
            expect(inStack[0]).toBe(healthyResource);
        });

        it('should get resource count', () => {
            expect(report.getResourceCount()).toBe(4);
        });

        it('should get resource count by state', () => {
            expect(report.getOrphanedResourceCount()).toBe(1);
            expect(report.getMissingResourceCount()).toBe(1);
            expect(report.getDriftedResourceCount()).toBe(1);
        });
    });

    describe('issue queries', () => {
        let report;
        let criticalIssue1;
        let criticalIssue2;
        let warningIssue;
        let infoIssue;

        beforeEach(() => {
            criticalIssue1 = Issue.orphanedResource({
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'orphan-123',
                description: 'Orphaned cluster',
            });

            criticalIssue2 = Issue.missingResource({
                resourceType: 'AWS::KMS::Key',
                resourceId: 'MissingKey',
                description: 'Missing key',
            });

            warningIssue = new Issue({
                type: 'PROPERTY_MISMATCH',
                severity: 'warning',
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Property mismatch',
            });

            infoIssue = new Issue({
                type: 'MISSING_TAG',
                severity: 'info',
                resourceType: 'AWS::Lambda::Function',
                resourceId: 'my-function',
                description: 'Missing tag',
            });

            report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(60),
                issues: [criticalIssue1, criticalIssue2, warningIssue, infoIssue],
            });
        });

        it('should get critical issues', () => {
            const critical = report.getCriticalIssues();
            expect(critical).toHaveLength(2);
            expect(critical).toContain(criticalIssue1);
            expect(critical).toContain(criticalIssue2);
        });

        it('should get warnings', () => {
            const warnings = report.getWarnings();
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toBe(warningIssue);
        });

        it('should get info issues', () => {
            const info = report.getInfoIssues();
            expect(info).toHaveLength(1);
            expect(info[0]).toBe(infoIssue);
        });

        it('should get issue count', () => {
            expect(report.getIssueCount()).toBe(4);
        });

        it('should get issue count by severity', () => {
            expect(report.getCriticalIssueCount()).toBe(2);
            expect(report.getWarningCount()).toBe(1);
            expect(report.getInfoIssueCount()).toBe(1);
        });

        it('should check if has critical issues', () => {
            expect(report.hasCriticalIssues()).toBe(true);
        });

        it('should check if has no critical issues', () => {
            const cleanReport = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(90),
                issues: [warningIssue],
            });

            expect(cleanReport.hasCriticalIssues()).toBe(false);
        });
    });

    describe('health assessment', () => {
        it('should be healthy with high score and no issues', () => {
            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(85),
            });

            expect(report.isHealthy()).toBe(true);
        });

        it('should not be healthy with low score', () => {
            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(70),
            });

            expect(report.isHealthy()).toBe(false);
        });

        it('should get qualitative assessment from health score', () => {
            const healthyReport = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(90),
            });

            expect(healthyReport.getQualitativeAssessment()).toBe('healthy');

            const degradedReport = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(60),
            });

            expect(degradedReport.getQualitativeAssessment()).toBe('degraded');
        });
    });

    describe('summary', () => {
        it('should generate summary', () => {
            const orphanedResource = new Resource({
                logicalId: null,
                physicalId: 'orphan-123',
                resourceType: 'AWS::RDS::DBCluster',
                state: ResourceState.ORPHANED,
            });

            const healthyResource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            const criticalIssue = Issue.orphanedResource({
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'orphan-123',
                description: 'Orphaned cluster',
            });

            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'my-app-prod',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(75),
                resources: [orphanedResource, healthyResource],
                issues: [criticalIssue],
            });

            const summary = report.getSummary();

            expect(summary).toEqual({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                healthScore: 75,
                qualitativeAssessment: 'degraded',
                isHealthy: false,
                resourceCount: 2,
                issueCount: 1,
                criticalIssueCount: 1,
                warningCount: 0,
                orphanedResourceCount: 1,
                missingResourceCount: 0,
                driftedResourceCount: 0,
                timestamp: report.timestamp.toISOString(),
            });
        });
    });

    describe('toString', () => {
        it('should return string representation', () => {
            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'my-app-prod',
                    region: 'us-east-1',
                    accountId: '123456789012',
                }),
                healthScore: new HealthScore(85),
            });

            const str = report.toString();
            expect(str).toContain('StackHealthReport');
            expect(str).toContain('my-app-prod');
            expect(str).toContain('us-east-1');
            expect(str).toContain('85');
            expect(str).toContain('healthy');
        });
    });

    describe('toJSON', () => {
        it('should serialize to JSON', () => {
            const stackId = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            const issue = Issue.orphanedResource({
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'orphan-123',
                description: 'Orphaned cluster',
            });

            const timestamp = new Date('2024-01-15T10:30:00Z');

            const report = new StackHealthReport({
                stackIdentifier: stackId,
                healthScore: new HealthScore(75),
                resources: [resource],
                issues: [issue],
                timestamp,
                metadata: { scanDuration: 5000 },
            });

            const json = report.toJSON();

            expect(json).toEqual({
                stackIdentifier: stackId.toJSON(),
                healthScore: 75,
                qualitativeAssessment: 'degraded',
                isHealthy: false,
                resources: [resource.toJSON()],
                issues: [issue.toJSON()],
                resourceCount: 1,
                issueCount: 1,
                summary: report.getSummary(),
                timestamp: '2024-01-15T10:30:00.000Z',
                metadata: { scanDuration: 5000 },
            });
        });

        it('should serialize empty report', () => {
            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: HealthScore.perfect(),
            });

            const json = report.toJSON();

            expect(json.resources).toEqual([]);
            expect(json.issues).toEqual([]);
            expect(json.healthScore).toBe(100);
            expect(json.isHealthy).toBe(true);
        });
    });

    describe('immutability', () => {
        it('should copy resources array to prevent external mutation', () => {
            const resources = [
                new Resource({
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-123',
                    resourceType: 'AWS::EC2::VPC',
                    state: ResourceState.IN_STACK,
                }),
            ];

            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(100),
                resources,
            });

            // Mutate original array
            resources.push(
                new Resource({
                    logicalId: 'Another',
                    physicalId: 'another-123',
                    resourceType: 'AWS::S3::Bucket',
                    state: ResourceState.IN_STACK,
                })
            );

            // Report should not be affected
            expect(report.resources).toHaveLength(1);
        });

        it('should copy issues array to prevent external mutation', () => {
            const issues = [
                Issue.orphanedResource({
                    resourceType: 'AWS::RDS::DBCluster',
                    resourceId: 'orphan-123',
                    description: 'Test',
                }),
            ];

            const report = new StackHealthReport({
                stackIdentifier: new StackIdentifier({
                    stackName: 'test',
                    region: 'us-east-1',
                }),
                healthScore: new HealthScore(100),
                issues,
            });

            // Mutate original array
            issues.push(
                Issue.missingResource({
                    resourceType: 'AWS::KMS::Key',
                    resourceId: 'key-123',
                    description: 'Test',
                })
            );

            // Report should not be affected
            expect(report.issues).toHaveLength(1);
        });
    });
});
