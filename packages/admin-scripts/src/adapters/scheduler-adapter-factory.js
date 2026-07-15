const Boom = require('@hapi/boom');
const { AWSSchedulerAdapter } = require('./aws-scheduler-adapter');
const { LocalSchedulerAdapter } = require('./local-scheduler-adapter');

/**
 * Scheduler Adapter Factory
 *
 * Infrastructure Layer - Hexagonal Architecture
 *
 * `createSchedulerAdapter` builds an adapter from an explicit `type` (no env
 * reads). `createSchedulerAdapterFromEnv` resolves the type from the runtime
 * environment and enforces that a deployed Lambda never silently falls back to
 * the in-memory local adapter.
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
                namePrefix: options.namePrefix,
                buildInput: options.buildInput,
            });

        case 'local':
            return new LocalSchedulerAdapter();

        default:
            throw new Error(`Unknown scheduler adapter type: ${options.type}`);
    }
}

/**
 * Resolve and build the scheduler adapter from the runtime environment.
 *
 * The local adapter is in-memory only (schedules vanish on cold start), so it
 * must never be the silent default in a deployed Lambda: require an explicit
 * SCHEDULER_PROVIDER when running on AWS, and fall back to 'local' only for
 * local dev/tests.
 *
 * @returns {SchedulerAdapter}
 * @throws {Boom.Boom} 503 (serverUnavailable) when SCHEDULER_PROVIDER is unset
 *   in a deployed Lambda.
 */
function createSchedulerAdapterFromEnv() {
    const type =
        process.env.SCHEDULER_PROVIDER ||
        (process.env.AWS_LAMBDA_FUNCTION_NAME ? null : 'local');
    if (!type) {
        throw Boom.serverUnavailable(
            'SCHEDULER_PROVIDER is not configured. Set it (e.g. "aws") via appDefinition.admin.enableScheduling.'
        );
    }

    return createSchedulerAdapter({
        type,
        targetLambdaArn: process.env.ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN,
        scheduleGroupName: process.env.ADMIN_SCRIPT_SCHEDULE_GROUP,
        roleArn: process.env.SCHEDULER_ROLE_ARN,
    });
}

/**
 * Resolve and build a scheduler adapter that targets the REPORT executor.
 *
 * Reuses the shared scheduler role and (via {@link createSchedulerAdapter}) the
 * same provider resolution as {@link createSchedulerAdapterFromEnv}, but points
 * the schedule at the report executor Lambda and produces a report-shaped target
 * message ({ reportName, mode, trigger: 'SCHEDULED', params }). A distinct name
 * prefix keeps report schedules from colliding with script schedules in the
 * shared EventBridge group.
 *
 * @param {Object} params
 * @param {string} params.reportName - Registered report name (also the ScriptSchedule key).
 * @param {string} params.mode - Run mode for the scheduled invocation (e.g. 'snapshot').
 * @returns {SchedulerAdapter}
 * @throws {Boom.Boom} 503 when SCHEDULER_PROVIDER is unset in a deployed Lambda.
 */
function createReportSchedulerAdapterFromEnv({ reportName, mode }) {
    const type =
        process.env.SCHEDULER_PROVIDER ||
        (process.env.AWS_LAMBDA_FUNCTION_NAME ? null : 'local');
    if (!type) {
        throw Boom.serverUnavailable(
            'SCHEDULER_PROVIDER is not configured. Set it (e.g. "aws") via appDefinition.admin.enableScheduling.'
        );
    }

    return createSchedulerAdapter({
        type,
        targetLambdaArn: process.env.REPORT_EXECUTOR_LAMBDA_ARN,
        scheduleGroupName: process.env.REPORT_SCHEDULE_GROUP,
        roleArn: process.env.SCHEDULER_ROLE_ARN,
        namePrefix: 'frigg-report-',
        buildInput: ({ input }) => ({
            reportName,
            mode,
            trigger: 'SCHEDULED',
            params: input || {},
        }),
    });
}

module.exports = {
    createSchedulerAdapter,
    createSchedulerAdapterFromEnv,
    createReportSchedulerAdapterFromEnv,
};
