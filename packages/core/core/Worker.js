const _ = require('lodash');
const { RequiredPropertyError } = require('../errors');
const { get } = require('../assertions');
const { readQueueDelivery } = require('../queues/queue-delivery');
const { runMessageScope } = require('./invocation-scope');
const { getLogger } = require('../logs');

const log = getLogger('frigg.worker');

/**
 * Worker - queue message producer/consumer base class.
 *
 * Subclass and override _run(). The queue transport is behind
 * QueueClientInterface and can be injected (friggframework/frigg#545):
 * `new MyWorker({ queueClient })`. Unlike #545 it is not required: without
 * one the worker uses an SqsQueueClient configured exactly as before
 * (AWS_REGION), created on first use rather than at module load, so
 * requiring core constructs no AWS client and a Netlify/QStash worker that
 * only calls _run() never touches SQS.
 */
class Worker {
    /**
     * @param {Object} [options]
     * @param {import('../queues/queue-client-interface').QueueClientInterface} [options.queueClient]
     */
    constructor(options = {}) {
        this._queueClient = options.queueClient || null;
    }

    _getQueueClient() {
        if (!this._queueClient) {
            const { SqsQueueClient } = require('../queues/sqs-queue-client');
            this._queueClient = new SqsQueueClient({
                clientConfig: { region: process.env.AWS_REGION },
            });
        }
        return this._queueClient;
    }

    async getQueueURL(params) {
        // Passing params in because there will be multiple QueueNames
        // let params = {
        //     QueueName:  process.env.QueueName
        // };
        return this._getQueueClient().getQueueUrl(params);
    }

    async run(params, context = {}) {
        const records = get(params, 'Records');
        const batchItemFailures = [];

        console.log(
            `[Worker] run: processing ${records.length} record(s)`
        );

        for (const record of records) {
            await runMessageScope(record, async () => {
                // messageId, receiveCount and the event come from the scope.
                log.debug('Record started', { eventName: 'frigg.worker.record_started' });

                try {
                    const runParams = JSON.parse(record.body);
                    this._validateParams(runParams);
                    await this._run(runParams, context, readQueueDelivery(record));
                    log.debug('Record succeeded', { eventName: 'frigg.worker.record_succeeded' });
                } catch (error) {
                    if (error.isHaltError) {
                        // HaltError means "discard this message, don't retry".
                        // Treat as success so SQS deletes it from the queue.
                        // Logged explicitly — silent discards made prod debugging
                        // extremely hard; keep this visible.
                        log.error('Record halted (discarded, no retry)', {
                            eventName: 'frigg.worker.record_halted',
                            statusCode: error.statusCode,
                            error,
                        });
                        return;
                    }
                    // The message goes back to SQS, so WARN (ADR-048 §4).
                    log.warn('Record failed, returned for retry', {
                        eventName: 'frigg.worker.record_failed',
                        error,
                    });
                    batchItemFailures.push({ itemIdentifier: record.messageId });
                }
            });
        }

        if (batchItemFailures.length > 0) {
            console.warn(
                `[Worker] run: returning ${batchItemFailures.length} batchItemFailure(s) of ${records.length}`
            );
        }

        return { batchItemFailures };
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
