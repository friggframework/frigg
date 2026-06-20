/**
 * ExecuteDryRunUseCase Tests
 *
 * TDD test suite for the dry-run orchestrator use case
 */

const { ExecuteDryRunUseCase } = require('../../../application/use-cases/ExecuteDryRunUseCase');
const { DryRunReport } = require('../../../domain/entities/DryRunReport');
const { DryRunStatus } = require('../../../domain/value-objects/DryRunStatus');
const { ValidationResult } = require('../../../domain/value-objects/ValidationResult');
const { ChangeSetSummary } = require('../../../domain/value-objects/ChangeSetSummary');
const {
    createMockChangeSetCreator,
    createMockEnvironmentValidator,
    createMockTemplateGenerator,
} = require('../../helpers/test-utils');

describe('ExecuteDryRunUseCase', () => {
    let mockPreFlightChecker;
    let mockEnvironmentValidator;
    let mockTemplateGenerator;
    let mockChangeSetCreator;
    let mockChangeSetAnalyzer;
    let useCase;

    beforeEach(() => {
        // Setup default mocks
        mockPreFlightChecker = {
            check: jest.fn(),
        };

        mockEnvironmentValidator = createMockEnvironmentValidator();

        mockTemplateGenerator = createMockTemplateGenerator();

        mockChangeSetCreator = createMockChangeSetCreator();

        mockChangeSetAnalyzer = {
            analyzeChangeSet: jest.fn(),
        };

        useCase = new ExecuteDryRunUseCase({
            preFlightChecker: mockPreFlightChecker,
            environmentValidator: mockEnvironmentValidator,
            templateGenerator: mockTemplateGenerator,
            changeSetCreator: mockChangeSetCreator,
            changeSetAnalyzer: mockChangeSetAnalyzer,
        });
    });

    describe('Constructor', () => {
        it('should throw if preFlightChecker is missing', () => {
            expect(() => {
                new ExecuteDryRunUseCase({
                    environmentValidator: mockEnvironmentValidator,
                    templateGenerator: mockTemplateGenerator,
                    changeSetCreator: mockChangeSetCreator,
                    changeSetAnalyzer: mockChangeSetAnalyzer,
                });
            }).toThrow('preFlightChecker is required');
        });

        it('should throw if environmentValidator is missing', () => {
            expect(() => {
                new ExecuteDryRunUseCase({
                    preFlightChecker: mockPreFlightChecker,
                    templateGenerator: mockTemplateGenerator,
                    changeSetCreator: mockChangeSetCreator,
                    changeSetAnalyzer: mockChangeSetAnalyzer,
                });
            }).toThrow('environmentValidator is required');
        });

        it('should throw if templateGenerator is missing', () => {
            expect(() => {
                new ExecuteDryRunUseCase({
                    preFlightChecker: mockPreFlightChecker,
                    environmentValidator: mockEnvironmentValidator,
                    changeSetCreator: mockChangeSetCreator,
                    changeSetAnalyzer: mockChangeSetAnalyzer,
                });
            }).toThrow('templateGenerator is required');
        });

        it('should throw if changeSetCreator is missing', () => {
            expect(() => {
                new ExecuteDryRunUseCase({
                    preFlightChecker: mockPreFlightChecker,
                    environmentValidator: mockEnvironmentValidator,
                    templateGenerator: mockTemplateGenerator,
                    changeSetAnalyzer: mockChangeSetAnalyzer,
                });
            }).toThrow('changeSetCreator is required');
        });

        it('should throw if changeSetAnalyzer is missing', () => {
            expect(() => {
                new ExecuteDryRunUseCase({
                    preFlightChecker: mockPreFlightChecker,
                    environmentValidator: mockEnvironmentValidator,
                    templateGenerator: mockTemplateGenerator,
                    changeSetCreator: mockChangeSetCreator,
                });
            }).toThrow('changeSetAnalyzer is required');
        });

        it('should create instance with all dependencies', () => {
            expect(useCase).toBeInstanceOf(ExecuteDryRunUseCase);
        });
    });

    describe('execute - Happy Path', () => {
        it('should successfully execute all phases and return complete DryRunReport', async () => {
            // Arrange
            const appPath = '/test/app';
            const stackName = 'test-stack';
            const region = 'us-east-1';
            const stage = 'dev';

            mockPreFlightChecker.check.mockResolvedValue(
                ValidationResult.success({
                    appName: 'test-app',
                    provider: 'aws',
                })
            );

            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success({
                    required: { present: ['AWS_REGION'], missing: [] },
                    optional: { present: [], missing: [] },
                })
            );

            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({
                    accountId: '123456789012',
                    region: 'us-east-1',
                })
            );

            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {
                    functions: ['handler'],
                    endpoints: ['/api/test'],
                    resources: { lambdaCount: 1 },
                },
            });

            const mockChangeSet = {
                Id: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/test-changeset',
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack',
                Changes: [
                    {
                        ResourceChange: {
                            Action: 'Add',
                            LogicalResourceId: 'HandlerFunction',
                            ResourceType: 'AWS::Lambda::Function',
                        },
                    },
                ],
            };

            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue(mockChangeSet);

            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.fromChanges(mockChangeSet.Changes),
                criticalChanges: [],
                warnings: [],
                impact: {
                    lambdaFunctionsAffected: 1,
                    databasesAffected: 0,
                    replacements: 0,
                    estimatedDowntime: 'None expected',
                    coldStartsExpected: true,
                    breakingChanges: false,
                },
            });

            // Act
            const result = await useCase.execute({
                appPath,
                stackName,
                region,
                stage,
            });

            // Assert
            expect(result).toBeInstanceOf(DryRunReport);
            expect(result.stackName).toBe(stackName);
            expect(result.region).toBe(region);
            expect(result.stage).toBe(stage);
            expect(result.status.isSuccess()).toBe(true);

            // Verify pre-flight was called
            expect(mockPreFlightChecker.check).toHaveBeenCalledWith(appPath);

            // Verify environment validation was called
            expect(mockEnvironmentValidator.validateEnvironmentVariables).toHaveBeenCalled();
            expect(mockEnvironmentValidator.validateAwsCredentials).toHaveBeenCalledWith(region);

            // Verify template generation was called
            expect(mockTemplateGenerator.generateTemplate).toHaveBeenCalledWith(
                expect.objectContaining({
                    appPath,
                    stage,
                })
            );

            // Verify change set creation was called
            expect(mockChangeSetCreator.createChangeSet).toHaveBeenCalled();
            expect(mockChangeSetCreator.getChangeSetDetails).toHaveBeenCalled();

            // Verify change set analysis was called
            expect(mockChangeSetAnalyzer.analyzeChangeSet).toHaveBeenCalledWith(mockChangeSet);

            // Verify report has all phase results
            expect(result.preFlight).toBeDefined();
            expect(result.environment).toBeInstanceOf(ValidationResult);
            expect(result.template).toBeDefined();
            expect(result.changeSet).toBeDefined();
            expect(result.impact).toBeDefined();
        });

        it('should handle new stack creation (stack does not exist)', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });

            mockChangeSetCreator.stackExists.mockResolvedValue(false);
            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue({
                Changes: [],
            });

            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.empty(),
                criticalChanges: [],
                warnings: [],
                impact: {
                    lambdaFunctionsAffected: 0,
                    databasesAffected: 0,
                    replacements: 0,
                    estimatedDowntime: 'None expected',
                    coldStartsExpected: false,
                    breakingChanges: false,
                },
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'new-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result).toBeInstanceOf(DryRunReport);
            expect(result.status.isSuccess()).toBe(true);
            expect(mockChangeSetCreator.stackExists).toHaveBeenCalled();
        });
    });

    describe('execute - Pre-Flight Check Failures', () => {
        it('should stop execution if pre-flight check fails', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(
                ValidationResult.failure(['Missing required file: index.js'], [])
            );

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result).toBeInstanceOf(DryRunReport);
            expect(result.status.hasErrors()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.VALIDATION_ERROR);
            expect(result.preFlight).toBeDefined();
            expect(result.preFlight.hasErrors()).toBe(true);

            // Verify subsequent phases were NOT called
            expect(mockEnvironmentValidator.validateEnvironmentVariables).not.toHaveBeenCalled();
            expect(mockTemplateGenerator.generateTemplate).not.toHaveBeenCalled();
            expect(mockChangeSetCreator.createChangeSet).not.toHaveBeenCalled();
        });

        it('should continue if pre-flight check has warnings only', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(
                ValidationResult.withWarnings(['Optional feature not configured'], {})
            );

            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });
            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue({ Changes: [] });
            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.empty(),
                criticalChanges: [],
                warnings: [],
                impact: {},
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.hasWarnings()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.WARNING);

            // Verify all phases were called
            expect(mockEnvironmentValidator.validateEnvironmentVariables).toHaveBeenCalled();
            expect(mockTemplateGenerator.generateTemplate).toHaveBeenCalled();
        });
    });

    describe('execute - Environment Validation Failures', () => {
        it('should stop execution if environment validation has errors', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());

            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.failure(['Missing required variable: AWS_REGION'], [])
            );

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.hasErrors()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.VALIDATION_ERROR);
            expect(result.environment).toBeDefined();
            expect(result.environment.hasErrors()).toBe(true);

            // Verify subsequent phases were NOT called
            expect(mockTemplateGenerator.generateTemplate).not.toHaveBeenCalled();
            expect(mockChangeSetCreator.createChangeSet).not.toHaveBeenCalled();
        });

        it('should continue if environment validation has warnings only', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());

            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.withWarnings(['Optional variable not set: CACHE_TTL'], {})
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });
            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue({ Changes: [] });
            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.empty(),
                criticalChanges: [],
                warnings: [],
                impact: {},
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.hasWarnings()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.WARNING);

            // Verify all phases were called
            expect(mockTemplateGenerator.generateTemplate).toHaveBeenCalled();
            expect(mockChangeSetCreator.createChangeSet).toHaveBeenCalled();
        });

        it('should stop execution if AWS credentials validation fails', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.failure(['Invalid AWS credentials'], [])
            );

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.hasErrors()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.VALIDATION_ERROR);

            // Verify subsequent phases were NOT called
            expect(mockTemplateGenerator.generateTemplate).not.toHaveBeenCalled();
        });
    });

    describe('execute - Template Generation Failures', () => {
        it('should handle template generation error gracefully', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );

            const templateError = new Error('Failed to generate template: Invalid configuration');
            mockTemplateGenerator.generateTemplate.mockRejectedValue(templateError);

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.hasErrors()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.VALIDATION_ERROR);
            expect(result.template).toEqual({
                error: templateError.message,
            });

            // Verify change set creation was NOT called
            expect(mockChangeSetCreator.createChangeSet).not.toHaveBeenCalled();
        });
    });

    describe('execute - Change Set Creation Failures', () => {
        it('should handle change set creation error gracefully', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });

            const changeSetError = new Error('Failed to create change set');
            mockChangeSetCreator.createChangeSet.mockRejectedValue(changeSetError);

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.hasErrors()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.VALIDATION_ERROR);
            expect(result.changeSet).toEqual({
                error: changeSetError.message,
            });

            // Verify analysis was NOT called
            expect(mockChangeSetAnalyzer.analyzeChangeSet).not.toHaveBeenCalled();
        });

        it('should handle no changes scenario', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });

            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue({
                Changes: [],
            });

            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.empty(),
                criticalChanges: [],
                warnings: [],
                impact: {
                    lambdaFunctionsAffected: 0,
                    databasesAffected: 0,
                    replacements: 0,
                    estimatedDowntime: 'None expected',
                    coldStartsExpected: false,
                    breakingChanges: false,
                },
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.isSuccess()).toBe(true);
            expect(result.changeSet).toBeDefined();
            expect(result.impact).toBeDefined();
            expect(result.impact.summary.hasChanges()).toBe(false);
        });
    });

    describe('execute - Change Set Analysis', () => {
        it('should analyze change set with additions', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });

            const mockChangeSet = {
                Changes: [
                    {
                        ResourceChange: {
                            Action: 'Add',
                            LogicalResourceId: 'NewFunction',
                            ResourceType: 'AWS::Lambda::Function',
                        },
                    },
                ],
            };

            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue(mockChangeSet);
            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.fromChanges(mockChangeSet.Changes),
                criticalChanges: [],
                warnings: [],
                impact: {
                    lambdaFunctionsAffected: 1,
                    databasesAffected: 0,
                    replacements: 0,
                    estimatedDowntime: 'None expected',
                    coldStartsExpected: true,
                    breakingChanges: false,
                },
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.isSuccess()).toBe(true);
            expect(result.impact.summary.add).toBe(1);
            expect(mockChangeSetAnalyzer.analyzeChangeSet).toHaveBeenCalledWith(mockChangeSet);
        });

        it('should analyze change set with modifications', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });

            const mockChangeSet = {
                Changes: [
                    {
                        ResourceChange: {
                            Action: 'Modify',
                            LogicalResourceId: 'ExistingFunction',
                            ResourceType: 'AWS::Lambda::Function',
                            Replacement: 'False',
                        },
                    },
                ],
            };

            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue(mockChangeSet);
            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.fromChanges(mockChangeSet.Changes),
                criticalChanges: [],
                warnings: [],
                impact: {
                    lambdaFunctionsAffected: 1,
                    databasesAffected: 0,
                    replacements: 0,
                    estimatedDowntime: 'None expected',
                    coldStartsExpected: true,
                    breakingChanges: false,
                },
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.isSuccess()).toBe(true);
            expect(result.impact.summary.modify).toBe(1);
        });

        it('should analyze change set with replacements and mark as critical', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });

            const mockChangeSet = {
                Changes: [
                    {
                        ResourceChange: {
                            Action: 'Modify',
                            LogicalResourceId: 'CriticalFunction',
                            ResourceType: 'AWS::Lambda::Function',
                            Replacement: 'True',
                        },
                    },
                ],
            };

            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue(mockChangeSet);
            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.fromChanges(mockChangeSet.Changes),
                criticalChanges: [
                    {
                        logicalId: 'CriticalFunction',
                        resourceType: 'AWS::Lambda::Function',
                        action: 'Modify',
                        reason: 'Requires replacement',
                        severity: 'high',
                    },
                ],
                warnings: [],
                impact: {
                    lambdaFunctionsAffected: 1,
                    databasesAffected: 0,
                    replacements: 1,
                    estimatedDowntime: '2-5 minutes',
                    coldStartsExpected: true,
                    breakingChanges: true,
                },
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.isSuccess()).toBe(true);
            expect(result.impact.summary.replace).toBe(1);
            expect(result.impact.criticalChanges).toHaveLength(1);
            expect(result.impact.impact.breakingChanges).toBe(true);
        });

        it('should handle multiple change types', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });

            const mockChangeSet = {
                Changes: [
                    {
                        ResourceChange: {
                            Action: 'Add',
                            LogicalResourceId: 'NewFunction',
                            ResourceType: 'AWS::Lambda::Function',
                        },
                    },
                    {
                        ResourceChange: {
                            Action: 'Modify',
                            LogicalResourceId: 'ExistingFunction',
                            ResourceType: 'AWS::Lambda::Function',
                            Replacement: 'False',
                        },
                    },
                    {
                        ResourceChange: {
                            Action: 'Remove',
                            LogicalResourceId: 'OldFunction',
                            ResourceType: 'AWS::Lambda::Function',
                        },
                    },
                ],
            };

            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue(mockChangeSet);
            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.fromChanges(mockChangeSet.Changes),
                criticalChanges: [
                    {
                        logicalId: 'OldFunction',
                        resourceType: 'AWS::Lambda::Function',
                        action: 'Remove',
                        reason: 'Resource will be deleted',
                        severity: 'high',
                    },
                ],
                warnings: [],
                impact: {
                    lambdaFunctionsAffected: 3,
                    databasesAffected: 0,
                    replacements: 0,
                    estimatedDowntime: 'None expected',
                    coldStartsExpected: true,
                    breakingChanges: true,
                },
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.isSuccess()).toBe(true);
            expect(result.impact.summary.add).toBe(1);
            expect(result.impact.summary.modify).toBe(1);
            expect(result.impact.summary.remove).toBe(1);
            expect(result.impact.criticalChanges).toHaveLength(1);
        });
    });

    describe('execute - Status Determination', () => {
        it('should return SUCCESS status when no errors or warnings', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });
            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue({ Changes: [] });
            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.empty(),
                criticalChanges: [],
                warnings: [],
                impact: {},
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.isSuccess()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.SUCCESS);
            expect(result.getExitCode()).toBe(0);
        });

        it('should return WARNING status when warnings are present', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(
                ValidationResult.withWarnings(['Config warning'])
            );
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });
            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue({ Changes: [] });
            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.empty(),
                criticalChanges: [],
                warnings: [],
                impact: {},
            });

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.hasWarnings()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.WARNING);
            expect(result.getExitCode()).toBe(2);
        });

        it('should return VALIDATION_ERROR status when errors are present', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(
                ValidationResult.failure(['Missing file'], [])
            );

            // Act
            const result = await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
            });

            // Assert
            expect(result.status.hasErrors()).toBe(true);
            expect(result.status.code).toBe(DryRunStatus.CODES.VALIDATION_ERROR);
            expect(result.getExitCode()).toBe(1);
        });
    });

    describe('execute - Input Validation', () => {
        it('should throw error if appPath is missing', async () => {
            await expect(
                useCase.execute({
                    stackName: 'test-stack',
                    region: 'us-east-1',
                    stage: 'dev',
                })
            ).rejects.toThrow('appPath is required');
        });

        it('should throw error if stackName is missing', async () => {
            await expect(
                useCase.execute({
                    appPath: '/test/app',
                    region: 'us-east-1',
                    stage: 'dev',
                })
            ).rejects.toThrow('stackName is required');
        });

        it('should throw error if region is missing', async () => {
            await expect(
                useCase.execute({
                    appPath: '/test/app',
                    stackName: 'test-stack',
                    stage: 'dev',
                })
            ).rejects.toThrow('region is required');
        });

        it('should throw error if stage is missing', async () => {
            await expect(
                useCase.execute({
                    appPath: '/test/app',
                    stackName: 'test-stack',
                    region: 'us-east-1',
                })
            ).rejects.toThrow('stage is required');
        });
    });

    describe('execute - Options Handling', () => {
        it('should pass options to template generator', async () => {
            // Arrange
            mockPreFlightChecker.check.mockResolvedValue(ValidationResult.success());
            mockEnvironmentValidator.validateEnvironmentVariables.mockResolvedValue(
                ValidationResult.success()
            );
            mockEnvironmentValidator.validateAwsCredentials.mockResolvedValue(
                ValidationResult.success({ accountId: '123456789012' })
            );
            mockTemplateGenerator.generateTemplate.mockResolvedValue({
                template: 'Resources: {}',
                summary: {},
            });
            mockChangeSetCreator.getChangeSetDetails.mockResolvedValue({ Changes: [] });
            mockChangeSetAnalyzer.analyzeChangeSet.mockReturnValue({
                summary: ChangeSetSummary.empty(),
                criticalChanges: [],
                warnings: [],
                impact: {},
            });

            const options = {
                verbose: true,
                timeout: 5000,
            };

            // Act
            await useCase.execute({
                appPath: '/test/app',
                stackName: 'test-stack',
                region: 'us-east-1',
                stage: 'dev',
                options,
            });

            // Assert
            expect(mockTemplateGenerator.generateTemplate).toHaveBeenCalledWith(
                expect.objectContaining({
                    options,
                })
            );
        });
    });
});
