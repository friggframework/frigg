/**
 * @fileoverview Resource ownership types for clean architecture
 *
 * This file defines the core types for the three-layer resource architecture:
 * 1. Ownership (STACK | EXTERNAL | AUTO)
 * 2. Discovery (facts about what exists)
 * 3. Resolution (decisions based on ownership + discovery)
 */

/**
 * Resource ownership states
 * @readonly
 * @enum {string}
 */
const ResourceOwnership = {
    /**
     * Resource is managed by our CloudFormation stack
     * CRITICAL: Must be added to template on every deploy or CloudFormation will delete it
     */
    STACK: 'stack',

    /**
     * Resource exists outside our stack (another stack, manually created, etc.)
     * Should NOT be added to our template - reference by physical ID only
     */
    EXTERNAL: 'external',

    /**
     * Let the system decide based on discovery results
     * - If found in our stack → STACK
     * - If found externally → EXTERNAL
     * - If not found → STACK (create new)
     */
    AUTO: 'auto'
};

/**
 * Resource decision made by resolver
 * @typedef {Object} ResourceDecision
 * @property {string} ownership - The ownership decision (STACK | EXTERNAL)
 * @property {string} [physicalId] - Physical resource ID (for EXTERNAL or existing STACK resources)
 * @property {string[]} [physicalIds] - Multiple physical IDs (e.g., security groups, subnets)
 * @property {string} reason - Human-readable reason for this decision
 * @property {Object} [metadata] - Additional metadata about the resource
 */

/**
 * Ownership intent from app definition
 * @typedef {'stack' | 'external' | 'auto'} OwnershipIntent
 */

/**
 * Validate ownership value
 * @param {string} value - Value to validate
 * @param {string} resourceName - Name of resource for error message
 * @throws {Error} If value is not valid ownership
 */
function validateOwnership(value, resourceName) {
    const validValues = Object.values(ResourceOwnership);
    if (!validValues.includes(value)) {
        throw new Error(
            `Invalid ownership '${value}' for ${resourceName}. Must be one of: ${validValues.join(', ')}`
        );
    }
}

/**
 * Resolve final ownership from intent and actual state
 * @param {OwnershipIntent} intent - User's intent from app definition
 * @param {boolean} inStack - Whether resource is in our CloudFormation stack
 * @param {boolean} foundExternal - Whether resource was found externally
 * @returns {string} Final ownership (STACK | EXTERNAL)
 */
function resolveOwnership(intent, inStack, foundExternal) {
    // Explicit stack
    if (intent === ResourceOwnership.STACK) {
        return ResourceOwnership.STACK;
    }

    // Explicit external
    if (intent === ResourceOwnership.EXTERNAL) {
        return ResourceOwnership.EXTERNAL;
    }

    // Auto-decide
    if (intent === ResourceOwnership.AUTO) {
        // CRITICAL: If it's in our stack, it MUST stay in template
        if (inStack) {
            return ResourceOwnership.STACK;
        }

        // Found externally - use it
        if (foundExternal) {
            return ResourceOwnership.EXTERNAL;
        }

        // Not found - create new in stack
        return ResourceOwnership.STACK;
    }

    throw new Error(`Invalid ownership intent: ${intent}`);
}

module.exports = {
    ResourceOwnership,
    validateOwnership,
    resolveOwnership
};
