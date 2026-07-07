const RunPreDeploymentHealthCheckUseCase = require('../run-pre-deployment-health-check-use-case');
const PreDeploymentCategorizer = require('../../../domain/services/pre-deployment-categorizer');
const StackIdentifier = require('../../../domain/value-objects/stack-identifier');
const { TemplateParser } = require('../../../domain/services/template-parser');

describe('Pre-Deployment Health Check Integration', () => {
    let useCase;
    let mockStackRepository;
    let mockResourceDetector;
    let categorizer;
    let templateParser;

    beforeEach(() => {
        mockStackRepository = {
            getStack: jest.fn(),
        };

        mockResourceDetector = {
            findOrphanedResources: jest.fn().mockResolvedValue([]),
            checkServiceQuotas: jest.fn().mockResolvedValue([]),
        };

        categorizer = new PreDeploymentCategorizer();
        templateParser = new TemplateParser();

        useCase = new RunPreDeploymentHealthCheckUseCase({
            stackRepository: mockStackRepository,
            resourceDetector: mockResourceDetector,
            preDeploymentCategorizer: categorizer,
            templateParser: { parseTemplate: jest.fn() },
        });
    });

    describe('end-to-end scenarios', () => {
        it('should detect and block orphaned KMS alias before deployment', async () => {
            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-dev',
                stackStatus: 'UPDATE_COMPLETE',
            });

            const template = {
                resources: {
                    MyKmsAlias: {
                        Type: 'AWS::KMS::Alias',
                        Properties: {
                            AliasName: 'alias/my-app-dev-kms',
                        },
                    },
                },
            };

            useCase.templateParser.parseTemplate.mockResolvedValue(template);

            mockResourceDetector.findOrphanedResources.mockResolvedValue([
                {
                    physicalId: 'alias/my-app-dev-kms',
                    resourceType: 'AWS::KMS::Alias',
                    properties: { AliasName: 'alias/my-app-dev-kms' },
                },
            ]);

            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-dev',
                region: 'us-east-1',
            });

            const result = await useCase.execute({
                stackIdentifier,
                templatePath: '/fake/path/template.json',
            });

            expect(result.canDeploy).toBe(false);
            expect(result.blockingIssues).toHaveLength(1);
            expect(result.blockingIssues[0].issue.resourceType).toBe('AWS::KMS::Alias');
            expect(result.blockingIssues[0].category.isBlocking()).toBe(true);
        });

        it('should allow deployment when no issues found', async () => {
            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackStatus: 'UPDATE_COMPLETE',
            });

            const template = {
                resources: {
                    MyLambda: {
                        Type: 'AWS::Lambda::Function',
                        Properties: {
                            FunctionName: 'my-function',
                        },
                    },
                },
            };

            useCase.templateParser.parseTemplate.mockResolvedValue(template);

            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const result = await useCase.execute({
                stackIdentifier,
                templatePath: '/fake/path/template.json',
            });

            expect(result.canDeploy).toBe(true);
            expect(result.blockingIssues).toHaveLength(0);
            expect(result.summary).toEqual({
                total: 0,
                blocking: 0,
                warnings: 0,
            });
        });

        it('should block deployment when stack in ROLLBACK_COMPLETE', async () => {
            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-broken',
                stackStatus: 'ROLLBACK_COMPLETE',
            });

            const template = { resources: {} };
            useCase.templateParser.parseTemplate.mockResolvedValue(template);

            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-broken',
                region: 'us-east-1',
            });

            const result = await useCase.execute({
                stackIdentifier,
                templatePath: '/fake/path/template.json',
            });

            expect(result.canDeploy).toBe(false);
            expect(result.blockingIssues).toHaveLength(1);
            expect(result.blockingIssues[0].issue.stackStatus).toBe('ROLLBACK_COMPLETE');
        });

        it('should handle first-time deployment (stack does not exist)', async () => {
            mockStackRepository.getStack.mockRejectedValue({
                code: 'ValidationError',
                message: 'Stack does not exist',
            });

            const template = {
                resources: {
                    MyBucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: { BucketName: 'my-new-bucket' },
                    },
                },
            };

            useCase.templateParser.parseTemplate.mockResolvedValue(template);

            const stackIdentifier = new StackIdentifier({
                stackName: 'my-new-stack',
                region: 'us-east-1',
            });

            const result = await useCase.execute({
                stackIdentifier,
                templatePath: '/fake/path/template.json',
            });

            expect(result.canDeploy).toBe(true);
            expect(result.stackExists).toBe(false);
            expect(result.blockingIssues).toHaveLength(0);
        });
    });
});
