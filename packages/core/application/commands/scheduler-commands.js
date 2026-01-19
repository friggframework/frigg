/**
 * Scheduler Commands
 *
 * Application Layer - Command pattern for scheduling operations.
 *
 * Provides a clean interface for integrations to schedule one-time jobs
 * without directly interacting with the infrastructure layer.
 *
 * @example
 * const schedulerCommands = createSchedulerCommands({ integrationName: 'zoho' });
 * await schedulerCommands.scheduleJob({
 *     jobId: 'zoho-notif-renewal-abc123',
 *     scheduledAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days
 *     event: 'REFRESH_WEBHOOK',
 *     payload: { integrationId: 'abc123' },
 *     queueUrl: process.env.ZOHO_QUEUE_URL,
 * });
 */

const { createSchedulerAdapter } = require('../../infrastructure/scheduler');

/**
 * Derive SQS ARN from SQS URL
 *
 * SQS URL format: https://sqs.{region}.amazonaws.com/{account-id}/{queue-name}
 * SQS ARN format: arn:aws:sqs:{region}:{account-id}:{queue-name}
 *
 * @param {string} queueUrl - SQS queue URL
 * @returns {string} SQS queue ARN
 */
function deriveArnFromQueueUrl(queueUrl) {
    try {
        const url = new URL(queueUrl);
        const region = url.hostname.split('.')[1];
        const pathParts = url.pathname.split('/').filter(Boolean);
        const accountId = pathParts[0];
        const queueName = pathParts[1];
        return `arn:aws:sqs:${region}:${accountId}:${queueName}`;
    } catch (error) {
        throw new Error(`Invalid SQS queue URL: ${queueUrl}`);
    }
}

const ERROR_CODE_MAP = {
    SCHEDULER_NOT_CONFIGURED: 503,
    INVALID_JOB_DATA: 400,
    SCHEDULE_NOT_FOUND: 404,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code,
    };
}

/**
 * Create scheduler commands for an integration
 *
 * @param {Object} params
 * @param {string} params.integrationName - Name of the integration (used for logging)
 * @returns {Object} Scheduler commands object
 */
function createSchedulerCommands({ integrationName }) {
    if (!integrationName) {
        throw new Error('integrationName is required');
    }

    // Lazily create the scheduler adapter to avoid initialization errors
    // when the environment is not configured (e.g., in tests)
    let schedulerAdapter = null;

    function getSchedulerAdapter() {
        if (!schedulerAdapter) {
            try {
                schedulerAdapter = createSchedulerAdapter();
            } catch (error) {
                console.warn(
                    `[${integrationName}] Scheduler adapter not available: ${error.message}`
                );
                return null;
            }
        }
        return schedulerAdapter;
    }

    return {
        /**
         * Schedule a one-time job to be executed at a specific time
         *
         * @param {Object} params
         * @param {string} params.jobId - Unique identifier for the job
         * @param {Date} params.scheduledAt - When to execute the job
         * @param {string} params.event - Event name to trigger
         * @param {Object} params.payload - Additional payload data
         * @param {string} params.queueUrl - Target SQS queue URL (ARN is derived internally)
         * @returns {Promise<{jobArn: string, scheduledAt: string} | {error: number, reason: string}>}
         */
        async scheduleJob({ jobId, scheduledAt, event, payload, queueUrl }) {
            try {
                if (!jobId) {
                    const error = new Error('jobId is required');
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                if (!scheduledAt || !(scheduledAt instanceof Date)) {
                    const error = new Error('scheduledAt must be a valid Date');
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                if (!event) {
                    const error = new Error('event is required');
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                if (!queueUrl) {
                    const error = new Error('queueUrl is required');
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                // Derive ARN from URL
                const queueArn = deriveArnFromQueueUrl(queueUrl);

                const adapter = getSchedulerAdapter();
                if (!adapter) {
                    console.warn(
                        `[${integrationName}] Scheduler not configured, skipping job schedule`
                    );
                    return {
                        warning: 'Scheduler not configured',
                        jobId,
                    };
                }

                // Build the SQS message payload
                const sqsPayload = {
                    eventType: event,
                    integrationName,
                    data: payload || {},
                    scheduledAt: scheduledAt.toISOString(),
                    createdAt: new Date().toISOString(),
                };

                const result = await adapter.scheduleOneTime({
                    scheduleName: jobId,
                    scheduleAt: scheduledAt,
                    targetArn: queueArn,
                    payload: sqsPayload,
                });

                console.log(
                    `[${integrationName}] Scheduled job ${jobId} for ${result.scheduledAt}`
                );

                return {
                    jobId,
                    jobArn: result.scheduleArn,
                    scheduledAt: result.scheduledAt,
                };
            } catch (error) {
                console.error(
                    `[${integrationName}] Failed to schedule job ${jobId}:`,
                    error.message
                );
                return mapErrorToResponse(error);
            }
        },

        /**
         * Delete a scheduled job
         *
         * @param {string} jobId - Job ID to delete
         * @returns {Promise<{success: boolean, jobId: string} | {error: number, reason: string}>}
         */
        async deleteJob(jobId) {
            try {
                if (!jobId) {
                    const error = new Error('jobId is required');
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                const adapter = getSchedulerAdapter();
                if (!adapter) {
                    console.warn(
                        `[${integrationName}] Scheduler not configured, skipping job deletion`
                    );
                    return {
                        success: true,
                        jobId,
                        warning: 'Scheduler not configured',
                    };
                }

                await adapter.deleteSchedule(jobId);

                console.log(`[${integrationName}] Deleted scheduled job ${jobId}`);

                return {
                    success: true,
                    jobId,
                };
            } catch (error) {
                console.error(
                    `[${integrationName}] Failed to delete job ${jobId}:`,
                    error.message
                );
                return mapErrorToResponse(error);
            }
        },

        /**
         * Get the status of a scheduled job
         *
         * @param {string} jobId - Job ID to check
         * @returns {Promise<{exists: boolean, scheduledAt?: string, state?: string} | {error: number, reason: string}>}
         */
        async getJobStatus(jobId) {
            try {
                if (!jobId) {
                    const error = new Error('jobId is required');
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                const adapter = getSchedulerAdapter();
                if (!adapter) {
                    return {
                        exists: false,
                        warning: 'Scheduler not configured',
                    };
                }

                const status = await adapter.getScheduleStatus(jobId);

                return status;
            } catch (error) {
                console.error(
                    `[${integrationName}] Failed to get job status ${jobId}:`,
                    error.message
                );
                return mapErrorToResponse(error);
            }
        },
    };
}

module.exports = {
    createSchedulerCommands,
};
