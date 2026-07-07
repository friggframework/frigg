const {
    createSchedulerAdapter,
    createSchedulerAdapterFromEnv,
} = require('../scheduler-adapter-factory');
const { AWSSchedulerAdapter } = require('../aws-scheduler-adapter');
const { LocalSchedulerAdapter } = require('../local-scheduler-adapter');

// Mock AWS SDK to prevent actual AWS calls
jest.mock('@aws-sdk/client-scheduler', () => ({
    SchedulerClient: jest.fn(() => ({
        send: jest.fn(),
    })),
    CreateScheduleCommand: jest.fn(),
    DeleteScheduleCommand: jest.fn(),
    GetScheduleCommand: jest.fn(),
    UpdateScheduleCommand: jest.fn(),
    ListSchedulesCommand: jest.fn(),
}));

const awsAdapterParams = {
    targetLambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
    scheduleGroupName: 'test-group',
    roleArn: 'arn:aws:iam::123456789012:role/test-role',
};

describe('Scheduler Adapter Factory', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv, AWS_REGION: 'us-east-1' };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('createSchedulerAdapter()', () => {
        it('should throw if type is not provided', () => {
            expect(() => createSchedulerAdapter()).toThrow();
        });

        it('should throw if type is not provided in options object', () => {
            expect(() => createSchedulerAdapter({})).toThrow();
        });

        it('should create local adapter when type is "local"', () => {
            const adapter = createSchedulerAdapter({ type: 'local' });

            expect(adapter).toBeInstanceOf(LocalSchedulerAdapter);
            expect(adapter.getName()).toBe('local-cron');
        });

        it('should create AWS adapter when type is "aws"', () => {
            const adapter = createSchedulerAdapter({
                type: 'aws',
                ...awsAdapterParams,
            });

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
            expect(adapter.getName()).toBe('aws-eventbridge-scheduler');
        });

        it('should create AWS adapter when type is "eventbridge"', () => {
            const adapter = createSchedulerAdapter({
                type: 'eventbridge',
                ...awsAdapterParams,
            });

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
        });

        it('should handle case-insensitive type values', () => {
            const adapter1 = createSchedulerAdapter({
                type: 'AWS',
                ...awsAdapterParams,
            });
            const adapter2 = createSchedulerAdapter({ type: 'LOCAL' });
            const adapter3 = createSchedulerAdapter({
                type: 'EventBridge',
                ...awsAdapterParams,
            });

            expect(adapter1).toBeInstanceOf(AWSSchedulerAdapter);
            expect(adapter2).toBeInstanceOf(LocalSchedulerAdapter);
            expect(adapter3).toBeInstanceOf(AWSSchedulerAdapter);
        });

        it('should pass AWS configuration to AWS adapter', () => {
            const config = {
                type: 'aws',
                targetLambdaArn:
                    'arn:aws:lambda:eu-west-1:123456789012:function:test',
                scheduleGroupName: 'custom-group',
                roleArn: 'arn:aws:iam::123456789012:role/custom-role',
            };

            const adapter = createSchedulerAdapter(config);

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
            expect(adapter.region).toBe('us-east-1'); // From process.env.AWS_REGION
            expect(adapter.targetLambdaArn).toBe(
                'arn:aws:lambda:eu-west-1:123456789012:function:test'
            );
            expect(adapter.scheduleGroupName).toBe('custom-group');
            expect(adapter.roleArn).toBe(
                'arn:aws:iam::123456789012:role/custom-role'
            );
        });

        it('should pass roleArn through to AWS adapter', () => {
            const adapter = createSchedulerAdapter({
                type: 'aws',
                ...awsAdapterParams,
                roleArn: 'arn:aws:iam::999999999999:role/scheduler-role',
            });

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
            expect(adapter.roleArn).toBe(
                'arn:aws:iam::999999999999:role/scheduler-role'
            );
        });

        it('should ignore AWS config for local adapter', () => {
            const config = {
                type: 'local',
                region: 'eu-west-1', // This should be ignored
            };

            const adapter = createSchedulerAdapter(config);

            expect(adapter).toBeInstanceOf(LocalSchedulerAdapter);
            expect(adapter.region).toBeUndefined();
        });

        it('should throw for unknown adapter type', () => {
            expect(() =>
                createSchedulerAdapter({ type: 'unknown-type' })
            ).toThrow();
        });
    });

    describe('createSchedulerAdapterFromEnv()', () => {
        it('falls back to the local adapter off-AWS when SCHEDULER_PROVIDER is unset', () => {
            delete process.env.SCHEDULER_PROVIDER;
            delete process.env.AWS_LAMBDA_FUNCTION_NAME;

            const adapter = createSchedulerAdapterFromEnv();

            expect(adapter).toBeInstanceOf(LocalSchedulerAdapter);
        });

        it('throws 503 when SCHEDULER_PROVIDER is unset in a deployed Lambda', () => {
            delete process.env.SCHEDULER_PROVIDER;
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'admin-script-router';

            let error;
            try {
                createSchedulerAdapterFromEnv();
            } catch (e) {
                error = e;
            }

            expect(error).toBeDefined();
            expect(error.isBoom).toBe(true);
            expect(error.output.statusCode).toBe(503);
        });

        it('builds the AWS adapter from SCHEDULER_PROVIDER + ADMIN_SCRIPT_* env', () => {
            process.env.SCHEDULER_PROVIDER = 'aws';
            process.env.ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN =
                awsAdapterParams.targetLambdaArn;
            process.env.ADMIN_SCRIPT_SCHEDULE_GROUP =
                awsAdapterParams.scheduleGroupName;
            process.env.SCHEDULER_ROLE_ARN = awsAdapterParams.roleArn;

            const adapter = createSchedulerAdapterFromEnv();

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
            expect(adapter.targetLambdaArn).toBe(
                awsAdapterParams.targetLambdaArn
            );
            expect(adapter.scheduleGroupName).toBe(
                awsAdapterParams.scheduleGroupName
            );
            expect(adapter.roleArn).toBe(awsAdapterParams.roleArn);
        });
    });
});
