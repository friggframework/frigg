/**
 * Issue Entity
 *
 * Represents a problem detected in infrastructure health check
 */

class Issue {
    /**
     * Valid issue types
     */
    static TYPES = {
        ORPHANED_RESOURCE: 'ORPHANED_RESOURCE',
        MISSING_RESOURCE: 'MISSING_RESOURCE',
        PROPERTY_MISMATCH: 'PROPERTY_MISMATCH',
        DRIFTED_RESOURCE: 'DRIFTED_RESOURCE',
        MISSING_TAG: 'MISSING_TAG',
        INVALID_STACK_STATE: 'INVALID_STACK_STATE',
        QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
        MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',
    };

    /**
     * Valid severity levels
     */
    static SEVERITIES = {
        CRITICAL: 'critical',
        WARNING: 'warning',
        INFO: 'info',
    };

    /**
     * Create a new Issue
     *
     * @param {Object} params
     * @param {string} params.type - Issue type (ORPHANED_RESOURCE, MISSING_RESOURCE, etc.)
     * @param {string} params.severity - Severity level (critical, warning, info)
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {string} params.resourceId - Resource identifier (physical or logical ID)
     * @param {string} params.description - Human-readable description
     * @param {string} [params.resolution] - Suggested resolution
     * @param {boolean} [params.canAutoFix=false] - Whether issue can be automatically fixed
     * @param {PropertyMismatch} [params.propertyMismatch] - Property mismatch details (for PROPERTY_MISMATCH type)
     */
    constructor({
        type,
        severity,
        resourceType,
        resourceId,
        description,
        resolution = null,
        canAutoFix = false,
        propertyMismatch = null,
    }) {
        // Validate required fields
        if (!type) {
            throw new Error('type is required');
        }

        if (!severity) {
            throw new Error('severity is required');
        }

        if (!resourceType) {
            throw new Error('resourceType is required');
        }

        if (!resourceId) {
            throw new Error('resourceId is required');
        }

        if (!description) {
            throw new Error('description is required');
        }

        // Validate type
        if (!Object.values(Issue.TYPES).includes(type)) {
            throw new Error(`Invalid issue type: ${type}`);
        }

        // Validate severity
        if (!Object.values(Issue.SEVERITIES).includes(severity)) {
            throw new Error(`Invalid severity: ${severity}`);
        }

        this.type = type;
        this.severity = severity;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.description = description;
        this.resolution = resolution;
        this.canAutoFix = canAutoFix;
        this.propertyMismatch = propertyMismatch;
    }

    /**
     * Check if issue is an orphaned resource
     * @returns {boolean}
     */
    isOrphanedResource() {
        return this.type === Issue.TYPES.ORPHANED_RESOURCE;
    }

    /**
     * Check if issue is a missing resource
     * @returns {boolean}
     */
    isMissingResource() {
        return this.type === Issue.TYPES.MISSING_RESOURCE;
    }

    /**
     * Check if issue is a property mismatch
     * @returns {boolean}
     */
    isPropertyMismatch() {
        return this.type === Issue.TYPES.PROPERTY_MISMATCH;
    }

    /**
     * Check if issue is a drifted resource
     * @returns {boolean}
     */
    isDrifted() {
        return this.type === Issue.TYPES.DRIFTED_RESOURCE;
    }

    /**
     * Check if issue is critical severity
     * @returns {boolean}
     */
    isCritical() {
        return this.severity === Issue.SEVERITIES.CRITICAL;
    }

    /**
     * Check if issue is warning severity
     * @returns {boolean}
     */
    isWarning() {
        return this.severity === Issue.SEVERITIES.WARNING;
    }

    /**
     * Check if issue is info severity
     * @returns {boolean}
     */
    isInfo() {
        return this.severity === Issue.SEVERITIES.INFO;
    }

    /**
     * Get string representation
     * @returns {string}
     */
    toString() {
        return `Issue: ${this.type} [${this.severity}] - ${this.resourceType} (${this.resourceId}): ${this.description}`;
    }

    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            type: this.type,
            severity: this.severity,
            resourceType: this.resourceType,
            resourceId: this.resourceId,
            description: this.description,
            resolution: this.resolution,
            canAutoFix: this.canAutoFix,
            propertyMismatch: this.propertyMismatch ? this.propertyMismatch.toJSON() : null,
        };
    }

    /**
     * Create an orphaned resource issue
     *
     * @param {Object} params
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {string} params.resourceId - Resource physical ID
     * @param {string} params.description - Issue description
     * @returns {Issue}
     */
    static orphanedResource({ resourceType, resourceId, description }) {
        return new Issue({
            type: Issue.TYPES.ORPHANED_RESOURCE,
            severity: Issue.SEVERITIES.CRITICAL,
            resourceType,
            resourceId,
            description,
            resolution: 'Import resource into CloudFormation stack using frigg repair --import',
            canAutoFix: true,
        });
    }

    /**
     * Create a missing resource issue
     *
     * @param {Object} params
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {string} params.resourceId - Resource logical ID
     * @param {string} params.description - Issue description
     * @returns {Issue}
     */
    static missingResource({ resourceType, resourceId, description }) {
        return new Issue({
            type: Issue.TYPES.MISSING_RESOURCE,
            severity: Issue.SEVERITIES.CRITICAL,
            resourceType,
            resourceId,
            description,
            resolution: 'Verify resource was not manually deleted. May need to recreate or remove from stack definition.',
            canAutoFix: false,
        });
    }

    /**
     * Format a value for display in issue descriptions
     * Handles arrays, objects, and primitive types
     *
     * @private
     * @param {*} value - Value to format
     * @returns {string} Formatted value
     */
    static _formatValue(value) {
        if (value === null || value === undefined) {
            return String(value);
        }

        // Handle arrays
        if (Array.isArray(value)) {
            // For arrays of objects (like Tags), show count and first few items
            if (value.length > 0 && typeof value[0] === 'object') {
                if (value.length <= 3) {
                    return JSON.stringify(value);
                }
                // Show first 2 items + count for long arrays
                const preview = value.slice(0, 2);
                return `${JSON.stringify(preview).slice(0, -1)}, ... (${value.length} total)]`;
            }
            // For simple arrays, stringify
            return JSON.stringify(value);
        }

        // Handle objects
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            if (keys.length === 0) {
                return '{}';
            }
            if (keys.length <= 3) {
                return JSON.stringify(value);
            }
            // For large objects, show keys count
            return `{${keys.slice(0, 3).join(', ')}, ... (${keys.length} keys total)}`;
        }

        // Primitives
        return String(value);
    }

    /**
     * Create a property mismatch issue
     *
     * @param {Object} params
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {string} params.resourceId - Resource identifier
     * @param {PropertyMismatch} params.mismatch - Property mismatch details
     * @returns {Issue}
     */
    static propertyMismatch({ resourceType, resourceId, mismatch }) {
        const severity = mismatch.requiresReplacement()
            ? Issue.SEVERITIES.CRITICAL
            : Issue.SEVERITIES.WARNING;

        const canAutoFix = mismatch.canAutoFix();

        // Format expected and actual values for display
        const formattedExpected = Issue._formatValue(mismatch.expectedValue);
        const formattedActual = Issue._formatValue(mismatch.actualValue);

        const description = `Property mismatch: ${mismatch.propertyPath} (expected: ${formattedExpected}, actual: ${formattedActual})`;

        const resolution = canAutoFix
            ? 'Can be auto-fixed using frigg repair --reconcile'
            : 'Requires resource replacement - manual intervention needed';

        return new Issue({
            type: Issue.TYPES.PROPERTY_MISMATCH,
            severity,
            resourceType,
            resourceId,
            description,
            resolution,
            canAutoFix,
            propertyMismatch: mismatch,
        });
    }
}

module.exports = Issue;
