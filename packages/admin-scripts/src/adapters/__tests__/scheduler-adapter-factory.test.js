const {
    createSchedulerAdapter,
    detectSchedulerAdapterType,
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

describe('Scheduler Adapter Factory', () => {
    let originalEnv;

    beforeAll(() => {
        originalEnv = { ...process.env };
    });

    beforeEach(() => {
        // Reset environment variables
        delete process.env.SCHEDULER_ADAPTER;
        delete process.env.STAGE;
        delete process.env.NODE_ENV;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('createSchedulerAdapter()', () => {
        it('should create local adapter by default', () => {
            const adapter = createSchedulerAdapter();

            expect(adapter).toBeInstanceOf(LocalSchedulerAdapter);
            expect(adapter.getName()).toBe('local-cron');
        });

        it('should create local adapter when explicitly specified', () => {
            const adapter = createSchedulerAdapter({ type: 'local' });

            expect(adapter).toBeInstanceOf(LocalSchedulerAdapter);
        });

        it('should create AWS adapter when type is "aws"', () => {
            const adapter = createSchedulerAdapter({ type: 'aws' });

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
            expect(adapter.getName()).toBe('aws-eventbridge-scheduler');
        });

        it('should create AWS adapter when type is "eventbridge"', () => {
            const adapter = createSchedulerAdapter({ type: 'eventbridge' });

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
        });

        it('should use SCHEDULER_ADAPTER env variable', () => {
            process.env.SCHEDULER_ADAPTER = 'aws';

            const adapter = createSchedulerAdapter();

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
        });

        it('should allow explicit type to override env variable', () => {
            process.env.SCHEDULER_ADAPTER = 'aws';

            const adapter = createSchedulerAdapter({ type: 'local' });

            expect(adapter).toBeInstanceOf(LocalSchedulerAdapter);
        });

        it('should handle case-insensitive type values', () => {
            const adapter1 = createSchedulerAdapter({ type: 'AWS' });
            const adapter2 = createSchedulerAdapter({ type: 'LOCAL' });
            const adapter3 = createSchedulerAdapter({ type: 'EventBridge' });

            expect(adapter1).toBeInstanceOf(AWSSchedulerAdapter);
            expect(adapter2).toBeInstanceOf(LocalSchedulerAdapter);
            expect(adapter3).toBeInstanceOf(AWSSchedulerAdapter);
        });

        it('should pass AWS configuration to AWS adapter', () => {
            const config = {
                type: 'aws',
                region: 'eu-west-1',
                targetLambdaArn: 'arn:aws:lambda:eu-west-1:123456789012:function:test',
                scheduleGroupName: 'custom-group',
            };

            const adapter = createSchedulerAdapter(config);

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
            expect(adapter.region).toBe('eu-west-1');
            expect(adapter.targetLambdaArn).toBe('arn:aws:lambda:eu-west-1:123456789012:function:test');
            expect(adapter.scheduleGroupName).toBe('custom-group');
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

        it('should handle unknown adapter type by creating local adapter', () => {
            const adapter = createSchedulerAdapter({ type: 'unknown-type' });

            expect(adapter).toBeInstanceOf(LocalSchedulerAdapter);
        });
    });

    describe('detectSchedulerAdapterType()', () => {
        it('should return "local" by default', () => {
            const type = detectSchedulerAdapterType();

            expect(type).toBe('local');
        });

        it('should return env SCHEDULER_ADAPTER when set', () => {
            process.env.SCHEDULER_ADAPTER = 'aws';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('aws');
        });

        it('should return "aws" for production stage', () => {
            process.env.STAGE = 'production';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('aws');
        });

        it('should return "aws" for prod stage', () => {
            process.env.STAGE = 'prod';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('aws');
        });

        it('should return "aws" for staging stage', () => {
            process.env.STAGE = 'staging';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('aws');
        });

        it('should return "aws" for stage stage', () => {
            process.env.STAGE = 'stage';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('aws');
        });

        it('should handle case-insensitive stage values', () => {
            process.env.STAGE = 'PRODUCTION';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('aws');
        });

        it('should return "local" for dev stage', () => {
            process.env.STAGE = 'dev';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('local');
        });

        it('should return "local" for development stage', () => {
            process.env.STAGE = 'development';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('local');
        });

        it('should return "local" for test stage', () => {
            process.env.STAGE = 'test';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('local');
        });

        it('should return "local" for local stage', () => {
            process.env.STAGE = 'local';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('local');
        });

        it('should use NODE_ENV as fallback for STAGE', () => {
            delete process.env.STAGE;
            process.env.NODE_ENV = 'production';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('aws');
        });

        it('should prioritize explicit SCHEDULER_ADAPTER over auto-detection', () => {
            process.env.SCHEDULER_ADAPTER = 'local';
            process.env.STAGE = 'production';

            const type = detectSchedulerAdapterType();

            expect(type).toBe('local');
        });
    });

    describe('Integration with createSchedulerAdapter', () => {
        it('should auto-detect and create AWS adapter in production', () => {
            process.env.STAGE = 'production';

            const adapter = createSchedulerAdapter();

            expect(adapter).toBeInstanceOf(AWSSchedulerAdapter);
        });

        it('should auto-detect and create local adapter in development', () => {
            process.env.STAGE = 'development';

            const adapter = createSchedulerAdapter();

            expect(adapter).toBeInstanceOf(LocalSchedulerAdapter);
        });

        it('should allow explicit override of auto-detection', () => {
            process.env.STAGE = 'production';

            const adapter = createSchedulerAdapter({ type: 'local' });

            expect(adapter).toBeInstanceOf(LocalSchedulerAdapter);
        });
    });
});
