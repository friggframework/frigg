/**
 * SQS Queue Client (Adapter)
 *
 * AWS SQS implementation of QueueClientInterface, used by Worker.
 *
 * In friggframework/frigg#545 this adapter moved to
 * @friggframework/provider-aws and Worker required it to be injected. In
 * this stack the AWS SDK stays a core dependency, so the adapter lives here,
 * Worker defaults to it, and provider-aws re-exports it. The SDK is
 * required on first use, not at module load.
 */
const { QueueClientInterface } = require('./queue-client-interface');

let sqsModule = null;
function getSqsModule() {
    if (!sqsModule) {
        sqsModule = require('@aws-sdk/client-sqs');
    }
    return sqsModule;
}

/**
 * Client config #545's adapter used: IS_OFFLINE credentials, AWS_REGION and
 * AWS_ENDPOINT.
 */
function defaultSqsClientConfig() {
    const config = {};
    if (process.env.IS_OFFLINE) {
        config.credentials = {
            accessKeyId: 'test-aws-key',
            secretAccessKey: 'test-aws-secret',
        };
        config.region = 'us-east-1';
    }
    if (!config.region && process.env.AWS_REGION) {
        config.region = process.env.AWS_REGION;
    }
    if (process.env.AWS_ENDPOINT) {
        config.endpoint = process.env.AWS_ENDPOINT;
    }
    return config;
}

class SqsQueueClient extends QueueClientInterface {
    /**
     * @param {Object} [options]
     * @param {Object} [options.clientConfig] - SQSClient config; defaults to
     *   defaultSqsClientConfig().
     */
    constructor({ clientConfig } = {}) {
        super();
        this._clientConfig = clientConfig;
        this._sqs = null;
    }

    _client() {
        if (!this._sqs) {
            const { SQSClient } = getSqsModule();
            this._sqs = new SQSClient(this._clientConfig || defaultSqsClientConfig());
        }
        return this._sqs;
    }

    async sendMessage(params) {
        const { SendMessageCommand } = getSqsModule();
        return this._client().send(new SendMessageCommand(params));
    }

    async sendMessageBatch(params) {
        const { SendMessageBatchCommand } = getSqsModule();
        return this._client().send(new SendMessageBatchCommand(params));
    }

    async getQueueUrl(params) {
        const { GetQueueUrlCommand } = getSqsModule();
        const data = await this._client().send(new GetQueueUrlCommand(params));
        return data.QueueUrl;
    }
}

module.exports = { SqsQueueClient, defaultSqsClientConfig };
