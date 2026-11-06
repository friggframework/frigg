/**
 * Tests for Resource Entity
 */

const Resource = require('./resource');
const ResourceState = require('../value-objects/resource-state');
const Issue = require('./issue');
const PropertyMismatch = require('./property-mismatch');
const PropertyMutability = require('../value-objects/property-mutability');

describe('Resource', () => {
    describe('constructor', () => {
        it('should create a resource in stack', () => {
            const resource = new Resource({
                logicalId: 'ProductionVPC',
                physicalId: 'vpc-0abc123def456',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
                properties: {
                    CidrBlock: '10.0.0.0/16',
                    Tags: [{ Key: 'Environment', Value: 'production' }],
                },
            });

            expect(resource.logicalId).toBe('ProductionVPC');
            expect(resource.physicalId).toBe('vpc-0abc123def456');
            expect(resource.resourceType).toBe('AWS::EC2::VPC');
            expect(resource.state.value).toBe('IN_STACK');
            expect(resource.properties.CidrBlock).toBe('10.0.0.0/16');
        });

        it('should create an orphaned resource', () => {
            const resource = new Resource({
                logicalId: null,
                physicalId: 'my-app-prod-aurora',
                resourceType: 'AWS::RDS::DBCluster',
                state: ResourceState.ORPHANED,
                properties: {
                    Engine: 'aurora-postgresql',
                    EngineVersion: '13.7',
                },
            });

            expect(resource.logicalId).toBeNull();
            expect(resource.physicalId).toBe('my-app-prod-aurora');
            expect(resource.state.value).toBe('ORPHANED');
        });

        it('should require physicalId', () => {
            expect(() => {
                new Resource({
                    logicalId: 'MyResource',
                    resourceType: 'AWS::S3::Bucket',
                    state: ResourceState.IN_STACK,
                });
            }).toThrow('physicalId is required');
        });

        it('should require resourceType', () => {
            expect(() => {
                new Resource({
                    logicalId: 'MyResource',
                    physicalId: 'my-bucket',
                    state: ResourceState.IN_STACK,
                });
            }).toThrow('resourceType is required');
        });

        it('should require state', () => {
            expect(() => {
                new Resource({
                    logicalId: 'MyResource',
                    physicalId: 'my-bucket',
                    resourceType: 'AWS::S3::Bucket',
                });
            }).toThrow('state is required');
        });

        it('should validate state is ResourceState instance', () => {
            expect(() => {
                new Resource({
                    logicalId: 'MyResource',
                    physicalId: 'my-bucket',
                    resourceType: 'AWS::S3::Bucket',
                    state: 'IN_STACK', // String instead of ResourceState
                });
            }).toThrow('state must be a ResourceState instance');
        });

        it('should initialize empty issues array', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            expect(resource.issues).toEqual([]);
        });

        it('should initialize with provided issues', () => {
            const issue = Issue.orphanedResource({
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'my-cluster',
                description: 'Test',
            });

            const resource = new Resource({
                logicalId: null,
                physicalId: 'my-cluster',
                resourceType: 'AWS::RDS::DBCluster',
                state: ResourceState.ORPHANED,
                issues: [issue],
            });

            expect(resource.issues).toHaveLength(1);
            expect(resource.issues[0]).toBe(issue);
        });

        it('should default properties to empty object', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            expect(resource.properties).toEqual({});
        });
    });

    describe('state checks', () => {
        it('should check if resource is in stack', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            expect(resource.isInStack()).toBe(true);
            expect(resource.isOrphaned()).toBe(false);
            expect(resource.isMissing()).toBe(false);
            expect(resource.isDrifted()).toBe(false);
        });

        it('should check if resource is orphaned', () => {
            const resource = new Resource({
                logicalId: null,
                physicalId: 'my-cluster',
                resourceType: 'AWS::RDS::DBCluster',
                state: ResourceState.ORPHANED,
            });

            expect(resource.isInStack()).toBe(false);
            expect(resource.isOrphaned()).toBe(true);
            expect(resource.isMissing()).toBe(false);
            expect(resource.isDrifted()).toBe(false);
        });

        it('should check if resource is missing', () => {
            const resource = new Resource({
                logicalId: 'FriggKMSKey',
                physicalId: 'key-id-that-does-not-exist',
                resourceType: 'AWS::KMS::Key',
                state: ResourceState.MISSING,
            });

            expect(resource.isInStack()).toBe(false);
            expect(resource.isOrphaned()).toBe(false);
            expect(resource.isMissing()).toBe(true);
            expect(resource.isDrifted()).toBe(false);
        });

        it('should check if resource is drifted', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.DRIFTED,
            });

            expect(resource.isInStack()).toBe(false);
            expect(resource.isOrphaned()).toBe(false);
            expect(resource.isMissing()).toBe(false);
            expect(resource.isDrifted()).toBe(true);
        });
    });

    describe('issue management', () => {
        it('should add an issue', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            const issue = Issue.propertyMismatch({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                mismatch: new PropertyMismatch({
                    propertyPath: 'Properties.Tags',
                    expectedValue: ['tag1'],
                    actualValue: ['tag2'],
                    mutability: PropertyMutability.MUTABLE,
                }),
            });

            resource.addIssue(issue);

            expect(resource.issues).toHaveLength(1);
            expect(resource.issues[0]).toBe(issue);
        });

        it('should check if resource has issues', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            expect(resource.hasIssues()).toBe(false);

            const issue = Issue.orphanedResource({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Test',
            });
            resource.addIssue(issue);

            expect(resource.hasIssues()).toBe(true);
        });

        it('should check if resource has critical issues', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            expect(resource.hasCriticalIssues()).toBe(false);

            // Add warning issue
            const warningIssue = new Issue({
                type: 'PROPERTY_MISMATCH',
                severity: 'warning',
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Test warning',
            });
            resource.addIssue(warningIssue);
            expect(resource.hasCriticalIssues()).toBe(false);

            // Add critical issue
            const criticalIssue = Issue.orphanedResource({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Test critical',
            });
            resource.addIssue(criticalIssue);
            expect(resource.hasCriticalIssues()).toBe(true);
        });

        it('should get critical issues', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            const warningIssue = new Issue({
                type: 'PROPERTY_MISMATCH',
                severity: 'warning',
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Warning',
            });

            const criticalIssue1 = Issue.orphanedResource({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Critical 1',
            });

            const criticalIssue2 = Issue.missingResource({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Critical 2',
            });

            resource.addIssue(warningIssue);
            resource.addIssue(criticalIssue1);
            resource.addIssue(criticalIssue2);

            const criticalIssues = resource.getCriticalIssues();
            expect(criticalIssues).toHaveLength(2);
            expect(criticalIssues).toContain(criticalIssue1);
            expect(criticalIssues).toContain(criticalIssue2);
        });
    });

    describe('isHealthy', () => {
        it('should be healthy with no issues', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            expect(resource.isHealthy()).toBe(true);
        });

        it('should not be healthy with issues', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            const issue = Issue.propertyMismatch({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                mismatch: new PropertyMismatch({
                    propertyPath: 'Properties.Tags',
                    expectedValue: ['tag1'],
                    actualValue: ['tag2'],
                    mutability: PropertyMutability.MUTABLE,
                }),
            });

            resource.addIssue(issue);
            expect(resource.isHealthy()).toBe(false);
        });
    });

    describe('getIdentifier', () => {
        it('should return logical ID if present', () => {
            const resource = new Resource({
                logicalId: 'ProductionVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            expect(resource.getIdentifier()).toBe('ProductionVPC');
        });

        it('should return physical ID if no logical ID', () => {
            const resource = new Resource({
                logicalId: null,
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.ORPHANED,
            });

            expect(resource.getIdentifier()).toBe('vpc-123');
        });
    });

    describe('toString', () => {
        it('should return string representation', () => {
            const resource = new Resource({
                logicalId: 'ProductionVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
            });

            const str = resource.toString();
            expect(str).toContain('AWS::EC2::VPC');
            expect(str).toContain('ProductionVPC');
            expect(str).toContain('vpc-123');
            expect(str).toContain('IN_STACK');
        });
    });

    describe('toJSON', () => {
        it('should serialize to JSON', () => {
            const resource = new Resource({
                logicalId: 'ProductionVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.IN_STACK,
                properties: {
                    CidrBlock: '10.0.0.0/16',
                },
            });

            const json = resource.toJSON();

            expect(json).toEqual({
                logicalId: 'ProductionVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: 'IN_STACK',
                properties: {
                    CidrBlock: '10.0.0.0/16',
                },
                issues: [],
                isHealthy: true,
            });
        });

        it('should include issues in JSON', () => {
            const resource = new Resource({
                logicalId: 'MyVPC',
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                state: ResourceState.DRIFTED,
            });

            const issue = Issue.orphanedResource({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Test',
            });
            resource.addIssue(issue);

            const json = resource.toJSON();

            expect(json.issues).toHaveLength(1);
            expect(json.issues[0].type).toBe('ORPHANED_RESOURCE');
            expect(json.isHealthy).toBe(false);
        });
    });
});
