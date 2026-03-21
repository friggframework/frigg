/**
 * SQS Queue Client (Adapter)
 *
 * AWS SQS implementation of QueueClientInterface.
 * Used by Worker and QueuerUtil for queue message operations.
 *
 * Supports offline/local development via IS_OFFLINE and AWS_ENDPOINT env vars.
 */

const {
    QueueClientInterface,
} = require('@friggframework/core/queues/queue-client-interface');

let _sqsModule = null;
let _sqs = null;

function getSqsModule() {
    if (!_sqsModule) {
        _sqsModule = require('@aws-sdk/client-sqs');
    }
    return _sqsModule;
}

function getSqs() {
    if (!_sqs) {
        const { SQSClient } = getSqsModule();
        const config = {};

        if (process.env.IS_OFFLINE) {
            config.credentials = {
                accessKeyId: 'test-aws-key',
                secretAccessKey: 'test-aws-secret',
            };
            config.region = 'us-east-1';
        }

        if (!config.region) {
            config.region = process.env.AWS_REGION;
        }

        if (process.env.AWS_ENDPOINT) {
            config.endpoint = process.env.AWS_ENDPOINT;
        }

        _sqs = new SQSClient(config);
    }
    return _sqs;
}

class SqsQueueClient extends QueueClientInterface {
    /**
     * Send a message via SQS SendMessageCommand
     *
     * @param {Object} params - SQS SendMessageCommand input
     * @param {string} params.QueueUrl
     * @param {string} params.MessageBody
     * @param {number} [params.DelaySeconds]
     * @returns {Promise<{MessageId: string}>}
     */
    async sendMessage(params) {
        const { SendMessageCommand } = getSqsModule();
        const command = new SendMessageCommand(params);
        return getSqs().send(command);
    }

    /**
     * Send a batch of messages via SQS SendMessageBatchCommand
     *
     * @param {Object} params - SQS SendMessageBatchCommand input
     * @param {string} params.QueueUrl
     * @param {Array<{Id: string, MessageBody: string}>} params.Entries
     * @returns {Promise<Object>}
     */
    async sendMessageBatch(params) {
        const { SendMessageBatchCommand } = getSqsModule();
        const command = new SendMessageBatchCommand(params);
        return getSqs().send(command);
    }

    /**
     * Resolve a queue name to URL via SQS GetQueueUrlCommand
     *
     * @param {Object} params
     * @param {string} params.QueueName
     * @returns {Promise<string>} Queue URL
     */
    async getQueueUrl(params) {
        const { GetQueueUrlCommand } = getSqsModule();
        const command = new GetQueueUrlCommand(params);
        const data = await getSqs().send(command);
        return data.QueueUrl;
    }
}

module.exports = { SqsQueueClient };
