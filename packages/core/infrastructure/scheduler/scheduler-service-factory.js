/**
 * Scheduler Service Factory
 *
 * Creates scheduler service instances based on configuration.
 * Returns implementations of SchedulerServiceInterface.
 *
 * Uses the provider plugin system (resolveProvider) to load the correct
 * scheduler adapter for the active platform (AWS, Netlify, etc.).
 *
 * Environment Detection:
 * - SCHEDULER_PROVIDER=mock -> Use in-memory mock scheduler
 * - Default in dev/test/local stages -> Mock scheduler
 * - Otherwise -> Resolved provider's SchedulerAdapter
 */

const { resolveProvider } = require('../../providers/resolve-provider');

const SCHEDULER_PROVIDERS = {
    MOCK: 'mock',
};

const LOCAL_STAGES = ['dev', 'test', 'local'];

/**
 * Determine if mock scheduler should be used
 *
 * @param {string} [explicit] - Explicit provider override
 * @returns {boolean}
 */
function shouldUseMock(explicit) {
    if (explicit === SCHEDULER_PROVIDERS.MOCK) {
        return true;
    }
    if (!explicit) {
        const stage = process.env.STAGE || 'dev';
        return LOCAL_STAGES.includes(stage);
    }
    return false;
}

/**
 * Create a scheduler service instance
 *
 * @param {Object} options
 * @param {string} options.provider - Scheduler provider ('mock', or omit for auto-detect)
 * @param {string} options.region - AWS region (for EventBridge)
 * @param {boolean} options.verbose - Verbose logging (for Mock)
 * @param {Object} options.repository - Schedule repository (for Netlify - persists schedules)
 * @param {Object} options.queueProvider - Queue provider (for Netlify - dispatches due jobs)
 * @returns {SchedulerServiceInterface} Implementation of scheduler interface
 */
function createSchedulerService(options = {}) {
    const explicit = options.provider || process.env.SCHEDULER_PROVIDER;

    if (shouldUseMock(explicit)) {
        const { MockSchedulerAdapter } = require('./mock-scheduler-adapter');
        return new MockSchedulerAdapter({ verbose: options.verbose });
    }

    // Use the resolved provider's scheduler adapter.
    // Legacy SCHEDULER_PROVIDER values (eventbridge, netlify) are mapped
    // to provider names for backward compatibility.
    const LEGACY_MAP = { eventbridge: 'aws', netlify: 'netlify' };
    const providerName = LEGACY_MAP[explicit] || explicit;
    const providerOverride = providerName ? { provider: providerName } : {};
    const provider = resolveProvider(null, providerOverride);

    const Adapter = provider.SchedulerAdapter;
    if (!Adapter) {
        throw new Error(
            `Provider '${provider.name}' does not export a SchedulerAdapter`
        );
    }
    return new Adapter(options);
}

module.exports = {
    createSchedulerService,
    SCHEDULER_PROVIDERS,
};
