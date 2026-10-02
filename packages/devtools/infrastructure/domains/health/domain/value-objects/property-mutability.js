/**
 * PropertyMutability Value Object
 *
 * Enum-like immutable mutability classification for CloudFormation resource properties
 *
 * Types:
 * - MUTABLE: Property can be changed without replacing the resource (Update requires: No interruption)
 * - IMMUTABLE: Property cannot be changed - requires resource replacement (Update requires: Replacement)
 * - CONDITIONAL: Property mutability depends on other properties or conditions (Update requires: Some interruptions)
 */

class PropertyMutability {
    /**
     * Valid mutability types
     * @type {string[]}
     */
    static VALID_TYPES = [
        'MUTABLE',
        'IMMUTABLE',
        'CONDITIONAL',
    ];

    /**
     * Create a new PropertyMutability
     *
     * @param {string} value - Mutability type
     */
    constructor(value) {
        if (value === undefined || value === null) {
            throw new Error('Property mutability is required');
        }

        if (!PropertyMutability.VALID_TYPES.includes(value)) {
            throw new Error(`Invalid property mutability: ${value}`);
        }

        this._value = value;

        // Make immutable
        Object.freeze(this);
    }

    /**
     * Get mutability value
     * @returns {string}
     */
    get value() {
        return this._value;
    }

    /**
     * Prevent modification of value
     * @throws {TypeError}
     */
    set value(newValue) {
        throw new TypeError('Cannot modify immutable property value');
    }

    /**
     * Check if property is mutable
     * @returns {boolean}
     */
    isMutable() {
        return this._value === 'MUTABLE';
    }

    /**
     * Check if property is immutable
     * @returns {boolean}
     */
    isImmutable() {
        return this._value === 'IMMUTABLE';
    }

    /**
     * Check if property mutability is conditional
     * @returns {boolean}
     */
    isConditional() {
        return this._value === 'CONDITIONAL';
    }

    /**
     * Check if property can be changed
     * @returns {boolean}
     */
    canChange() {
        return this._value === 'MUTABLE';
    }

    /**
     * Check if changing property requires resource replacement
     * @returns {boolean}
     */
    requiresReplacement() {
        return this._value === 'IMMUTABLE';
    }

    /**
     * Get description of mutability type
     * @returns {string}
     */
    getDescription() {
        const descriptions = {
            MUTABLE: 'Property can be changed without replacing the resource',
            IMMUTABLE: 'Property cannot be changed - requires resource replacement',
            CONDITIONAL: 'Property mutability depends on other property values or conditions',
        };

        return descriptions[this._value];
    }

    /**
     * Check equality with another PropertyMutability
     *
     * @param {PropertyMutability} other
     * @returns {boolean}
     */
    equals(other) {
        if (!(other instanceof PropertyMutability)) {
            return false;
        }

        return this._value === other._value;
    }

    /**
     * Get string representation
     *
     * @returns {string}
     */
    toString() {
        return this._value;
    }

    /**
     * Predefined mutability: MUTABLE
     * @type {PropertyMutability}
     */
    static get MUTABLE() {
        return new PropertyMutability('MUTABLE');
    }

    /**
     * Predefined mutability: IMMUTABLE
     * @type {PropertyMutability}
     */
    static get IMMUTABLE() {
        return new PropertyMutability('IMMUTABLE');
    }

    /**
     * Predefined mutability: CONDITIONAL
     * @type {PropertyMutability}
     */
    static get CONDITIONAL() {
        return new PropertyMutability('CONDITIONAL');
    }
}

module.exports = PropertyMutability;
