/**
 * @friggframework/provider-aws
 *
 * AWS provider adapters for the Frigg Framework.
 *
 * Contains all AWS SDK-dependent adapters extracted from @friggframework/core
 * so that core remains provider-agnostic and doesn't pull in heavy AWS SDKs
 * on non-AWS platforms (e.g., Netlify).
 *
 * Usage:
 *   const { SqsQueueProvider } = require('@friggframework/provider-aws');
 *   const { EventBridgeSchedulerAdapter } = require('@friggframework/provider-aws');
 */

// Lazy getters — each adapter is only loaded when accessed, avoiding
// pulling in all AWS SDK clients at once.

module.exports = {
    name: 'aws',

    // ── Scheduler ────────────────────────────────────────────────────
    get EventBridgeSchedulerAdapter() {
        return require('./scheduler/eventbridge-scheduler-adapter')
            .EventBridgeSchedulerAdapter;
    },

    // ── Queues ───────────────────────────────────────────────────────
    get SqsQueueProvider() {
        return require('./queues/sqs-queue-provider').SqsQueueProvider;
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
