/**
 * EventBridge Scheduler Adapter
 *
 * Infrastructure Layer - Hexagonal Architecture
 *
 * Responsible for:
 * - Creating one-time EventBridge Scheduler schedules
 * - Deleting schedules when no longer needed
 * - Checking schedule status
 *
 * This adapter implements SchedulerServiceInterface for AWS EventBridge Scheduler.
 */

const {
    SchedulerClient,
    CreateScheduleCommand,
    UpdateScheduleCommand,
    DeleteScheduleCommand,
    GetScheduleCommand,
    ResourceNotFoundException,
    ConflictException,
} = require('@aws-sdk/client-scheduler');

const { SchedulerServiceInterface, TICK, fillTick } = require('./scheduler-service-interface');
const { parseEvery, parseCron, validateRecurrence } = require('./recurrence');

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Host-neutral recurrence -> EventBridge Scheduler expression.
 *   { every: '15m' }  -> rate(15 minutes)       (whole hours and days use those units)
 *   { cron: 'm h dom mon dow' } -> cron(m h dom mon dow *), with `?` in whichever day field is unrestricted and the
 *   weekdays written as names, because EventBridge numbers them 1-7 from Sunday where cron numbers 0-6.
 */
function toEventBridgeExpression(recurrence) {
    const problems = validateRecurrence(recurrence);
    if (problems.length) throw new Error(`Invalid recurrence: ${problems.join('; ')}`);
    if (recurrence.every !== undefined) {
        const n = parseEvery(recurrence.every);
        const [count, unit] = n % 1440 === 0 ? [n / 1440, 'day'] : n % 60 === 0 ? [n / 60, 'hour'] : [n, 'minute'];
        return `rate(${count} ${unit}${count === 1 ? '' : 's'})`;
    }
    const parsed = parseCron(recurrence.cron);
    const [minute, hour, dom, month] = parsed.parts;
    const dow = parsed.restricted.dow ? [...parsed.fields[4]].map((d) => DAY_NAMES[d]).join(',') : '?';
    return `cron(${minute} ${hour} ${parsed.restricted.dow ? '?' : dom} ${month} ${dow} *)`;
}

class EventBridgeSchedulerAdapter extends SchedulerServiceInterface {
    constructor({ region } = {}) {
        super();
        this.client = new SchedulerClient({
            region: region || process.env.AWS_REGION || 'us-east-1',
        });
        this.scheduleGroupName =
            process.env.SCHEDULE_GROUP_NAME || 'frigg-integration-schedules';
        this.roleArn = process.env.SCHEDULER_ROLE_ARN;
    }

    /**
     * Create a one-time schedule that sends a message to SQS
     *
     * @param {Object} params
     * @param {string} params.scheduleName - Unique name for the schedule
     * @param {Date} params.scheduleAt - When to trigger the schedule
     * @param {string} params.queueResourceId - Queue resource identifier (ARN) to send message to
     * @param {Object} params.payload - Message payload
     * @returns {Promise<{scheduledJobId: string, scheduledAt: string}>}
     */
    async scheduleOneTime({ scheduleName, scheduleAt, queueResourceId, payload }) {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }
        if (!scheduleAt || !(scheduleAt instanceof Date)) {
            throw new Error('scheduleAt must be a valid Date object');
        }
        if (!queueResourceId) {
            throw new Error('queueResourceId is required');
        }
        if (!this.roleArn) {
            throw new Error(
                'SCHEDULER_ROLE_ARN environment variable is not set'
            );
        }

        // Format date to AWS schedule expression (at(yyyy-mm-ddThh:mm:ss))
        const scheduleExpression = `at(${scheduleAt.toISOString().replace(/\.\d{3}Z$/, '')})`;

        const command = new CreateScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
            ScheduleExpression: scheduleExpression,
            ScheduleExpressionTimezone: 'UTC',
            FlexibleTimeWindow: {
                Mode: 'OFF',
            },
            Target: {
                Arn: queueResourceId,
                RoleArn: this.roleArn,
                Input: JSON.stringify(payload),
            },
            ActionAfterCompletion: 'DELETE', // Auto-cleanup after execution
        });

        try {
            const response = await this.client.send(command);
            console.log(
                `[Scheduler] Created schedule ${scheduleName} for ${scheduleAt.toISOString()}`
            );

            return {
                scheduledJobId: response.ScheduleArn,
                scheduledAt: scheduleAt.toISOString(),
            };
        } catch (error) {
            console.error(
                `[Scheduler] Failed to create schedule ${scheduleName}:`,
                error.message
            );
            throw error;
        }
    }

    /**
     * Create or update a recurring schedule that sends `payload` to the queue on every firing.
     * Update first (the common case once installed), create when it does not exist, and update again if a concurrent
     * writer created it in between.
     */
    async upsertRecurring({ scheduleName, recurrence, queueResourceId, payload, enabled = true }) {
        if (!scheduleName) throw new Error('scheduleName is required');
        if (!queueResourceId) throw new Error('queueResourceId is required');
        if (!this.roleArn) throw new Error('SCHEDULER_ROLE_ARN environment variable is not set');

        const input = {
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
            ScheduleExpression: toEventBridgeExpression(recurrence),
            ScheduleExpressionTimezone: recurrence.every !== undefined ? 'UTC' : recurrence.timezone || 'UTC',
            FlexibleTimeWindow: { Mode: 'OFF' },
            State: enabled ? 'ENABLED' : 'DISABLED',
            Target: {
                Arn: queueResourceId,
                RoleArn: this.roleArn,
                // EventBridge substitutes these context attributes per invocation.
                Input: JSON.stringify(fillTick(payload, { id: '<aws.scheduler.execution-id>', scheduledFor: '<aws.scheduler.scheduled-time>' })),
            },
        };
        const update = async () => (await this.client.send(new UpdateScheduleCommand(input))).ScheduleArn;
        try {
            return { scheduledJobId: await update(), created: false };
        } catch (error) {
            if (!(error instanceof ResourceNotFoundException)) throw error;
        }
        try {
            const response = await this.client.send(new CreateScheduleCommand(input));
            return { scheduledJobId: response.ScheduleArn, created: true };
        } catch (error) {
            if (error instanceof ConflictException) return { scheduledJobId: await update(), created: false };
            throw error;
        }
    }

    /**
     * Delete a schedule
     *
     * @param {string} scheduleName - Name of the schedule to delete
     * @returns {Promise<void>}
     */
    async deleteSchedule(scheduleName) {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }

        const command = new DeleteScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
        });

        try {
            await this.client.send(command);
            console.log(`[Scheduler] Deleted schedule ${scheduleName}`);
        } catch (error) {
            if (error instanceof ResourceNotFoundException) {
                console.log(
                    `[Scheduler] Schedule ${scheduleName} not found (already deleted or executed)`
                );
                return; // Graceful handling - schedule doesn't exist
            }
            console.error(
                `[Scheduler] Failed to delete schedule ${scheduleName}:`,
                error.message
            );
            throw error;
        }
    }

    /**
     * Get schedule status
     *
     * @param {string} scheduleName - Name of the schedule
     * @returns {Promise<{exists: boolean, scheduledAt?: string, state?: string}>}
     */
    async getScheduleStatus(scheduleName) {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }

        const command = new GetScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
        });

        try {
            const response = await this.client.send(command);

            // Parse the schedule expression to get the scheduled time
            // Format: at(yyyy-mm-ddThh:mm:ss)
            let scheduledAt = null;
            if (response.ScheduleExpression) {
                const match = response.ScheduleExpression.match(
                    /^at\((.+)\)$/
                );
                if (match) {
                    scheduledAt = new Date(match[1] + 'Z').toISOString();
                }
            }

            return {
                exists: true,
                scheduledAt,
                state: response.State,
                expression: response.ScheduleExpression,
                timezone: response.ScheduleExpressionTimezone,
            };
        } catch (error) {
            if (error instanceof ResourceNotFoundException) {
                return {
                    exists: false,
                };
            }
            console.error(
                `[Scheduler] Failed to get schedule ${scheduleName}:`,
                error.message
            );
            throw error;
        }
    }
}

module.exports = { EventBridgeSchedulerAdapter, toEventBridgeExpression, TICK };
