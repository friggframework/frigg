/**
 * SQS Queue Provider (Adapter)
 *
 * AWS SQS implementation of the QueueProvider interface.
 * Extracted from the original queuer-util.js to support multi-provider architecture.
 */
const { v4: uuid } = require('uuid');
const {
    SQSClient,
    SendMessageCommand,
    SendMessageBatchCommand,
} = require('@aws-sdk/client-sqs');
const { QueueProvider } = require('@friggframework/core/queues/queue-provider');

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

class SqsQueueProvider extends QueueProvider {
    constructor() {
        super();
        this.sqs = new SQSClient(awsConfigOptions());
    }

    async send(message, queueUrl) {
        const command = new SendMessageCommand({
            MessageBody: JSON.stringify(message),
            QueueUrl: queueUrl,
        });
        return this.sqs.send(command);
    }

    async batchSend(entries = [], queueUrl) {
        const buffer = [];
        const batchSize = 10;

        for (const entry of entries) {
            buffer.push({
                Id: uuid(),
                MessageBody: JSON.stringify(entry),
            });

            if (buffer.length === batchSize) {
                const command = new SendMessageBatchCommand({
                    Entries: buffer,
                    QueueUrl: queueUrl,
                });
                await this.sqs.send(command);
                buffer.splice(0, buffer.length);
            }
        }

        if (buffer.length > 0) {
            const command = new SendMessageBatchCommand({
                Entries: buffer,
                QueueUrl: queueUrl,
            });
            return this.sqs.send(command);
        }

        return {};
    }

    /**
     * Parse SQS event format: event.Records[].body (JSON string)
     */
    parseEvent(event) {
        const records = event?.Records || [];
        return records.map((record) => JSON.parse(record.body));
    }
}

module.exports = { SqsQueueProvider };
