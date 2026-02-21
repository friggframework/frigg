const { SchedulerAdapter } = require('./scheduler-adapter');

/**
 * Local Scheduler Adapter
 *
 * Infrastructure Adapter - Hexagonal Architecture
 *
 * In-memory implementation for local development and testing.
 * Stores schedule configurations but does not execute them.
 * For actual cron execution, use a library like node-cron.
 */
class LocalSchedulerAdapter extends SchedulerAdapter {
    constructor() {
        super();
        this.schedules = new Map();
        this.intervals = new Map();
    }

    getName() {
        return 'local-cron';
    }

    async createSchedule({ scriptName, cronExpression, timezone, input }) {
        // Store schedule (actual cron execution would use node-cron)
        this.schedules.set(scriptName, {
            scriptName,
            cronExpression,
            timezone: timezone || 'UTC',
            input,
            enabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        return {
            scheduleName: scriptName,
            scheduleArn: `local:schedule:${scriptName}`,
        };
    }

    async deleteSchedule(scriptName) {
        this.schedules.delete(scriptName);
        if (this.intervals.has(scriptName)) {
            clearInterval(this.intervals.get(scriptName));
            this.intervals.delete(scriptName);
        }
    }

    async setScheduleEnabled(scriptName, enabled) {
        const schedule = this.schedules.get(scriptName);
        if (!schedule) {
            throw new Error(`Schedule for script "${scriptName}" not found`);
        }

        schedule.enabled = enabled;
        schedule.updatedAt = new Date().toISOString();
    }

    async listSchedules() {
        return Array.from(this.schedules.values()).map((schedule) => ({
            Name: `frigg-script-${schedule.scriptName}`,
            State: schedule.enabled ? 'ENABLED' : 'DISABLED',
            ScheduleExpression: schedule.cronExpression,
            ScheduleExpressionTimezone: schedule.timezone,
        }));
    }

    async getSchedule(scriptName) {
        const schedule = this.schedules.get(scriptName);
        if (!schedule) {
            throw new Error(`Schedule for script "${scriptName}" not found`);
        }

        return {
            Name: scriptName,
            State: schedule.enabled ? 'ENABLED' : 'DISABLED',
            ScheduleExpression: schedule.cronExpression,
            ScheduleExpressionTimezone: schedule.timezone,
            Target: {
                Input: JSON.stringify({
                    scriptName,
                    trigger: 'SCHEDULED',
                    params: schedule.input || {},
                }),
            },
            CreationDate: new Date(schedule.createdAt),
            LastModificationDate: new Date(schedule.updatedAt),
        };
    }

    /**
     * Clear all schedules (useful for testing)
     */
    clear() {
        this.schedules.clear();
        this.intervals.forEach((interval) => clearInterval(interval));
        this.intervals.clear();
    }

    /**
     * Get number of schedules (useful for testing)
     */
    get size() {
        return this.schedules.size;
    }
}

module.exports = { LocalSchedulerAdapter };
