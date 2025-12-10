const { AWSSchedulerAdapter } = require('../aws-scheduler-adapter');
const { SchedulerAdapter } = require('../scheduler-adapter');

// Mock AWS SDK
jest.mock('@aws-sdk/client-scheduler', () => {
    const mockSend = jest.fn();

    return {
        SchedulerClient: jest.fn(() => ({
            send: mockSend,
        })),
        CreateScheduleCommand: jest.fn((params) => ({ _type: 'CreateScheduleCommand', params })),
        DeleteScheduleCommand: jest.fn((params) => ({ _type: 'DeleteScheduleCommand', params })),
        GetScheduleCommand: jest.fn((params) => ({ _type: 'GetScheduleCommand', params })),
        UpdateScheduleCommand: jest.fn((params) => ({ _type: 'UpdateScheduleCommand', params })),
        ListSchedulesCommand: jest.fn((params) => ({ _type: 'ListSchedulesCommand', params })),
        _mockSend: mockSend,
    };
});

describe('AWSSchedulerAdapter', () => {
    let adapter;
    let mockSend;
    let originalEnv;

    beforeAll(() => {
        originalEnv = { ...process.env };
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset environment variables
        process.env.AWS_REGION = 'us-east-1';
        process.env.SCHEDULE_GROUP_NAME = 'test-schedule-group';
        process.env.SCHEDULER_ROLE_ARN = 'arn:aws:iam::123456789012:role/test-role';
        process.env.ADMIN_SCRIPT_LAMBDA_ARN = 'arn:aws:lambda:us-east-1:123456789012:function:test-executor';

        const sdk = require('@aws-sdk/client-scheduler');
        mockSend = sdk._mockSend;

        adapter = new AWSSchedulerAdapter({
            targetLambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:admin-script-executor',
            scheduleGroupName: 'frigg-admin-scripts',
        });
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('Inheritance', () => {
        it('should extend SchedulerAdapter', () => {
            expect(adapter).toBeInstanceOf(SchedulerAdapter);
        });

        it('should have correct adapter name', () => {
            expect(adapter.getName()).toBe('aws-eventbridge-scheduler');
        });
    });

    describe('Constructor', () => {
        it('should use provided configuration', () => {
            const customAdapter = new AWSSchedulerAdapter({
                region: 'eu-west-1',
                targetLambdaArn: 'arn:aws:lambda:eu-west-1:123456789012:function:custom',
                scheduleGroupName: 'custom-group',
            });

            expect(customAdapter.region).toBe('eu-west-1');
            expect(customAdapter.targetLambdaArn).toBe('arn:aws:lambda:eu-west-1:123456789012:function:custom');
            expect(customAdapter.scheduleGroupName).toBe('custom-group');
        });

        it('should use environment variables as fallback', () => {
            const envAdapter = new AWSSchedulerAdapter();

            expect(envAdapter.region).toBe('us-east-1');
            expect(envAdapter.targetLambdaArn).toBe('arn:aws:lambda:us-east-1:123456789012:function:test-executor');
            expect(envAdapter.scheduleGroupName).toBe('test-schedule-group');
        });

        it('should use defaults when no config or env vars', () => {
            delete process.env.AWS_REGION;
            delete process.env.SCHEDULE_GROUP_NAME;
            delete process.env.ADMIN_SCRIPT_LAMBDA_ARN;

            const defaultAdapter = new AWSSchedulerAdapter();

            expect(defaultAdapter.region).toBe('us-east-1');
            expect(defaultAdapter.scheduleGroupName).toBe('frigg-admin-scripts');
        });
    });

    describe('createSchedule()', () => {
        it('should create a schedule with required fields', async () => {
            mockSend.mockResolvedValue({
                ScheduleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            const result = await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 0 * * ? *)',
            });

            expect(result).toEqual({
                ruleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
                ruleName: 'frigg-script-test-script',
            });

            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command._type).toBe('CreateScheduleCommand');
            expect(command.params.Name).toBe('frigg-script-test-script');
            expect(command.params.ScheduleExpression).toBe('cron(0 0 * * ? *)');
            expect(command.params.ScheduleExpressionTimezone).toBe('UTC');
        });

        it('should create a schedule with all optional fields', async () => {
            mockSend.mockResolvedValue({
                ScheduleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 12 * * ? *)',
                timezone: 'America/New_York',
                input: { key: 'value' },
            });

            const command = mockSend.mock.calls[0][0];
            expect(command.params.ScheduleExpressionTimezone).toBe('America/New_York');

            const targetInput = JSON.parse(command.params.Target.Input);
            expect(targetInput).toEqual({
                scriptName: 'test-script',
                trigger: 'SCHEDULED',
                params: { key: 'value' },
            });
        });

        it('should configure target with Lambda ARN and role', async () => {
            mockSend.mockResolvedValue({
                ScheduleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 0 * * ? *)',
            });

            const command = mockSend.mock.calls[0][0];
            expect(command.params.Target.Arn).toBe('arn:aws:lambda:us-east-1:123456789012:function:admin-script-executor');
            expect(command.params.Target.RoleArn).toBe('arn:aws:iam::123456789012:role/test-role');
        });

        it('should enable schedule by default', async () => {
            mockSend.mockResolvedValue({
                ScheduleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 0 * * ? *)',
            });

            const command = mockSend.mock.calls[0][0];
            expect(command.params.State).toBe('ENABLED');
        });

        it('should set flexible time window to OFF', async () => {
            mockSend.mockResolvedValue({
                ScheduleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 0 * * ? *)',
            });

            const command = mockSend.mock.calls[0][0];
            expect(command.params.FlexibleTimeWindow).toEqual({ Mode: 'OFF' });
        });
    });

    describe('deleteSchedule()', () => {
        it('should delete a schedule', async () => {
            mockSend.mockResolvedValue({});

            await adapter.deleteSchedule('test-script');

            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command._type).toBe('DeleteScheduleCommand');
            expect(command.params.Name).toBe('frigg-script-test-script');
            expect(command.params.GroupName).toBe('frigg-admin-scripts');
        });
    });

    describe('setScheduleEnabled()', () => {
        beforeEach(() => {
            // Mock GetScheduleCommand response
            mockSend.mockImplementation((command) => {
                if (command._type === 'GetScheduleCommand') {
                    return Promise.resolve({
                        Name: 'frigg-script-test-script',
                        GroupName: 'frigg-admin-scripts',
                        ScheduleExpression: 'cron(0 0 * * ? *)',
                        ScheduleExpressionTimezone: 'UTC',
                        FlexibleTimeWindow: { Mode: 'OFF' },
                        Target: {
                            Arn: 'arn:aws:lambda:us-east-1:123456789012:function:admin-script-executor',
                            RoleArn: 'arn:aws:iam::123456789012:role/test-role',
                            Input: '{"scriptName":"test-script","trigger":"SCHEDULED","params":{}}',
                        },
                        State: 'ENABLED',
                    });
                }
                return Promise.resolve({});
            });
        });

        it('should disable a schedule', async () => {
            await adapter.setScheduleEnabled('test-script', false);

            expect(mockSend).toHaveBeenCalledTimes(2); // GET then UPDATE
            const updateCommand = mockSend.mock.calls[1][0];
            expect(updateCommand._type).toBe('UpdateScheduleCommand');
            expect(updateCommand.params.State).toBe('DISABLED');
        });

        it('should enable a schedule', async () => {
            await adapter.setScheduleEnabled('test-script', true);

            expect(mockSend).toHaveBeenCalledTimes(2); // GET then UPDATE
            const updateCommand = mockSend.mock.calls[1][0];
            expect(updateCommand._type).toBe('UpdateScheduleCommand');
            expect(updateCommand.params.State).toBe('ENABLED');
        });

        it('should preserve schedule configuration when updating state', async () => {
            await adapter.setScheduleEnabled('test-script', false);

            const updateCommand = mockSend.mock.calls[1][0];
            expect(updateCommand.params.ScheduleExpression).toBe('cron(0 0 * * ? *)');
            expect(updateCommand.params.ScheduleExpressionTimezone).toBe('UTC');
            expect(updateCommand.params.FlexibleTimeWindow).toEqual({ Mode: 'OFF' });
            expect(updateCommand.params.Target).toBeDefined();
        });
    });

    describe('listSchedules()', () => {
        it('should list all schedules', async () => {
            const mockSchedules = [
                { Name: 'frigg-script-script-1', State: 'ENABLED' },
                { Name: 'frigg-script-script-2', State: 'DISABLED' },
            ];

            mockSend.mockResolvedValue({ Schedules: mockSchedules });

            const result = await adapter.listSchedules();

            expect(result).toEqual(mockSchedules);
            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command._type).toBe('ListSchedulesCommand');
            expect(command.params.GroupName).toBe('frigg-admin-scripts');
        });

        it('should return empty array when no schedules exist', async () => {
            mockSend.mockResolvedValue({ Schedules: undefined });

            const result = await adapter.listSchedules();

            expect(result).toEqual([]);
        });
    });

    describe('getSchedule()', () => {
        it('should get schedule details', async () => {
            const mockSchedule = {
                Name: 'frigg-script-test-script',
                GroupName: 'frigg-admin-scripts',
                ScheduleExpression: 'cron(0 0 * * ? *)',
                ScheduleExpressionTimezone: 'UTC',
                State: 'ENABLED',
            };

            mockSend.mockResolvedValue(mockSchedule);

            const result = await adapter.getSchedule('test-script');

            expect(result).toEqual(mockSchedule);
            expect(mockSend).toHaveBeenCalledTimes(1);
            const command = mockSend.mock.calls[0][0];
            expect(command._type).toBe('GetScheduleCommand');
            expect(command.params.Name).toBe('frigg-script-test-script');
            expect(command.params.GroupName).toBe('frigg-admin-scripts');
        });
    });

    describe('Lazy SDK loading', () => {
        it('should load AWS SDK on first client access', () => {
            const newAdapter = new AWSSchedulerAdapter({
                targetLambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
            });

            expect(newAdapter.scheduler).toBeNull();

            newAdapter.getSchedulerClient();

            expect(newAdapter.scheduler).toBeDefined();
        });

        it('should reuse client after first creation', () => {
            const client1 = adapter.getSchedulerClient();
            const client2 = adapter.getSchedulerClient();

            expect(client1).toBe(client2);
        });
    });
});
