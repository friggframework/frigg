const AWS = require('aws-sdk');
const _ = require('lodash');
const { RequiredPropertyError } = require('../errors');
const { get } = require('../assertions');

AWS.config.update({ region: process.env.AWS_REGION });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

class Worker {
    async getQueueURL(params) {
        // Passing params in because there will be multiple QueueNames
        // let params = {
        //     QueueName:  process.env.QueueName
        // };
        return new Promise((resolve, reject) => {
            sqs.getQueueUrl(params, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data.QueueUrl);
                }
            });
        });
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
        return new Promise((resolve, reject) => {
            sqs.sendMessage(params, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data.MessageId);
                }
            });
        });
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
