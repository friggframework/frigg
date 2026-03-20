/* eslint-disable @typescript-eslint/no-require-imports */

export interface ErrorResponse {
    error: number;
    reason?: string;
    code?: string;
}

export interface SchedulerService {
    scheduleOneTime(params: {
        scheduleName: string;
        scheduleAt: Date;
        queueResourceId: string;
        payload: Record<string, unknown>;
    }): Promise<{ scheduledJobId: string; scheduledAt: string }>;
    deleteSchedule(scheduleName: string): Promise<void>;
    getScheduleStatus(scheduleName: string): Promise<{ exists: boolean; scheduledAt?: string; state?: string }>;
}

export interface ScheduleJobParams {
    jobId: string;
    scheduledAt: Date;
    event: string;
    payload?: Record<string, unknown>;
    queueUrl: string;
}

export interface ScheduleJobResult {
    jobId: string;
    jobArn: string | null;
    scheduledAt: string | null;
    warning?: string;
}

export interface DeleteJobResult {
    success: boolean;
    jobId: string;
    warning?: string;
}

export interface JobStatusResult {
    exists: boolean;
    scheduledAt?: string;
    state?: string;
    warning?: string;
}

export interface SchedulerCommands {
    scheduleJob(params: ScheduleJobParams): Promise<ScheduleJobResult | ErrorResponse>;
    deleteJob(jobId: string): Promise<DeleteJobResult | ErrorResponse>;
    getJobStatus(jobId: string): Promise<JobStatusResult | ErrorResponse>;
}

export interface CreateSchedulerCommandsParams {
    integrationName: string;
    schedulerService?: SchedulerService;
}

function deriveArnFromQueueUrl(queueUrl: string): string {
    try {
        const url = new URL(queueUrl);
        const region = url.hostname.split('.')[1];
        const pathParts = url.pathname.split('/').filter(Boolean);
        const accountId = pathParts[0];
        const queueName = pathParts[1];
        return `arn:aws:sqs:${region}:${accountId}:${queueName}`;
    } catch {
        throw new Error(`Invalid SQS queue URL: ${queueUrl}`);
    }
}

const ERROR_CODE_MAP: Record<string, number> = {
    SCHEDULER_NOT_CONFIGURED: 503,
    INVALID_JOB_DATA: 400,
    SCHEDULE_NOT_FOUND: 404,
};

function mapErrorToResponse(error: Error & { code?: string }): ErrorResponse {
    const status = ERROR_CODE_MAP[error?.code ?? ''] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code,
    };
}

export function createSchedulerCommands({ integrationName, schedulerService }: CreateSchedulerCommandsParams): SchedulerCommands {
    if (!integrationName) {
        throw new Error('integrationName is required');
    }

    let _schedulerService: SchedulerService | null = schedulerService || null;

    function getSchedulerService(): SchedulerService | null {
        if (!_schedulerService) {
            try {
                const { createSchedulerService } = require('../../../infrastructure/scheduler');
                _schedulerService = createSchedulerService();
            } catch (error: unknown) {
                const err = error as Error;
                console.warn(
                    `[${integrationName}] Scheduler service not available: ${err.message}`
                );
                return null;
            }
        }
        return _schedulerService;
    }

    return {
        async scheduleJob({ jobId, scheduledAt, event, payload, queueUrl }: ScheduleJobParams) {
            try {
                if (!jobId) {
                    const error = new Error('jobId is required') as Error & { code?: string };
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                if (!scheduledAt || !(scheduledAt instanceof Date)) {
                    const error = new Error('scheduledAt must be a valid Date') as Error & { code?: string };
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                if (!event) {
                    const error = new Error('event is required') as Error & { code?: string };
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                if (!queueUrl) {
                    const error = new Error('queueUrl is required') as Error & { code?: string };
                    error.code = 'INVALID_JOB_DATA';
                    throw error;
                }

                const queueArn = deriveArnFromQueueUrl(queueUrl);

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

                const sqsPayload: Record<string, unknown> = {
                    event,
                    integrationName,
                    data: payload || {},
                    scheduledAt: scheduledAt.toISOString(),
                    createdAt: new Date().toISOString(),
                };

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
                    (error as Error).message
                );
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async deleteJob(jobId: string) {
            try {
                if (!jobId) {
                    const error = new Error('jobId is required') as Error & { code?: string };
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
                    (error as Error).message
                );
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async getJobStatus(jobId: string) {
            try {
                if (!jobId) {
                    const error = new Error('jobId is required') as Error & { code?: string };
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
                    (error as Error).message
                );
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },
    };
}
