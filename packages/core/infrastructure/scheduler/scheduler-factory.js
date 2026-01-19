/**
 * Scheduler Factory
 *
 * Creates scheduler adapter instances based on configuration.
 * Supports EventBridge Scheduler for production and Mock Scheduler for local development.
 *
 * Environment Detection:
 * - SCHEDULER_PROVIDER=eventbridge -> Use AWS EventBridge Scheduler
 * - SCHEDULER_PROVIDER=mock -> Use in-memory mock scheduler
 * - Default in dev/test/local stages -> Mock scheduler
 * - Default in other stages -> EventBridge scheduler
 */

const { EventBridgeSchedulerAdapter } = require('./eventbridge-scheduler-adapter');
const { MockSchedulerAdapter } = require('./mock-scheduler-adapter');

const SCHEDULER_PROVIDERS = {
    EVENTBRIDGE: 'eventbridge',
    MOCK: 'mock',
};

const LOCAL_STAGES = ['dev', 'test', 'local'];

/**
 * Determine the scheduler provider based on environment
 *
 * @returns {string} Provider name
 */
function determineProvider() {
    // Explicit provider takes precedence
    const explicitProvider = process.env.SCHEDULER_PROVIDER;
    if (explicitProvider) {
        return explicitProvider;
    }

    // Default based on stage
    const stage = process.env.STAGE || 'dev';
    if (LOCAL_STAGES.includes(stage)) {
        return SCHEDULER_PROVIDERS.MOCK;
    }

    return SCHEDULER_PROVIDERS.EVENTBRIDGE;
}

/**
 * Create a scheduler adapter based on the provider configuration
 *
 * @param {Object} options
 * @param {string} options.provider - Scheduler provider ('eventbridge' or 'mock')
 * @param {string} options.region - AWS region (for EventBridge)
 * @param {boolean} options.verbose - Verbose logging (for Mock)
 * @returns {EventBridgeSchedulerAdapter|MockSchedulerAdapter}
 */
function createSchedulerAdapter(options = {}) {
    const provider = options.provider || determineProvider();

    switch (provider) {
        case SCHEDULER_PROVIDERS.EVENTBRIDGE:
            return new EventBridgeSchedulerAdapter({
                region: options.region,
            });
        case SCHEDULER_PROVIDERS.MOCK:
            return new MockSchedulerAdapter({
                verbose: options.verbose,
            });
        default:
            throw new Error(`Unknown scheduler provider: ${provider}`);
    }
}

module.exports = {
    createSchedulerAdapter,
    SCHEDULER_PROVIDERS,
    determineProvider,
};
