/**
 * Regression tests for lazy loading of @aws-sdk/client-scheduler.
 *
 * Merely requiring the scheduler infrastructure (and therefore core itself)
 * must NOT load the AWS SDK. Only instantiating the EventBridge adapter should
 * reach for it. These tests simulate the SDK being absent with a virtual mock
 * that throws MODULE_NOT_FOUND, so they prove laziness regardless of whether
 * the package happens to be installed in the test environment.
 */

const SDK = '@aws-sdk/client-scheduler';

function moduleNotFound(message) {
    const error = new Error(message);
    error.code = 'MODULE_NOT_FOUND';
    return error;
}

/**
 * Run `fn` in an isolated module registry where requiring the scheduler SDK
 * throws `error`.
 */
function withSdkThrowing(error, fn) {
    jest.isolateModules(() => {
        jest.doMock(
            SDK,
            () => {
                throw error;
            },
            { virtual: true }
        );
        fn();
    });
}

describe('EventBridge scheduler lazy AWS SDK loading', () => {
    afterEach(() => {
        jest.dontMock(SDK);
        jest.resetModules();
    });

    it('requires the scheduler index without loading the SDK', () => {
        withSdkThrowing(moduleNotFound(`Cannot find module '${SDK}'`), () => {
            let scheduler;
            expect(() => {
                scheduler = require('./index');
            }).not.toThrow();
            expect(scheduler.EventBridgeSchedulerAdapter).toBeDefined();
            expect(scheduler.MockSchedulerAdapter).toBeDefined();
            expect(scheduler.createSchedulerService).toBeInstanceOf(Function);
        });
    });

    it('creates a mock scheduler without loading the SDK', () => {
        withSdkThrowing(moduleNotFound(`Cannot find module '${SDK}'`), () => {
            const { createSchedulerService } = require('./index');
            const service = createSchedulerService({ provider: 'mock' });
            expect(service.constructor.name).toBe('MockSchedulerAdapter');
        });
    });

    it('throws an actionable error when the SDK is missing on instantiation', () => {
        const original = moduleNotFound(`Cannot find module '${SDK}'`);
        withSdkThrowing(original, () => {
            const {
                EventBridgeSchedulerAdapter,
            } = require('./eventbridge-scheduler-adapter');

            let thrown;
            try {
                new EventBridgeSchedulerAdapter({ region: 'us-east-1' });
            } catch (error) {
                thrown = error;
            }

            expect(thrown).toBeDefined();
            expect(thrown.message).toMatch(
                /requires the "@aws-sdk\/client-scheduler" package/
            );
            expect(thrown.message).toMatch(/SCHEDULER_PROVIDER=mock/);
            expect(thrown.cause).toBe(original);
        });
    });

    it('rethrows a MODULE_NOT_FOUND for a different module unchanged', () => {
        const nested = moduleNotFound(
            "Cannot find module '@smithy/some-transitive-dependency'"
        );
        withSdkThrowing(nested, () => {
            const {
                EventBridgeSchedulerAdapter,
            } = require('./eventbridge-scheduler-adapter');

            expect(() => new EventBridgeSchedulerAdapter({})).toThrow(nested);
        });
    });

    it('rethrows non-MODULE_NOT_FOUND errors unchanged', () => {
        const other = new Error('SDK initialisation failed');
        withSdkThrowing(other, () => {
            const {
                EventBridgeSchedulerAdapter,
            } = require('./eventbridge-scheduler-adapter');

            expect(() => new EventBridgeSchedulerAdapter({})).toThrow(other);
        });
    });

    it('instantiates the adapter when the SDK is available', () => {
        jest.isolateModules(() => {
            const SchedulerClient = jest.fn();
            jest.doMock(SDK, () => ({ SchedulerClient }), { virtual: true });
            const {
                EventBridgeSchedulerAdapter,
            } = require('./eventbridge-scheduler-adapter');

            const adapter = new EventBridgeSchedulerAdapter({
                region: 'eu-west-1',
            });

            expect(SchedulerClient).toHaveBeenCalledWith({
                region: 'eu-west-1',
            });
            expect(adapter.client).toBeInstanceOf(SchedulerClient);
        });
    });

    it('loads the SDK once, in the constructor, and reuses it in every method', async () => {
        class ResourceNotFoundException extends Error {}
        const command = () =>
            jest.fn(function (input) {
                this.input = input;
            });
        const sdk = {
            SchedulerClient: jest.fn(),
            CreateScheduleCommand: command(),
            DeleteScheduleCommand: command(),
            GetScheduleCommand: command(),
            ResourceNotFoundException,
        };
        // Count every read of an SDK export. Loading once in the constructor
        // means each export is read at most once, however many methods run.
        const reads = {};
        const factory = jest.fn(
            () =>
                new Proxy(sdk, {
                    get(target, prop) {
                        reads[prop] = (reads[prop] || 0) + 1;
                        return target[prop];
                    },
                })
        );

        let adapter;
        jest.isolateModules(() => {
            jest.doMock(SDK, factory, { virtual: true });
            const {
                EventBridgeSchedulerAdapter,
            } = require('./eventbridge-scheduler-adapter');
            adapter = new EventBridgeSchedulerAdapter({});
        });

        adapter.roleArn = 'arn:aws:iam::123456789012:role/test';
        const send = jest
            .fn()
            .mockResolvedValueOnce({ ScheduleArn: 'arn:schedule' })
            .mockRejectedValueOnce(new ResourceNotFoundException('gone'))
            .mockRejectedValueOnce(new ResourceNotFoundException('gone'));
        adapter.client = { send };
        jest.spyOn(console, 'log').mockImplementation(() => {});

        const created = await adapter.scheduleOneTime({
            scheduleName: 'job',
            scheduleAt: new Date('2030-01-01T00:00:00Z'),
            queueResourceId: 'arn:aws:sqs:us-east-1:123456789012:queue',
            payload: { a: 1 },
        });
        const deleted = await adapter.deleteSchedule('job');
        const status = await adapter.getScheduleStatus('job');
        console.log.mockRestore();

        expect(created.scheduledJobId).toBe('arn:schedule');
        expect(deleted).toBeUndefined();
        expect(status).toEqual({ exists: false });
        expect(send.mock.calls[0][0]).toBeInstanceOf(sdk.CreateScheduleCommand);
        expect(send.mock.calls[1][0]).toBeInstanceOf(sdk.DeleteScheduleCommand);
        expect(send.mock.calls[2][0]).toBeInstanceOf(sdk.GetScheduleCommand);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(Object.keys(reads).length).toBeGreaterThan(0);
        for (const [name, count] of Object.entries(reads)) {
            expect([name, count]).toEqual([name, 1]);
        }
    });
});
