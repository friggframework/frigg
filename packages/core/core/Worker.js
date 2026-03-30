const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require('@aws-sdk/client-sqs');
const _ = require('lodash');
const { RequiredPropertyError } = require('../errors');
const { get } = require('../assertions');

const sqs = new SQSClient({ region: process.env.AWS_REGION });

class Worker {
    async getQueueURL(params) {
        // Passing params in because there will be multiple QueueNames
        // let params = {
        //     QueueName:  process.env.QueueName
        // };
        const command = new GetQueueUrlCommand(params);
        const data = await sqs.send(command);
        return data.QueueUrl;
    }

    async run(params, context = {}) {
        const records = get(params, 'Records');
        const batchItemFailures = [];

        for (const record of records) {
            try {
                const runParams = JSON.parse(record.body);
                this._validateParams(runParams);
                await this._run(runParams, context);
            } catch (error) {
                if (error.isHaltError) {
                    // HaltError means "discard this message, don't retry".
                    // Treat as success so SQS deletes it from the queue.
                    continue;
                }
                console.error(`[Worker] Failed to process record ${record.messageId}:`, error);
                batchItemFailures.push({ itemIdentifier: record.messageId });
            }
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
        const command = new SendMessageCommand(params);
        const data = await sqs.send(command);
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
