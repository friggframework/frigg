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
        it('should reconcile multiple properties in template mode', async () => {
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

            // Mock GetTemplate for first property
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

            // Mock UpdateStack for first property
            mockCFSend.mockResolvedValueOnce({
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
            });

            // Mock GetTemplate for second property
            mockCFSend.mockResolvedValueOnce({
                TemplateBody: JSON.stringify({
                    Resources: {
                        MyVPC: {
                            Type: 'AWS::EC2::VPC',
                            Properties: {
                                CidrBlock: '10.0.0.0/16',
                                EnableDnsSupport: false,
                                EnableDnsHostnames: true,
                            },
                        },
                    },
                }),
            });

            // Mock UpdateStack for second property
            mockCFSend.mockResolvedValueOnce({
                StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/my-app-prod/guid',
            });

            const result = await reconciler.reconcileMultipleProperties({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatches,
                mode: 'template',
            });

            expect(result.reconciledCount).toBe(2);
            expect(result.failedCount).toBe(0);
            expect(result.results).toHaveLength(2);
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
                reconciler.getReconciliationStrategy('AWS::Lambda::Function')
            ).rejects.toThrow('Resource type AWS::Lambda::Function not supported');
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
