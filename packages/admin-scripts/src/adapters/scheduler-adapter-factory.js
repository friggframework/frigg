const { AWSSchedulerAdapter } = require('./aws-scheduler-adapter');
const { LocalSchedulerAdapter } = require('./local-scheduler-adapter');

/**
 * Scheduler Adapter Factory
 *
 * Application Layer - Hexagonal Architecture
 *
 * Creates the appropriate scheduler adapter based on configuration.
 * Supports environment-based auto-detection and explicit configuration.
 */

/**
 * Create a scheduler adapter instance
 *
 * @param {Object} options - Configuration options
 * @param {string} [options.type] - Adapter type ('aws', 'eventbridge', 'local')
 * @param {string} [options.region] - AWS region (for AWS adapter)
 * @param {Object} [options.credentials] - AWS credentials (for AWS adapter)
 * @param {string} [options.targetLambdaArn] - Lambda ARN to invoke (for AWS adapter)
 * @param {string} [options.scheduleGroupName] - EventBridge schedule group name (for AWS adapter)
 * @returns {SchedulerAdapter} Configured scheduler adapter
 */
function createSchedulerAdapter(options = {}) {
    const adapterType = options.type || detectSchedulerAdapterType();

    switch (adapterType.toLowerCase()) {
        case 'aws':
        case 'eventbridge':
            return new AWSSchedulerAdapter({
                region: options.region,
                credentials: options.credentials,
                targetLambdaArn: options.targetLambdaArn,
                scheduleGroupName: options.scheduleGroupName,
            });

        case 'local':
        default:
            return new LocalSchedulerAdapter();
    }
}

/**
 * Determine the appropriate scheduler adapter type based on environment
 *
 * @returns {string} Adapter type ('aws' or 'local')
 */
function detectSchedulerAdapterType() {
    // If explicitly set, use that
    if (process.env.SCHEDULER_ADAPTER) {
        return process.env.SCHEDULER_ADAPTER;
    }

    // Auto-detect based on environment
    const stage = process.env.STAGE || process.env.NODE_ENV || 'local';

    // Use AWS adapter in production/staging environments
    if (['production', 'prod', 'staging', 'stage'].includes(stage.toLowerCase())) {
        return 'aws';
    }

    // Use local adapter for dev/test/local
    return 'local';
}

module.exports = {
    createSchedulerAdapter,
    detectSchedulerAdapterType,
};
