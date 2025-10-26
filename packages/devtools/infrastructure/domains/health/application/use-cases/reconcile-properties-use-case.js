/**
 * ReconcilePropertiesUseCase - Reconcile Property Drift
 *
 * Application Layer - Use Case
 *
 * Business logic for the "frigg repair --reconcile" command. Orchestrates property
 * drift reconciliation to fix mutable property mismatches between CloudFormation
 * template and actual cloud resources.
 *
 * Responsibilities:
 * - Validate properties can be reconciled
 * - Preview reconciliation impact
 * - Execute reconciliation (template mode or resource mode)
 * - Handle batch reconciliations
 * - Skip immutable properties
 */

class ReconcilePropertiesUseCase {
    /**
     * Create use case with required dependencies
     *
     * @param {Object} params
     * @param {IPropertyReconciler} params.propertyReconciler - Property reconciliation operations
     */
    constructor({ propertyReconciler }) {
        if (!propertyReconciler) {
            throw new Error('propertyReconciler is required');
        }

        this.propertyReconciler = propertyReconciler;
    }

    /**
     * Reconcile a single property mismatch
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.logicalId - Logical resource ID
     * @param {PropertyMismatch} params.mismatch - Property mismatch to reconcile
     * @param {string} [params.mode='template'] - Reconciliation mode
     * @returns {Promise<Object>} Reconciliation result
     */
    async reconcileSingleProperty({ stackIdentifier, logicalId, mismatch, mode = 'template' }) {
        // 1. Check if property can be reconciled
        const canReconcile = await this.propertyReconciler.canReconcile(mismatch);

        if (!canReconcile) {
            throw new Error(
                `Property ${mismatch.propertyPath} cannot be reconciled automatically (immutable property requires replacement)`
            );
        }

        // 2. Execute reconciliation
        const result = await this.propertyReconciler.reconcileProperty({
            stackIdentifier,
            logicalId,
            mismatch,
            mode,
        });

        return result;
    }

    /**
     * Reconcile multiple property mismatches for a resource
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.logicalId - Logical resource ID
     * @param {PropertyMismatch[]} params.mismatches - Property mismatches to reconcile
     * @param {string} [params.mode='template'] - Reconciliation mode
     * @returns {Promise<Object>} Batch reconciliation result
     */
    async reconcileMultipleProperties({
        stackIdentifier,
        logicalId,
        mismatches,
        mode = 'template',
    }) {
        // 1. Filter out immutable properties (cannot be reconciled)
        const reconcilableProperties = [];
        const skippedProperties = [];

        for (const mismatch of mismatches) {
            const canReconcile = await this.propertyReconciler.canReconcile(mismatch);

            if (canReconcile) {
                reconcilableProperties.push(mismatch);
            } else {
                skippedProperties.push(mismatch);
            }
        }

        // 2. If no properties can be reconciled, return early
        if (reconcilableProperties.length === 0) {
            return {
                reconciledCount: 0,
                failedCount: 0,
                skippedCount: skippedProperties.length,
                reconcilableCount: 0,
                message: `All ${mismatches.length} property mismatch(es) require resource replacement (immutable)`,
                results: [],
            };
        }

        // 3. Reconcile the reconcilable properties
        const batchResult = await this.propertyReconciler.reconcileMultipleProperties({
            stackIdentifier,
            logicalId,
            mismatches: reconcilableProperties,
            mode,
        });

        // 4. Return combined result
        return {
            reconciledCount: batchResult.reconciledCount,
            failedCount: batchResult.failedCount,
            skippedCount: skippedProperties.length,
            reconcilableCount: reconcilableProperties.length,
            message: batchResult.message,
            results: batchResult.results,
            skippedProperties: skippedProperties.length > 0 ? skippedProperties : undefined,
        };
    }

    /**
     * Preview reconciliation without applying changes
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.logicalId - Logical resource ID
     * @param {PropertyMismatch} params.mismatch - Property mismatch to preview
     * @param {string} [params.mode='template'] - Reconciliation mode
     * @returns {Promise<Object>} Preview result
     */
    async previewReconciliation({ stackIdentifier, logicalId, mismatch, mode = 'template' }) {
        return await this.propertyReconciler.previewReconciliation({
            stackIdentifier,
            logicalId,
            mismatch,
            mode,
        });
    }
}

module.exports = ReconcilePropertiesUseCase;
