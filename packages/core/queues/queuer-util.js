const { v4: uuid } = require('uuid');

// AWS SQS SDK is lazy-loaded to avoid pulling in @aws-sdk/client-sqs
// on non-AWS platforms. The singleton client is created on first use.
let _sqsModule = null;
let _sqs = null;

function getSqsModule() {
    if (!_sqsModule) {
        _sqsModule = require('@aws-sdk/client-sqs');
    }
    return _sqsModule;
}

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

function getSqs() {
    if (!_sqs) {
        const { SQSClient } = getSqsModule();
        _sqs = new SQSClient(awsConfigOptions());
    }
    return _sqs;
}

const QueuerUtil = {
    send: async (message, queueUrl) => {
        const { SendMessageCommand } = getSqsModule();
        const command = new SendMessageCommand({
            MessageBody: JSON.stringify(message),
            QueueUrl: queueUrl,
        });
        return getSqs().send(command);
    },

    batchSend: async (entries = [], queueUrl) => {
        const { SendMessageBatchCommand } = getSqsModule();
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
                await getSqs().send(command);
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
            return getSqs().send(command);
        }

        // If we're exact... just return an empty object for now

        return {};
    },
};

module.exports = { QueuerUtil };
