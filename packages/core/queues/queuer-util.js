const { v4: uuid } = require('uuid');
const { SQSClient, SendMessageCommand, SendMessageBatchCommand } = require('@aws-sdk/client-sqs');

const awsConfigOptions = () => {
    const config = {};
    if (process.env.IS_OFFLINE) {
        console.log('Running in offline mode');
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

const QueuerUtil = {
    send: async (message, queueUrl) => {
        console.log(`Enqueuing message to SQS queue ${queueUrl}`);
        const command = new SendMessageCommand({
            MessageBody: JSON.stringify(message),
            QueueUrl: queueUrl,
        });
        return sqs.send(command);
    },

    batchSend: async (entries = [], queueUrl) => {
        console.log(
            `Enqueuing ${entries.length} entries on SQS to queue ${queueUrl}`
        );
        const buffer = [];
        const batchSize = 10;

        for (const entry of entries) {
            buffer.push({
                Id: uuid(),
                MessageBody: JSON.stringify(entry),
            });
            // Sends 10, then purges the buffer
            if (buffer.length === batchSize) {
                console.log('Buffer at 10, sending batch');
                const command = new SendMessageBatchCommand({
                    Entries: buffer,
                    QueueUrl: queueUrl,
                });
                await sqs.send(command);
                // Purge the buffer
                buffer.splice(0, buffer.length);
            }
        }
        console.log('Buffer at end, sending final batch');

        // If any remaining entries under 10 are left in the buffer, send and return
        if (buffer.length > 0) {
            console.log(buffer);
            const command = new SendMessageBatchCommand({
                Entries: buffer,
                QueueUrl: queueUrl,
            });
            return sqs.send(command);
        }

        // If we're exact... just return an empty object for now

        return {};
    },
};

module.exports = { QueuerUtil };
