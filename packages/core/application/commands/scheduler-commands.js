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

const { createSchedulerService, TICK, validateRecurrence, recurrenceKey } = require('../../infrastructure/scheduler');

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

    const commands = {
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
                    event,
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
         * Create or update a recurring job. Every firing sends `{ event, data: { ...payload, tick } }` to the queue,
         * where `tick` is `{ id, scheduledFor }` for that firing (when the host supplies them), so a handler can
         * dedupe a redelivered tick.
         *
         * @param {Object} params
         * @param {string} params.jobId - Unique, stable name for the schedule
         * @param {{every?: string, cron?: string, timezone?: string}} params.recurrence - Host-neutral recurrence
         * @param {string} params.event - Event name to trigger
         * @param {Object} [params.payload] - Data sent on every firing
         * @param {string} params.queueUrl - Target SQS queue URL
         * @param {boolean} [params.enabled=true]
         * @returns {Promise<{jobId, jobArn, created} | {jobId, warning} | {error, reason, code}>}
         */
        async upsertRecurringJob({ jobId, recurrence, event, payload, queueUrl, enabled = true }) {
            try {
                const invalid = (message) => Object.assign(new Error(message), { code: 'INVALID_JOB_DATA' });
                if (!jobId) throw invalid('jobId is required');
                if (!event) throw invalid('event is required');
                if (!queueUrl) throw invalid('queueUrl is required');
                const problems = validateRecurrence(recurrence);
                if (problems.length) throw invalid(`Invalid recurrence: ${problems.join('; ')}`);

                const service = getSchedulerService();
                if (!service) {
                    console.warn(`[${integrationName}] Scheduler not configured, skipping recurring job ${jobId}`);
                    return { jobId, jobArn: null, warning: 'Scheduler not configured' };
                }
                const result = await service.upsertRecurring({
                    scheduleName: jobId,
                    recurrence,
                    queueResourceId: deriveArnFromQueueUrl(queueUrl),
                    payload: {
                        event,
                        integrationName,
                        scheduleName: jobId,
                        data: { ...(payload || {}), tick: { id: TICK.id, scheduledFor: TICK.scheduledFor } },
                    },
                    enabled,
                });
                return { jobId, jobArn: result.scheduledJobId, created: result.created };
            } catch (error) {
                console.error(`[${integrationName}] Failed to upsert recurring job ${jobId}:`, error.message);
                return mapErrorToResponse(error);
            }
        },

        /**
         * Make the host's recurring jobs match what an installation should have, and return what to store.
         *
         * `desired` is the full list for one installation; `stored` is what the last reconcile returned (kept on the
         * integration config). A job is upserted when it is new or its recurrence, event, payload or state changed,
         * and deleted when it is no longer desired. A failed upsert or delete leaves its stored entry as it was, so
         * the next reconcile retries it; nothing is reported as scheduled that the host did not accept.
         *
         * @param {Object} params
         * @param {Array<{key, jobId, recurrence, event, payload?, enabled?}>} params.desired
         * @param {Object<string, {jobId, recurrence, event, enabled, fingerprint}>} [params.stored]
         * @param {string} params.queueUrl
         * @returns {Promise<{stored, created: string[], updated: string[], deleted: string[], unchanged: string[], failed: Array<{key, reason}>, warning?: string}>}
         */
        async reconcileRecurringJobs({ desired = [], stored = {}, queueUrl }) {
            const out = { stored: { ...(stored || {}) }, created: [], updated: [], deleted: [], unchanged: [], failed: [] };
            if (!getSchedulerService()) return { ...out, warning: 'Scheduler not configured' };
            const fingerprint = (d) => JSON.stringify([recurrenceKey(d.recurrence), d.event, d.payload || {}, d.enabled !== false, d.jobId]);
            const wanted = new Set();
            for (const d of desired) {
                wanted.add(d.key);
                const prev = out.stored[d.key];
                const print = fingerprint(d);
                if (prev && prev.fingerprint === print) { out.unchanged.push(d.key); continue; }
                const res = await commands.upsertRecurringJob({ jobId: d.jobId, recurrence: d.recurrence, event: d.event, payload: d.payload, queueUrl, enabled: d.enabled !== false });
                if (res.error || res.warning) { out.failed.push({ key: d.key, reason: res.reason || res.warning }); continue; }
                if (prev && prev.jobId !== d.jobId) {
                    const del = await commands.deleteJob(prev.jobId);
                    if (del.error) out.failed.push({ key: d.key, reason: `Old schedule ${prev.jobId} not deleted: ${del.reason}` });
                }
                out.stored[d.key] = { jobId: d.jobId, recurrence: d.recurrence, event: d.event, enabled: d.enabled !== false, jobArn: res.jobArn, fingerprint: print, updatedAt: new Date().toISOString() };
                (prev ? out.updated : out.created).push(d.key);
            }
            for (const [key, prev] of Object.entries(out.stored)) {
                if (wanted.has(key)) continue;
                const del = await commands.deleteJob(prev.jobId);
                if (del.error) { out.failed.push({ key, reason: del.reason }); continue; }
                delete out.stored[key];
                out.deleted.push(key);
            }
            return out;
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
    return commands;
}

module.exports = {
    createSchedulerCommands,
};
