const { v4: uuid } = require('uuid');
const { SQSClient, SendMessageCommand, SendMessageBatchCommand } = require('@aws-sdk/client-sqs');

const awsConfigOptions = () => {
    const config = {};
    if (process.env.IS_OFFLINE) {
        config.credentials = {
            accessKeyId: 'test-aws-key',
            secretAccessKey: 'test-aws-secret',
        };
        config.region = 'us-east-1';
    }
    if (process.env.AWS_ENDPOINT) {
        config.endpoint = process.env.AWS_ENDPOINT;
    }
    return config;
};

const sqs = new SQSClient(awsConfigOptions());

// Inspect SendMessageBatchResult for partial failures and log them.
// AWS SendMessageBatch can succeed at the HTTP level while individual entries
// are rejected (KMS errors, per-entry throttling, service errors). Callers that
// don't inspect result.Failed silently lose those messages. This logs the
// details so the loss is visible in CloudWatch.
const inspectBatchResult = (result, queueUrl, bufferSize) => {
    const failedCount = result?.Failed?.length ?? 0;
    const successCount = result?.Successful?.length ?? 0;

    if (failedCount > 0) {
        console.error(
            `[QueuerUtil] SendMessageBatch partial failure: ${failedCount}/${bufferSize} failed`,
            {
                queueUrl,
                bufferSize,
                successCount,
                failedCount,
                failed: result.Failed.map((f) => ({
                    Id: f.Id,
                    Code: f.Code,
                    SenderFault: f.SenderFault,
                    Message: f.Message,
                })),
            }
        );
    } else if (successCount > 0) {
        console.log(
            `[QueuerUtil] SendMessageBatch ok: ${successCount}/${bufferSize} to ${queueUrl}`
        );
    }

    return result;
};

const QueuerUtil = {
    send: async (message, queueUrl) => {
        const command = new SendMessageCommand({
            MessageBody: JSON.stringify(message),
            QueueUrl: queueUrl,
        });
        const result = await sqs.send(command);
        console.log(
            `[QueuerUtil] SendMessage ok: MessageId=${result?.MessageId} to ${queueUrl}`
        );
        return result;
    },

    batchSend: async (entries = [], queueUrl) => {
        const buffer = [];
        const batchSize = 10;

        for (const entry of entries) {
            buffer.push({
                Id: uuid(),
                MessageBody: JSON.stringify(entry),
            });
            // Sends 10, then purges the buffer
            if (buffer.length === batchSize) {
                const command = new SendMessageBatchCommand({
                    Entries: buffer,
                    QueueUrl: queueUrl,
                });
                const result = await sqs.send(command);
                inspectBatchResult(result, queueUrl, buffer.length);
                // Purge the buffer
                buffer.splice(0, buffer.length);
            }
        }

        // If any remaining entries under 10 are left in the buffer, send and return
        if (buffer.length > 0) {
            const command = new SendMessageBatchCommand({
                Entries: buffer,
                QueueUrl: queueUrl,
            });
            const result = await sqs.send(command);
            return inspectBatchResult(result, queueUrl, buffer.length);
        }

        // If we're exact... just return an empty object for now

        return {};
    },
};

module.exports = { QueuerUtil };
