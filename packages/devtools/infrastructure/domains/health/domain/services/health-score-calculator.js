/**
 * HealthScoreCalculator Domain Service
 *
 * Calculates health scores (0-100) based on detected issues and resource states.
 *
 * Penalty System:
 * - Critical issues (orphaned, missing, immutable drift): 20-30 points each
 * - Warning issues (mutable drift): 10 points each
 * - Info issues (missing tags): 5 points each
 *
 * Score is capped at 0 (cannot go negative).
 */

const HealthScore = require('../value-objects/health-score');

class HealthScoreCalculator {
    /**
     * Default penalty values for different issue severities
     * @private
     */
    static DEFAULT_PENALTIES = {
        critical: 30, // Orphaned resources, missing resources
        warning: 10, // Mutable property mismatches
        info: 5, // Missing tags, minor issues
        immutablePropertyMismatch: 20, // Immutable property changes (requires replacement)
    };

    /**
     * Create a new HealthScoreCalculator
     *
     * @param {Object} [config={}]
     * @param {Object} [config.penalties] - Custom penalty configuration
     * @param {number} [config.penalties.critical] - Penalty for critical issues (default: 30)
     * @param {number} [config.penalties.warning] - Penalty for warning issues (default: 10)
     * @param {number} [config.penalties.info] - Penalty for info issues (default: 5)
     * @param {number} [config.penalties.immutablePropertyMismatch] - Penalty for immutable property changes (default: 20)
     */
    constructor(config = {}) {
        this.penalties = {
            ...HealthScoreCalculator.DEFAULT_PENALTIES,
            ...(config.penalties || {}),
        };
    }

    /**
     * Get default penalty configuration
     * @returns {Object}
     */
    static getDefaultPenalties() {
        return { ...HealthScoreCalculator.DEFAULT_PENALTIES };
    }

    /**
     * Calculate health score based on resources and issues
     *
     * @param {Object} params
     * @param {Resource[]} params.resources - Resources in the stack
     * @param {Issue[]} params.issues - Detected issues
     * @returns {HealthScore}
     */
    calculate({ resources, issues }) {
        const startingScore = 100;
        let totalPenalty = 0;

        // Calculate penalties for each issue
        for (const issue of issues) {
            totalPenalty += this._calculateIssuePenalty(issue);
        }

        // Calculate final score (capped at 0)
        const finalScore = Math.max(0, startingScore - totalPenalty);

        return new HealthScore(finalScore);
    }

    /**
     * Calculate penalty for a single issue
     *
     * @private
     * @param {Issue} issue
     * @returns {number}
     */
    _calculateIssuePenalty(issue) {
        // Special case: immutable property mismatch has higher penalty than regular critical
        if (
            issue.isPropertyMismatch() &&
            issue.propertyMismatch &&
            issue.propertyMismatch.requiresReplacement()
        ) {
            return this.penalties.immutablePropertyMismatch;
        }

        // Standard severity-based penalties
        if (issue.isCritical()) {
            return this.penalties.critical;
        }

        if (issue.isWarning()) {
            return this.penalties.warning;
        }

        if (issue.isInfo()) {
            return this.penalties.info;
        }

        // Fallback (should never reach here if Issue validation is correct)
        return 0;
    }

    /**
     * Explain the score calculation with detailed breakdown
     *
     * @param {Object} params
     * @param {Resource[]} params.resources - Resources in the stack
     * @param {Issue[]} params.issues - Detected issues
     * @returns {Object} Explanation with breakdown
     */
    explainScore({ resources, issues }) {
        const startingScore = 100;
        let totalPenalty = 0;

        // Count issues by severity
        const breakdown = {
            critical: { count: 0, penalty: 0 },
            warning: { count: 0, penalty: 0 },
            info: { count: 0, penalty: 0 },
        };

        // Count issues by type
        const issueTypes = {};

        // Process each issue
        for (const issue of issues) {
            const penalty = this._calculateIssuePenalty(issue);
            totalPenalty += penalty;

            // Track by severity
            if (issue.isCritical()) {
                breakdown.critical.count++;
                breakdown.critical.penalty += penalty;
            } else if (issue.isWarning()) {
                breakdown.warning.count++;
                breakdown.warning.penalty += penalty;
            } else if (issue.isInfo()) {
                breakdown.info.count++;
                breakdown.info.penalty += penalty;
            }

            // Track by type
            issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
        }

        const finalScore = Math.max(0, startingScore - totalPenalty);

        return {
            finalScore,
            startingScore,
            totalPenalty,
            breakdown,
            issueTypes,
        };
    }
}

module.exports = HealthScoreCalculator;
