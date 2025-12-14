const { SchedulerAdapter } = require('./scheduler-adapter');

// Lazy-loaded AWS SDK clients (following AWSProviderAdapter pattern)
let SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand,
    GetScheduleCommand, UpdateScheduleCommand, ListSchedulesCommand;

function loadSchedulerSDK() {
    if (!SchedulerClient) {
        const schedulerModule = require('@aws-sdk/client-scheduler');
        SchedulerClient = schedulerModule.SchedulerClient;
        CreateScheduleCommand = schedulerModule.CreateScheduleCommand;
        DeleteScheduleCommand = schedulerModule.DeleteScheduleCommand;
        GetScheduleCommand = schedulerModule.GetScheduleCommand;
        UpdateScheduleCommand = schedulerModule.UpdateScheduleCommand;
        ListSchedulesCommand = schedulerModule.ListSchedulesCommand;
    }
}

/**
 * AWS EventBridge Scheduler Adapter
 *
 * Infrastructure Adapter - Hexagonal Architecture
 *
 * Implements scheduling using AWS EventBridge Scheduler.
 * Supports cron expressions, timezone configuration, and Lambda invocation.
 */
class AWSSchedulerAdapter extends SchedulerAdapter {
    constructor({ region, credentials, targetLambdaArn, scheduleGroupName } = {}) {
        super();
        this.region = region || process.env.AWS_REGION || 'us-east-1';
        this.credentials = credentials;
        this.targetLambdaArn = targetLambdaArn || process.env.ADMIN_SCRIPT_LAMBDA_ARN;
        this.scheduleGroupName = scheduleGroupName || process.env.SCHEDULE_GROUP_NAME || 'frigg-admin-scripts';
        this.scheduler = null;
    }

    getSchedulerClient() {
        if (!this.scheduler) {
            loadSchedulerSDK();
            this.scheduler = new SchedulerClient({
                region: this.region,
                credentials: this.credentials,
            });
        }
        return this.scheduler;
    }

    getName() {
        return 'aws-eventbridge-scheduler';
    }

    async createSchedule({ scriptName, cronExpression, timezone, input }) {
        const client = this.getSchedulerClient();
        const scheduleName = `frigg-script-${scriptName}`;

        const command = new CreateScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
            ScheduleExpression: cronExpression,
            ScheduleExpressionTimezone: timezone || 'UTC',
            FlexibleTimeWindow: { Mode: 'OFF' },
            Target: {
                Arn: this.targetLambdaArn,
                RoleArn: process.env.SCHEDULER_ROLE_ARN,
                Input: JSON.stringify({
                    scriptName,
                    trigger: 'SCHEDULED',
                    params: input || {},
                }),
            },
            State: 'ENABLED',
        });

        const response = await client.send(command);
        return {
            scheduleArn: response.ScheduleArn,
            scheduleName: scheduleName,
        };
    }

    async deleteSchedule(scriptName) {
        const client = this.getSchedulerClient();
        const scheduleName = `frigg-script-${scriptName}`;

        await client.send(new DeleteScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
        }));
    }

    async setScheduleEnabled(scriptName, enabled) {
        const client = this.getSchedulerClient();
        const scheduleName = `frigg-script-${scriptName}`;

        // Get the current schedule first to preserve all settings
        const getCommand = new GetScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
        });

        const currentSchedule = await client.send(getCommand);

        // Update with the new state
        await client.send(new UpdateScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
            ScheduleExpression: currentSchedule.ScheduleExpression,
            ScheduleExpressionTimezone: currentSchedule.ScheduleExpressionTimezone,
            FlexibleTimeWindow: currentSchedule.FlexibleTimeWindow,
            Target: currentSchedule.Target,
            State: enabled ? 'ENABLED' : 'DISABLED',
        }));
    }

    async listSchedules() {
        const client = this.getSchedulerClient();

        const response = await client.send(new ListSchedulesCommand({
            GroupName: this.scheduleGroupName,
        }));

        return response.Schedules || [];
    }

    async getSchedule(scriptName) {
        const client = this.getSchedulerClient();
        const scheduleName = `frigg-script-${scriptName}`;

        const response = await client.send(new GetScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
        }));

        return response;
    }
}

module.exports = { AWSSchedulerAdapter };
