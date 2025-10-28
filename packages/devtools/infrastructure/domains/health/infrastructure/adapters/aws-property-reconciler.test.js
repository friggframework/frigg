/**
 * Tests for AWSPropertyReconciler Adapter
 *
 * Tests property drift reconciliation operations
 */

const AWSPropertyReconciler = require('./aws-property-reconciler');
const StackIdentifier = require('../../domain/value-objects/stack-identifier');
const PropertyMismatch = require('../../domain/entities/property-mismatch');
const PropertyMutability = require('../../domain/value-objects/property-mutability');

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudformation', () => ({
    CloudFormationClient: jest.fn(),
    UpdateStackCommand: jest.fn(),
    GetTemplateCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-ec2', () => ({
    EC2Client: jest.fn(),
    ModifyVpcAttributeCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-lambda', () => ({
    LambdaClient: jest.fn(),
    UpdateFunctionConfigurationCommand: jest.fn(),
}));

describe('AWSPropertyReconciler', () => {
    let reconciler;
    let mockCFSend;
    let mockEC2Send;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock CloudFormation client
        mockCFSend = jest.fn();
        const { CloudFormationClient } = require('@aws-sdk/client-cloudformation');
        CloudFormationClient.mockImplementation(() => ({ send: mockCFSend }));

        // Mock EC2 client
        mockEC2Send = jest.fn();
        const { EC2Client } = require('@aws-sdk/client-ec2');
        EC2Client.mockImplementation(() => ({ send: mockEC2Send }));

        reconciler = new AWSPropertyReconciler({ region: 'us-east-1' });
    });

    describe('canReconcile', () => {
        it('should return true for mutable property mismatch', async () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: { Environment: 'production' },
                actualValue: { Environment: 'staging' },
                mutability: PropertyMutability.MUTABLE,
            });

            const canReconcile = await reconciler.canReconcile(mismatch);
            expect(canReconcile).toBe(true);
        });

        it('should return false for immutable property mismatch', async () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.CidrBlock',
                expectedValue: '10.0.0.0/16',
                actualValue: '10.1.0.0/16',
                mutability: PropertyMutability.IMMUTABLE,
            });

            const canReconcile = await reconciler.canReconcile(mismatch);
            expect(canReconcile).toBe(false);
        });

        it('should return true for conditional property mismatch', async () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EngineVersion',
                expectedValue: '13.7',
                actualValue: '13.8',
                mutability: PropertyMutability.CONDITIONAL,
            });

            const canReconcile = await reconciler.canReconcile(mismatch);
            expect(canReconcile).toBe(true);
        });
    });

    describe('reconcileProperty - template mode', () => {
        it('should reconcile property by updating template', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EnableDnsSupport',
                expectedValue: true,
                actualValue: false,
                mutability: PropertyMutability.MUTABLE,
            });

            // Mock GetTemplate
            mockCFSend.mockResolvedValueOnce({
                TemplateBody: JSON.stringify({
                    Resources: {
                        MyVPC: {
                            Type: 'AWS::EC2::VPC',
                            Properties: {
                                CidrBlock: '10.0.0.0/16',
                                EnableDnsSupport: true,
                            },
                        },
                    },
                }),
            });

            // Mock UpdateStack
            mockCFSend.mockResolvedValueOnce({
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
            });

            const result = await reconciler.reconcileProperty({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatch,
                mode: 'template',
            });

            expect(result).toEqual({
                success: true,
                mode: 'template',
                propertyPath: 'Properties.EnableDnsSupport',
                oldValue: true,
                newValue: false,
                message: 'Template updated to match actual resource state',
            });

            expect(mockCFSend).toHaveBeenCalledTimes(2);
        });
    });

    describe('reconcileProperty - resource mode', () => {
        it('should reconcile property by updating resource', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EnableDnsSupport',
                expectedValue: true,
                actualValue: false,
                mutability: PropertyMutability.MUTABLE,
            });

            // Mock EC2 ModifyVpcAttribute
            mockEC2Send.mockResolvedValue({});

            const result = await reconciler.reconcileProperty({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatch,
                mode: 'resource',
            });

            expect(result.success).toBe(true);
            expect(result.mode).toBe('resource');
            expect(result.propertyPath).toBe('Properties.EnableDnsSupport');
        });

        it('should throw error for unsupported resource update', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.SomeUnsupportedProperty',
                expectedValue: 'value1',
                actualValue: 'value2',
                mutability: PropertyMutability.MUTABLE,
            });

            await expect(
                reconciler.reconcileProperty({
                    stackIdentifier,
                    logicalId: 'MyVPC',
                    mismatch,
                    mode: 'resource',
                })
            ).rejects.toThrow('Resource property update not supported');
        });
    });

    describe('reconcileMultipleProperties', () => {
        it('should reconcile multiple properties in single UpdateStack call', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const mismatches = [
                new PropertyMismatch({
                    propertyPath: 'Properties.EnableDnsSupport',
                    expectedValue: true,
                    actualValue: false,
                    mutability: PropertyMutability.MUTABLE,
                }),
                new PropertyMismatch({
                    propertyPath: 'Properties.EnableDnsHostnames',
                    expectedValue: true,
                    actualValue: false,
                    mutability: PropertyMutability.MUTABLE,
                }),
            ];

            // Mock GetTemplate - should be called ONCE
            mockCFSend.mockResolvedValueOnce({
                TemplateBody: JSON.stringify({
                    Resources: {
                        MyVPC: {
                            Type: 'AWS::EC2::VPC',
                            Properties: {
                                CidrBlock: '10.0.0.0/16',
                                EnableDnsSupport: true,
                                EnableDnsHostnames: true,
                            },
                        },
                    },
                }),
            });

            // Mock UpdateStack - should be called ONCE with both property updates
            mockCFSend.mockResolvedValueOnce({
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
            });

            const result = await reconciler.reconcileMultipleProperties({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatches,
                mode: 'template',
            });

            // Verify only 2 AWS SDK calls: 1 GetTemplate + 1 UpdateStack (not 3+ like before)
            expect(mockCFSend).toHaveBeenCalledTimes(2);

            // Verify result
            expect(result.reconciledCount).toBe(2);
            expect(result.failedCount).toBe(0);
            expect(result.results).toHaveLength(2);
            expect(result.message).toContain('single UpdateStack call');

            // Verify both properties were marked as successfully reconciled
            expect(result.results[0].success).toBe(true);
            expect(result.results[0].propertyPath).toBe('Properties.EnableDnsSupport');
            expect(result.results[1].success).toBe(true);
            expect(result.results[1].propertyPath).toBe('Properties.EnableDnsHostnames');
        });
    });

    describe('previewReconciliation', () => {
        it('should preview template reconciliation', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EnableDnsSupport',
                expectedValue: true,
                actualValue: false,
                mutability: PropertyMutability.MUTABLE,
            });

            const preview = await reconciler.previewReconciliation({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatch,
                mode: 'template',
            });

            expect(preview).toEqual({
                canReconcile: true,
                mode: 'template',
                propertyPath: 'Properties.EnableDnsSupport',
                currentValue: true,
                proposedValue: false,
                impact: 'Will update CloudFormation template to match actual resource state',
                warnings: [],
            });
        });

        it('should preview resource reconciliation', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EnableDnsSupport',
                expectedValue: true,
                actualValue: false,
                mutability: PropertyMutability.MUTABLE,
            });

            const preview = await reconciler.previewReconciliation({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatch,
                mode: 'resource',
            });

            expect(preview.canReconcile).toBe(true);
            expect(preview.mode).toBe('resource');
            expect(preview.impact).toContain('Will update cloud resource');
        });

        it('should warn for immutable property', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.CidrBlock',
                expectedValue: '10.0.0.0/16',
                actualValue: '10.1.0.0/16',
                mutability: PropertyMutability.IMMUTABLE,
            });

            const preview = await reconciler.previewReconciliation({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatch,
                mode: 'template',
            });

            expect(preview.canReconcile).toBe(false);
            expect(preview.warnings).toContain(
                'Property is immutable - requires resource replacement'
            );
        });
    });

    describe('updateTemplateProperty', () => {
        it('should update CloudFormation template property', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            // Mock GetTemplate
            mockCFSend.mockResolvedValueOnce({
                TemplateBody: JSON.stringify({
                    Resources: {
                        MyVPC: {
                            Type: 'AWS::EC2::VPC',
                            Properties: {
                                CidrBlock: '10.0.0.0/16',
                                EnableDnsSupport: true,
                            },
                        },
                    },
                }),
            });

            // Mock UpdateStack
            mockCFSend.mockResolvedValueOnce({
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
            });

            const result = await reconciler.updateTemplateProperty({
                stackIdentifier,
                logicalId: 'MyVPC',
                propertyPath: 'Properties.EnableDnsSupport',
                newValue: false,
            });

            expect(result.success).toBe(true);
            expect(result.changeSetId).toBeDefined();
        });
    });

    describe('updateResourceProperty', () => {
        it('should update VPC DNS support', async () => {
            mockEC2Send.mockResolvedValue({});

            const result = await reconciler.updateResourceProperty({
                resourceType: 'AWS::EC2::VPC',
                physicalId: 'vpc-123',
                region: 'us-east-1',
                propertyPath: 'Properties.EnableDnsSupport',
                newValue: false,
            });

            expect(result.success).toBe(true);
            expect(result.updatedAt).toBeInstanceOf(Date);
        });

        it('should throw error for unsupported resource type', async () => {
            await expect(
                reconciler.updateResourceProperty({
                    resourceType: 'AWS::Lambda::Function',
                    physicalId: 'my-function',
                    region: 'us-east-1',
                    propertyPath: 'Properties.MemorySize',
                    newValue: 512,
                })
            ).rejects.toThrow('Resource type AWS::Lambda::Function updates not supported');
        });
    });

    describe('getReconciliationStrategy', () => {
        it('should get strategy for VPC', async () => {
            const strategy = await reconciler.getReconciliationStrategy('AWS::EC2::VPC');

            expect(strategy).toEqual({
                supportsTemplateUpdate: true,
                supportsResourceUpdate: true,
                recommendedMode: 'template',
                limitations: [
                    'Some VPC properties require resource replacement (e.g., CidrBlock)',
                ],
            });
        });

        it('should get strategy for RDS DBCluster', async () => {
            const strategy = await reconciler.getReconciliationStrategy(
                'AWS::RDS::DBCluster'
            );

            expect(strategy.supportsTemplateUpdate).toBe(true);
            expect(strategy.supportsResourceUpdate).toBe(false);
            expect(strategy.recommendedMode).toBe('template');
        });

        it('should throw error for unsupported type', async () => {
            await expect(
                reconciler.getReconciliationStrategy('AWS::UnsupportedType::Resource')
            ).rejects.toThrow('Resource type AWS::UnsupportedType::Resource not supported');
        });

        it('should get strategy for Lambda Function', async () => {
            const strategy = await reconciler.getReconciliationStrategy(
                'AWS::Lambda::Function'
            );

            expect(strategy.supportsTemplateUpdate).toBe(true);
            expect(strategy.supportsResourceUpdate).toBe(false);
            expect(strategy.recommendedMode).toBe('template');
            expect(strategy.limitations).toContain(
                'VpcConfig changes may take several minutes to propagate'
            );
        });
    });

    describe('Lambda Function VpcConfig Reconciliation (TDD)', () => {
        let stackIdentifier;

        beforeEach(() => {
            stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });
        });

        describe('reconcile Lambda VpcConfig.SubnetIds', () => {
            it('should reconcile Lambda SubnetIds property mismatch', async () => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'Properties.VpcConfig.SubnetIds',
                    expectedValue: ['subnet-111', 'subnet-222'],
                    actualValue: ['subnet-333', 'subnet-444'],
                    mutability: PropertyMutability.MUTABLE,
                });

                // Mock GetTemplate
                mockCFSend.mockResolvedValueOnce({
                    TemplateBody: JSON.stringify({
                        Resources: {
                            AttioLambdaFunction: {
                                Type: 'AWS::Lambda::Function',
                                Properties: {
                                    FunctionName: 'attio-lambda',
                                    Runtime: 'nodejs20.x',
                                    VpcConfig: {
                                        SubnetIds: ['subnet-111', 'subnet-222'],
                                        SecurityGroupIds: ['sg-111'],
                                    },
                                },
                            },
                        },
                    }),
                });

                // Mock UpdateStack
                mockCFSend.mockResolvedValueOnce({
                    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
                });

                const result = await reconciler.reconcileProperty({
                    stackIdentifier,
                    logicalId: 'AttioLambdaFunction',
                    mismatch,
                    mode: 'template',
                });

                expect(result.success).toBe(true);
                expect(result.mode).toBe('template');
                expect(result.propertyPath).toBe('Properties.VpcConfig.SubnetIds');
                expect(result.oldValue).toEqual(['subnet-111', 'subnet-222']);
                expect(result.newValue).toEqual(['subnet-333', 'subnet-444']);
                expect(result.message).toContain('Template updated to match actual resource state');
            });

            it('should recognize SubnetIds as mutable (no replacement required)', async () => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'Properties.VpcConfig.SubnetIds',
                    expectedValue: ['subnet-111'],
                    actualValue: ['subnet-333'],
                    mutability: PropertyMutability.MUTABLE,
                });

                const canReconcile = await reconciler.canReconcile(mismatch);
                expect(canReconcile).toBe(true);
            });
        });

        describe('reconcile Lambda VpcConfig.SecurityGroupIds', () => {
            it('should reconcile Lambda SecurityGroupIds property mismatch', async () => {
                const mismatch = new PropertyMismatch({
                    propertyPath: 'Properties.VpcConfig.SecurityGroupIds',
                    expectedValue: ['sg-111'],
                    actualValue: ['sg-222', 'sg-333'],
                    mutability: PropertyMutability.MUTABLE,
                });

                // Mock GetTemplate
                mockCFSend.mockResolvedValueOnce({
                    TemplateBody: JSON.stringify({
                        Resources: {
                            HealthLambdaFunction: {
                                Type: 'AWS::Lambda::Function',
                                Properties: {
                                    FunctionName: 'health-lambda',
                                    Runtime: 'nodejs20.x',
                                    VpcConfig: {
                                        SubnetIds: ['subnet-111', 'subnet-222'],
                                        SecurityGroupIds: ['sg-111'],
                                    },
                                },
                            },
                        },
                    }),
                });

                // Mock UpdateStack
                mockCFSend.mockResolvedValueOnce({
                    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
                });

                const result = await reconciler.reconcileProperty({
                    stackIdentifier,
                    logicalId: 'HealthLambdaFunction',
                    mismatch,
                    mode: 'template',
                });

                expect(result.success).toBe(true);
                expect(result.mode).toBe('template');
                expect(result.propertyPath).toBe('Properties.VpcConfig.SecurityGroupIds');
                expect(result.newValue).toEqual(['sg-222', 'sg-333']);
            });
        });

        describe('reconcile multiple Lambda VpcConfig properties', () => {
            it('should reconcile both SubnetIds and SecurityGroupIds for same Lambda', async () => {
                const mismatches = [
                    new PropertyMismatch({
                        propertyPath: 'Properties.VpcConfig.SubnetIds',
                        expectedValue: ['subnet-111', 'subnet-222'],
                        actualValue: ['subnet-333', 'subnet-444'],
                        mutability: PropertyMutability.MUTABLE,
                    }),
                    new PropertyMismatch({
                        propertyPath: 'Properties.VpcConfig.SecurityGroupIds',
                        expectedValue: ['sg-111'],
                        actualValue: ['sg-222'],
                        mutability: PropertyMutability.MUTABLE,
                    }),
                ];

                // Mock GetTemplate for first property (SubnetIds)
                mockCFSend.mockResolvedValueOnce({
                    TemplateBody: JSON.stringify({
                        Resources: {
                            UserLambdaFunction: {
                                Type: 'AWS::Lambda::Function',
                                Properties: {
                                    FunctionName: 'user-lambda',
                                    Runtime: 'nodejs20.x',
                                    VpcConfig: {
                                        SubnetIds: ['subnet-111', 'subnet-222'],
                                        SecurityGroupIds: ['sg-111'],
                                    },
                                },
                            },
                        },
                    }),
                });

                // Mock UpdateStack for first property
                mockCFSend.mockResolvedValueOnce({
                    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
                });

                // Mock GetTemplate for second property (SecurityGroupIds)
                mockCFSend.mockResolvedValueOnce({
                    TemplateBody: JSON.stringify({
                        Resources: {
                            UserLambdaFunction: {
                                Type: 'AWS::Lambda::Function',
                                Properties: {
                                    FunctionName: 'user-lambda',
                                    Runtime: 'nodejs20.x',
                                    VpcConfig: {
                                        SubnetIds: ['subnet-333', 'subnet-444'], // Updated from first reconciliation
                                        SecurityGroupIds: ['sg-111'],
                                    },
                                },
                            },
                        },
                    }),
                });

                // Mock UpdateStack for second property
                mockCFSend.mockResolvedValueOnce({
                    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
                });

                const result = await reconciler.reconcileMultipleProperties({
                    stackIdentifier,
                    logicalId: 'UserLambdaFunction',
                    mismatches,
                    mode: 'template',
                });

                expect(result.reconciledCount).toBe(2);
                expect(result.failedCount).toBe(0);
                expect(result.results).toHaveLength(2);
            });
        });

        describe('Lambda reconciliation strategy', () => {
            it('should provide reconciliation strategy for Lambda Function', async () => {
                const strategy = await reconciler.getReconciliationStrategy(
                    'AWS::Lambda::Function'
                );

                expect(strategy).toEqual({
                    supportsTemplateUpdate: true,
                    supportsResourceUpdate: false,
                    recommendedMode: 'template',
                    limitations: expect.arrayContaining([
                        'VpcConfig changes may take several minutes to propagate',
                    ]),
                });
            });
        });

        describe('real-world drift scenario - 17 Lambda functions', () => {
            it('should reconcile VpcConfig drift for multiple Lambda functions', async () => {
                // Simulate real drift from user's test-stack stack
                // 17 Lambda functions with 2 mismatches each (SubnetIds + SecurityGroupIds)
                const lambdaFunctions = [
                    'AttioLambdaFunction',
                    'AttioQueueWorkerLambdaFunction',
                    'HealthLambdaFunction',
                ];

                let totalReconciled = 0;

                for (const logicalId of lambdaFunctions) {
                    const mismatches = [
                        new PropertyMismatch({
                            propertyPath: 'Properties.VpcConfig.SubnetIds',
                            expectedValue: ['subnet-old1', 'subnet-old2'],
                            actualValue: ['subnet-new1', 'subnet-new2'],
                            mutability: PropertyMutability.MUTABLE,
                        }),
                        new PropertyMismatch({
                            propertyPath: 'Properties.VpcConfig.SecurityGroupIds',
                            expectedValue: ['sg-old'],
                            actualValue: ['sg-new'],
                            mutability: PropertyMutability.MUTABLE,
                        }),
                    ];

                    // Mock GetTemplate + UpdateStack ONCE (batches both properties)
                    mockCFSend
                        .mockResolvedValueOnce({
                            TemplateBody: JSON.stringify({
                                Resources: {
                                    [logicalId]: {
                                        Type: 'AWS::Lambda::Function',
                                        Properties: {
                                            VpcConfig: {
                                                SubnetIds: ['subnet-old1', 'subnet-old2'],
                                                SecurityGroupIds: ['sg-old'],
                                            },
                                        },
                                    },
                                },
                            }),
                        })
                        .mockResolvedValueOnce({ StackId: 'arn:...' });

                    const result = await reconciler.reconcileMultipleProperties({
                        stackIdentifier,
                        logicalId,
                        mismatches,
                        mode: 'template',
                    });

                    totalReconciled += result.reconciledCount;
                }

                // 3 functions × 2 properties each = 6 total reconciliations
                expect(totalReconciled).toBe(6);
            });
        });
    });

    describe('large template handling (> 51KB limit)', () => {
        it('should use S3 upload when template exceeds 51KB', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            // Create large template that exceeds 51,200 bytes
            const largeTemplate = {
                Resources: {},
                Outputs: {},
            };

            // Add many resources to exceed limit (need ~250 resources with outputs to reach 51KB+)
            for (let i = 0; i < 250; i++) {
                largeTemplate.Resources[`LambdaFunction${i}`] = {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        FunctionName: `my-integration-function-${i}`,
                        Runtime: 'nodejs18.x',
                        Handler: 'index.handler',
                        Role: { 'Fn::GetAtt': ['LambdaExecutionRole', 'Arn'] },
                        Code: {
                            S3Bucket: 'my-deployment-bucket',
                            S3Key: `serverless/my-stack/dev/${Date.now()}/function-${i}.zip`,
                        },
                        VpcConfig: {
                            SubnetIds: ['subnet-33333333', 'subnet-44444444'],
                            SecurityGroupIds: ['sg-12345678'],
                        },
                        Environment: {
                            Variables: {
                                NODE_ENV: 'production',
                                DB_HOST: 'my-db-host',
                                DB_NAME: 'my-database',
                            },
                        },
                    },
                };
                largeTemplate.Outputs[`LambdaFunction${i}QualifiedArn`] = {
                    Description: `Current Lambda function version for function ${i}`,
                    Value: { 'Fn::GetAtt': [`LambdaFunction${i}`, 'Arn'] },
                    Export: { Name: { 'Fn::Sub': `\${AWS::StackName}-LambdaFunction${i}QualifiedArn` } },
                };
            }

            const templateBody = JSON.stringify(largeTemplate);
            expect(templateBody.length).toBeGreaterThan(51200);

            // Mock CloudFormation repository with uploadTemplate and monitoring methods
            const mockCFRepo = {
                uploadTemplate: jest.fn().mockResolvedValue('https://bucket.s3.amazonaws.com/template.json'),
                getStackEvents: jest.fn().mockResolvedValue([
                    {
                        LogicalResourceId: 'LambdaFunction0',
                        ResourceStatus: 'UPDATE_COMPLETE',
                        Timestamp: new Date(),
                    },
                ]),
                getStackStatus: jest.fn().mockResolvedValue('UPDATE_COMPLETE'),
            };

            const reconciler = new AWSPropertyReconciler({
                region: 'us-east-1',
                cloudFormationRepository: mockCFRepo,
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.FunctionName',
                expectedValue: 'old-function-name',
                actualValue: 'my-integration-function-0',
                mutability: PropertyMutability.MUTABLE,
            });

            // Mock GetTemplate
            mockCFSend.mockResolvedValueOnce({
                TemplateBody: templateBody,
            });

            // Mock UpdateStack (should use TemplateURL, not TemplateBody)
            mockCFSend.mockResolvedValueOnce({ StackId: 'arn:...' });

            const result = await reconciler.reconcileMultipleProperties({
                stackIdentifier,
                logicalId: 'LambdaFunction0', // Match resource in template
                mismatches: [mismatch],
                mode: 'template',
            });

            // Verify S3 upload was called with large template
            expect(mockCFRepo.uploadTemplate).toHaveBeenCalledWith({
                stackName: 'test-stack',
                templateBody: expect.any(String),
            });

            // Verify template body passed to S3 is the large template
            const uploadedTemplate = mockCFRepo.uploadTemplate.mock.calls[0][0].templateBody;
            expect(uploadedTemplate.length).toBeGreaterThan(51200);

            // Verify GetTemplate and UpdateStack were called
            expect(mockCFSend).toHaveBeenCalledTimes(2);

            // Success - reconciled the property
            expect(result.reconciledCount).toBe(1);
            expect(result.failedCount).toBe(0);
        });

        it('should use TemplateBody when template is under 51KB', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'small-stack',
                region: 'us-east-1',
            });

            const smallTemplate = {
                Resources: {
                    MyVPC: {
                        Type: 'AWS::EC2::VPC',
                        Properties: {
                            CidrBlock: '10.0.0.0/16',
                        },
                    },
                },
            };

            const templateBody = JSON.stringify(smallTemplate);
            expect(templateBody.length).toBeLessThan(51200);

            const reconciler = new AWSPropertyReconciler({ region: 'us-east-1' });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EnableDnsSupport',
                expectedValue: true,
                actualValue: false,
                mutability: PropertyMutability.MUTABLE,
            });

            // Mock GetTemplate
            mockCFSend.mockResolvedValueOnce({
                TemplateBody: templateBody,
            });

            // Mock UpdateStack
            mockCFSend.mockResolvedValueOnce({ StackId: 'arn:...' });

            const result = await reconciler.reconcileMultipleProperties({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatches: [mismatch],
                mode: 'template',
            });

            // Verify 2 SDK calls: GetTemplate + UpdateStack
            expect(mockCFSend).toHaveBeenCalledTimes(2);

            // Success - small template doesn't require S3 upload
            expect(result.reconciledCount).toBe(1);
            expect(result.failedCount).toBe(0);
        });
    });

    describe('resource mode batch reconciliation (TDD)', () => {
        let stackIdentifier;
        let mockLambdaSend;

        beforeEach(() => {
            stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            // Mock Lambda client
            mockLambdaSend = jest.fn();
            const { LambdaClient } = require('@aws-sdk/client-lambda');
            LambdaClient.mockImplementation(() => ({ send: mockLambdaSend }));

            // Re-create reconciler to get new Lambda client
            reconciler = new AWSPropertyReconciler({ region: 'us-east-1' });
        });

        describe('reconcileMultipleProperties in resource mode', () => {
            it('should batch Lambda VpcConfig updates via UpdateFunctionConfiguration', async () => {
                const mismatches = [
                    new PropertyMismatch({
                        propertyPath: 'VpcConfig.SubnetIds',
                        expectedValue: ['subnet-11111111', 'subnet-22222222'],
                        actualValue: ['subnet-33333333', 'subnet-44444444'],
                        mutability: PropertyMutability.MUTABLE,
                    }),
                    new PropertyMismatch({
                        propertyPath: 'VpcConfig.SecurityGroupIds',
                        expectedValue: ['sg-expected'],
                        actualValue: ['sg-actual'],
                        mutability: PropertyMutability.MUTABLE,
                    }),
                ];

                // Mock Lambda UpdateFunctionConfiguration
                mockLambdaSend.mockResolvedValueOnce({
                    FunctionName: 'test-stack-health',
                    VpcConfig: {
                        SubnetIds: ['subnet-11111111', 'subnet-22222222'],
                        SecurityGroupIds: ['sg-expected'],
                    },
                });

                const result = await reconciler.reconcileMultipleProperties({
                    stackIdentifier,
                    logicalId: 'HealthLambdaFunction',
                    physicalId: 'test-stack-health',
                    resourceType: 'AWS::Lambda::Function',
                    mismatches,
                    mode: 'resource',
                });

                expect(result.reconciledCount).toBe(2);
                expect(result.failedCount).toBe(0);
                expect(result.results).toHaveLength(2);
                expect(result.results[0].success).toBe(true);
                expect(result.results[0].mode).toBe('resource');
                expect(result.message).toContain('Lambda VpcConfig updated');

                // Verify UpdateFunctionConfiguration was called once with all changes
                expect(mockLambdaSend).toHaveBeenCalledTimes(1);

                // Verify the command was constructed correctly
                // AWS SDK v3 UpdateFunctionConfigurationCommand wraps input in the command object
                const { UpdateFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
                expect(UpdateFunctionConfigurationCommand).toHaveBeenCalledWith({
                    FunctionName: 'test-stack-health',
                    VpcConfig: {
                        SubnetIds: ['subnet-11111111', 'subnet-22222222'],
                        SecurityGroupIds: ['sg-expected'],
                    },
                });
            });

            it('should handle multiple Lambda functions in parallel', async () => {
                // This test verifies that the reconciler can handle multiple Lambda functions
                // Each Lambda should get its own UpdateFunctionConfiguration call
                const lambdas = [
                    {
                        logicalId: 'HealthLambdaFunction',
                        physicalId: 'test-stack-health',
                        mismatches: [
                            new PropertyMismatch({
                                propertyPath: 'VpcConfig.SubnetIds',
                                expectedValue: ['subnet-111'],
                                actualValue: ['subnet-999'],
                                mutability: PropertyMutability.MUTABLE,
                            }),
                        ],
                    },
                    {
                        logicalId: 'UserLambdaFunction',
                        physicalId: 'test-stack-user',
                        mismatches: [
                            new PropertyMismatch({
                                propertyPath: 'VpcConfig.SubnetIds',
                                expectedValue: ['subnet-222'],
                                actualValue: ['subnet-888'],
                                mutability: PropertyMutability.MUTABLE,
                            }),
                        ],
                    },
                ];

                // Mock successful responses for each Lambda
                mockLambdaSend.mockResolvedValue({
                    VpcConfig: { SubnetIds: [], SecurityGroupIds: [] },
                });

                // Reconcile first Lambda
                const result1 = await reconciler.reconcileMultipleProperties({
                    stackIdentifier,
                    logicalId: lambdas[0].logicalId,
                    physicalId: lambdas[0].physicalId,
                    resourceType: 'AWS::Lambda::Function',
                    mismatches: lambdas[0].mismatches,
                    mode: 'resource',
                });

                // Reconcile second Lambda
                const result2 = await reconciler.reconcileMultipleProperties({
                    stackIdentifier,
                    logicalId: lambdas[1].logicalId,
                    physicalId: lambdas[1].physicalId,
                    resourceType: 'AWS::Lambda::Function',
                    mismatches: lambdas[1].mismatches,
                    mode: 'resource',
                });

                expect(result1.reconciledCount).toBe(1);
                expect(result2.reconciledCount).toBe(1);
                expect(mockLambdaSend).toHaveBeenCalledTimes(2);
            });

            it('should handle Lambda update failures gracefully', async () => {
                const mismatches = [
                    new PropertyMismatch({
                        propertyPath: 'VpcConfig.SubnetIds',
                        expectedValue: ['subnet-111'],
                        actualValue: ['subnet-999'],
                        mutability: PropertyMutability.MUTABLE,
                    }),
                ];

                // Mock Lambda API error
                mockLambdaSend.mockRejectedValueOnce(
                    new Error('InvalidParameterValueException: Subnets not in same VPC')
                );

                const result = await reconciler.reconcileMultipleProperties({
                    stackIdentifier,
                    logicalId: 'HealthLambdaFunction',
                    physicalId: 'test-stack-health',
                    resourceType: 'AWS::Lambda::Function',
                    mismatches,
                    mode: 'resource',
                });

                expect(result.reconciledCount).toBe(0);
                expect(result.failedCount).toBe(1);
                expect(result.message).toContain('Failed to update Lambda');
                expect(result.results[0].success).toBe(false);
            });

            it('should skip immutable properties in resource mode', async () => {
                const mismatches = [
                    new PropertyMismatch({
                        propertyPath: 'VpcConfig.SubnetIds',
                        expectedValue: ['subnet-111'],
                        actualValue: ['subnet-999'],
                        mutability: PropertyMutability.MUTABLE,
                    }),
                    new PropertyMismatch({
                        propertyPath: 'FunctionName',
                        expectedValue: 'old-name',
                        actualValue: 'new-name',
                        mutability: PropertyMutability.IMMUTABLE,
                    }),
                ];

                mockLambdaSend.mockResolvedValue({
                    VpcConfig: { SubnetIds: ['subnet-111'], SecurityGroupIds: [] },
                });

                const result = await reconciler.reconcileMultipleProperties({
                    stackIdentifier,
                    logicalId: 'HealthLambdaFunction',
                    physicalId: 'test-stack-health',
                    resourceType: 'AWS::Lambda::Function',
                    mismatches,
                    mode: 'resource',
                });

                // Only mutable property should be reconciled
                expect(result.reconciledCount).toBe(1);
                expect(result.skippedCount).toBe(1);
                expect(result.results).toHaveLength(2);
                expect(result.results[0].success).toBe(true); // VpcConfig
                expect(result.results[1].success).toBe(false); // FunctionName
                expect(result.results[1].message).toContain('immutable');
            });

            it('should throw error for unsupported resource types in resource mode', async () => {
                const mismatches = [
                    new PropertyMismatch({
                        propertyPath: 'SomeProperty',
                        expectedValue: 'value1',
                        actualValue: 'value2',
                        mutability: PropertyMutability.MUTABLE,
                    }),
                ];

                await expect(
                    reconciler.reconcileMultipleProperties({
                        stackIdentifier,
                        logicalId: 'MyUnsupportedResource',
                        physicalId: 'resource-123',
                        resourceType: 'AWS::Unsupported::Resource',
                        mismatches,
                        mode: 'resource',
                    })
                ).rejects.toThrow('Resource mode reconciliation not supported for AWS::Unsupported::Resource');
            });
        });
    });

    describe('constructor', () => {
        it('should create instance with default region', () => {
            const rec = new AWSPropertyReconciler();
            expect(rec).toBeInstanceOf(AWSPropertyReconciler);
        });

        it('should create instance with custom region', () => {
            const rec = new AWSPropertyReconciler({ region: 'eu-west-1' });
            expect(rec).toBeInstanceOf(AWSPropertyReconciler);
        });
    });
});
