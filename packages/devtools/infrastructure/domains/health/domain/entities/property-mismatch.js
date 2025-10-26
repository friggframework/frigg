/**
 * PropertyMismatch Entity
 *
 * Represents a difference between expected and actual property values
 * for a CloudFormation resource.
 */

const PropertyMutability = require('../value-objects/property-mutability');

class PropertyMismatch {
    /**
     * Create a new PropertyMismatch
     *
     * @param {Object} params
     * @param {string} params.propertyPath - Path to the property (e.g., 'Properties.BucketName')
     * @param {*} params.expectedValue - Expected property value
     * @param {*} params.actualValue - Actual property value
     * @param {PropertyMutability} params.mutability - Property mutability
     */
    constructor({ propertyPath, expectedValue, actualValue, mutability }) {
        // Validate required fields
        if (!propertyPath) {
            throw new Error('propertyPath is required');
        }

        // Note: expectedValue and actualValue can be undefined (for missing properties)
        // They can also be null (explicit null value)
        // Only check if they're provided in the params object at all
        if (!('expectedValue' in arguments[0])) {
            throw new Error('expectedValue must be provided (can be null or undefined)');
        }

        if (!('actualValue' in arguments[0])) {
            throw new Error('actualValue must be provided (can be null or undefined)');
        }

        if (!mutability) {
            throw new Error('mutability is required');
        }

        if (!(mutability instanceof PropertyMutability)) {
            throw new Error('mutability must be a PropertyMutability instance');
        }

        this.propertyPath = propertyPath;
        this.expectedValue = expectedValue;
        this.actualValue = actualValue;
        this.mutability = mutability;
    }

    /**
     * Check if fixing this mismatch requires resource replacement
     *
     * @returns {boolean}
     */
    requiresReplacement() {
        return this.mutability.requiresReplacement();
    }

    /**
     * Check if this mismatch can be automatically fixed
     *
     * @returns {boolean}
     */
    canAutoFix() {
        return this.mutability.canChange();
    }

    /**
     * Get severity level of this mismatch
     *
     * @returns {'critical' | 'warning'}
     */
    getSeverity() {
        return this.mutability.isImmutable() ? 'critical' : 'warning';
    }

    /**
     * Get string representation
     *
     * @returns {string}
     */
    toString() {
        const expectedStr = this.expectedValue === null ? 'null' : this.expectedValue;
        const actualStr = this.actualValue === null ? 'null' : this.actualValue;

        return `PropertyMismatch: ${this.propertyPath} (expected: ${expectedStr}, actual: ${actualStr}, mutability: ${this.mutability.toString()})`;
    }

    /**
     * Serialize to JSON
     *
     * @returns {Object}
     */
    toJSON() {
        return {
            propertyPath: this.propertyPath,
            expectedValue: this.expectedValue,
            actualValue: this.actualValue,
            mutability: this.mutability.toString(),
            severity: this.getSeverity(),
            canAutoFix: this.canAutoFix(),
            requiresReplacement: this.requiresReplacement(),
        };
    }
}

module.exports = PropertyMismatch;
