const PreDeploymentCategorizer = require('./pre-deployment-categorizer');
const BlockingCategory = require('../value-objects/blocking-category');
const Issue = require('../entities/issue');
const PropertyMismatch = require('../entities/property-mismatch');
const PropertyMutability = require('../value-objects/property-mutability');

describe('PreDeploymentCategorizer', () => {
    let categorizer;

    beforeEach(() => {
        categorizer = new PreDeploymentCategorizer();
    });

    describe('categorize', () => {
        describe('invalid stack state (BLOCKING)', () => {
            PreDeploymentCategorizer.BLOCKING_STACK_STATES.forEach(stackStatus => {
                it(`should categorize ${stackStatus} as BLOCKING`, () => {
                    const issue = {
                        type: 'INVALID_STACK_STATE',
                        stackStatus,
                        description: `Stack in ${stackStatus}`,
                    };

                    const category = categorizer.categorize(issue);

                    expect(category.isBlocking()).toBe(true);
                    expect(category.reason).toBe(BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE);
                    expect(category.description).toContain(stackStatus);
                });
            });

            it('should not categorize UPDATE_COMPLETE as blocking', () => {
                const issue = {
                    type: 'SOME_TYPE',
                    stackStatus: 'UPDATE_COMPLETE',
                    description: 'Stack in UPDATE_COMPLETE',
                };

                const category = categorizer.categorize(issue);

                expect(category.isBlocking()).toBe(false);
            });
        });

        describe('orphaned resources (BLOCKING)', () => {
            PreDeploymentCategorizer.BLOCKING_ORPHAN_TYPES.forEach(resourceType => {
                it(`should categorize orphaned ${resourceType} as BLOCKING`, () => {
                    const issue = Issue.orphanedResource({
                        resourceType,
                        resourceId: `test-${resourceType}`,
                        description: `Orphaned ${resourceType}`,
                    });

                    const category = categorizer.categorize(issue);

                    expect(category.isBlocking()).toBe(true);
                    expect(category.reason).toBe(BlockingCategory.BLOCKING_REASONS.ORPHANED_RESOURCE);
                    expect(category.description).toContain(resourceType);
                });
            });

            it('should not categorize orphaned non-blocking resource as BLOCKING', () => {
                const issue = Issue.orphanedResource({
                    resourceType: 'AWS::IAM::Role',
                    resourceId: 'test-role',
                    description: 'Orphaned role',
                });

                const category = categorizer.categorize(issue);

                expect(category.isBlocking()).toBe(false);
            });
        });

        describe('quota exceeded (BLOCKING)', () => {
            it('should categorize quota exceeded as BLOCKING', () => {
                const issue = {
                    type: 'QUOTA_EXCEEDED',
                    resourceType: 'AWS::EC2::EIP',
                    description: 'EIP quota exceeded',
                };

                const category = categorizer.categorize(issue);

                expect(category.isBlocking()).toBe(true);
                expect(category.reason).toBe(BlockingCategory.BLOCKING_REASONS.QUOTA_EXCEEDED);
                expect(category.description).toContain('AWS::EC2::EIP');
            });
        });

        describe('missing dependency (BLOCKING)', () => {
            it('should categorize missing dependency as BLOCKING', () => {
                const issue = {
                    type: 'MISSING_DEPENDENCY',
                    resourceType: 'AWS::EC2::VPC',
                    description: 'Referenced VPC not found',
                };

                const category = categorizer.categorize(issue);

                expect(category.isBlocking()).toBe(true);
                expect(category.reason).toBe(BlockingCategory.BLOCKING_REASONS.MISSING_DEPENDENCY);
            });
        });

        describe('property drift (WARNING)', () => {
            it('should categorize mutable property drift as WARNING', () => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'Timeout',
                    expectedValue: 30,
                    actualValue: 60,
                    mutability: PropertyMutability.MUTABLE,
                });

                const issue = Issue.propertyMismatch({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'my-function',
                    mismatch,
                });

                const category = categorizer.categorize(issue);

                expect(category.isWarning()).toBe(true);
                expect(category.reason).toBe('PROPERTY_DRIFT');
                expect(category.description).toBe('Mutable property drift detected');
            });

            it('should categorize immutable property drift as BLOCKING', () => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'BucketName',
                    expectedValue: 'bucket-a',
                    actualValue: 'bucket-b',
                    mutability: PropertyMutability.IMMUTABLE,
                });

                const issue = Issue.propertyMismatch({
                    resourceType: 'AWS::S3::Bucket',
                    resourceId: 'my-bucket',
                    mismatch,
                });

                const category = categorizer.categorize(issue);

                expect(category.isBlocking()).toBe(true);
            });
        });

        describe('default to INFO', () => {
            it('should categorize unknown issue type as INFO', () => {
                const issue = {
                    type: 'UNKNOWN_TYPE',
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'my-function',
                    description: 'Some other issue',
                };

                const category = categorizer.categorize(issue);

                expect(category.isInfo()).toBe(true);
                expect(category.reason).toBe('OTHER');
            });

            it('should categorize missing tag as INFO', () => {
                const issue = {
                    type: Issue.TYPES.MISSING_TAG,
                    resourceType: 'AWS::KMS::Key',
                    resourceId: 'key-123',
                    description: 'Missing tags',
                };

                const category = categorizer.categorize(issue);

                expect(category.isInfo()).toBe(true);
            });
        });
    });

    describe('constants', () => {
        it('should have correct blocking stack states', () => {
            expect(PreDeploymentCategorizer.BLOCKING_STACK_STATES).toEqual([
                'CREATE_FAILED',
                'ROLLBACK_COMPLETE',
                'ROLLBACK_FAILED',
                'UPDATE_ROLLBACK_FAILED',
                'DELETE_IN_PROGRESS',
                'DELETE_FAILED',
            ]);
        });

        it('should have correct blocking orphan types', () => {
            expect(PreDeploymentCategorizer.BLOCKING_ORPHAN_TYPES).toEqual([
                'AWS::KMS::Alias',
                'AWS::KMS::Key',
                'AWS::EC2::VPC',
                'AWS::S3::Bucket',
                'AWS::Lambda::Function',
                'AWS::RDS::DBInstance',
                'AWS::DynamoDB::Table',
            ]);
        });
    });
});
