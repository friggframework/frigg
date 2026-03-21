/**
 * Netlify Scheduler Adapter
 *
 * Implements SchedulerServiceInterface for Netlify deployments.
 *
 * Netlify Scheduled Functions use cron syntax but are defined statically in
 * netlify.toml or via the @netlify/functions schedule() helper. They cannot
 * be created dynamically at runtime like EventBridge Scheduler.
 *
 * Strategy for one-time scheduled jobs on Netlify:
 *   1. Store the schedule in the database (same as mock adapter pattern)
 *   2. A Netlify Scheduled Function runs on a cron interval (e.g., every 5 min)
 *   3. The cron function queries for due schedules and dispatches them
 *      to a background function for execution
 *
 * This is a "poll-and-dispatch" pattern vs EventBridge's "push" pattern.
 * Trade-off: slightly less precise timing (up to cron interval delay),
 * but works on any platform without cloud-specific scheduling APIs.
 *
 * For integrations that need the queue provider to dispatch jobs:
 *   - queueResourceId maps to the background function URL path
 *   - Payload is stored and forwarded when the cron fires
 */

const { SchedulerServiceInterface } = require('./scheduler-service-interface');

class NetlifySchedulerAdapter extends SchedulerServiceInterface {
    /**
     * @param {Object} options
     * @param {Object} options.repository - Repository for persisting schedules
     *   Must implement: save(schedule), delete(scheduleName),
     *   findByName(scheduleName), findDue(now)
     * @param {Object} [options.queueProvider] - Queue provider for dispatching due jobs
     */
    constructor(options = {}) {
        super();
        this.repository = options.repository;
        this.queueProvider = options.queueProvider;

        if (!this.repository) {
            console.warn(
                '[NetlifyScheduler] No repository provided. ' +
                    'Schedules will be stored in memory (lost on function restart). ' +
                    'Provide a database-backed repository for production use.'
            );
            this._inMemorySchedules = new Map();
        }
    }

    async scheduleOneTime({
        scheduleName,
        scheduleAt,
        queueResourceId,
        payload,
    }) {
        if (!scheduleName) throw new Error('scheduleName is required');
        if (!scheduleAt || !(scheduleAt instanceof Date))
            throw new Error('scheduleAt must be a valid Date object');
        if (!queueResourceId) throw new Error('queueResourceId is required');

        const scheduleData = {
            scheduleName,
            scheduledAt: scheduleAt.toISOString(),
            queueResourceId,
            payload,
            createdAt: new Date().toISOString(),
            state: 'PENDING',
        };

        if (this.repository) {
            await this.repository.save(scheduleData);
        } else {
            this._inMemorySchedules.set(scheduleName, scheduleData);
        }

        console.log(
            `[NetlifyScheduler] Scheduled: ${scheduleName} for ${scheduleAt.toISOString()}`
        );

        return {
            scheduledJobId: `netlify-schedule-${scheduleName}`,
            scheduledAt: scheduleAt.toISOString(),
        };
    }

    async deleteSchedule(scheduleName) {
        if (!scheduleName) throw new Error('scheduleName is required');

        if (this.repository) {
            await this.repository.delete(scheduleName);
        } else {
            this._inMemorySchedules.delete(scheduleName);
        }

        console.log(`[NetlifyScheduler] Deleted schedule: ${scheduleName}`);
    }

    async getScheduleStatus(scheduleName) {
        if (!scheduleName) throw new Error('scheduleName is required');

        let schedule;
        if (this.repository) {
            schedule = await this.repository.findByName(scheduleName);
        } else {
            schedule = this._inMemorySchedules.get(scheduleName);
        }

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
     * Process due schedules. Called by the Netlify cron function.
     *
     * Finds all schedules where scheduledAt <= now, dispatches them
     * to the queue provider, and marks them as completed.
     *
     * @returns {Promise<{ processed: number, errors: number }>}
     */
    async processDueSchedules() {
        if (!this.repository) {
            console.warn(
                '[NetlifyScheduler] Cannot process due schedules without a repository'
            );
            return { processed: 0, errors: 0 };
        }

        const now = new Date();
        const dueSchedules = await this.repository.findDue(now);

        let processed = 0;
        let errors = 0;

        for (const schedule of dueSchedules) {
            try {
                // Mark as PROCESSING before dispatch so the next cron tick
                // won't re-pick this schedule (findDue only returns PENDING).
                await this.repository.save({
                    ...schedule,
                    state: 'PROCESSING',
                });

                if (this.queueProvider) {
                    await this.queueProvider.send(
                        schedule.payload,
                        schedule.queueResourceId
                    );
                } else {
                    console.log(
                        `[NetlifyScheduler] No queue provider — logging payload for: ${schedule.scheduleName}`,
                        JSON.stringify(schedule.payload)
                    );
                }

                await this.repository.delete(schedule.scheduleName);
                processed++;
            } catch (error) {
                console.error(
                    `[NetlifyScheduler] Error processing schedule ${schedule.scheduleName}:`,
                    error
                );
                // Mark as FAILED so it won't be re-dispatched automatically.
                // Operators can inspect FAILED schedules and retry manually.
                await this.repository
                    .save({ ...schedule, state: 'FAILED' })
                    .catch(() => {});
                errors++;
            }
        }

        console.log(
            `[NetlifyScheduler] Processed ${processed} due schedules, ${errors} errors`
        );
        return { processed, errors };
    }
}

module.exports = { NetlifySchedulerAdapter };
