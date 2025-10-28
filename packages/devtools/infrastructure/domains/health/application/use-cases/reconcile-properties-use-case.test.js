/**
 * Tests for ReconcilePropertiesUseCase
 *
 * Use case for reconciling property drift between CloudFormation template
 * and actual cloud resources (frigg repair --reconcile command)
 */

const ReconcilePropertiesUseCase = require('./reconcile-properties-use-case');
const StackIdentifier = require('../../domain/value-objects/stack-identifier');
const PropertyMismatch = require('../../domain/entities/property-mismatch');
const PropertyMutability = require('../../domain/value-objects/property-mutability');

describe('ReconcilePropertiesUseCase', () => {
    let useCase;
    let mockPropertyReconciler;

    beforeEach(() => {
        // Mock property reconciler
        mockPropertyReconciler = {
            canReconcile: jest.fn(),
            reconcileProperty: jest.fn(),
            reconcileMultipleProperties: jest.fn(),
            previewReconciliation: jest.fn(),
        };

        useCase = new ReconcilePropertiesUseCase({
            propertyReconciler: mockPropertyReconciler,
        });
    });

    describe('reconcileSingleProperty', () => {
        it('should reconcile a single mutable property mismatch', async () => {
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

            // Mock reconciler can handle this mismatch
            mockPropertyReconciler.canReconcile.mockResolvedValue(true);

            // Mock reconciliation result
            mockPropertyReconciler.reconcileProperty.mockResolvedValue({
                success: true,
                mode: 'template',
                propertyPath: 'Properties.EnableDnsSupport',
                oldValue: true,
                newValue: false,
                message: 'Template updated to match actual resource state',
            });

            const result = await useCase.reconcileSingleProperty({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatch,
                mode: 'template',
            });

            expect(result.success).toBe(true);
            expect(result.mode).toBe('template');
            expect(result.propertyPath).toBe('Properties.EnableDnsSupport');
            expect(mockPropertyReconciler.canReconcile).toHaveBeenCalledWith(mismatch);
            expect(mockPropertyReconciler.reconcileProperty).toHaveBeenCalled();
        });

        it('should fail if property cannot be reconciled', async () => {
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

            // Mock reconciler cannot handle immutable property
            mockPropertyReconciler.canReconcile.mockResolvedValue(false);

            await expect(
                useCase.reconcileSingleProperty({
                    stackIdentifier,
                    logicalId: 'MyVPC',
                    mismatch,
                    mode: 'template',
                })
            ).rejects.toThrow('Property Properties.CidrBlock cannot be reconciled automatically');
        });

        it('should use resource mode when specified', async () => {
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

            mockPropertyReconciler.canReconcile.mockResolvedValue(true);

            mockPropertyReconciler.reconcileProperty.mockResolvedValue({
                success: true,
                mode: 'resource',
                propertyPath: 'Properties.EnableDnsSupport',
                oldValue: false,
                newValue: true,
                message: 'Resource updated to match template definition',
            });

            const result = await useCase.reconcileSingleProperty({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatch,
                mode: 'resource',
            });

            expect(result.success).toBe(true);
            expect(result.mode).toBe('resource');
            expect(mockPropertyReconciler.reconcileProperty).toHaveBeenCalledWith({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatch,
                mode: 'resource',
            });
        });
    });

    describe('reconcileMultipleProperties', () => {
        it('should reconcile multiple property mismatches for a resource', async () => {
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

            // Mock all mismatches can be reconciled
            mockPropertyReconciler.canReconcile.mockResolvedValue(true);

            // Mock batch reconciliation
            mockPropertyReconciler.reconcileMultipleProperties.mockResolvedValue({
                reconciledCount: 2,
                failedCount: 0,
                results: [
                    {
                        success: true,
                        mode: 'template',
                        propertyPath: 'Properties.EnableDnsSupport',
                        oldValue: true,
                        newValue: false,
                        message: 'Template updated',
                    },
                    {
                        success: true,
                        mode: 'template',
                        propertyPath: 'Properties.EnableDnsHostnames',
                        oldValue: true,
                        newValue: false,
                        message: 'Template updated',
                    },
                ],
                message: 'Reconciled 2 of 2 properties',
            });

            const result = await useCase.reconcileMultipleProperties({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatches,
                mode: 'template',
            });

            expect(result.reconciledCount).toBe(2);
            expect(result.failedCount).toBe(0);
            expect(result.results).toHaveLength(2);
        });

        it('should skip immutable properties and reconcile mutable ones', async () => {
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
                    propertyPath: 'Properties.CidrBlock',
                    expectedValue: '10.0.0.0/16',
                    actualValue: '10.1.0.0/16',
                    mutability: PropertyMutability.IMMUTABLE,
                }),
            ];

            // Mock first can be reconciled, second cannot
            mockPropertyReconciler.canReconcile
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            // Mock reconciliation of the mutable property
            mockPropertyReconciler.reconcileMultipleProperties.mockResolvedValue({
                reconciledCount: 1,
                failedCount: 0,
                results: [
                    {
                        success: true,
                        mode: 'template',
                        propertyPath: 'Properties.EnableDnsSupport',
                        oldValue: true,
                        newValue: false,
                        message: 'Template updated',
                    },
                ],
                message: 'Reconciled 1 of 1 properties',
            });

            const result = await useCase.reconcileMultipleProperties({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatches,
                mode: 'template',
            });

            expect(result.reconciledCount).toBe(1); // One mutable property reconciled
            expect(result.skippedCount).toBe(1); // One immutable property skipped
            expect(result.reconcilableCount).toBe(1);
            expect(result.results).toHaveLength(1);
        });
    });

    describe('previewReconciliation', () => {
        it('should preview reconciliation changes', async () => {
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

            // Mock preview
            mockPropertyReconciler.previewReconciliation.mockResolvedValue({
                canReconcile: true,
                mode: 'template',
                propertyPath: 'Properties.EnableDnsSupport',
                currentValue: true,
                proposedValue: false,
                impact: 'Will update CloudFormation template to match actual resource state',
                warnings: [],
            });

            const preview = await useCase.previewReconciliation({
                stackIdentifier,
                logicalId: 'MyVPC',
                mismatch,
                mode: 'template',
            });

            expect(preview.canReconcile).toBe(true);
            expect(preview.mode).toBe('template');
            expect(preview.impact).toContain('CloudFormation template');
        });

        it('should include warnings for risky reconciliations', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EngineVersion',
                expectedValue: '13.7',
                actualValue: '13.8',
                mutability: PropertyMutability.CONDITIONAL,
            });

            // Mock preview with warnings
            mockPropertyReconciler.previewReconciliation.mockResolvedValue({
                canReconcile: true,
                mode: 'resource',
                propertyPath: 'Properties.EngineVersion',
                currentValue: '13.7',
                proposedValue: '13.8',
                impact: 'Will update database engine version - may cause downtime',
                warnings: [
                    'Engine version downgrade may not be supported',
                    'Downtime may occur during version change',
                ],
            });

            const preview = await useCase.previewReconciliation({
                stackIdentifier,
                logicalId: 'MyDBCluster',
                mismatch,
                mode: 'resource',
            });

            expect(preview.canReconcile).toBe(true);
            expect(preview.warnings).toHaveLength(2);
            expect(preview.warnings[0]).toContain('Engine version');
        });
    });

    describe('constructor', () => {
        it('should require propertyReconciler', () => {
            expect(() => {
                new ReconcilePropertiesUseCase({});
            }).toThrow('propertyReconciler is required');
        });
    });
});
