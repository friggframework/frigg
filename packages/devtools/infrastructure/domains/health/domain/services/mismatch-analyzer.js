/**
 * MismatchAnalyzer Domain Service
 *
 * Analyzes differences between expected (CloudFormation template) and actual
 * (cloud resource) property values to detect drift.
 *
 * Features:
 * - Deep object comparison
 * - Array comparison (order-sensitive)
 * - Primitive value comparison
 * - Type mismatch detection
 * - Property mutability tracking
 * - Ignore specific properties
 * - Nested property path tracking
 */

const PropertyMismatch = require('../entities/property-mismatch');
const PropertyMutability = require('../value-objects/property-mutability');

class MismatchAnalyzer {
    /**
     * Analyze differences between expected and actual property values
     *
     * @param {Object} params
     * @param {Object} params.expected - Expected properties from CloudFormation template
     * @param {Object} params.actual - Actual properties from cloud resource
     * @param {Object} params.propertyMutability - Map of property paths to PropertyMutability instances
     * @param {string[]} [params.ignoreProperties=[]] - Property paths to ignore
     * @returns {PropertyMismatch[]} Array of detected mismatches
     */
    analyze({ expected, actual, propertyMutability, ignoreProperties = [] }) {
        const mismatches = [];

        // Recursively compare objects
        this._compareObjects({
            expected,
            actual,
            propertyMutability,
            ignoreProperties,
            currentPath: '',
            mismatches,
        });

        return mismatches;
    }

    /**
     * Recursively compare two objects
     *
     * @private
     */
    _compareObjects({
        expected,
        actual,
        propertyMutability,
        ignoreProperties,
        currentPath,
        mismatches,
    }) {
        // Get all unique property keys from both objects
        const allKeys = new Set([
            ...Object.keys(expected || {}),
            ...Object.keys(actual || {}),
        ]);

        for (const key of allKeys) {
            const propertyPath = currentPath ? `${currentPath}.${key}` : key;

            // Skip ignored properties
            if (ignoreProperties.includes(propertyPath)) {
                continue;
            }

            const expectedValue = expected?.[key];
            const actualValue = actual?.[key];

            // Check if values are different
            if (!this._areValuesEqual(expectedValue, actualValue)) {
                // Check if both are objects (and not arrays or null)
                if (
                    this._isPlainObject(expectedValue) &&
                    this._isPlainObject(actualValue)
                ) {
                    // Recursively compare nested objects
                    this._compareObjects({
                        expected: expectedValue,
                        actual: actualValue,
                        propertyMutability,
                        ignoreProperties,
                        currentPath: propertyPath,
                        mismatches,
                    });
                } else {
                    // Create a mismatch for this property
                    const mutability =
                        propertyMutability[propertyPath] || PropertyMutability.MUTABLE;

                    const mismatch = new PropertyMismatch({
                        propertyPath,
                        expectedValue,
                        actualValue,
                        mutability,
                    });

                    mismatches.push(mismatch);
                }
            }
        }
    }

    /**
     * Check if two values are equal
     *
     * @private
     * @param {*} value1
     * @param {*} value2
     * @returns {boolean}
     */
    _areValuesEqual(value1, value2) {
        // Handle null/undefined equivalence
        if (this._isNullish(value1) && this._isNullish(value2)) {
            return true;
        }

        // Handle different types
        if (typeof value1 !== typeof value2) {
            return false;
        }

        // Handle primitives
        if (
            typeof value1 === 'string' ||
            typeof value1 === 'number' ||
            typeof value1 === 'boolean'
        ) {
            return value1 === value2;
        }

        // Handle arrays
        if (Array.isArray(value1) && Array.isArray(value2)) {
            return this._areArraysEqual(value1, value2);
        }

        // Handle plain objects
        if (this._isPlainObject(value1) && this._isPlainObject(value2)) {
            return this._areObjectsEqual(value1, value2);
        }

        // Handle dates
        if (value1 instanceof Date && value2 instanceof Date) {
            return value1.getTime() === value2.getTime();
        }

        // Fallback: strict equality
        return value1 === value2;
    }

    /**
     * Check if value is null or undefined
     *
     * @private
     * @param {*} value
     * @returns {boolean}
     */
    _isNullish(value) {
        return value === null || value === undefined;
    }

    /**
     * Check if value is a plain object (not array, not null, not Date, etc.)
     *
     * @private
     * @param {*} value
     * @returns {boolean}
     */
    _isPlainObject(value) {
        return (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            !(value instanceof Date) &&
            Object.getPrototypeOf(value) === Object.prototype
        );
    }

    /**
     * Deep equality check for arrays (order-sensitive)
     *
     * @private
     * @param {Array} arr1
     * @param {Array} arr2
     * @returns {boolean}
     */
    _areArraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) {
            return false;
        }

        for (let i = 0; i < arr1.length; i++) {
            if (!this._areValuesEqual(arr1[i], arr2[i])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Deep equality check for plain objects
     *
     * @private
     * @param {Object} obj1
     * @param {Object} obj2
     * @returns {boolean}
     */
    _areObjectsEqual(obj1, obj2) {
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);

        if (keys1.length !== keys2.length) {
            return false;
        }

        for (const key of keys1) {
            if (!this._areValuesEqual(obj1[key], obj2[key])) {
                return false;
            }
        }

        return true;
    }
}

module.exports = MismatchAnalyzer;
