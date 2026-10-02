/**
 * IPropertyReconciler Port Interface
 *
 * Defines operations for reconciling property mismatches between CloudFormation
 * template definitions and actual cloud resource properties. This is used by
 * the "frigg repair --reconcile" command to fix mutable property drift.
 *
 * This is a port in the hexagonal architecture that will be implemented
 * by provider-specific adapters (e.g., AWSPropertyReconciler).
 *
 * Purpose: Abstract property update operations from the domain layer
 */

class IPropertyReconciler {
    /**
     * Check if a property mismatch can be auto-fixed
     *
     * @param {PropertyMismatch} mismatch - Property mismatch to evaluate
     * @returns {Promise<boolean>} True if mismatch can be automatically fixed
     */
    async canReconcile(mismatch) {
        throw new Error(
            'IPropertyReconciler.canReconcile() must be implemented by adapter'
        );
    }

    /**
     * Reconcile a single property mismatch
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.logicalId - Logical resource ID
     * @param {PropertyMismatch} params.mismatch - Property mismatch to fix
     * @param {string} [params.mode='template'] - Reconciliation mode:
     *   - 'template': Update CloudFormation template to match actual (default)
     *   - 'resource': Update cloud resource to match template
     * @returns {Promise<Object>} Reconciliation result
     * @returns {Promise<Object>} Result with properties:
     *   - success: boolean
     *   - mode: string ('template' or 'resource')
     *   - propertyPath: string
     *   - oldValue: any
     *   - newValue: any
     *   - message: string
     * @throws {Error} If reconciliation fails
     */
    async reconcileProperty({ stackIdentifier, logicalId, mismatch, mode = 'template' }) {
        throw new Error(
            'IPropertyReconciler.reconcileProperty() must be implemented by adapter'
        );
    }

    /**
     * Reconcile multiple property mismatches for a resource
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.logicalId - Logical resource ID
     * @param {PropertyMismatch[]} params.mismatches - Property mismatches to fix
     * @param {string} [params.mode='template'] - Reconciliation mode
     * @returns {Promise<Object>} Reconciliation result
     * @returns {Promise<Object>} Result with properties:
     *   - reconciledCount: number
     *   - failedCount: number
     *   - results: Array<Object> (per-property results)
     *   - message: string
     */
    async reconcileMultipleProperties({
        stackIdentifier,
        logicalId,
        mismatches,
        mode = 'template',
    }) {
        throw new Error(
            'IPropertyReconciler.reconcileMultipleProperties() must be implemented by adapter'
        );
    }

    /**
     * Preview property reconciliation without applying changes
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.logicalId - Logical resource ID
     * @param {PropertyMismatch} params.mismatch - Property mismatch to preview
     * @param {string} [params.mode='template'] - Reconciliation mode
     * @returns {Promise<Object>} Preview result
     * @returns {Promise<Object>} Result with properties:
     *   - canReconcile: boolean
     *   - mode: string
     *   - propertyPath: string
     *   - currentValue: any
     *   - proposedValue: any
     *   - impact: string (description of impact)
     *   - warnings: Array<string>
     */
    async previewReconciliation({ stackIdentifier, logicalId, mismatch, mode = 'template' }) {
        throw new Error(
            'IPropertyReconciler.previewReconciliation() must be implemented by adapter'
        );
    }

    /**
     * Update CloudFormation template property
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.logicalId - Logical resource ID
     * @param {string} params.propertyPath - Property path (e.g., "Properties.Tags")
     * @param {*} params.newValue - New property value
     * @returns {Promise<Object>} Update result
     * @returns {Promise<Object>} Result with properties:
     *   - success: boolean
     *   - changeSetId: string (CloudFormation change set ID)
     *   - message: string
     * @throws {Error} If update fails
     */
    async updateTemplateProperty({ stackIdentifier, logicalId, propertyPath, newValue }) {
        throw new Error(
            'IPropertyReconciler.updateTemplateProperty() must be implemented by adapter'
        );
    }

    /**
     * Update cloud resource property directly
     *
     * @param {Object} params
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {string} params.physicalId - Physical resource ID
     * @param {string} params.region - AWS region
     * @param {string} params.propertyPath - Property path
     * @param {*} params.newValue - New property value
     * @returns {Promise<Object>} Update result
     * @returns {Promise<Object>} Result with properties:
     *   - success: boolean
     *   - message: string
     *   - updatedAt: Date
     * @throws {Error} If update fails or is not supported
     */
    async updateResourceProperty({ resourceType, physicalId, region, propertyPath, newValue }) {
        throw new Error(
            'IPropertyReconciler.updateResourceProperty() must be implemented by adapter'
        );
    }

    /**
     * Get reconciliation strategy for a resource type
     *
     * @param {string} resourceType - CloudFormation resource type
     * @returns {Promise<Object>} Strategy information
     * @returns {Promise<Object>} Strategy with properties:
     *   - supportsTemplateUpdate: boolean
     *   - supportsResourceUpdate: boolean
     *   - recommendedMode: string ('template' or 'resource')
     *   - limitations: Array<string>
     */
    async getReconciliationStrategy(resourceType) {
        throw new Error(
            'IPropertyReconciler.getReconciliationStrategy() must be implemented by adapter'
        );
    }
}

module.exports = IPropertyReconciler;
