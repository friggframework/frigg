/**
 * Queue Provider Factory
 *
 * Creates queue provider instances based on appDefinition or environment configuration.
 *
 * Priority order for determining provider:
 * 1. Explicit `provider` option passed to factory
 * 2. `appDefinition.queue.provider` property
 * 3. `QUEUE_PROVIDER` environment variable
 * 4. Default: 'sqs' (backward-compatible with existing AWS deployments)
 *
 * Supported providers:
 * - 'sqs' → AWS SQS (default, existing behavior)
 * - 'netlify-background' → Netlify Background Functions
 * - 'qstash' → Upstash QStash (platform-agnostic)
 */
const { SqsQueueProvider } = require('./providers/sqs-queue-provider');
const {
    NetlifyBackgroundProvider,
} = require('./providers/netlify-background-provider');
const { QStashQueueProvider } = require('./providers/qstash-queue-provider');

const QUEUE_PROVIDERS = {
    SQS: 'sqs',
    NETLIFY_BACKGROUND: 'netlify-background',
    QSTASH: 'qstash',
};

/**
 * Determine the queue provider based on config hierarchy
 *
 * @param {Object} [options]
 * @param {string} [options.provider] - Explicit provider override
 * @param {Object} [options.appDefinition] - Frigg app definition object
 * @returns {string} Provider name
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

    return QUEUE_PROVIDERS.SQS;
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
    const provider = determineProvider(options);
    const providerOptions = options.providerOptions || {};

    switch (provider) {
        case QUEUE_PROVIDERS.SQS:
            return new SqsQueueProvider(providerOptions);
        case QUEUE_PROVIDERS.NETLIFY_BACKGROUND:
            return new NetlifyBackgroundProvider(providerOptions);
        case QUEUE_PROVIDERS.QSTASH:
            return new QStashQueueProvider(providerOptions);
        default:
            throw new Error(
                `Unknown queue provider: '${provider}'. Supported: ${Object.values(QUEUE_PROVIDERS).join(', ')}`
            );
    }
}

module.exports = {
    createQueueProvider,
    determineProvider,
    QUEUE_PROVIDERS,
};
