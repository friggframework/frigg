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
});
