/**
 * Scheduler Commands
 *
 * Application Layer - Command pattern for scheduling operations.
 *
 * Follows hexagonal architecture:
 * - Receives SchedulerServiceInterface via dependency injection
 * - Contains business logic (validation, logging, error mapping)
 * - Protocol-agnostic (doesn't know about HTTP/Lambda)
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

const { createSchedulerService } = require('../../infrastructure/scheduler');

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
 * @param {SchedulerServiceInterface} [params.schedulerService] - Optional injected scheduler service
 * @returns {Object} Scheduler commands object
 */
function createSchedulerCommands({ integrationName, schedulerService }) {
    if (!integrationName) {
        throw new Error('integrationName is required');
    }

    // Support both dependency injection and lazy creation
    // DI is preferred for testability, lazy creation for convenience
    let _schedulerService = schedulerService || null;

    function getSchedulerService() {
        if (!_schedulerService) {
            try {
                _schedulerService = createSchedulerService();
            } catch (error) {
                console.warn(
                    `[${integrationName}] Scheduler service not available: ${error.message}`
                );
                return null;
            }
        }
        return _schedulerService;
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

                // Derive ARN from URL (business logic - transformation)
                const queueArn = deriveArnFromQueueUrl(queueUrl);

                // Get scheduler service (via DI or factory)
                const service = getSchedulerService();
                if (!service) {
                    console.warn(
                        `[${integrationName}] Scheduler not configured, skipping job schedule`
                    );
                    return {
                        jobId,
                        jobArn: null,
                        scheduledAt: null,
                        warning: 'Scheduler not configured',
                    };
                }

                // Build the SQS message payload (business logic - assembly)
                const sqsPayload = {
                    eventType: event,
                    integrationName,
                    data: payload || {},
                    scheduledAt: scheduledAt.toISOString(),
                    createdAt: new Date().toISOString(),
                };

                // Delegate to service (Port interface)
                const result = await service.scheduleOneTime({
                    scheduleName: jobId,
                    scheduleAt: scheduledAt,
                    queueResourceId: queueArn,
                    payload: sqsPayload,
                });

                console.log(
                    `[${integrationName}] Scheduled job ${jobId} for ${result.scheduledAt}`
                );

                return {
                    jobId,
                    jobArn: result.scheduledJobId,
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

                const service = getSchedulerService();
                if (!service) {
                    console.warn(
                        `[${integrationName}] Scheduler not configured, skipping job deletion`
                    );
                    return {
                        success: true,
                        jobId,
                        warning: 'Scheduler not configured',
                    };
                }

                await service.deleteSchedule(jobId);

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

                const service = getSchedulerService();
                if (!service) {
                    return {
                        exists: false,
                        warning: 'Scheduler not configured',
                    };
                }

                const status = await service.getScheduleStatus(jobId);

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
