/**
 * ResourceState Value Object
 *
 * Enum-like immutable state for CloudFormation resources
 *
 * States:
 * - IN_STACK: Resource exists in CloudFormation stack and matches expected definition
 * - ORPHANED: Resource exists in AWS but not in CloudFormation stack
 * - MISSING: Resource is in CloudFormation stack but not in AWS
 * - DRIFTED: Resource exists in both but properties differ
 * - EXTERNAL: Resource is intentionally external to stack
 */

class ResourceState {
    /**
     * Valid resource states
     * @type {string[]}
     */
    static VALID_STATES = [
        'IN_STACK',
        'ORPHANED',
        'MISSING',
        'DRIFTED',
        'EXTERNAL',
    ];

    /**
     * Create a new ResourceState
     *
     * @param {string} value - State value
     */
    constructor(value) {
        if (value === undefined || value === null) {
            throw new Error('Resource state is required');
        }

        if (!ResourceState.VALID_STATES.includes(value)) {
            throw new Error(`Invalid resource state: ${value}`);
        }

        this._value = value;

        // Make immutable
        Object.freeze(this);
    }

    /**
     * Get state value
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
     * Check if resource is in stack
     * @returns {boolean}
     */
    isInStack() {
        return this._value === 'IN_STACK';
    }

    /**
     * Check if resource is orphaned
     * @returns {boolean}
     */
    isOrphaned() {
        return this._value === 'ORPHANED';
    }

    /**
     * Check if resource is missing
     * @returns {boolean}
     */
    isMissing() {
        return this._value === 'MISSING';
    }

    /**
     * Check if resource has drifted
     * @returns {boolean}
     */
    isDrifted() {
        return this._value === 'DRIFTED';
    }

    /**
     * Check if resource is external
     * @returns {boolean}
     */
    isExternal() {
        return this._value === 'EXTERNAL';
    }

    /**
     * Check equality with another ResourceState
     *
     * @param {ResourceState} other
     * @returns {boolean}
     */
    equals(other) {
        if (!(other instanceof ResourceState)) {
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
     * Predefined state: IN_STACK
     * @type {ResourceState}
     */
    static get IN_STACK() {
        return new ResourceState('IN_STACK');
    }

    /**
     * Predefined state: ORPHANED
     * @type {ResourceState}
     */
    static get ORPHANED() {
        return new ResourceState('ORPHANED');
    }

    /**
     * Predefined state: MISSING
     * @type {ResourceState}
     */
    static get MISSING() {
        return new ResourceState('MISSING');
    }

    /**
     * Predefined state: DRIFTED
     * @type {ResourceState}
     */
    static get DRIFTED() {
        return new ResourceState('DRIFTED');
    }

    /**
     * Predefined state: EXTERNAL
     * @type {ResourceState}
     */
    static get EXTERNAL() {
        return new ResourceState('EXTERNAL');
    }
}

module.exports = ResourceState;
