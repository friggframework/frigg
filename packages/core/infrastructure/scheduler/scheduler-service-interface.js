/**
 * Scheduler Service Interface (Port)
 *
 * Defines the contract for scheduling one-time jobs.
 * All scheduler adapters must extend this interface.
 *
 * Following Frigg's hexagonal architecture pattern:
 * - Port defines WHAT the service does (contract)
 * - Adapters implement HOW (AWS EventBridge, Mock, etc.)
 */
class SchedulerServiceInterface {
    /**
     * Schedule a one-time job to be executed at a specific time
     *
     * @param {Object} params
     * @param {string} params.scheduleName - Unique name for the schedule
     * @param {Date} params.scheduleAt - When to trigger the schedule
     * @param {string} params.targetArn - Target resource ARN (SQS queue)
     * @param {Object} params.payload - JSON payload to send
     * @returns {Promise<{scheduleArn: string, scheduledAt: string}>}
     */
    async scheduleOneTime({ scheduleName, scheduleAt, targetArn, payload }) {
        throw new Error('Method scheduleOneTime must be implemented by subclass');
    }

    /**
     * Delete a scheduled job
     *
     * @param {string} scheduleName - Name of the schedule to delete
     * @returns {Promise<void>}
     */
    async deleteSchedule(scheduleName) {
        throw new Error('Method deleteSchedule must be implemented by subclass');
    }

    /**
     * Get the status of a scheduled job
     *
     * @param {string} scheduleName - Name of the schedule
     * @returns {Promise<{exists: boolean, scheduledAt?: string, state?: string}>}
     */
    async getScheduleStatus(scheduleName) {
        throw new Error('Method getScheduleStatus must be implemented by subclass');
    }
}

module.exports = { SchedulerServiceInterface };
