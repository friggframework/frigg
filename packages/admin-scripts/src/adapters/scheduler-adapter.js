/**
 * Scheduler Adapter (Abstract Base Class)
 *
 * Port - Hexagonal Architecture
 *
 * Defines the contract for scheduler implementations.
 * Supports AWS EventBridge, local cron, or other providers.
 */
class SchedulerAdapter {
    getName() {
        throw new Error('SchedulerAdapter.getName() must be implemented');
    }

    /**
     * Create or update a schedule for a script
     * @param {Object} config
     * @param {string} config.scriptName - Script identifier
     * @param {string} config.cronExpression - Cron expression
     * @param {string} [config.timezone] - Timezone (default UTC)
     * @param {Object} [config.input] - Optional input params
     * @returns {Promise<Object>} Created schedule { ruleArn, ruleName }
     */
    async createSchedule(config) {
        throw new Error('SchedulerAdapter.createSchedule() must be implemented');
    }

    /**
     * Delete a schedule
     * @param {string} scriptName - Script identifier
     * @returns {Promise<void>}
     */
    async deleteSchedule(scriptName) {
        throw new Error('SchedulerAdapter.deleteSchedule() must be implemented');
    }

    /**
     * Enable or disable a schedule
     * @param {string} scriptName - Script identifier
     * @param {boolean} enabled - Whether to enable
     * @returns {Promise<void>}
     */
    async setScheduleEnabled(scriptName, enabled) {
        throw new Error('SchedulerAdapter.setScheduleEnabled() must be implemented');
    }

    /**
     * List all schedules
     * @returns {Promise<Array>} List of schedules
     */
    async listSchedules() {
        throw new Error('SchedulerAdapter.listSchedules() must be implemented');
    }

    /**
     * Get a specific schedule
     * @param {string} scriptName - Script identifier
     * @returns {Promise<Object>} Schedule details
     */
    async getSchedule(scriptName) {
        throw new Error('SchedulerAdapter.getSchedule() must be implemented');
    }
}

module.exports = { SchedulerAdapter };
