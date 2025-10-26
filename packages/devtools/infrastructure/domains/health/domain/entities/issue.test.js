/**
 * Tests for Issue Entity
 */

const Issue = require('./issue');
const ResourceState = require('../value-objects/resource-state');
const PropertyMismatch = require('./property-mismatch');
const PropertyMutability = require('../value-objects/property-mutability');

describe('Issue', () => {
    describe('constructor', () => {
        it('should create an orphaned resource issue', () => {
            const issue = new Issue({
                type: 'ORPHANED_RESOURCE',
                severity: 'critical',
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'my-app-prod-aurora',
                description: 'Aurora cluster exists in AWS but not managed by CloudFormation',
                resolution: 'Import resource into CloudFormation stack',
                canAutoFix: true,
            });

            expect(issue.type).toBe('ORPHANED_RESOURCE');
            expect(issue.severity).toBe('critical');
            expect(issue.resourceType).toBe('AWS::RDS::DBCluster');
            expect(issue.resourceId).toBe('my-app-prod-aurora');
            expect(issue.description).toBe('Aurora cluster exists in AWS but not managed by CloudFormation');
            expect(issue.resolution).toBe('Import resource into CloudFormation stack');
            expect(issue.canAutoFix).toBe(true);
        });

        it('should create a missing resource issue', () => {
            const issue = new Issue({
                type: 'MISSING_RESOURCE',
                severity: 'critical',
                resourceType: 'AWS::KMS::Key',
                resourceId: 'FriggKMSKey',
                description: 'KMS key defined in stack but does not exist in AWS',
                resolution: 'Verify resource was not manually deleted',
                canAutoFix: false,
            });

            expect(issue.type).toBe('MISSING_RESOURCE');
            expect(issue.severity).toBe('critical');
        });

        it('should create a property mismatch issue', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: [{ Key: 'Environment', Value: 'production' }],
                actualValue: [{ Key: 'Env', Value: 'prod' }],
                mutability: PropertyMutability.MUTABLE,
            });

            const issue = new Issue({
                type: 'PROPERTY_MISMATCH',
                severity: 'warning',
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-0abc123',
                description: 'VPC tags differ from expected configuration',
                resolution: 'Update VPC tags to match desired state',
                canAutoFix: true,
                propertyMismatch: mismatch,
            });

            expect(issue.type).toBe('PROPERTY_MISMATCH');
            expect(issue.propertyMismatch).toBe(mismatch);
            expect(issue.canAutoFix).toBe(true);
        });

        it('should require type', () => {
            expect(() => {
                new Issue({
                    severity: 'critical',
                    resourceType: 'AWS::S3::Bucket',
                    resourceId: 'my-bucket',
                    description: 'Test',
                    resolution: 'Fix it',
                });
            }).toThrow('type is required');
        });

        it('should require severity', () => {
            expect(() => {
                new Issue({
                    type: 'ORPHANED_RESOURCE',
                    resourceType: 'AWS::S3::Bucket',
                    resourceId: 'my-bucket',
                    description: 'Test',
                    resolution: 'Fix it',
                });
            }).toThrow('severity is required');
        });

        it('should require resourceType', () => {
            expect(() => {
                new Issue({
                    type: 'ORPHANED_RESOURCE',
                    severity: 'critical',
                    resourceId: 'my-bucket',
                    description: 'Test',
                    resolution: 'Fix it',
                });
            }).toThrow('resourceType is required');
        });

        it('should require resourceId', () => {
            expect(() => {
                new Issue({
                    type: 'ORPHANED_RESOURCE',
                    severity: 'critical',
                    resourceType: 'AWS::S3::Bucket',
                    description: 'Test',
                    resolution: 'Fix it',
                });
            }).toThrow('resourceId is required');
        });

        it('should require description', () => {
            expect(() => {
                new Issue({
                    type: 'ORPHANED_RESOURCE',
                    severity: 'critical',
                    resourceType: 'AWS::S3::Bucket',
                    resourceId: 'my-bucket',
                    resolution: 'Fix it',
                });
            }).toThrow('description is required');
        });

        it('should validate issue type', () => {
            expect(() => {
                new Issue({
                    type: 'INVALID_TYPE',
                    severity: 'critical',
                    resourceType: 'AWS::S3::Bucket',
                    resourceId: 'my-bucket',
                    description: 'Test',
                    resolution: 'Fix it',
                });
            }).toThrow('Invalid issue type: INVALID_TYPE');
        });

        it('should validate severity', () => {
            expect(() => {
                new Issue({
                    type: 'ORPHANED_RESOURCE',
                    severity: 'invalid',
                    resourceType: 'AWS::S3::Bucket',
                    resourceId: 'my-bucket',
                    description: 'Test',
                    resolution: 'Fix it',
                });
            }).toThrow('Invalid severity: invalid');
        });

        it('should default canAutoFix to false', () => {
            const issue = new Issue({
                type: 'ORPHANED_RESOURCE',
                severity: 'critical',
                resourceType: 'AWS::S3::Bucket',
                resourceId: 'my-bucket',
                description: 'Test',
                resolution: 'Fix it',
            });

            expect(issue.canAutoFix).toBe(false);
        });
    });

    describe('type checks', () => {
        it('should check if issue is orphaned resource', () => {
            const issue = new Issue({
                type: 'ORPHANED_RESOURCE',
                severity: 'critical',
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'my-cluster',
                description: 'Test',
                resolution: 'Import',
            });

            expect(issue.isOrphanedResource()).toBe(true);
            expect(issue.isMissingResource()).toBe(false);
            expect(issue.isPropertyMismatch()).toBe(false);
            expect(issue.isDrifted()).toBe(false);
        });

        it('should check if issue is missing resource', () => {
            const issue = new Issue({
                type: 'MISSING_RESOURCE',
                severity: 'critical',
                resourceType: 'AWS::KMS::Key',
                resourceId: 'FriggKMSKey',
                description: 'Test',
                resolution: 'Verify deletion',
            });

            expect(issue.isOrphanedResource()).toBe(false);
            expect(issue.isMissingResource()).toBe(true);
            expect(issue.isPropertyMismatch()).toBe(false);
            expect(issue.isDrifted()).toBe(false);
        });

        it('should check if issue is property mismatch', () => {
            const issue = new Issue({
                type: 'PROPERTY_MISMATCH',
                severity: 'warning',
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Test',
                resolution: 'Update',
            });

            expect(issue.isOrphanedResource()).toBe(false);
            expect(issue.isMissingResource()).toBe(false);
            expect(issue.isPropertyMismatch()).toBe(true);
            expect(issue.isDrifted()).toBe(false);
        });

        it('should check if issue is drifted', () => {
            const issue = new Issue({
                type: 'DRIFTED_RESOURCE',
                severity: 'warning',
                resourceType: 'AWS::S3::Bucket',
                resourceId: 'my-bucket',
                description: 'Test',
                resolution: 'Reconcile',
            });

            expect(issue.isOrphanedResource()).toBe(false);
            expect(issue.isMissingResource()).toBe(false);
            expect(issue.isPropertyMismatch()).toBe(false);
            expect(issue.isDrifted()).toBe(true);
        });
    });

    describe('severity checks', () => {
        it('should check if issue is critical', () => {
            const issue = new Issue({
                type: 'ORPHANED_RESOURCE',
                severity: 'critical',
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'my-cluster',
                description: 'Test',
                resolution: 'Import',
            });

            expect(issue.isCritical()).toBe(true);
            expect(issue.isWarning()).toBe(false);
            expect(issue.isInfo()).toBe(false);
        });

        it('should check if issue is warning', () => {
            const issue = new Issue({
                type: 'PROPERTY_MISMATCH',
                severity: 'warning',
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'Test',
                resolution: 'Update',
            });

            expect(issue.isCritical()).toBe(false);
            expect(issue.isWarning()).toBe(true);
            expect(issue.isInfo()).toBe(false);
        });

        it('should check if issue is info', () => {
            const issue = new Issue({
                type: 'MISSING_TAG',
                severity: 'info',
                resourceType: 'AWS::Lambda::Function',
                resourceId: 'my-function',
                description: 'Test',
                resolution: 'Add tag',
            });

            expect(issue.isCritical()).toBe(false);
            expect(issue.isWarning()).toBe(false);
            expect(issue.isInfo()).toBe(true);
        });
    });

    describe('toString', () => {
        it('should return string representation', () => {
            const issue = new Issue({
                type: 'ORPHANED_RESOURCE',
                severity: 'critical',
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'my-app-prod-aurora',
                description: 'Aurora cluster exists in AWS but not managed by CloudFormation',
                resolution: 'Import resource into CloudFormation stack',
            });

            const str = issue.toString();
            expect(str).toContain('ORPHANED_RESOURCE');
            expect(str).toContain('critical');
            expect(str).toContain('AWS::RDS::DBCluster');
            expect(str).toContain('my-app-prod-aurora');
        });
    });

    describe('toJSON', () => {
        it('should serialize to JSON', () => {
            const issue = new Issue({
                type: 'ORPHANED_RESOURCE',
                severity: 'critical',
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'my-app-prod-aurora',
                description: 'Aurora cluster exists in AWS but not managed by CloudFormation',
                resolution: 'Import resource into CloudFormation stack',
                canAutoFix: true,
            });

            const json = issue.toJSON();

            expect(json).toEqual({
                type: 'ORPHANED_RESOURCE',
                severity: 'critical',
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'my-app-prod-aurora',
                description: 'Aurora cluster exists in AWS but not managed by CloudFormation',
                resolution: 'Import resource into CloudFormation stack',
                canAutoFix: true,
                propertyMismatch: null,
            });
        });

        it('should include property mismatch in JSON', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: [{ Key: 'Env', Value: 'prod' }],
                actualValue: [{ Key: 'Env', Value: 'dev' }],
                mutability: PropertyMutability.MUTABLE,
            });

            const issue = new Issue({
                type: 'PROPERTY_MISMATCH',
                severity: 'warning',
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                description: 'VPC tags differ',
                resolution: 'Update tags',
                canAutoFix: true,
                propertyMismatch: mismatch,
            });

            const json = issue.toJSON();

            expect(json.propertyMismatch).toBeDefined();
            expect(json.propertyMismatch.propertyPath).toBe('Properties.Tags');
        });
    });

    describe('static factory methods', () => {
        it('should create orphaned resource issue', () => {
            const issue = Issue.orphanedResource({
                resourceType: 'AWS::RDS::DBCluster',
                resourceId: 'my-cluster',
                description: 'Cluster not in stack',
            });

            expect(issue.type).toBe('ORPHANED_RESOURCE');
            expect(issue.severity).toBe('critical');
            expect(issue.canAutoFix).toBe(true);
        });

        it('should create missing resource issue', () => {
            const issue = Issue.missingResource({
                resourceType: 'AWS::KMS::Key',
                resourceId: 'FriggKMSKey',
                description: 'Key not in AWS',
            });

            expect(issue.type).toBe('MISSING_RESOURCE');
            expect(issue.severity).toBe('critical');
            expect(issue.canAutoFix).toBe(false);
        });

        it('should create property mismatch issue', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1'],
                actualValue: ['tag2'],
                mutability: PropertyMutability.MUTABLE,
            });

            const issue = Issue.propertyMismatch({
                resourceType: 'AWS::EC2::VPC',
                resourceId: 'vpc-123',
                mismatch,
            });

            expect(issue.type).toBe('PROPERTY_MISMATCH');
            expect(issue.severity).toBe('warning'); // Default for mutable
            expect(issue.propertyMismatch).toBe(mismatch);
        });

        it('should create property mismatch with critical severity for immutable', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'bucket-v2',
                actualValue: 'bucket-v1',
                mutability: PropertyMutability.IMMUTABLE,
            });

            const issue = Issue.propertyMismatch({
                resourceType: 'AWS::S3::Bucket',
                resourceId: 'my-bucket',
                mismatch,
            });

            expect(issue.severity).toBe('critical'); // Critical for immutable
            expect(issue.canAutoFix).toBe(false); // Can't auto-fix immutable
        });
    });
});
