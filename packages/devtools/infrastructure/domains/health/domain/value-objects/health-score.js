/**
 * HealthScore Value Object
 *
 * Immutable health score from 0-100 with qualitative assessment
 * - 80-100: healthy
 * - 40-79: degraded
 * - 0-39: unhealthy
 */

class HealthScore {
    /**
     * Create a new HealthScore
     *
     * @param {number} value - Score from 0 to 100
     */
    constructor(value) {
        // Validate type
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
            throw new Error('Health score must be a number');
        }

        // Validate range
        if (value < 0 || value > 100) {
            throw new Error('Health score must be between 0 and 100');
        }

        // Assign property
        this._value = value;

        // Make immutable
        Object.freeze(this);
    }

    /**
     * Get score value
     * @returns {number}
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
     * Get qualitative assessment
     *
     * @returns {'healthy' | 'degraded' | 'unhealthy'}
     */
    qualitativeAssessment() {
        if (this._value >= 80) {
            return 'healthy';
        } else if (this._value >= 40) {
            return 'degraded';
        } else {
            return 'unhealthy';
        }
    }

    /**
     * Check if score is healthy (>= 80)
     *
     * @returns {boolean}
     */
    isHealthy() {
        return this._value >= 80;
    }

    /**
     * Check if score is degraded (40-79)
     *
     * @returns {boolean}
     */
    isDegraded() {
        return this._value >= 40 && this._value < 80;
    }

    /**
     * Check if score is unhealthy (< 40)
     *
     * @returns {boolean}
     */
    isUnhealthy() {
        return this._value < 40;
    }

    /**
     * Get string representation
     *
     * @returns {string}
     */
    toString() {
        return `${this._value} (${this.qualitativeAssessment()})`;
    }

    /**
     * Create perfect health score (100)
     *
     * @returns {HealthScore}
     */
    static perfect() {
        return new HealthScore(100);
    }

    /**
     * Create failed health score (0)
     *
     * @returns {HealthScore}
     */
    static failed() {
        return new HealthScore(0);
    }

    /**
     * Create HealthScore from percentage (0.0 to 1.0)
     *
     * @param {number} percentage - Percentage as decimal (0.75 = 75%)
     * @returns {HealthScore}
     */
    static fromPercentage(percentage) {
        if (typeof percentage !== 'number' || isNaN(percentage) || !isFinite(percentage)) {
            throw new Error('Percentage must be a number');
        }

        if (percentage < 0 || percentage > 1) {
            throw new Error('Percentage must be between 0 and 1');
        }

        return new HealthScore(Math.round(percentage * 100));
    }
}

module.exports = HealthScore;
