/**
 * StackHealthReport Aggregate Root
 *
 * Represents the complete health assessment of a CloudFormation stack,
 * including all resources, detected issues, and overall health score.
 *
 * As an aggregate root, this entity controls access to Resource and Issue entities
 * and maintains consistency across the entire health report.
 */

const StackIdentifier = require('../value-objects/stack-identifier');
const HealthScore = require('../value-objects/health-score');
const Resource = require('./resource');
const Issue = require('./issue');

class StackHealthReport {
    /**
     * Create a new StackHealthReport
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {HealthScore} params.healthScore - Overall health score (0-100)
     * @param {Resource[]} [params.resources=[]] - Resources in the stack
     * @param {Issue[]} [params.issues=[]] - Detected issues
     * @param {Date} [params.timestamp=new Date()] - When the health check was performed
     * @param {Object} [params.metadata={}] - Additional metadata (e.g., scan duration)
     */
    constructor({
        stackIdentifier,
        healthScore,
        resources = [],
        issues = [],
        timestamp = new Date(),
        metadata = {},
    }) {
        // Validate required fields
        if (!stackIdentifier) {
            throw new Error('stackIdentifier is required');
        }

        if (!healthScore) {
            throw new Error('healthScore is required');
        }

        if (!(stackIdentifier instanceof StackIdentifier)) {
            throw new Error('stackIdentifier must be a StackIdentifier instance');
        }

        if (!(healthScore instanceof HealthScore)) {
            throw new Error('healthScore must be a HealthScore instance');
        }

        // Validate resources array
        if (!Array.isArray(resources)) {
            throw new Error('resources must be an array');
        }

        for (const resource of resources) {
            if (!(resource instanceof Resource)) {
                throw new Error('All resources must be Resource instances');
            }
        }

        // Validate issues array
        if (!Array.isArray(issues)) {
            throw new Error('issues must be an array');
        }

        for (const issue of issues) {
            if (!(issue instanceof Issue)) {
                throw new Error('All issues must be Issue instances');
            }
        }

        this.stackIdentifier = stackIdentifier;
        this.healthScore = healthScore;
        this.resources = [...resources]; // Copy to prevent external mutation
        this.issues = [...issues]; // Copy to prevent external mutation
        this.timestamp = timestamp;
        this.metadata = metadata;
    }

    // ========================================
    // Resource Queries
    // ========================================

    /**
     * Get all orphaned resources (exist in cloud but not in stack)
     * @returns {Resource[]}
     */
    getOrphanedResources() {
        return this.resources.filter((r) => r.isOrphaned());
    }

    /**
     * Get all missing resources (in stack but not in cloud)
     * @returns {Resource[]}
     */
    getMissingResources() {
        return this.resources.filter((r) => r.isMissing());
    }

    /**
     * Get all drifted resources (properties differ)
     * @returns {Resource[]}
     */
    getDriftedResources() {
        return this.resources.filter((r) => r.isDrifted());
    }

    /**
     * Get all healthy resources (in stack with no issues)
     * @returns {Resource[]}
     */
    getHealthyResources() {
        return this.resources.filter((r) => r.isInStack() && r.isHealthy());
    }

    /**
     * Get all resources that are in the stack
     * @returns {Resource[]}
     */
    getResourcesInStack() {
        return this.resources.filter((r) => r.isInStack());
    }

    /**
     * Get total resource count
     * @returns {number}
     */
    getResourceCount() {
        return this.resources.length;
    }

    /**
     * Get count of orphaned resources
     * @returns {number}
     */
    getOrphanedResourceCount() {
        return this.getOrphanedResources().length;
    }

    /**
     * Get count of missing resources
     * @returns {number}
     */
    getMissingResourceCount() {
        return this.getMissingResources().length;
    }

    /**
     * Get count of drifted resources
     * @returns {number}
     */
    getDriftedResourceCount() {
        return this.getDriftedResources().length;
    }

    // ========================================
    // Issue Queries
    // ========================================

    /**
     * Get all critical issues
     * @returns {Issue[]}
     */
    getCriticalIssues() {
        return this.issues.filter((i) => i.isCritical());
    }

    /**
     * Get all warning-level issues
     * @returns {Issue[]}
     */
    getWarnings() {
        return this.issues.filter((i) => i.isWarning());
    }

    /**
     * Get all info-level issues
     * @returns {Issue[]}
     */
    getInfoIssues() {
        return this.issues.filter((i) => i.isInfo());
    }

    /**
     * Get total issue count
     * @returns {number}
     */
    getIssueCount() {
        return this.issues.length;
    }

    /**
     * Get count of critical issues
     * @returns {number}
     */
    getCriticalIssueCount() {
        return this.getCriticalIssues().length;
    }

    /**
     * Get count of warnings
     * @returns {number}
     */
    getWarningCount() {
        return this.getWarnings().length;
    }

    /**
     * Get count of info issues
     * @returns {number}
     */
    getInfoIssueCount() {
        return this.getInfoIssues().length;
    }

    /**
     * Check if report has any critical issues
     * @returns {boolean}
     */
    hasCriticalIssues() {
        return this.getCriticalIssueCount() > 0;
    }

    // ========================================
    // Health Assessment
    // ========================================

    /**
     * Check if stack is healthy (score >= 80)
     * @returns {boolean}
     */
    isHealthy() {
        return this.healthScore.isHealthy();
    }

    /**
     * Get qualitative health assessment
     * @returns {string} 'healthy', 'degraded', or 'unhealthy'
     */
    getQualitativeAssessment() {
        return this.healthScore.qualitativeAssessment();
    }

    // ========================================
    // Summary
    // ========================================

    /**
     * Get summary statistics for the health report
     * @returns {Object}
     */
    getSummary() {
        return {
            stackName: this.stackIdentifier.stackName,
            region: this.stackIdentifier.region,
            healthScore: this.healthScore.value,
            qualitativeAssessment: this.getQualitativeAssessment(),
            isHealthy: this.isHealthy(),
            resourceCount: this.getResourceCount(),
            issueCount: this.getIssueCount(),
            criticalIssueCount: this.getCriticalIssueCount(),
            warningCount: this.getWarningCount(),
            orphanedResourceCount: this.getOrphanedResourceCount(),
            missingResourceCount: this.getMissingResourceCount(),
            driftedResourceCount: this.getDriftedResourceCount(),
            timestamp: this.timestamp.toISOString(),
        };
    }

    // ========================================
    // Serialization
    // ========================================

    /**
     * Get string representation
     * @returns {string}
     */
    toString() {
        return `StackHealthReport: ${this.stackIdentifier.toString()} - Score: ${this.healthScore.value} (${this.getQualitativeAssessment()}) - Resources: ${this.getResourceCount()}, Issues: ${this.getIssueCount()}`;
    }

    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            stackIdentifier: this.stackIdentifier.toJSON(),
            healthScore: this.healthScore.value,
            qualitativeAssessment: this.getQualitativeAssessment(),
            isHealthy: this.isHealthy(),
            resources: this.resources.map((r) => r.toJSON()),
            issues: this.issues.map((i) => i.toJSON()),
            resourceCount: this.getResourceCount(),
            issueCount: this.getIssueCount(),
            summary: this.getSummary(),
            timestamp: this.timestamp.toISOString(),
            metadata: this.metadata,
        };
    }
}

module.exports = StackHealthReport;
