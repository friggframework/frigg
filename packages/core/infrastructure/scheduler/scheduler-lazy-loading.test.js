/**
 * Scheduler barrel lazy loading (friggframework/frigg#545, 1176a004).
 *
 * @aws-sdk/client-scheduler is not a core dependency. Requiring the barrel,
 * or core itself, must not load it, or a deployment without that SDK (a
 * pruned Netlify function bundle) crashes at require time.
 */

const loaded = (pattern) =>
    Object.keys(require.cache).some((m) => m.includes(pattern));

describe('scheduler barrel (index.js)', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('does not load the EventBridge adapter or its SDK on require', () => {
        const scheduler = require('./index');

        expect(loaded('@aws-sdk/client-scheduler')).toBe(false);
        expect(loaded('eventbridge-scheduler-adapter')).toBe(false);
        expect(scheduler.SchedulerServiceInterface).toBeDefined();
        expect(scheduler.createSchedulerService).toBeDefined();
        expect(scheduler.SCHEDULER_PROVIDERS).toEqual({
            EVENTBRIDGE: 'eventbridge',
            MOCK: 'mock',
            NETLIFY: 'netlify',
        });
    });

    it('does not load it through require("@friggframework/core") either', () => {
        require('../../index');
        expect(loaded('@aws-sdk/client-scheduler')).toBe(false);
        expect(loaded('eventbridge-scheduler-adapter')).toBe(false);
    });

    it('still exports every adapter, loaded on access', () => {
        const scheduler = require('./index');
        expect(scheduler.MockSchedulerAdapter.name).toBe('MockSchedulerAdapter');
        expect(scheduler.NetlifySchedulerAdapter.name).toBe('NetlifySchedulerAdapter');
        expect(scheduler.EventBridgeSchedulerAdapter.name).toBe('EventBridgeSchedulerAdapter');
    });

    it('builds only the requested adapter', () => {
        const scheduler = require('./index');
        scheduler.createSchedulerService({ provider: 'mock' });
        scheduler.createSchedulerService({ provider: 'netlify', repository: {} });
        expect(loaded('eventbridge-scheduler-adapter')).toBe(false);
    });

    it('creates the Netlify adapter with its repository and queue provider', () => {
        const scheduler = require('./index');
        const repository = { save: jest.fn() };
        const queueProvider = { send: jest.fn() };

        const service = scheduler.createSchedulerService({
            provider: 'netlify',
            repository,
            queueProvider,
        });

        expect(service).toBeInstanceOf(scheduler.NetlifySchedulerAdapter);
        expect(service.repository).toBe(repository);
        expect(service.queueProvider).toBe(queueProvider);
    });

    it('reads SCHEDULER_PROVIDER=netlify from the environment', () => {
        const saved = process.env.SCHEDULER_PROVIDER;
        process.env.SCHEDULER_PROVIDER = 'netlify';
        try {
            const scheduler = require('./index');
            const service = scheduler.createSchedulerService({ repository: {} });
            expect(service.constructor.name).toBe('NetlifySchedulerAdapter');
        } finally {
            if (saved === undefined) delete process.env.SCHEDULER_PROVIDER;
            else process.env.SCHEDULER_PROVIDER = saved;
        }
    });

    it('names an unknown provider in the error', () => {
        const scheduler = require('./index');
        expect(() => scheduler.createSchedulerService({ provider: 'vercel' })).toThrow(
            /Unknown scheduler provider: vercel/
        );
    });
});
