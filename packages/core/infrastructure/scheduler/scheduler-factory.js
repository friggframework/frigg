/**
 * Scheduler Factory
 *
 * Creates scheduler adapter instances based on configuration.
 * Currently supports EventBridge Scheduler, but designed to be
 * extensible for other providers (Step Functions, etc.).
 */

const { EventBridgeSchedulerAdapter } = require('./eventbridge-scheduler-adapter');

const SCHEDULER_PROVIDERS = {
    EVENTBRIDGE: 'eventbridge',
};

/**
 * Create a scheduler adapter based on the provider configuration
 *
 * @param {Object} options
 * @param {string} options.provider - Scheduler provider ('eventbridge')
 * @param {string} options.region - AWS region
 * @returns {EventBridgeSchedulerAdapter}
 */
function createSchedulerAdapter(options = {}) {
    const provider = options.provider || process.env.SCHEDULER_PROVIDER || SCHEDULER_PROVIDERS.EVENTBRIDGE;

    switch (provider) {
        case SCHEDULER_PROVIDERS.EVENTBRIDGE:
            return new EventBridgeSchedulerAdapter({
                region: options.region,
            });
        default:
            throw new Error(`Unknown scheduler provider: ${provider}`);
    }
}

module.exports = {
    createSchedulerAdapter,
    SCHEDULER_PROVIDERS,
};
