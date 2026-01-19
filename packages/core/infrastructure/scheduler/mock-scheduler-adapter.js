/**
 * Mock Scheduler Adapter for Local Development
 *
 * Stores schedules in memory and logs instead of creating real EventBridge schedules.
 * Used when SCHEDULER_PROVIDER=mock or in local/dev/test environments.
 *
 * This adapter implements SchedulerServiceInterface for local development and testing.
 */

const { SchedulerServiceInterface } = require('./scheduler-service-interface');

class MockSchedulerAdapter extends SchedulerServiceInterface {
    constructor(options = {}) {
        super();
        this.verbose = options.verbose || false;
        this.schedules = new Map();
    }

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
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }
        if (!scheduleAt || !(scheduleAt instanceof Date)) {
            throw new Error('scheduleAt must be a valid Date object');
        }
        if (!targetArn) {
            throw new Error('targetArn is required');
        }

        const scheduleData = {
            scheduleName,
            scheduledAt: scheduleAt.toISOString(),
            targetArn,
            payload,
            createdAt: new Date().toISOString(),
            state: 'ENABLED',
        };

        this.schedules.set(scheduleName, scheduleData);

        console.log(`[MockScheduler] Created schedule: ${scheduleName}`);
        console.log(`[MockScheduler]   Scheduled for: ${scheduleAt.toISOString()}`);
        console.log(`[MockScheduler]   Target: ${targetArn}`);
        if (this.verbose) {
            console.log(`[MockScheduler]   Payload:`, JSON.stringify(payload, null, 2));
        }

        return {
            scheduleArn: `arn:aws:scheduler:mock-region:123456789:schedule/frigg-integration-schedules/${scheduleName}`,
            scheduledAt: scheduleAt.toISOString(),
        };
    }

    /**
     * Delete a scheduled job
     *
     * @param {string} scheduleName - Name of the schedule to delete
     * @returns {Promise<void>}
     */
    async deleteSchedule(scheduleName) {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }

        const existed = this.schedules.has(scheduleName);
        this.schedules.delete(scheduleName);

        console.log(`[MockScheduler] Deleted schedule: ${scheduleName} (existed: ${existed})`);
    }

    /**
     * Get the status of a scheduled job
     *
     * @param {string} scheduleName - Name of the schedule
     * @returns {Promise<{exists: boolean, scheduledAt?: string, state?: string}>}
     */
    async getScheduleStatus(scheduleName) {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }

        const schedule = this.schedules.get(scheduleName);

        if (!schedule) {
            return { exists: false };
        }

        return {
            exists: true,
            scheduledAt: schedule.scheduledAt,
            state: schedule.state,
        };
    }

    /**
     * Get all scheduled jobs (helper for testing)
     *
     * @returns {Object} Map of all schedules as plain object
     */
    _getSchedules() {
        return Object.fromEntries(this.schedules);
    }

    /**
     * Clear all schedules (helper for testing)
     */
    _clearSchedules() {
        const count = this.schedules.size;
        this.schedules.clear();
        console.log(`[MockScheduler] Cleared ${count} schedules`);
    }

    /**
     * Simulate triggering a schedule (helper for testing)
     *
     * @param {string} scheduleName - Name of the schedule to trigger
     * @returns {Object|null} The payload that would be sent, or null if not found
     */
    _simulateTrigger(scheduleName) {
        const schedule = this.schedules.get(scheduleName);
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
