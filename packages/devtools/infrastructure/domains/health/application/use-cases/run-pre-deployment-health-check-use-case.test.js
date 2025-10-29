const RunPreDeploymentHealthCheckUseCase = require('./run-pre-deployment-health-check-use-case');
const StackIdentifier = require('../../domain/value-objects/stack-identifier');
const Issue = require('../../domain/entities/issue');
const BlockingCategory = require('../../domain/value-objects/blocking-category');

describe('RunPreDeploymentHealthCheckUseCase', () => {
    let useCase;
    let mockStackRepository;
    let mockResourceDetector;
    let mockCategorizer;
    let mockTemplateParser;
    let stackIdentifier;

    beforeEach(() => {
        stackIdentifier = new StackIdentifier({
            stackName: 'my-app-prod',
            region: 'us-east-1',
        });

        mockStackRepository = {
            getStack: jest.fn(),
        };

        mockResourceDetector = {
            findOrphanedResources: jest.fn(),
            checkServiceQuotas: jest.fn(),
        };

        mockCategorizer = {
            categorize: jest.fn(),
        };

        mockTemplateParser = {
            parseTemplate: jest.fn(),
        };

        useCase = new RunPreDeploymentHealthCheckUseCase({
            stackRepository: mockStackRepository,
            resourceDetector: mockResourceDetector,
            preDeploymentCategorizer: mockCategorizer,
            templateParser: mockTemplateParser,
        });
    });

    describe('constructor', () => {
        it('should require stackRepository', () => {
            expect(() => {
                new RunPreDeploymentHealthCheckUseCase({
                    resourceDetector: mockResourceDetector,
                    preDeploymentCategorizer: mockCategorizer,
                    templateParser: mockTemplateParser,
                });
            }).toThrow('stackRepository is required');
        });

        it('should require resourceDetector', () => {
            expect(() => {
                new RunPreDeploymentHealthCheckUseCase({
                    stackRepository: mockStackRepository,
                    preDeploymentCategorizer: mockCategorizer,
                    templateParser: mockTemplateParser,
                });
            }).toThrow('resourceDetector is required');
        });

        it('should require preDeploymentCategorizer', () => {
            expect(() => {
                new RunPreDeploymentHealthCheckUseCase({
                    stackRepository: mockStackRepository,
                    resourceDetector: mockResourceDetector,
                    templateParser: mockTemplateParser,
                });
            }).toThrow('preDeploymentCategorizer is required');
        });

        it('should require templateParser', () => {
            expect(() => {
                new RunPreDeploymentHealthCheckUseCase({
                    stackRepository: mockStackRepository,
                    resourceDetector: mockResourceDetector,
                    preDeploymentCategorizer: mockCategorizer,
                });
            }).toThrow('templateParser is required');
        });
    });

    describe('execute', () => {
        describe('when stack does not exist', () => {
            it('should allow deployment for first-time stack creation', async () => {
                mockStackRepository.getStack.mockRejectedValue({
                    code: 'ValidationError',
                    message: 'Stack does not exist',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {},
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                const result = await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(result.canDeploy).toBe(true);
                expect(result.stackExists).toBe(false);
                expect(result.blockingIssues).toHaveLength(0);
            });

            it('should still check for orphaned resources even if stack does not exist', async () => {
                mockStackRepository.getStack.mockRejectedValue({
                    code: 'ValidationError',
                    message: 'Stack does not exist',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {
                        MyKmsKey: {
                            Type: 'AWS::KMS::Alias',
                            Properties: { AliasName: 'alias/my-key' },
                        },
                    },
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([
                    {
                        resourceType: 'AWS::KMS::Alias',
                        physicalId: 'alias/my-key',
                    },
                ]);

                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                mockCategorizer.categorize.mockReturnValue(
                    new BlockingCategory({
                        category: BlockingCategory.CATEGORIES.BLOCKING,
                        reason: BlockingCategory.BLOCKING_REASONS.ORPHANED_RESOURCE,
                        description: 'Orphaned KMS alias',
                    })
                );

                const result = await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(result.canDeploy).toBe(false);
                expect(result.blockingIssues).toHaveLength(1);
            });
        });

        describe('when stack exists', () => {
            it('should allow deployment when stack is in UPDATE_COMPLETE state', async () => {
                mockStackRepository.getStack.mockResolvedValue({
                    stackName: 'my-app-prod',
                    stackStatus: 'UPDATE_COMPLETE',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {},
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                const result = await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(result.canDeploy).toBe(true);
                expect(result.stackExists).toBe(true);
                expect(result.stackStatus).toBe('UPDATE_COMPLETE');
                expect(result.blockingIssues).toHaveLength(0);
            });

            it('should block deployment when stack is in ROLLBACK_COMPLETE state', async () => {
                mockStackRepository.getStack.mockResolvedValue({
                    stackName: 'my-app-prod',
                    stackStatus: 'ROLLBACK_COMPLETE',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {},
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                mockCategorizer.categorize.mockReturnValue(
                    new BlockingCategory({
                        category: BlockingCategory.CATEGORIES.BLOCKING,
                        reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                        description: 'Stack in ROLLBACK_COMPLETE',
                    })
                );

                const result = await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(result.canDeploy).toBe(false);
                expect(result.blockingIssues).toHaveLength(1);
                expect(result.blockingIssues[0].issue.type).toBe(Issue.TYPES.INVALID_STACK_STATE);
            });

            it('should allow deployment when stack is in UPDATE_ROLLBACK_COMPLETE state', async () => {
                mockStackRepository.getStack.mockResolvedValue({
                    stackName: 'my-app-prod',
                    stackStatus: 'UPDATE_ROLLBACK_COMPLETE',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {},
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                const result = await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(result.canDeploy).toBe(true);
                expect(result.blockingIssues).toHaveLength(0);
            });
        });

        describe('orphaned resources', () => {
            it('should block deployment when orphaned KMS alias found', async () => {
                mockStackRepository.getStack.mockResolvedValue({
                    stackName: 'my-app-prod',
                    stackStatus: 'UPDATE_COMPLETE',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {
                        MyKmsAlias: {
                            Type: 'AWS::KMS::Alias',
                            Properties: { AliasName: 'alias/my-app-prod-kms' },
                        },
                    },
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([
                    {
                        resourceType: 'AWS::KMS::Alias',
                        physicalId: 'alias/my-app-prod-kms',
                    },
                ]);

                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                mockCategorizer.categorize.mockReturnValue(
                    new BlockingCategory({
                        category: BlockingCategory.CATEGORIES.BLOCKING,
                        reason: BlockingCategory.BLOCKING_REASONS.ORPHANED_RESOURCE,
                        description: 'Orphaned KMS alias',
                    })
                );

                const result = await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(result.canDeploy).toBe(false);
                expect(result.blockingIssues).toHaveLength(1);
                expect(result.blockingIssues[0].issue.resourceType).toBe('AWS::KMS::Alias');
            });

            it('should pass expected resources to orphan detector', async () => {
                mockStackRepository.getStack.mockResolvedValue({
                    stackName: 'my-app-prod',
                    stackStatus: 'UPDATE_COMPLETE',
                });

                const expectedResources = {
                    MyKmsKey: {
                        Type: 'AWS::KMS::Key',
                        Properties: { Description: 'My key' },
                    },
                    MyBucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: { BucketName: 'my-bucket' },
                    },
                };

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: expectedResources,
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(mockResourceDetector.findOrphanedResources).toHaveBeenCalledWith({
                    stackIdentifier,
                    expectedResources,
                });
            });
        });

        describe('quota checks', () => {
            it('should block deployment when quota exceeded', async () => {
                mockStackRepository.getStack.mockResolvedValue({
                    stackName: 'my-app-prod',
                    stackStatus: 'UPDATE_COMPLETE',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {},
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([]);

                const quotaIssue = {
                    type: Issue.TYPES.QUOTA_EXCEEDED,
                    severity: Issue.SEVERITIES.CRITICAL,
                    resourceType: 'AWS::EC2::EIP',
                    resourceId: 'MyEIP',
                    description: 'EIP quota exceeded',
                };

                mockResourceDetector.checkServiceQuotas.mockResolvedValue([quotaIssue]);

                mockCategorizer.categorize.mockReturnValue(
                    new BlockingCategory({
                        category: BlockingCategory.CATEGORIES.BLOCKING,
                        reason: BlockingCategory.BLOCKING_REASONS.QUOTA_EXCEEDED,
                        description: 'EIP quota exceeded',
                    })
                );

                const result = await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(result.canDeploy).toBe(false);
                expect(result.blockingIssues).toHaveLength(1);
            });
        });

        describe('progress callback', () => {
            it('should call onProgress callback at each step', async () => {
                const onProgress = jest.fn();

                mockStackRepository.getStack.mockResolvedValue({
                    stackName: 'my-app-prod',
                    stackStatus: 'UPDATE_COMPLETE',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {},
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                    onProgress,
                });

                expect(onProgress).toHaveBeenCalledWith('📋 Step 1/6:', expect.any(String));
                expect(onProgress).toHaveBeenCalledWith('🔍 Step 2/6:', expect.any(String));
                expect(onProgress).toHaveBeenCalledWith('📄 Step 3/6:', expect.any(String));
                expect(onProgress).toHaveBeenCalledWith('🔎 Step 4/6:', expect.any(String));
                expect(onProgress).toHaveBeenCalledWith('📊 Step 5/6:', expect.any(String));
                expect(onProgress).toHaveBeenCalledWith('🏷️  Step 6/6:', expect.any(String));
            });

            it('should work without onProgress callback', async () => {
                mockStackRepository.getStack.mockResolvedValue({
                    stackName: 'my-app-prod',
                    stackStatus: 'UPDATE_COMPLETE',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {},
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                const result = await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(result.canDeploy).toBe(true);
            });
        });

        describe('result structure', () => {
            it('should return correct summary counts', async () => {
                mockStackRepository.getStack.mockResolvedValue({
                    stackName: 'my-app-prod',
                    stackStatus: 'ROLLBACK_COMPLETE',
                });

                mockTemplateParser.parseTemplate.mockResolvedValue({
                    resources: {},
                });

                mockResourceDetector.findOrphanedResources.mockResolvedValue([
                    {
                        resourceType: 'AWS::KMS::Alias',
                        physicalId: 'alias/test',
                    },
                ]);

                mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

                mockCategorizer.categorize.mockImplementation((issue) => {
                    if (issue.stackStatus) {
                        return new BlockingCategory({
                            category: BlockingCategory.CATEGORIES.BLOCKING,
                            reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                            description: 'Stack state issue',
                        });
                    }
                    return new BlockingCategory({
                        category: BlockingCategory.CATEGORIES.WARNING,
                        reason: 'OTHER',
                        description: 'Warning',
                    });
                });

                const result = await useCase.execute({
                    stackIdentifier,
                    templatePath: '/path/to/template.json',
                });

                expect(result.summary).toEqual({
                    total: 2,
                    blocking: 1,
                    warnings: 1,
                });
            });
        });
    });
});
