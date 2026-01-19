/**
 * Mock Scheduler Adapter for Local Development
 *
 * Stores schedules in memory and logs instead of creating real EventBridge schedules.
 * Used when SCHEDULER_PROVIDER=mock or in local/dev/test environments.
 */

const schedules = new Map();

class MockSchedulerAdapter {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Create a one-time schedule (stored in memory)
     *
     * @param {Object} params
     * @param {string} params.jobId - Unique identifier for the schedule
     * @param {Date} params.scheduledAt - When to trigger the schedule
     * @param {string} params.targetArn - Target resource ARN (SQS queue)
     * @param {string} params.roleArn - IAM role ARN (ignored in mock)
     * @param {Object} params.payload - JSON payload to send
     * @returns {Promise<{success: boolean, scheduleName: string, scheduledTime: string}>}
     */
    async createSchedule({ jobId, scheduledAt, targetArn, roleArn, payload }) {
        const scheduleName = jobId;
        const scheduleData = {
            scheduleName,
            scheduledAt: scheduledAt.toISOString(),
            targetArn,
            payload,
            createdAt: new Date().toISOString(),
            state: 'ENABLED',
        };

        schedules.set(scheduleName, scheduleData);

        console.log(`[MockScheduler] Created schedule: ${scheduleName}`);
        console.log(`[MockScheduler]   Scheduled for: ${scheduledAt.toISOString()}`);
        console.log(`[MockScheduler]   Target: ${targetArn}`);
        if (this.verbose) {
            console.log(`[MockScheduler]   Payload:`, JSON.stringify(payload, null, 2));
        }

        return {
            success: true,
            scheduleName,
            scheduledTime: scheduledAt.toISOString(),
        };
    }

    /**
     * Delete a schedule from memory
     *
     * @param {string} scheduleName - Name of the schedule to delete
     * @returns {Promise<{success: boolean, deleted: boolean}>}
     */
    async deleteSchedule(scheduleName) {
        const existed = schedules.has(scheduleName);
        schedules.delete(scheduleName);

        console.log(`[MockScheduler] Deleted schedule: ${scheduleName} (existed: ${existed})`);

        return {
            success: true,
            deleted: existed,
        };
    }

    /**
     * Get schedule status
     *
     * @param {string} scheduleName - Name of the schedule
     * @returns {Promise<{exists: boolean, state?: string, scheduledTime?: string}>}
     */
    async getScheduleStatus(scheduleName) {
        const schedule = schedules.get(scheduleName);

        if (!schedule) {
            return { exists: false };
        }

        return {
            exists: true,
            state: schedule.state,
            scheduledTime: schedule.scheduledAt,
            createdAt: schedule.createdAt,
        };
    }

    /**
     * Get all scheduled jobs (helper for testing)
     *
     * @returns {Object} Map of all schedules as plain object
     */
    _getSchedules() {
        return Object.fromEntries(schedules);
    }

    /**
     * Clear all schedules (helper for testing)
     */
    _clearSchedules() {
        const count = schedules.size;
        schedules.clear();
        console.log(`[MockScheduler] Cleared ${count} schedules`);
    }

    /**
     * Simulate triggering a schedule (helper for testing)
     *
     * @param {string} scheduleName - Name of the schedule to trigger
     * @returns {Object|null} The payload that would be sent, or null if not found
     */
    _simulateTrigger(scheduleName) {
        const schedule = schedules.get(scheduleName);
        if (!schedule) {
            console.log(`[MockScheduler] Cannot trigger - schedule not found: ${scheduleName}`);
            return null;
        }

        console.log(`[MockScheduler] Simulating trigger for: ${scheduleName}`);
        console.log(`[MockScheduler]   Payload:`, JSON.stringify(schedule.payload, null, 2));

        return schedule.payload;
    }
}

module.exports = { MockSchedulerAdapter };
