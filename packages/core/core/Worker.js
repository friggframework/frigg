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

        console.log(
            `[Worker] run: processing ${records.length} record(s)`
        );

        for (const record of records) {
            // Log record entry with SQS-provided attributes useful for tracing
            // delivery history (ApproximateReceiveCount for retries, etc.).
            let parsedEvent;
            try {
                parsedEvent = JSON.parse(record.body)?.event;
            } catch {
                parsedEvent = undefined;
            }
            console.log(`[Worker] record begin`, {
                messageId: record.messageId,
                event: parsedEvent,
                receiveCount: record.attributes?.ApproximateReceiveCount,
            });

            try {
                const runParams = JSON.parse(record.body);
                this._validateParams(runParams);
                await this._run(runParams, context);
                console.log(`[Worker] record success`, {
                    messageId: record.messageId,
                    event: runParams?.event,
                });
            } catch (error) {
                if (error.isHaltError) {
                    // HaltError means "discard this message, don't retry".
                    // Treat as success so SQS deletes it from the queue.
                    // Logged explicitly — silent discards made prod debugging
                    // extremely hard; keep this visible.
                    console.warn(`[Worker] record halted (discarded, no retry)`, {
                        messageId: record.messageId,
                        event: parsedEvent,
                        reason: error.message,
                        statusCode: error.statusCode,
                    });
                    continue;
                }
                console.error(`[Worker] Failed to process record ${record.messageId}:`, error);
                batchItemFailures.push({ itemIdentifier: record.messageId });
            }
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
