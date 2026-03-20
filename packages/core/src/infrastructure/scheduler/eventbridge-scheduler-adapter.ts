import {
    SchedulerClient,
    CreateScheduleCommand,
    DeleteScheduleCommand,
    GetScheduleCommand,
    ResourceNotFoundException,
} from '@aws-sdk/client-scheduler';
import { SchedulerServiceInterface } from './scheduler-service-interface';
import type { ScheduleOneTimeParams, ScheduleOneTimeResult, ScheduleStatusResult } from './scheduler-service-interface';

export class EventBridgeSchedulerAdapter extends SchedulerServiceInterface {
    private client: SchedulerClient;
    private scheduleGroupName: string;
    private roleArn: string | undefined;

    constructor({ region }: { region?: string } = {}) {
        super();
        this.client = new SchedulerClient({
            region: region || process.env.AWS_REGION || 'us-east-1',
        });
        this.scheduleGroupName =
            process.env.SCHEDULE_GROUP_NAME || 'frigg-integration-schedules';
        this.roleArn = process.env.SCHEDULER_ROLE_ARN;
    }

    async scheduleOneTime({ scheduleName, scheduleAt, queueResourceId, payload }: ScheduleOneTimeParams): Promise<ScheduleOneTimeResult> {
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
            ActionAfterCompletion: 'DELETE',
        } as any);

        try {
            const response = await this.client.send(command);
            console.log(
                `[Scheduler] Created schedule ${scheduleName} for ${scheduleAt.toISOString()}`
            );

            return {
                scheduledJobId: (response as any).ScheduleArn,
                scheduledAt: scheduleAt.toISOString(),
            };
        } catch (error: any) {
            console.error(
                `[Scheduler] Failed to create schedule ${scheduleName}:`,
                error.message
            );
            throw error;
        }
    }

    async deleteSchedule(scheduleName: string): Promise<void> {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }

        const command = new DeleteScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
        } as any);

        try {
            await this.client.send(command);
            console.log(`[Scheduler] Deleted schedule ${scheduleName}`);
        } catch (error: any) {
            if (error instanceof ResourceNotFoundException) {
                console.log(
                    `[Scheduler] Schedule ${scheduleName} not found (already deleted or executed)`
                );
                return;
            }
            console.error(
                `[Scheduler] Failed to delete schedule ${scheduleName}:`,
                error.message
            );
            throw error;
        }
    }

    async getScheduleStatus(scheduleName: string): Promise<ScheduleStatusResult> {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }

        const command = new GetScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
        } as any);

        try {
            const response: any = await this.client.send(command);

            let scheduledAt: string | null = null;
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
            };
        } catch (error: any) {
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
