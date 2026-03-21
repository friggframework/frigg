/**
 * @friggframework/provider-aws
 *
 * AWS provider plugin for the Frigg Framework.
 *
 * Conforms to the provider plugin interface (same shape as provider-netlify).
 * Core resolves this package via `resolveProvider()` and accesses standard
 * interface names (QueueProvider, SchedulerAdapter, etc.).
 *
 * Usage via provider system (preferred):
 *   const provider = resolveProvider(); // returns this module when provider=aws
 *   new provider.QueueProvider(options);
 *   new provider.SchedulerAdapter(options);
 *
 * Direct usage (still supported):
 *   const { SqsQueueProvider } = require('@friggframework/provider-aws');
 */

// Lazy getters — each adapter is only loaded when accessed, avoiding
// pulling in all AWS SDK clients at once.

// Singleton for invokeFunctionAdapter (pre-instantiated, matching Netlify's shape)
let _invoker;

module.exports = {
    name: 'aws',

    // ═══════════════════════════════════════════════════════════════════
    // Standard Provider Plugin Interface
    // (same property names as @friggframework/provider-netlify)
    // ═══════════════════════════════════════════════════════════════════

    /** @type {typeof SqsQueueProvider} */
    get QueueProvider() {
        return require('./queues/sqs-queue-provider').SqsQueueProvider;
    },
    /** @type {typeof EventBridgeSchedulerAdapter} */
    get SchedulerAdapter() {
        return require('./scheduler/eventbridge-scheduler-adapter')
            .EventBridgeSchedulerAdapter;
    },
    /** @type {typeof KmsEncryptionKeyProvider} */
    get CryptorAdapter() {
        return require('./encryption/kms-encryption-key-provider')
            .KmsEncryptionKeyProvider;
    },
    /** @type {typeof ApiGatewayMessageSender} */
    get WebSocketAdapter() {
        return require('./websocket/api-gateway-message-sender')
            .ApiGatewayMessageSender;
    },
    /** Pre-instantiated function invoker: { invoke(name, payload) } */
    get invokeFunctionAdapter() {
        if (!_invoker) {
            const { LambdaInvoker } = require('./lambda/lambda-invoker');
            _invoker = new LambdaInvoker();
        }
        return _invoker;
    },
    get loadSecrets() {
        return require('@friggframework/core/core/secrets-to-env').secretsToEnv;
    },

    // ── Health Checks ─────────────────────────────────────────────────
    get checkKmsDecryptCapability() {
        return require('./health/kms-health-check').checkKmsDecryptCapability;
    },
    get detectVpcConfiguration() {
        return require('./health/kms-health-check').detectVpcConfiguration;
    },

    // ═══════════════════════════════════════════════════════════════════
    // AWS-Specific Exports (backward compatibility)
    // ═══════════════════════════════════════════════════════════════════

    // ── Scheduler ────────────────────────────────────────────────────
    get EventBridgeSchedulerAdapter() {
        return require('./scheduler/eventbridge-scheduler-adapter')
            .EventBridgeSchedulerAdapter;
    },

    // ── Queues ───────────────────────────────────────────────────────
    get SqsQueueProvider() {
        return require('./queues/sqs-queue-provider').SqsQueueProvider;
    },
    get SqsQueueClient() {
        return require('./queues/sqs-queue-client').SqsQueueClient;
    },

    // ── Encryption ────────────────────────────────────────────────────
    get KmsEncryptionKeyProvider() {
        return require('./encryption/kms-encryption-key-provider')
            .KmsEncryptionKeyProvider;
    },

    // ── WebSocket ─────────────────────────────────────────────────────
    get ApiGatewayMessageSender() {
        return require('./websocket/api-gateway-message-sender')
            .ApiGatewayMessageSender;
    },

    // ── Lambda ───────────────────────────────────────────────────────
    get LambdaInvoker() {
        return require('./lambda/lambda-invoker').LambdaInvoker;
    },
    get LambdaInvocationError() {
        return require('./lambda/lambda-invoker').LambdaInvocationError;
    },

    // ── Storage ──────────────────────────────────────────────────────
    get MigrationStatusRepositoryS3() {
        return require('./storage/migration-status-repository-s3')
            .MigrationStatusRepositoryS3;
    },
};
