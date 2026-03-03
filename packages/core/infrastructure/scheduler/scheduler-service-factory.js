/**
 * Scheduler Service Factory
 *
 * Creates scheduler service instances based on configuration.
 * Returns implementations of SchedulerServiceInterface.
 *
 * Environment Detection:
 * - SCHEDULER_PROVIDER=eventbridge -> Use AWS EventBridge Scheduler
 * - SCHEDULER_PROVIDER=mock -> Use in-memory mock scheduler
 * - Default in dev/test/local stages -> Mock scheduler
 * - Default in other stages -> EventBridge scheduler
 */

// Adapters are lazily required to avoid pulling in heavy SDK deps
// (e.g. @aws-sdk/client-scheduler) when they won't be used.

const SCHEDULER_PROVIDERS = {
    EVENTBRIDGE: 'eventbridge',
    MOCK: 'mock',
    NETLIFY: 'netlify',
};

const LOCAL_STAGES = ['dev', 'test', 'local'];

/**
 * Determine the scheduler provider based on environment
 *
 * @returns {string} Provider name
 */
function determineProvider() {
    const explicitProvider = process.env.SCHEDULER_PROVIDER;
    if (explicitProvider) {
        return explicitProvider;
    }

    const stage = process.env.STAGE || 'dev';
    if (LOCAL_STAGES.includes(stage)) {
        return SCHEDULER_PROVIDERS.MOCK;
    }

    return SCHEDULER_PROVIDERS.EVENTBRIDGE;
}

/**
 * Create a scheduler service instance
 *
 * @param {Object} options
 * @param {string} options.provider - Scheduler provider ('eventbridge', 'mock', or 'netlify')
 * @param {string} options.region - AWS region (for EventBridge)
 * @param {boolean} options.verbose - Verbose logging (for Mock)
 * @param {Object} options.repository - Schedule repository (for Netlify - persists schedules)
 * @param {Object} options.queueProvider - Queue provider (for Netlify - dispatches due jobs)
 * @returns {SchedulerServiceInterface} Implementation of scheduler interface
 */
function createSchedulerService(options = {}) {
    const provider = options.provider || determineProvider();

    switch (provider) {
        case SCHEDULER_PROVIDERS.EVENTBRIDGE: {
            const { EventBridgeSchedulerAdapter } = require('./eventbridge-scheduler-adapter');
            return new EventBridgeSchedulerAdapter({
                region: options.region,
            });
        }
        case SCHEDULER_PROVIDERS.MOCK: {
            const { MockSchedulerAdapter } = require('./mock-scheduler-adapter');
            return new MockSchedulerAdapter({
                verbose: options.verbose,
            });
        }
        case SCHEDULER_PROVIDERS.NETLIFY: {
            const { NetlifySchedulerAdapter } = require('./netlify-scheduler-adapter');
            return new NetlifySchedulerAdapter({
                repository: options.repository,
                queueProvider: options.queueProvider,
            });
        }
        default:
            throw new Error(`Unknown scheduler provider: ${provider}`);
    }
}

module.exports = {
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
};
