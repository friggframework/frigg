/**
 * Tests for scheduler barrel export lazy loading.
 *
 * Verifies that requiring the scheduler barrel does NOT eagerly pull
 * in @aws-sdk/client-scheduler, which would break non-AWS platforms
 * (e.g. Netlify) that don't have the AWS SDK installed.
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

    it('defers EventBridgeSchedulerAdapter load until property access', () => {
        const scheduler = require('./index');

        // Before access: eventbridge adapter file should NOT be loaded
        const preAccessModules = Object.keys(require.cache);
        const preLoaded = preAccessModules.some((m) =>
            m.includes('eventbridge-scheduler-adapter')
        );
        expect(preLoaded).toBe(false);

        // Accessing the getter triggers the lazy require.
        // In this test env @aws-sdk/client-scheduler may not be installed,
        // so we catch the error — the point is that it wasn't loaded BEFORE.
        try {
            scheduler.EventBridgeSchedulerAdapter;
        } catch (e) {
            expect(e.message).toMatch(/Cannot find module.*@aws-sdk/);
        }
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
