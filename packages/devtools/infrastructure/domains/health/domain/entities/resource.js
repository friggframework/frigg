/**
 * Resource Entity
 *
 * Represents a CloudFormation resource with its current state and any detected issues
 */

const ResourceState = require('../value-objects/resource-state');

class Resource {
    /**
     * Create a new Resource
     *
     * @param {Object} params
     * @param {string|null} params.logicalId - CloudFormation logical ID (null for orphaned resources)
     * @param {string} params.physicalId - Physical resource ID in cloud provider
     * @param {string} params.resourceType - CloudFormation resource type (e.g., AWS::EC2::VPC)
     * @param {ResourceState} params.state - Resource state
     * @param {Object} [params.properties={}] - Resource properties
     * @param {Issue[]} [params.issues=[]] - Detected issues with this resource
     */
    constructor({
        logicalId = null,
        physicalId,
        resourceType,
        state,
        properties = {},
        issues = [],
    }) {
        // Validate required fields
        if (physicalId === undefined || physicalId === null) {
            throw new Error('physicalId is required');
        }

        if (!resourceType) {
            throw new Error('resourceType is required');
        }

        if (!state) {
            throw new Error('state is required');
        }

        if (!(state instanceof ResourceState)) {
            throw new Error('state must be a ResourceState instance');
        }

        this.logicalId = logicalId;
        this.physicalId = physicalId;
        this.resourceType = resourceType;
        this.state = state;
        this.properties = properties;
        this.issues = [...issues]; // Copy array to avoid mutations
    }

    /**
     * Check if resource is in CloudFormation stack
     * @returns {boolean}
     */
    isInStack() {
        return this.state.isInStack();
    }

    /**
     * Check if resource is orphaned (exists in cloud but not in stack)
     * @returns {boolean}
     */
    isOrphaned() {
        return this.state.isOrphaned();
    }

    /**
     * Check if resource is missing (exists in stack but not in cloud)
     * @returns {boolean}
     */
    isMissing() {
        return this.state.isMissing();
    }

    /**
     * Check if resource has drifted (properties differ)
     * @returns {boolean}
     */
    isDrifted() {
        return this.state.isDrifted();
    }

    /**
     * Add an issue to this resource
     * @param {Issue} issue
     */
    addIssue(issue) {
        this.issues.push(issue);
    }

    /**
     * Check if resource has any issues
     * @returns {boolean}
     */
    hasIssues() {
        return this.issues.length > 0;
    }

    /**
     * Check if resource has critical issues
     * @returns {boolean}
     */
    hasCriticalIssues() {
        return this.issues.some(issue => issue.isCritical());
    }

    /**
     * Get all critical issues
     * @returns {Issue[]}
     */
    getCriticalIssues() {
        return this.issues.filter(issue => issue.isCritical());
    }

    /**
     * Check if resource is healthy (no issues)
     * @returns {boolean}
     */
    isHealthy() {
        return !this.hasIssues();
    }

    /**
     * Get resource identifier (logical ID or physical ID)
     * @returns {string}
     */
    getIdentifier() {
        return this.logicalId || this.physicalId;
    }

    /**
     * Get string representation
     * @returns {string}
     */
    toString() {
        return `Resource: ${this.resourceType} [${this.state.toString()}] - LogicalId: ${this.logicalId}, PhysicalId: ${this.physicalId}`;
    }

    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            logicalId: this.logicalId,
            physicalId: this.physicalId,
            resourceType: this.resourceType,
            state: this.state.toString(),
            properties: this.properties,
            issues: this.issues.map(issue => issue.toJSON()),
            isHealthy: this.isHealthy(),
        };
    }
}

module.exports = Resource;
