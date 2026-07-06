const { AWSSchedulerAdapter } = require('./aws-scheduler-adapter');
const { LocalSchedulerAdapter } = require('./local-scheduler-adapter');

/**
 * Scheduler Adapter Factory
 *
 * Application Layer - Hexagonal Architecture
 *
 * Creates the appropriate scheduler adapter based on explicit configuration
 * from appDefinition. Does not auto-detect or read environment variables.
 */

/**
 * Create a scheduler adapter instance
 *
 * @param {Object} options - Configuration options (from appDefinition.adminScripts.scheduler)
 * @param {string} options.type - Adapter type ('aws', 'eventbridge', 'local') - required
 * @param {Object} [options.credentials] - AWS credentials (for AWS adapter)
 * @param {string} [options.targetLambdaArn] - Lambda ARN to invoke (required for AWS adapter)
 * @param {string} [options.scheduleGroupName] - EventBridge schedule group name (required for AWS adapter)
 * @param {string} [options.roleArn] - IAM role ARN for scheduler (required for AWS adapter)
 * @returns {SchedulerAdapter} Configured scheduler adapter
 */
function createSchedulerAdapter(options = {}) {
    if (!options.type) {
        throw new Error(
            'Scheduler adapter type is required. Configure in appDefinition.adminScripts.scheduler.type'
        );
    }

    switch (options.type.toLowerCase()) {
        case 'aws':
        case 'eventbridge':
            return new AWSSchedulerAdapter({
                credentials: options.credentials,
                targetLambdaArn: options.targetLambdaArn,
                scheduleGroupName: options.scheduleGroupName,
                roleArn: options.roleArn,
            });

        case 'local':
            return new LocalSchedulerAdapter();

        default:
            throw new Error(`Unknown scheduler adapter type: ${options.type}`);
    }
}

module.exports = {
    createSchedulerAdapter,
};
