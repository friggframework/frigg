const { AWSSchedulerAdapter } = require('../aws-scheduler-adapter');
const { SchedulerAdapter } = require('../scheduler-adapter');

// Mock AWS SDK
jest.mock('@aws-sdk/client-scheduler', () => {
    const mockSend = jest.fn();

    return {
        SchedulerClient: jest.fn(() => ({
            send: mockSend,
        })),
        CreateScheduleCommand: jest.fn((params) => ({
            _type: 'CreateScheduleCommand',
            params,
        })),
        DeleteScheduleCommand: jest.fn((params) => ({
            _type: 'DeleteScheduleCommand',
            params,
        })),
        GetScheduleCommand: jest.fn((params) => ({
            _type: 'GetScheduleCommand',
            params,
        })),
        UpdateScheduleCommand: jest.fn((params) => ({
            _type: 'UpdateScheduleCommand',
            params,
        })),
        ListSchedulesCommand: jest.fn((params) => ({
            _type: 'ListSchedulesCommand',
            params,
        })),
        _mockSend: mockSend,
    };
});

const defaultParams = {
    targetLambdaArn:
        'arn:aws:lambda:us-east-1:123456789012:function:admin-script-executor',
    scheduleGroupName: 'frigg-admin-scripts',
    roleArn: 'arn:aws:iam::123456789012:role/test-role',
};

describe('AWSSchedulerAdapter', () => {
    let adapter;
    let mockSend;
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, AWS_REGION: 'us-east-1' };

        const sdk = require('@aws-sdk/client-scheduler');
        mockSend = sdk._mockSend;

        adapter = new AWSSchedulerAdapter({ ...defaultParams });
    });

    afterEach(() => {
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
        it('should use provided configuration and AWS_REGION from env', () => {
            process.env.AWS_REGION = 'eu-west-1';
            const customAdapter = new AWSSchedulerAdapter({
                targetLambdaArn:
                    'arn:aws:lambda:eu-west-1:123456789012:function:custom',
                scheduleGroupName: 'custom-group',
                roleArn: 'arn:aws:iam::123456789012:role/custom-role',
            });

            expect(customAdapter.region).toBe('eu-west-1');
            expect(customAdapter.targetLambdaArn).toBe(
                'arn:aws:lambda:eu-west-1:123456789012:function:custom'
            );
            expect(customAdapter.scheduleGroupName).toBe('custom-group');
            expect(customAdapter.roleArn).toBe(
                'arn:aws:iam::123456789012:role/custom-role'
            );
        });

        it('should throw if AWS_REGION is not set', () => {
            delete process.env.AWS_REGION;
            expect(
                () =>
                    new AWSSchedulerAdapter({
                        ...defaultParams,
                    })
            ).toThrow(
                'AWSSchedulerAdapter requires AWS_REGION environment variable'
            );
        });

        it('should throw if targetLambdaArn is missing', () => {
            expect(
                () =>
                    new AWSSchedulerAdapter({
                        scheduleGroupName: defaultParams.scheduleGroupName,
                        roleArn: defaultParams.roleArn,
                    })
            ).toThrow('AWSSchedulerAdapter requires targetLambdaArn');
        });

        it('should throw if scheduleGroupName is missing', () => {
            expect(
                () =>
                    new AWSSchedulerAdapter({
                        targetLambdaArn: defaultParams.targetLambdaArn,
                        roleArn: defaultParams.roleArn,
                    })
            ).toThrow('AWSSchedulerAdapter requires scheduleGroupName');
        });

        it('should throw if roleArn is missing', () => {
            expect(
                () =>
                    new AWSSchedulerAdapter({
                        targetLambdaArn: defaultParams.targetLambdaArn,
                        scheduleGroupName: defaultParams.scheduleGroupName,
                    })
            ).toThrow('AWSSchedulerAdapter requires roleArn');
        });
    });

    describe('createSchedule()', () => {
        it('should create a schedule with required fields', async () => {
            mockSend.mockResolvedValue({
                ScheduleArn:
                    'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            const result = await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 0 * * ? *)',
            });

            expect(result).toEqual({
                scheduleArn:
                    'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
                scheduleName: 'frigg-script-test-script',
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
                ScheduleArn:
                    'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 12 * * ? *)',
                timezone: 'America/New_York',
                input: { key: 'value' },
            });

            const command = mockSend.mock.calls[0][0];
            expect(command.params.ScheduleExpressionTimezone).toBe(
                'America/New_York'
            );

            const targetInput = JSON.parse(command.params.Target.Input);
            expect(targetInput).toEqual({
                scriptName: 'test-script',
                trigger: 'SCHEDULED',
                params: { key: 'value' },
            });
        });

        it('should configure target with Lambda ARN and constructor roleArn', async () => {
            mockSend.mockResolvedValue({
                ScheduleArn:
                    'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 0 * * ? *)',
            });

            const command = mockSend.mock.calls[0][0];
            expect(command.params.Target.Arn).toBe(
                'arn:aws:lambda:us-east-1:123456789012:function:admin-script-executor'
            );
            expect(command.params.Target.RoleArn).toBe(
                'arn:aws:iam::123456789012:role/test-role'
            );
        });

        it('should use roleArn from constructor, not process.env', async () => {
            const customRoleArn =
                'arn:aws:iam::999999999999:role/custom-scheduler-role';
            const customAdapter = new AWSSchedulerAdapter({
                ...defaultParams,
                roleArn: customRoleArn,
            });

            mockSend.mockResolvedValue({
                ScheduleArn:
                    'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            await customAdapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 0 * * ? *)',
            });

            const command = mockSend.mock.calls[0][0];
            expect(command.params.Target.RoleArn).toBe(customRoleArn);
        });

        it('should enable schedule by default', async () => {
            mockSend.mockResolvedValue({
                ScheduleArn:
                    'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
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
                ScheduleArn:
                    'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
            });

            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 0 * * ? *)',
            });

            const command = mockSend.mock.calls[0][0];
            expect(command.params.FlexibleTimeWindow).toEqual({ Mode: 'OFF' });
        });

        it('should fall back to UpdateScheduleCommand on ConflictException', async () => {
            const conflictError = new Error('Schedule already exists');
            conflictError.name = 'ConflictException';

            mockSend
                .mockRejectedValueOnce(conflictError)
                .mockResolvedValueOnce({
                    ScheduleArn:
                        'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
                });

            const result = await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: 'cron(0 0 * * ? *)',
            });

            expect(result).toEqual({
                scheduleArn:
                    'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
                scheduleName: 'frigg-script-test-script',
            });

            expect(mockSend).toHaveBeenCalledTimes(2);
            expect(mockSend.mock.calls[0][0]._type).toBe(
                'CreateScheduleCommand'
            );
            expect(mockSend.mock.calls[1][0]._type).toBe(
                'UpdateScheduleCommand'
            );
        });

        it('should rethrow non-conflict errors', async () => {
            const otherError = new Error('Access denied');
            otherError.name = 'AccessDeniedException';

            mockSend.mockRejectedValue(otherError);

            await expect(
                adapter.createSchedule({
                    scriptName: 'test-script',
                    cronExpression: 'cron(0 0 * * ? *)',
                })
            ).rejects.toThrow('Access denied');
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
            expect(updateCommand.params.ScheduleExpression).toBe(
                'cron(0 0 * * ? *)'
            );
            expect(updateCommand.params.ScheduleExpressionTimezone).toBe('UTC');
            expect(updateCommand.params.FlexibleTimeWindow).toEqual({
                Mode: 'OFF',
            });
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

    describe('report parameterization (namePrefix + buildInput)', () => {
        const reportParams = {
            targetLambdaArn:
                'arn:aws:lambda:us-east-1:123456789012:function:report-executor',
            scheduleGroupName: 'frigg-admin-scripts',
            roleArn: 'arn:aws:iam::123456789012:role/test-role',
            namePrefix: 'frigg-report-',
            buildInput: ({ input }) => ({
                reportName: 'integrations',
                mode: 'snapshot',
                trigger: 'SCHEDULED',
                params: input || {},
            }),
        };

        it('targets the report executor and emits a report-shaped message', async () => {
            const reportAdapter = new AWSSchedulerAdapter({ ...reportParams });
            mockSend.mockResolvedValue({
                ScheduleArn:
                    'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-report-integrations',
            });

            const result = await reportAdapter.createSchedule({
                scriptName: 'integrations',
                cronExpression: 'cron(0 6 * * ? *)',
            });

            expect(result.scheduleName).toBe('frigg-report-integrations');

            const command = mockSend.mock.calls[0][0];
            expect(command.params.Name).toBe('frigg-report-integrations');
            expect(command.params.Target.Arn).toBe(
                'arn:aws:lambda:us-east-1:123456789012:function:report-executor'
            );
            expect(JSON.parse(command.params.Target.Input)).toEqual({
                reportName: 'integrations',
                mode: 'snapshot',
                trigger: 'SCHEDULED',
                params: {},
            });
        });

        it('deletes the report schedule by its prefixed name', async () => {
            const reportAdapter = new AWSSchedulerAdapter({ ...reportParams });
            mockSend.mockResolvedValue({});

            await reportAdapter.deleteSchedule('integrations');

            const command = mockSend.mock.calls[0][0];
            expect(command._type).toBe('DeleteScheduleCommand');
            expect(command.params.Name).toBe('frigg-report-integrations');
        });
    });

    describe('Lazy SDK loading', () => {
        it('should load AWS SDK on first client access', () => {
            const newAdapter = new AWSSchedulerAdapter({ ...defaultParams });

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
