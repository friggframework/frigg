/**
 * Regression tests for lazy loading of @aws-sdk/client-scheduler.
 *
 * @aws-sdk/client-scheduler is an OPTIONAL dependency of @friggframework/core.
 * Merely requiring the scheduler infrastructure (and therefore core itself)
 * must NOT pull in the AWS SDK, so consumers on the mock provider or with no
 * scheduler at all are not forced to install it. Only instantiating the
 * EventBridge adapter should reach for the SDK.
 */

describe('EventBridge scheduler lazy AWS SDK loading', () => {
    const AWS_SDK = '@aws-sdk/client-scheduler';

    const isSdkInstalled = () => {
        try {
            require.resolve(AWS_SDK);
            return true;
        } catch (error) {
            return false;
        }
    };

    beforeEach(() => {
        jest.resetModules();
    });

    it('loads the scheduler module without requiring the AWS SDK', () => {
        // Requiring the module must not throw even if the SDK is absent,
        // and must not populate the SDK into the module cache.
        // eslint-disable-next-line global-require
        const scheduler = require('./index');
        expect(scheduler.EventBridgeSchedulerAdapter).toBeDefined();
        expect(scheduler.MockSchedulerAdapter).toBeDefined();
        expect(scheduler.createSchedulerService).toBeInstanceOf(Function);

        if (!isSdkInstalled()) {
            expect(
                Object.keys(require.cache).some((k) => k.includes('client-scheduler'))
            ).toBe(false);
        }
    });

    it('creates a mock scheduler without touching the AWS SDK', () => {
        // eslint-disable-next-line global-require
        const { createSchedulerService } = require('./index');
        const service = createSchedulerService({ provider: 'mock' });
        expect(service.constructor.name).toBe('MockSchedulerAdapter');
    });

    it('defaults to the mock provider in local/dev/test stages', () => {
        const prevStage = process.env.STAGE;
        const prevProvider = process.env.SCHEDULER_PROVIDER;
        delete process.env.SCHEDULER_PROVIDER;
        process.env.STAGE = 'test';
        try {
            // eslint-disable-next-line global-require
            const { createSchedulerService } = require('./index');
            const service = createSchedulerService();
            expect(service.constructor.name).toBe('MockSchedulerAdapter');
        } finally {
            if (prevStage === undefined) delete process.env.STAGE;
            else process.env.STAGE = prevStage;
            if (prevProvider !== undefined)
                process.env.SCHEDULER_PROVIDER = prevProvider;
        }
    });

    it('instantiating the EventBridge adapter reaches for the SDK', () => {
        // eslint-disable-next-line global-require
        const {
            EventBridgeSchedulerAdapter,
        } = require('./eventbridge-scheduler-adapter');

        if (isSdkInstalled()) {
            const adapter = new EventBridgeSchedulerAdapter({
                region: 'us-east-1',
            });
            expect(adapter.client).toBeDefined();
        } else {
            // Without the SDK installed, instantiation must throw a clear,
            // actionable error naming the optional dependency.
            expect(() => new EventBridgeSchedulerAdapter({})).toThrow(
                /@aws-sdk\/client-scheduler/
            );
        }
    });
});
