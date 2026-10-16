/**
 * Queue Provider Factory
 *
 * Creates a QueueProvider (send / batchSend / parseEvent) for the active
 * platform. From friggframework/frigg#545, adapted: #545 resolved every
 * provider through resolveProvider(), so an AWS app had to install
 * @friggframework/provider-aws. In this stack the AWS SDK is a core
 * dependency, so the built-in queues are created here and only an unknown
 * name goes through the provider plugin system.
 *
 * Priority order for determining the provider:
 * 1. Explicit `provider` option
 * 2. `appDefinition.queue.provider`
 * 3. `QUEUE_PROVIDER` environment variable
 * 4. Default: SQS
 *
 * Built-in names:
 * - 'sqs' | 'aws'                     -> SqsQueueProvider
 * - 'netlify-background' | 'netlify'  -> NetlifyBackgroundProvider
 * - 'qstash'                          -> QStashQueueProvider
 * Any other name -> require('@friggframework/provider-<name>').QueueProvider
 */

const QUEUE_PROVIDERS = {
    SQS: 'sqs',
    NETLIFY_BACKGROUND: 'netlify-background',
    QSTASH: 'qstash',
};

// Platform provider names (appDefinition.provider) that map to a built-in queue.
const PLATFORM_ALIASES = {
    aws: QUEUE_PROVIDERS.SQS,
    netlify: QUEUE_PROVIDERS.NETLIFY_BACKGROUND,
};

/**
 * Determine the queue provider from the config hierarchy.
 *
 * @param {Object} [options]
 * @param {string} [options.provider]
 * @param {Object} [options.appDefinition]
 * @returns {string|undefined}
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
    return undefined;
}

/**
 * Create a queue provider instance.
 *
 * @param {Object} [options]
 * @param {string} [options.provider] - Queue provider name
 * @param {Object} [options.appDefinition] - reads `queue.provider`
 * @param {Object} [options.providerOptions] - passed to the provider constructor
 * @returns {import('./queue-provider').QueueProvider}
 */
function createQueueProvider(options = {}) {
    const explicit = determineProvider(options);
    const name = PLATFORM_ALIASES[explicit] || explicit || QUEUE_PROVIDERS.SQS;
    const providerOptions = options.providerOptions || {};

    switch (name) {
        case QUEUE_PROVIDERS.SQS: {
            const { SqsQueueProvider } = require('./providers/sqs-queue-provider');
            return new SqsQueueProvider(providerOptions);
        }
        case QUEUE_PROVIDERS.NETLIFY_BACKGROUND: {
            const {
                NetlifyBackgroundProvider,
            } = require('./providers/netlify-background-provider');
            return new NetlifyBackgroundProvider(providerOptions);
        }
        case QUEUE_PROVIDERS.QSTASH: {
            const { QStashQueueProvider } = require('./providers/qstash-queue-provider');
            return new QStashQueueProvider(providerOptions);
        }
        default: {
            const { resolveProvider } = require('../providers/resolve-provider');
            const provider = resolveProvider(null, { provider: name });
            if (!provider.QueueProvider) {
                throw new Error(`Provider '${provider.name || name}' does not export a QueueProvider`);
            }
            return new provider.QueueProvider(providerOptions);
        }
    }
}

module.exports = {
    createQueueProvider,
    determineProvider,
    QUEUE_PROVIDERS,
};
