/**
 * HealthScoreCalculator Domain Service
 *
 * Calculates health scores (0-100) based on percentage-based penalties
 * weighted by resource criticality.
 *
 * Resource Criticality:
 * - Critical: Lambda, RDS, DynamoDB (affect application functionality)
 * - Infrastructure: VPC, Subnet, SecurityGroup, KMS, etc.
 *
 * Percentage-Based Penalties (max 100 points):
 * - Critical issues (orphaned, missing): up to 50 points (% of total resources)
 * - Functional drift: up to 30 points (% of critical resources drifted)
 * - Infrastructure drift: up to 20 points (% of infrastructure resources drifted)
 *
 * Example: 16/16 Lambdas drifted = 100% functional drift = 30 penalty → 70/100 score
 */

const HealthScore = require('../value-objects/health-score');

class HealthScoreCalculator {
    /**
     * Critical resource types that affect application functionality
     * @private
     */
    static CRITICAL_RESOURCE_TYPES = [
        'AWS::Lambda::Function',
        'AWS::RDS::DBCluster',
        'AWS::RDS::DBInstance',
        'AWS::DynamoDB::Table',
    ];

    /**
     * Maximum penalties for each category (sum = 100)
     * @private
     */
    static MAX_PENALTIES = {
        criticalIssues: 50, // Orphaned resources, missing resources
        functionalDrift: 30, // Drift on critical resources (Lambda, RDS, DynamoDB)
        infrastructureDrift: 20, // Drift on infrastructure resources (VPC, networking, KMS)
    };

    /**
     * Create a new HealthScoreCalculator
     *
     * @param {Object} [config={}]
     * @param {Object} [config.maxPenalties] - Custom max penalty configuration
     * @param {number} [config.maxPenalties.criticalIssues] - Max penalty for critical issues (default: 50)
     * @param {number} [config.maxPenalties.functionalDrift] - Max penalty for functional drift (default: 30)
     * @param {number} [config.maxPenalties.infrastructureDrift] - Max penalty for infra drift (default: 20)
     */
    constructor(config = {}) {
        this.maxPenalties = {
            ...HealthScoreCalculator.MAX_PENALTIES,
            ...(config.maxPenalties || {}),
        };
    }

    /**
     * Check if resource type is critical (affects functionality)
     * @private
     */
    _isCriticalResourceType(resourceType) {
        return HealthScoreCalculator.CRITICAL_RESOURCE_TYPES.includes(resourceType);
    }

    /**
     * Calculate health score based on percentage-based penalties
     *
     * @param {Object} params
     * @param {Resource[]} params.resources - Resources in the stack
     * @param {Issue[]} params.issues - Detected issues
     * @returns {HealthScore}
     */
    calculate({ resources, issues }) {
        const startingScore = 100;

        // Handle empty stack edge case
        if (resources.length === 0) {
            return new HealthScore(startingScore);
        }

        // Categorize resources by criticality
        const criticalResources = resources.filter((r) =>
            this._isCriticalResourceType(r.resourceType)
        );
        const infraResources = resources.filter(
            (r) => !this._isCriticalResourceType(r.resourceType)
        );

        // Count issues by category
        const criticalIssues = issues.filter(
            (issue) => issue.type === 'ORPHANED_RESOURCE' || issue.type === 'MISSING_RESOURCE'
        );
        const functionalDriftIssues = issues.filter(
            (issue) =>
                issue.type === 'PROPERTY_MISMATCH' &&
                this._isCriticalResourceType(issue.resourceType)
        );
        const infraDriftIssues = issues.filter(
            (issue) =>
                issue.type === 'PROPERTY_MISMATCH' &&
                !this._isCriticalResourceType(issue.resourceType)
        );

        // Calculate percentage-based penalties
        let totalPenalty = 0;

        // 1. Critical issues penalty (up to 50 points)
        if (criticalIssues.length > 0) {
            const criticalImpactPercent = criticalIssues.length / resources.length;
            totalPenalty += criticalImpactPercent * this.maxPenalties.criticalIssues;
        }

        // 2. Functional drift penalty (up to 30 points)
        if (functionalDriftIssues.length > 0 && criticalResources.length > 0) {
            // Get unique drifted critical resources
            const driftedCriticalResourceIds = new Set(
                functionalDriftIssues.map((issue) => issue.resourceId)
            );
            const functionalDriftPercent =
                driftedCriticalResourceIds.size / criticalResources.length;
            totalPenalty += functionalDriftPercent * this.maxPenalties.functionalDrift;
        }

        // 3. Infrastructure drift penalty (up to 20 points)
        if (infraDriftIssues.length > 0 && infraResources.length > 0) {
            // Get unique drifted infrastructure resources
            const driftedInfraResourceIds = new Set(
                infraDriftIssues.map((issue) => issue.resourceId)
            );
            const infraDriftPercent = driftedInfraResourceIds.size / infraResources.length;
            totalPenalty += infraDriftPercent * this.maxPenalties.infrastructureDrift;
        }

        // Calculate final score (capped at 0)
        const finalScore = Math.max(0, Math.round(startingScore - totalPenalty));

        return new HealthScore(finalScore);
    }

    /**
     * Explain the score calculation with detailed percentage-based breakdown
     *
     * @param {Object} params
     * @param {Resource[]} params.resources - Resources in the stack
     * @param {Issue[]} params.issues - Detected issues
     * @returns {Object} Explanation with breakdown
     */
    explainScore({ resources, issues }) {
        const startingScore = 100;

        if (resources.length === 0) {
            return {
                finalScore: startingScore,
                startingScore,
                totalPenalty: 0,
                breakdown: {
                    criticalIssues: { count: 0, impactPercent: 0, penalty: 0 },
                    functionalDrift: { count: 0, impactPercent: 0, penalty: 0 },
                    infrastructureDrift: { count: 0, impactPercent: 0, penalty: 0 },
                },
            };
        }

        // Categorize resources
        const criticalResources = resources.filter((r) =>
            this._isCriticalResourceType(r.resourceType)
        );
        const infraResources = resources.filter(
            (r) => !this._isCriticalResourceType(r.resourceType)
        );

        // Count issues by category
        const criticalIssues = issues.filter(
            (issue) => issue.type === 'ORPHANED_RESOURCE' || issue.type === 'MISSING_RESOURCE'
        );
        const functionalDriftIssues = issues.filter(
            (issue) =>
                issue.type === 'PROPERTY_MISMATCH' &&
                this._isCriticalResourceType(issue.resourceType)
        );
        const infraDriftIssues = issues.filter(
            (issue) =>
                issue.type === 'PROPERTY_MISMATCH' &&
                !this._isCriticalResourceType(issue.resourceType)
        );

        // Calculate penalties
        const breakdown = {
            criticalIssues: {
                count: criticalIssues.length,
                impactPercent: criticalIssues.length / resources.length,
                penalty:
                    (criticalIssues.length / resources.length) * this.maxPenalties.criticalIssues,
            },
            functionalDrift: {
                count: functionalDriftIssues.length,
                impactPercent:
                    criticalResources.length > 0
                        ? new Set(functionalDriftIssues.map((i) => i.resourceId)).size /
                          criticalResources.length
                        : 0,
                penalty:
                    criticalResources.length > 0
                        ? (new Set(functionalDriftIssues.map((i) => i.resourceId)).size /
                              criticalResources.length) *
                          this.maxPenalties.functionalDrift
                        : 0,
            },
            infrastructureDrift: {
                count: infraDriftIssues.length,
                impactPercent:
                    infraResources.length > 0
                        ? new Set(infraDriftIssues.map((i) => i.resourceId)).size /
                          infraResources.length
                        : 0,
                penalty:
                    infraResources.length > 0
                        ? (new Set(infraDriftIssues.map((i) => i.resourceId)).size /
                              infraResources.length) *
                          this.maxPenalties.infrastructureDrift
                        : 0,
            },
        };

        const totalPenalty =
            breakdown.criticalIssues.penalty +
            breakdown.functionalDrift.penalty +
            breakdown.infrastructureDrift.penalty;

        const finalScore = Math.max(0, Math.round(startingScore - totalPenalty));

        return {
            finalScore,
            startingScore,
            totalPenalty: Math.round(totalPenalty * 100) / 100, // Round to 2 decimal places
            breakdown,
            resourceCounts: {
                total: resources.length,
                critical: criticalResources.length,
                infrastructure: infraResources.length,
            },
        };
    }
}

module.exports = HealthScoreCalculator;
