const { SchedulerAdapter } = require('./scheduler-adapter');

// Lazy-loaded AWS SDK clients (following AWSProviderAdapter pattern)
let SchedulerClient,
    CreateScheduleCommand,
    DeleteScheduleCommand,
    GetScheduleCommand,
    UpdateScheduleCommand,
    ListSchedulesCommand;

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
// Prefix and input builder are parameterized so one adapter can target either the script or report executor.
const DEFAULT_NAME_PREFIX = 'frigg-script-';
const defaultBuildInput = ({ scriptName, input }) => ({
    scriptName,
    trigger: 'SCHEDULED',
    params: input || {},
});

class AWSSchedulerAdapter extends SchedulerAdapter {
    constructor({
        credentials,
        targetLambdaArn,
        scheduleGroupName,
        roleArn,
        namePrefix,
        buildInput,
    } = {}) {
        super();
        if (!targetLambdaArn)
            throw new Error('AWSSchedulerAdapter requires targetLambdaArn');
        if (!scheduleGroupName)
            throw new Error('AWSSchedulerAdapter requires scheduleGroupName');
        if (!roleArn) throw new Error('AWSSchedulerAdapter requires roleArn');
        // Region inherits from the service (set by Lambda runtime, same for all AWS resources)
        const region = process.env.AWS_REGION;
        if (!region)
            throw new Error(
                'AWSSchedulerAdapter requires AWS_REGION environment variable'
            );
        this.region = region;
        this.credentials = credentials;
        this.targetLambdaArn = targetLambdaArn;
        this.scheduleGroupName = scheduleGroupName;
        this.roleArn = roleArn;
        this.namePrefix = namePrefix || DEFAULT_NAME_PREFIX;
        this.buildInput = buildInput || defaultBuildInput;
        this.scheduler = null;
    }

    scheduleNameFor(scriptName) {
        return `${this.namePrefix}${scriptName}`;
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
        const scheduleName = this.scheduleNameFor(scriptName);

        const scheduleParams = {
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
            ScheduleExpression: cronExpression,
            ScheduleExpressionTimezone: timezone || 'UTC',
            FlexibleTimeWindow: { Mode: 'OFF' },
            Target: {
                Arn: this.targetLambdaArn,
                RoleArn: this.roleArn,
                Input: JSON.stringify(this.buildInput({ scriptName, input })),
            },
            State: 'ENABLED',
        };

        try {
            const response = await client.send(
                new CreateScheduleCommand(scheduleParams)
            );
            return {
                scheduleArn: response.ScheduleArn,
                scheduleName: scheduleName,
            };
        } catch (error) {
            if (error.name === 'ConflictException') {
                const response = await client.send(
                    new UpdateScheduleCommand(scheduleParams)
                );
                return {
                    scheduleArn: response.ScheduleArn,
                    scheduleName: scheduleName,
                };
            }
            throw error;
        }
    }

    async deleteSchedule(scriptName) {
        const client = this.getSchedulerClient();
        const scheduleName = this.scheduleNameFor(scriptName);

        await client.send(
            new DeleteScheduleCommand({
                Name: scheduleName,
                GroupName: this.scheduleGroupName,
            })
        );
    }

    async setScheduleEnabled(scriptName, enabled) {
        const client = this.getSchedulerClient();
        const scheduleName = this.scheduleNameFor(scriptName);

        // Get the current schedule first to preserve all settings
        const getCommand = new GetScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
        });

        const currentSchedule = await client.send(getCommand);

        // Update with the new state
        await client.send(
            new UpdateScheduleCommand({
                Name: scheduleName,
                GroupName: this.scheduleGroupName,
                ScheduleExpression: currentSchedule.ScheduleExpression,
                ScheduleExpressionTimezone:
                    currentSchedule.ScheduleExpressionTimezone,
                FlexibleTimeWindow: currentSchedule.FlexibleTimeWindow,
                Target: currentSchedule.Target,
                State: enabled ? 'ENABLED' : 'DISABLED',
            })
        );
    }

    async listSchedules() {
        const client = this.getSchedulerClient();

        const response = await client.send(
            new ListSchedulesCommand({
                GroupName: this.scheduleGroupName,
            })
        );

        return response.Schedules || [];
    }

    async getSchedule(scriptName) {
        const client = this.getSchedulerClient();
        const scheduleName = this.scheduleNameFor(scriptName);

        const response = await client.send(
            new GetScheduleCommand({
                Name: scheduleName,
                GroupName: this.scheduleGroupName,
            })
        );

        return response;
    }
}

module.exports = { AWSSchedulerAdapter };
