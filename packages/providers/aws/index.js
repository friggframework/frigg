/**
 * @friggframework/provider-aws
 *
 * AWS provider plugin for the Frigg Framework, with the provider plugin
 * interface of friggframework/frigg#545 (the same shape as
 * @friggframework/provider-netlify): QueueProvider, SchedulerAdapter,
 * invokeFunctionAdapter, loadSecrets, ...
 *
 * In #545 this package owned the AWS adapters, moved out of core. In this
 * stack the AWS adapters stay in @friggframework/core (the AWS SDK is still a
 * core dependency, and AWS apps keep working without this package), so the
 * plugin re-exports core's implementations rather than carrying copies.
 * Every export is a lazy getter: requiring the plugin loads no AWS SDK.
 *
 * Not provided, because core has no such port: CryptorAdapter (core's
 * Cryptor talks to KMS itself with { shouldUseAws: true }), WebSocketAdapter
 * (the WebSocket repositories call API Gateway directly), the KMS health
 * checks (still inside core's health router).
 */

let invoker;

module.exports = {
    name: 'aws',

    // ── Standard provider plugin interface ───────────────────────────
    get QueueProvider() {
        return require('@friggframework/core/queues/providers/sqs-queue-provider')
            .SqsQueueProvider;
    },
    get SchedulerAdapter() {
        return require('@friggframework/core/infrastructure/scheduler/eventbridge-scheduler-adapter')
            .EventBridgeSchedulerAdapter;
    },
    CryptorAdapter: null,
    WebSocketAdapter: null,
    /** Pre-instantiated function invoker: { invoke(name, payload) } */
    get invokeFunctionAdapter() {
        if (!invoker) {
            const {
                LambdaInvoker,
            } = require('@friggframework/core/database/adapters/lambda-invoker');
            invoker = new LambdaInvoker();
        }
        return invoker;
    },
    get loadSecrets() {
        return require('@friggframework/core/core/secrets-to-env').secretsToEnv;
    },
    // AWS builds and deploys through the serverless pipeline in
    // @friggframework/devtools (createFriggInfrastructure / frigg deploy).
    detect() {
        return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
    },

    // ── AWS-specific exports ─────────────────────────────────────────
    get EventBridgeSchedulerAdapter() {
        return module.exports.SchedulerAdapter;
    },
    get SqsQueueProvider() {
        return module.exports.QueueProvider;
    },
    get SqsQueueClient() {
        return require('@friggframework/core/queues/sqs-queue-client').SqsQueueClient;
    },
    get LambdaInvoker() {
        return require('@friggframework/core/database/adapters/lambda-invoker')
            .LambdaInvoker;
    },
    get LambdaInvocationError() {
        return require('@friggframework/core/database/adapters/lambda-invoker')
            .LambdaInvocationError;
    },
    get MigrationStatusRepositoryS3() {
        return require('@friggframework/core/database/repositories/migration-status-repository-s3')
            .MigrationStatusRepositoryS3;
    },
};
