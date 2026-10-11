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

const { SchedulerServiceInterface } = require('./scheduler-service-interface');

const SCHEDULER_SDK = '@aws-sdk/client-scheduler';

/**
 * Lazily load the AWS EventBridge Scheduler SDK.
 *
 * Requiring `@aws-sdk/client-scheduler` at module top level would put the AWS
 * SDK on the load path of every consumer of `@friggframework/core`, including
 * those using the mock scheduler or no scheduler at all. Loading it here, on
 * construction of the EventBridge adapter, keeps it out of the module-load
 * path. The adapter calls it exactly once, in its constructor, and keeps the
 * classes its methods need on the instance.
 *
 * Only a MODULE_NOT_FOUND for the scheduler SDK itself is rewritten into an
 * actionable message; any other failure (including a missing transitive
 * dependency) is rethrown unchanged so the real cause is not masked.
 *
 * @returns {object} The relevant exports from `@aws-sdk/client-scheduler`.
 */
function loadSchedulerSdk() {
    try {
        // Keep the literal specifier so bundlers (esbuild) can resolve it.
        return require('@aws-sdk/client-scheduler');
    } catch (error) {
        const isSchedulerSdkMissing =
            error &&
            error.code === 'MODULE_NOT_FOUND' &&
            typeof error.message === 'string' &&
            error.message.includes(SCHEDULER_SDK);
        if (isSchedulerSdkMissing) {
            throw new Error(
                `The EventBridge scheduler requires the "${SCHEDULER_SDK}" package, ` +
                    `which is not installed. Install it (\`npm install ${SCHEDULER_SDK}\`) ` +
                    'to use the EventBridge scheduler provider, or use the mock scheduler provider ' +
                    '(SCHEDULER_PROVIDER=mock) for local development.',
                { cause: error }
            );
        }
        throw error;
    }
}

class EventBridgeSchedulerAdapter extends SchedulerServiceInterface {
    constructor({ region } = {}) {
        super();
        const {
            SchedulerClient,
            CreateScheduleCommand,
            DeleteScheduleCommand,
            GetScheduleCommand,
            ResourceNotFoundException,
        } = loadSchedulerSdk();
        this.sdk = {
            CreateScheduleCommand,
            DeleteScheduleCommand,
            GetScheduleCommand,
            ResourceNotFoundException,
        };
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
    async scheduleOneTime({
        scheduleName,
        scheduleAt,
        queueResourceId,
        payload,
    }) {
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
        const scheduleExpression = `at(${scheduleAt
            .toISOString()
            .replace(/\.\d{3}Z$/, '')})`;

        const { CreateScheduleCommand } = this.sdk;
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
     * Delete a schedule
     *
     * @param {string} scheduleName - Name of the schedule to delete
     * @returns {Promise<void>}
     */
    async deleteSchedule(scheduleName) {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }

        const { DeleteScheduleCommand, ResourceNotFoundException } = this.sdk;
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

        const { GetScheduleCommand, ResourceNotFoundException } = this.sdk;
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
                const match = response.ScheduleExpression.match(/^at\((.+)\)$/);
                if (match) {
                    scheduledAt = new Date(match[1] + 'Z').toISOString();
                }
            }

            return {
                exists: true,
                scheduledAt,
                state: response.State,
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

module.exports = { EventBridgeSchedulerAdapter };
