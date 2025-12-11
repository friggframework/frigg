/**
 * Script Schedule Repository Interface
 * Abstract base class defining the contract for script schedule persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Script schedules support Phase 2 hybrid scheduling:
 * - Database overrides take precedence over Definition defaults
 * - EventBridge rules provisioned for enabled schedules
 * - lastTriggeredAt and nextTriggerAt for monitoring
 *
 * @abstract
 */
class ScriptScheduleRepositoryInterface {
    /**
     * Find a schedule by script name
     *
     * @param {string} scriptName - The script name
     * @returns {Promise<Object|null>} Schedule record or null if not found
     * @abstract
     */
    async findScheduleByScriptName(scriptName) {
        throw new Error('Method findScheduleByScriptName must be implemented by subclass');
    }

    /**
     * Create or update a schedule (upsert)
     *
     * @param {Object} params - Schedule parameters
     * @param {string} params.scriptName - Name of the script
     * @param {boolean} params.enabled - Whether schedule is enabled
     * @param {string} params.cronExpression - Cron expression
     * @param {string} [params.timezone] - Timezone (default 'UTC')
     * @param {string} [params.awsScheduleArn] - AWS EventBridge Scheduler ARN
     * @param {string} [params.awsScheduleName] - AWS EventBridge Scheduler name
     * @returns {Promise<Object>} Created or updated schedule record
     * @abstract
     */
    async upsertSchedule({ scriptName, enabled, cronExpression, timezone, awsScheduleArn, awsScheduleName }) {
        throw new Error('Method upsertSchedule must be implemented by subclass');
    }

    /**
     * Delete a schedule by script name
     *
     * @param {string} scriptName - The script name
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteSchedule(scriptName) {
        throw new Error('Method deleteSchedule must be implemented by subclass');
    }

    /**
     * Update AWS EventBridge Scheduler information
     *
     * @param {string} scriptName - The script name
     * @param {Object} awsInfo - AWS schedule information
     * @param {string} [awsInfo.awsScheduleArn] - AWS EventBridge Scheduler ARN
     * @param {string} [awsInfo.awsScheduleName] - AWS EventBridge Scheduler name
     * @returns {Promise<Object>} Updated schedule record
     * @abstract
     */
    async updateScheduleAwsInfo(scriptName, { awsScheduleArn, awsScheduleName }) {
        throw new Error('Method updateScheduleAwsInfo must be implemented by subclass');
    }

    /**
     * Update last triggered timestamp
     *
     * @param {string} scriptName - The script name
     * @param {Date} [timestamp] - Trigger timestamp (default: now)
     * @returns {Promise<Object>} Updated schedule record
     * @abstract
     */
    async updateScheduleLastTriggered(scriptName, timestamp) {
        throw new Error('Method updateScheduleLastTriggered must be implemented by subclass');
    }

    /**
     * Update next trigger timestamp
     *
     * @param {string} scriptName - The script name
     * @param {Date} timestamp - Next trigger timestamp
     * @returns {Promise<Object>} Updated schedule record
     * @abstract
     */
    async updateScheduleNextTrigger(scriptName, timestamp) {
        throw new Error('Method updateScheduleNextTrigger must be implemented by subclass');
    }

    /**
     * List all schedules
     *
     * @param {Object} [options] - Query options
     * @param {boolean} [options.enabledOnly] - Only return enabled schedules
     * @returns {Promise<Array>} Array of schedule records
     * @abstract
     */
    async listSchedules(options = {}) {
        throw new Error('Method listSchedules must be implemented by subclass');
    }
}

module.exports = { ScriptScheduleRepositoryInterface };
