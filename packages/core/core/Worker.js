const _ = require('lodash');
const { RequiredPropertyError } = require('../errors');
const { get } = require('../assertions');

/**
 * Worker - Queue message producer/consumer base class.
 *
 * Subclass and override _run() to implement your worker logic.
 * The queue transport (SQS, Netlify, etc.) is abstracted behind
 * QueueClientInterface, injected via constructor options.
 *
 * BREAKING CHANGE (v3): A queueClient must be explicitly provided.
 * For AWS/SQS, pass `new SqsQueueClient()` from @friggframework/provider-aws.
 * See docs/architecture-decisions/010-decouple-aws-from-core.md for migration guide.
 */
class Worker {
    constructor(options = {}) {
        this._queueClient = options.queueClient || null;
    }

    /**
     * Get the queue client. Throws if none was injected.
     * @returns {QueueClientInterface}
     */
    _getQueueClient() {
        if (!this._queueClient) {
            throw new Error(
                'Worker requires a queueClient. Pass one via constructor options, e.g.:\n' +
                '  const { SqsQueueClient } = require("@friggframework/provider-aws");\n' +
                '  new MyWorker({ queueClient: new SqsQueueClient() })\n' +
                'See docs/architecture-decisions/010-decouple-aws-from-core.md for migration guide.'
            );
        }
        return this._queueClient;
    }

    async getQueueURL(params) {
        return this._getQueueClient().getQueueUrl(params);
    }

    async run(params, context = {}) {
        const records = get(params, 'Records');

        for (const record of records) {
            const runParams = JSON.parse(record.body);
            this._validateParams(runParams);
            await this._run(runParams, context);
        }
    }

    async _run(params, context = {}) {
        // validate params and instantiate any class to do work based on the
        // parameters
    }

    // returns the message id
    async send(params, delay = 0) {
        this._validateParams(params);

        const queueURL = params.QueueUrl;

        const messageParams = _.omit(params, 'QueueUrl');
        const args = {
            DelaySeconds: delay,
            MessageBody: JSON.stringify(messageParams),
            QueueUrl: queueURL,
        };
        return this.sendAsyncSQSMessage(args);
    }

    async sendAsyncSQSMessage(params) {
        const data = await this._getQueueClient().sendMessage(params);
        return data.MessageId;
    }

    // Throw an exception if the params do not validate
    _validateParams(params) {}

    _verifyParamExists(params, param) {
        if (!(param in params)) {
            throw new RequiredPropertyError({
                parent: this,
                key: param,
            });
        }
    }

    // async deleteSQSMessage(id){

    // }
}

module.exports = { Worker };
