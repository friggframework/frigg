/**
 * Example Lambda Handler for Process Management Queue
 *
 * This handler processes messages from the process management FIFO queue.
 * Deploy this as a Lambda function with SQS trigger.
 *
 * Configuration Required:
 * - Environment Variables:
 *   - DB_TYPE: 'mongodb' or 'postgresql'
 *   - DATABASE_URL: Connection string for database
 *   - PROCESS_QUEUE_ENABLED: 'true'
 *   - PROCESS_MANAGEMENT_QUEUE_URL: Queue URL
 *
 * - IAM Permissions:
 *   - sqs:ReceiveMessage
 *   - sqs:DeleteMessage
 *   - sqs:GetQueueAttributes
 *
 * - SQS Trigger Configuration:
 *   - Batch size: 1 (process one message at a time)
 *   - Maximum batching window: 0 seconds
 *   - Report batch item failures: Enabled
 *
 * Usage in serverless.yml:
 * ```yaml
 * functions:
 *   processUpdateHandler:
 *     handler: node_modules/@friggframework/core/handlers/process-update-handler-example.handler
 *     events:
 *       - sqs:
 *           arn: !GetAtt ProcessManagementQueue.Arn
 *           batchSize: 1
 *           maximumBatchingWindowInSeconds: 0
 *           functionResponseType: ReportBatchItemFailures
 *     timeout: 30
 *     environment:
 *       DB_TYPE: ${env:DB_TYPE}
 *       DATABASE_URL: ${env:DATABASE_URL}
 *       PROCESS_QUEUE_ENABLED: 'true'
 *       PROCESS_MANAGEMENT_QUEUE_URL: !Ref ProcessManagementQueue
 * ```
 */

const {
    HandleProcessUpdate,
    UpdateProcessState,
    UpdateProcessMetrics,
} = require('../integrations/use-cases');
const {
    createProcessRepository,
} = require('../integrations/repositories/process-repository-factory');

// Initialize dependencies (singleton pattern for Lambda container reuse)
let handleProcessUpdate;

/**
 * Initializes the HandleProcessUpdate use case with dependencies
 * Reuses instances across Lambda invocations for performance
 */
function initializeUseCase() {
    if (!handleProcessUpdate) {
        console.log('Initializing HandleProcessUpdate use case...');

        // Create repository
        const processRepository = createProcessRepository();

        // Create use cases
        const updateProcessState = new UpdateProcessState({ processRepository });
        const updateProcessMetrics = new UpdateProcessMetrics({ processRepository });

        // Create handler
        handleProcessUpdate = new HandleProcessUpdate({
            updateProcessState,
            updateProcessMetrics,
        });

        console.log('HandleProcessUpdate use case initialized');
    }

    return handleProcessUpdate;
}

/**
 * Lambda handler for SQS messages from process management queue
 *
 * @param {Object} event - Lambda event from SQS
 * @param {Array} event.Records - Array of SQS records
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response with batch item failures
 */
exports.handler = async (event, context) => {
    console.log('Process Update Handler invoked', {
        recordCount: event.Records?.length || 0,
        requestId: context.requestId,
    });

    // Initialize use case
    const useCase = initializeUseCase();

    const results = [];
    const batchItemFailures = [];

    // Process each SQS record
    for (const record of event.Records) {
        const messageId = record.messageId;

        try {
            console.log(`Processing message ${messageId}...`);

            // Parse and handle the message
            await useCase.executeFromSQS(record);

            console.log(`Message ${messageId} processed successfully`);
            results.push({
                messageId,
                status: 'success',
            });
        } catch (error) {
            console.error(`Failed to process message ${messageId}:`, {
                error: error.message,
                stack: error.stack,
            });

            results.push({
                messageId,
                status: 'failed',
                error: error.message,
            });

            // Add to batch item failures for SQS retry
            batchItemFailures.push({
                itemIdentifier: messageId,
            });
        }
    }

    // Log summary
    const successCount = results.filter((r) => r.status === 'success').length;
    const failureCount = results.filter((r) => r.status === 'failed').length;

    console.log('Processing complete', {
        total: results.length,
        success: successCount,
        failed: failureCount,
    });

    // Return batch item failures for SQS to retry
    // Successfully processed messages will be deleted from queue
    return {
        batchItemFailures,
    };
};
