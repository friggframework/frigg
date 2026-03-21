/**
 * Tests for scheduler barrel export lazy loading.
 *
 * Verifies that requiring the scheduler barrel does NOT eagerly pull
 * in @aws-sdk/client-scheduler or @friggframework/provider-aws,
 * which would break non-AWS platforms (e.g. Netlify).
 */

describe('scheduler barrel (index.js)', () => {
    beforeEach(() => {
        // Reset all module caches between tests to ensure full isolation.
        // Manual require.cache cleanup is fragile with workspace symlinks.
        jest.resetModules();
    });

    it('does not eagerly require @aws-sdk/client-scheduler', () => {
        // Requiring the barrel should NOT trigger a load of the AWS SDK
        const scheduler = require('./index');

        // Check that no AWS scheduler SDK module was loaded
        const loadedModules = Object.keys(require.cache);
        const awsSchedulerLoaded = loadedModules.some(
            (m) =>
                m.includes('@aws-sdk/client-scheduler') ||
                m.includes('eventbridge-scheduler-adapter')
        );

        expect(awsSchedulerLoaded).toBe(false);

        // But the factory and interface SHOULD be available
        expect(scheduler.SchedulerServiceInterface).toBeDefined();
        expect(scheduler.createSchedulerService).toBeDefined();
        expect(scheduler.SCHEDULER_PROVIDERS).toBeDefined();
    });

    it('does not export EventBridgeSchedulerAdapter (use provider-aws directly)', () => {
        const scheduler = require('./index');

        // EventBridgeSchedulerAdapter was removed from the barrel —
        // it should be imported from @friggframework/provider-aws instead
        expect(scheduler.EventBridgeSchedulerAdapter).toBeUndefined();
    });

    it('lazily loads MockSchedulerAdapter on access', () => {
        const scheduler = require('./index');

        const Adapter = scheduler.MockSchedulerAdapter;

        expect(Adapter).toBeDefined();
        expect(Adapter.name).toBe('MockSchedulerAdapter');
    });

    it('lazily loads NetlifySchedulerAdapter on access', () => {
        const scheduler = require('./index');

        const Adapter = scheduler.NetlifySchedulerAdapter;

        expect(Adapter).toBeDefined();
        expect(Adapter.name).toBe('NetlifySchedulerAdapter');
    });

    it('factory lazy-loads only the requested adapter', () => {
        const scheduler = require('./index');

        // Create a mock scheduler — should NOT load EventBridge adapter
        const mockService = scheduler.createSchedulerService({
            provider: 'mock',
        });

        expect(mockService).toBeDefined();

        const loadedModules = Object.keys(require.cache);
        const eventbridgeLoaded = loadedModules.some((m) =>
            m.includes('eventbridge-scheduler-adapter')
        );

        expect(eventbridgeLoaded).toBe(false);
    });
});
