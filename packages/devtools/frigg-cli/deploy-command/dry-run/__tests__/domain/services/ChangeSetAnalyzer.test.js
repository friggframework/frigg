/**
 * ChangeSetAnalyzer Service Tests
 *
 * Comprehensive test suite for the ChangeSetAnalyzer domain service
 * following TDD principles
 */

const { ChangeSetAnalyzer } = require('../../../domain/services/ChangeSetAnalyzer');
const { ChangeSetSummary } = require('../../../domain/value-objects/ChangeSetSummary');
const {
    mockChangeSetEmpty,
    mockChangeSetWithAdditions,
    mockChangeSetWithModifications,
    mockChangeSetWithReplacements,
    mockChangeSetWithDatabase,
} = require('../../fixtures/mock-change-sets');

describe('ChangeSetAnalyzer', () => {
    let analyzer;

    beforeEach(() => {
        analyzer = new ChangeSetAnalyzer();
    });

    describe('analyzeChangeSet()', () => {
        describe('when change set is empty or invalid', () => {
            it('should handle null change set', () => {
                const result = analyzer.analyzeChangeSet(null);

                expect(result.summary).toBeInstanceOf(ChangeSetSummary);
                expect(result.summary.add).toBe(0);
                expect(result.summary.modify).toBe(0);
                expect(result.summary.remove).toBe(0);
                expect(result.summary.replace).toBe(0);
                expect(result.criticalChanges).toEqual([]);
                expect(result.warnings).toEqual([]);
                expect(result.impact.lambdaFunctionsAffected).toBe(0);
                expect(result.impact.databasesAffected).toBe(0);
                expect(result.impact.replacements).toBe(0);
                expect(result.impact.estimatedDowntime).toBe('None expected');
                expect(result.impact.coldStartsExpected).toBe(false);
                expect(result.impact.breakingChanges).toBe(false);
            });

            it('should handle undefined change set', () => {
                const result = analyzer.analyzeChangeSet(undefined);

                expect(result.summary).toBeInstanceOf(ChangeSetSummary);
                expect(result.summary.total).toBe(0);
                expect(result.criticalChanges).toEqual([]);
                expect(result.warnings).toEqual([]);
            });

            it('should handle change set without Changes property', () => {
                const changeSet = {
                    ChangeSetId: 'test-id',
                    StackName: 'test-stack',
                };

                const result = analyzer.analyzeChangeSet(changeSet);

                expect(result.summary.total).toBe(0);
                expect(result.criticalChanges).toEqual([]);
                expect(result.warnings).toEqual([]);
            });

            it('should handle empty change set with no changes', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetEmpty);

                expect(result.summary).toBeInstanceOf(ChangeSetSummary);
                expect(result.summary.add).toBe(0);
                expect(result.summary.modify).toBe(0);
                expect(result.summary.remove).toBe(0);
                expect(result.summary.replace).toBe(0);
                expect(result.summary.total).toBe(0);
                expect(result.summary.hasChanges()).toBe(false);
                expect(result.criticalChanges).toEqual([]);
                expect(result.warnings).toEqual([]);
                expect(result.impact.estimatedDowntime).toBe('None expected');
                expect(result.impact.breakingChanges).toBe(false);
            });
        });

        describe('when change set has additions only', () => {
            it('should correctly count additions', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithAdditions);

                expect(result.summary.add).toBe(3);
                expect(result.summary.modify).toBe(0);
                expect(result.summary.remove).toBe(0);
                expect(result.summary.replace).toBe(0);
                expect(result.summary.total).toBe(3);
            });

            it('should identify no critical changes for additions', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithAdditions);

                expect(result.criticalChanges).toEqual([]);
                expect(result.summary.hasCriticalChanges()).toBe(false);
            });

            it('should calculate impact for Lambda additions', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithAdditions);

                expect(result.impact.lambdaFunctionsAffected).toBe(2);
                expect(result.impact.databasesAffected).toBe(0);
                expect(result.impact.replacements).toBe(0);
                expect(result.impact.coldStartsExpected).toBe(true);
                expect(result.impact.breakingChanges).toBe(false);
                expect(result.impact.estimatedDowntime).toBe('None expected');
            });

            it('should generate no warnings for simple additions', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithAdditions);

                expect(result.warnings).toEqual([]);
            });
        });

        describe('when change set has modifications', () => {
            it('should correctly count modifications', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithModifications);

                expect(result.summary.add).toBe(0);
                expect(result.summary.modify).toBe(2);
                expect(result.summary.remove).toBe(0);
                expect(result.summary.replace).toBe(0);
                expect(result.summary.total).toBe(2);
            });

            it('should identify affected Lambda functions', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithModifications);

                expect(result.impact.lambdaFunctionsAffected).toBe(2);
                expect(result.impact.coldStartsExpected).toBe(true);
            });

            it('should not identify critical changes for regular modifications', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithModifications);

                expect(result.criticalChanges).toEqual([]);
                expect(result.summary.hasCriticalChanges()).toBe(false);
            });

            it('should estimate no downtime for regular modifications', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithModifications);

                expect(result.impact.estimatedDowntime).toBe('None expected');
                expect(result.impact.breakingChanges).toBe(false);
            });
        });

        describe('when change set has replacements', () => {
            it('should correctly count replacements', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithReplacements);

                expect(result.summary.add).toBe(0);
                expect(result.summary.modify).toBe(0);
                expect(result.summary.remove).toBe(1);
                expect(result.summary.replace).toBe(1);
                expect(result.summary.total).toBe(1);
            });

            it('should identify critical changes for replacements', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithReplacements);

                expect(result.criticalChanges).toHaveLength(2);

                const replacementChange = result.criticalChanges.find(
                    (c) => c.logicalId === 'DatabaseSecurityGroup'
                );
                expect(replacementChange).toBeDefined();
                expect(replacementChange.action).toBe('Modify');
                expect(replacementChange.resourceType).toBe('AWS::EC2::SecurityGroup');
                expect(replacementChange.reason).toBe('Requires replacement');
                expect(replacementChange.severity).toBe('high');
                expect(replacementChange.physicalId).toBe('sg-abc123');
            });

            it('should identify critical changes for removals', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithReplacements);

                const removalChange = result.criticalChanges.find(
                    (c) => c.logicalId === 'OldLambdaFunction'
                );
                expect(removalChange).toBeDefined();
                expect(removalChange.action).toBe('Remove');
                expect(removalChange.resourceType).toBe('AWS::Lambda::Function');
                expect(removalChange.reason).toBe('Resource will be deleted');
                expect(removalChange.severity).toBe('high');
                expect(removalChange.physicalId).toBe('test-stack-OldLambdaFunction-OLD123');
            });

            it('should mark as having critical changes', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithReplacements);

                expect(result.summary.hasCriticalChanges()).toBe(true);
            });

            it('should estimate downtime for replacements', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithReplacements);

                expect(result.impact.replacements).toBe(1);
                expect(result.impact.estimatedDowntime).toBe('2-5 minutes');
                expect(result.impact.breakingChanges).toBe(true);
            });
        });

        describe('when change set has Lambda VPC changes', () => {
            it('should detect VPC configuration changes with VpcConfig attribute', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithModifications);

                const vpcWarning = result.warnings.find(
                    (w) => w.logicalId === 'HealthLambdaFunction'
                );
                expect(vpcWarning).toBeDefined();
                expect(vpcWarning.type).toBe('VPC_CONFIGURATION_CHANGE');
                expect(vpcWarning.message).toBe(
                    'VPC configuration change - Lambda function will experience cold start'
                );
                expect(vpcWarning.severity).toBe('medium');
            });

            it('should detect VPC configuration changes with VpcConfig name', () => {
                const changeSetWithVpcConfigName = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'VpcLambdaFunction',
                                ResourceType: 'AWS::Lambda::Function',
                                Details: [
                                    {
                                        Target: {
                                            Name: 'VpcConfig',
                                            RequiresRecreation: 'Never',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithVpcConfigName);

                const vpcWarning = result.warnings.find(
                    (w) => w.logicalId === 'VpcLambdaFunction'
                );
                expect(vpcWarning).toBeDefined();
                expect(vpcWarning.type).toBe('VPC_CONFIGURATION_CHANGE');
            });

            it('should not generate VPC warning for Lambda without VPC changes', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithModifications);

                const nonVpcWarning = result.warnings.find(
                    (w) => w.logicalId === 'IntegrationLambdaFunction'
                );
                expect(nonVpcWarning).toBeUndefined();
            });

            it('should handle Lambda functions without Details array', () => {
                const changeSetWithoutDetails = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'SimpleLambdaFunction',
                                ResourceType: 'AWS::Lambda::Function',
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithoutDetails);

                expect(result.warnings).toEqual([]);
            });
        });

        describe('when change set has database modifications', () => {
            it('should detect RDS DBCluster modifications', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithDatabase);

                const dbWarning = result.warnings.find(
                    (w) => w.logicalId === 'DatabaseCluster'
                );
                expect(dbWarning).toBeDefined();
                expect(dbWarning.type).toBe('DATABASE_MODIFICATION');
                expect(dbWarning.message).toBe('Database modification detected - potential downtime');
                expect(dbWarning.severity).toBe('high');
            });

            it('should detect RDS DBInstance modifications', () => {
                const changeSetWithDBInstance = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'DatabaseInstance',
                                ResourceType: 'AWS::RDS::DBInstance',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithDBInstance);

                const dbWarning = result.warnings.find(
                    (w) => w.logicalId === 'DatabaseInstance'
                );
                expect(dbWarning).toBeDefined();
                expect(dbWarning.type).toBe('DATABASE_MODIFICATION');
                expect(dbWarning.severity).toBe('high');
            });

            it('should detect database replacement', () => {
                const changeSetWithDBReplacement = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'DatabaseInstance',
                                ResourceType: 'AWS::RDS::DBInstance',
                                Replacement: 'True',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithDBReplacement);

                expect(result.warnings).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            type: 'DATABASE_MODIFICATION',
                            severity: 'high',
                        }),
                    ])
                );

                expect(result.criticalChanges).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            logicalId: 'DatabaseInstance',
                            reason: 'Requires replacement',
                        }),
                    ])
                );
            });

            it('should calculate impact with database changes', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithDatabase);

                expect(result.impact.databasesAffected).toBe(1);
                expect(result.impact.estimatedDowntime).toBe('5-15 minutes');
                expect(result.impact.breakingChanges).toBe(true);
            });

            it('should count both DBInstance and DBCluster in impact', () => {
                const changeSetWithMultipleDatabases = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'DatabaseInstance',
                                ResourceType: 'AWS::RDS::DBInstance',
                                Details: [],
                            },
                        },
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'DatabaseCluster',
                                ResourceType: 'AWS::RDS::DBCluster',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithMultipleDatabases);

                expect(result.impact.databasesAffected).toBe(2);
            });
        });

        describe('when change set has conditional replacements', () => {
            it('should generate warning for conditional replacements', () => {
                const changeSetWithConditional = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'ConditionalResource',
                                ResourceType: 'AWS::EC2::Instance',
                                Replacement: 'Conditional',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithConditional);

                const conditionalWarning = result.warnings.find(
                    (w) => w.logicalId === 'ConditionalResource'
                );
                expect(conditionalWarning).toBeDefined();
                expect(conditionalWarning.type).toBe('CONDITIONAL_REPLACEMENT');
                expect(conditionalWarning.message).toBe(
                    'Resource may require replacement depending on property values'
                );
                expect(conditionalWarning.severity).toBe('medium');
            });

            it('should not count conditional replacements as critical changes', () => {
                const changeSetWithConditional = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'ConditionalResource',
                                ResourceType: 'AWS::EC2::Instance',
                                Replacement: 'Conditional',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithConditional);

                expect(result.criticalChanges).toEqual([]);
                expect(result.summary.replace).toBe(0);
            });
        });

        describe('complex change sets with multiple change types', () => {
            it('should handle change set with all change types', () => {
                const complexChangeSet = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Add',
                                LogicalResourceId: 'NewFunction',
                                ResourceType: 'AWS::Lambda::Function',
                                Details: [],
                            },
                        },
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'ExistingFunction',
                                ResourceType: 'AWS::Lambda::Function',
                                Details: [],
                            },
                        },
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'ReplacedResource',
                                ResourceType: 'AWS::S3::Bucket',
                                Replacement: 'True',
                                Details: [],
                            },
                        },
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Remove',
                                LogicalResourceId: 'OldResource',
                                ResourceType: 'AWS::IAM::Role',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(complexChangeSet);

                expect(result.summary.add).toBe(1);
                expect(result.summary.modify).toBe(1);
                expect(result.summary.remove).toBe(1);
                expect(result.summary.replace).toBe(1);
                expect(result.summary.total).toBe(3);
            });

            it('should handle changes without ResourceChange property', () => {
                const changeSetWithInvalidChange = {
                    Changes: [
                        {
                            Type: 'Resource',
                        },
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Add',
                                LogicalResourceId: 'ValidFunction',
                                ResourceType: 'AWS::Lambda::Function',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithInvalidChange);

                expect(result.summary.add).toBe(1);
                expect(result.criticalChanges).toEqual([]);
                expect(result.warnings).toEqual([]);
            });

            it('should generate multiple warnings for same resource when applicable', () => {
                const changeSetWithMultipleWarnings = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'DBInstance',
                                ResourceType: 'AWS::RDS::DBInstance',
                                Replacement: 'Conditional',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithMultipleWarnings);

                expect(result.warnings).toHaveLength(2);
                expect(result.warnings).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ type: 'DATABASE_MODIFICATION' }),
                        expect.objectContaining({ type: 'CONDITIONAL_REPLACEMENT' }),
                    ])
                );
            });
        });

        describe('impact calculation', () => {
            it('should prioritize database downtime over replacement downtime', () => {
                const changeSetWithBoth = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'Database',
                                ResourceType: 'AWS::RDS::DBInstance',
                                Details: [],
                            },
                        },
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'SecurityGroup',
                                ResourceType: 'AWS::EC2::SecurityGroup',
                                Replacement: 'True',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithBoth);

                expect(result.impact.databasesAffected).toBe(1);
                expect(result.impact.replacements).toBe(1);
                expect(result.impact.estimatedDowntime).toBe('5-15 minutes');
            });

            it('should return None expected for modifications without replacements', () => {
                const changeSetWithOnlyModifications = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Modify',
                                LogicalResourceId: 'Function',
                                ResourceType: 'AWS::Lambda::Function',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithOnlyModifications);

                expect(result.impact.estimatedDowntime).toBe('None expected');
                expect(result.impact.breakingChanges).toBe(false);
            });

            it('should return 2-5 minutes for replacements without databases', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithReplacements);

                expect(result.impact.replacements).toBe(1);
                expect(result.impact.databasesAffected).toBe(0);
                expect(result.impact.estimatedDowntime).toBe('2-5 minutes');
            });

            it('should detect cold starts for Lambda functions', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithAdditions);

                expect(result.impact.lambdaFunctionsAffected).toBeGreaterThan(0);
                expect(result.impact.coldStartsExpected).toBe(true);
            });

            it('should not expect cold starts when no Lambda functions affected', () => {
                const changeSetWithoutLambda = {
                    Changes: [
                        {
                            Type: 'Resource',
                            ResourceChange: {
                                Action: 'Add',
                                LogicalResourceId: 'Bucket',
                                ResourceType: 'AWS::S3::Bucket',
                                Details: [],
                            },
                        },
                    ],
                };

                const result = analyzer.analyzeChangeSet(changeSetWithoutLambda);

                expect(result.impact.lambdaFunctionsAffected).toBe(0);
                expect(result.impact.coldStartsExpected).toBe(false);
            });

            it('should mark breaking changes when replacements exist', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithReplacements);

                expect(result.impact.breakingChanges).toBe(true);
            });

            it('should mark breaking changes when databases are affected', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithDatabase);

                expect(result.impact.breakingChanges).toBe(true);
            });
        });

        describe('return structure validation', () => {
            it('should return object with all required properties', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithAdditions);

                expect(result).toHaveProperty('summary');
                expect(result).toHaveProperty('criticalChanges');
                expect(result).toHaveProperty('warnings');
                expect(result).toHaveProperty('impact');
            });

            it('should return ChangeSetSummary instance', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithAdditions);

                expect(result.summary).toBeInstanceOf(ChangeSetSummary);
                expect(typeof result.summary.add).toBe('number');
                expect(typeof result.summary.modify).toBe('number');
                expect(typeof result.summary.remove).toBe('number');
                expect(typeof result.summary.replace).toBe('number');
            });

            it('should return array of critical changes', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithReplacements);

                expect(Array.isArray(result.criticalChanges)).toBe(true);
                result.criticalChanges.forEach((change) => {
                    expect(change).toHaveProperty('logicalId');
                    expect(change).toHaveProperty('physicalId');
                    expect(change).toHaveProperty('resourceType');
                    expect(change).toHaveProperty('action');
                    expect(change).toHaveProperty('reason');
                    expect(change).toHaveProperty('severity');
                });
            });

            it('should return array of warnings', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithModifications);

                expect(Array.isArray(result.warnings)).toBe(true);
                result.warnings.forEach((warning) => {
                    expect(warning).toHaveProperty('logicalId');
                    expect(warning).toHaveProperty('type');
                    expect(warning).toHaveProperty('message');
                    expect(warning).toHaveProperty('severity');
                });
            });

            it('should return impact object with all fields', () => {
                const result = analyzer.analyzeChangeSet(mockChangeSetWithAdditions);

                expect(result.impact).toHaveProperty('lambdaFunctionsAffected');
                expect(result.impact).toHaveProperty('databasesAffected');
                expect(result.impact).toHaveProperty('replacements');
                expect(result.impact).toHaveProperty('estimatedDowntime');
                expect(result.impact).toHaveProperty('coldStartsExpected');
                expect(result.impact).toHaveProperty('breakingChanges');
            });
        });
    });
});
