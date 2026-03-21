/**
 * Queue Provider Factory
 *
 * Creates queue provider instances based on appDefinition or environment configuration.
 * Uses the provider plugin system (resolveProvider) to load the correct
 * queue adapter for the active platform (AWS, Netlify, etc.).
 *
 * Priority order for determining provider:
 * 1. Explicit `provider` option passed to factory
 * 2. `appDefinition.queue.provider` property
 * 3. `QUEUE_PROVIDER` environment variable
 * 4. Default: resolved provider's QueueProvider
 *
 * Special providers (not tied to a platform):
 * - 'qstash' -> Upstash QStash (platform-agnostic)
 */

const { resolveProvider } = require('../providers/resolve-provider');

const QUEUE_PROVIDERS = {
    QSTASH: 'qstash',
};

// Map legacy QUEUE_PROVIDER values to Frigg provider names
const LEGACY_PROVIDER_MAP = {
    sqs: 'aws',
    'netlify-background': 'netlify',
};

/**
 * Determine the queue provider from config hierarchy
 *
 * @param {Object} [options]
 * @param {string} [options.provider] - Explicit provider override
 * @param {Object} [options.appDefinition] - Frigg app definition object
 * @returns {string|undefined} Provider name, or undefined for auto-detect
 */
function determineProvider(options = {}) {
    if (options.provider) {
        return options.provider;
    }

    if (options.appDefinition?.queue?.provider) {
        return options.appDefinition.queue.provider;
    }

    if (process.env.QUEUE_PROVIDER) {
        return process.env.QUEUE_PROVIDER;
    }

    return undefined; // Let resolveProvider() pick the default
}

/**
 * Create a queue provider instance
 *
 * @param {Object} [options]
 * @param {string} [options.provider] - Queue provider name
 * @param {Object} [options.appDefinition] - Frigg app definition (reads queue.provider)
 * @param {Object} [options.providerOptions] - Options passed to the provider constructor
 * @returns {QueueProvider} Implementation of queue provider interface
 */
function createQueueProvider(options = {}) {
    const explicit = determineProvider(options);
    const providerOptions = options.providerOptions || {};

    // QStash is a third-party queue not tied to any platform provider
    if (explicit === QUEUE_PROVIDERS.QSTASH) {
        const { QStashQueueProvider } = require('./providers/qstash-queue-provider');
        return new QStashQueueProvider(providerOptions);
    }

    // Use the resolved provider's queue adapter.
    // Legacy QUEUE_PROVIDER values (sqs, netlify-background) are mapped
    // to provider names for backward compatibility.
    const providerName = LEGACY_PROVIDER_MAP[explicit] || explicit;
    const providerOverride = providerName ? { provider: providerName } : {};
    const provider = resolveProvider(null, providerOverride);

    const QueueProviderClass = provider.QueueProvider;
    if (!QueueProviderClass) {
        throw new Error(
            `Provider '${provider.name}' does not export a QueueProvider`
        );
    }
    return new QueueProviderClass(providerOptions);
}

module.exports = {
    createQueueProvider,
    determineProvider,
    QUEUE_PROVIDERS,
};
