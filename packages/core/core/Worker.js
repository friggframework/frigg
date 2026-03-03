const _ = require('lodash');
const { RequiredPropertyError } = require('../errors');
const { get } = require('../assertions');

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

function getSqs() {
    if (!_sqs) {
        const { SQSClient } = getSqsModule();
        _sqs = new SQSClient({ region: process.env.AWS_REGION });
    }
    return _sqs;
}

class Worker {
    async getQueueURL(params) {
        // Passing params in because there will be multiple QueueNames
        // let params = {
        //     QueueName:  process.env.QueueName
        // };
        const { GetQueueUrlCommand } = getSqsModule();
        const command = new GetQueueUrlCommand(params);
        const data = await getSqs().send(command);
        return data.QueueUrl;
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
        const { SendMessageCommand } = getSqsModule();
        const command = new SendMessageCommand(params);
        const data = await getSqs().send(command);
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
