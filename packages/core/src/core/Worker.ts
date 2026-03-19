import {
    SQSClient,
    GetQueueUrlCommand,
    SendMessageCommand,
} from '@aws-sdk/client-sqs';
import type { GetQueueUrlCommandInput, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import omit from 'lodash/omit';
import { RequiredPropertyError } from '../errors';
import { get } from '../assertions';

const sqs = new SQSClient({ region: process.env.AWS_REGION });

export interface SQSRecord {
    body: string;
    [key: string]: unknown;
}

export interface WorkerRunParams {
    Records: SQSRecord[];
    [key: string]: unknown;
}

export interface WorkerSendParams {
    QueueUrl: string;
    [key: string]: unknown;
}

export class Worker {
    async getQueueURL(params: GetQueueUrlCommandInput): Promise<string | undefined> {
        const command = new GetQueueUrlCommand(params);
        const data = await sqs.send(command);
        return data.QueueUrl;
    }

    async run(params: WorkerRunParams, context: Record<string, unknown> = {}): Promise<void> {
        const records = get(params, 'Records') as SQSRecord[];

        for (const record of records) {
            const runParams = JSON.parse(record.body) as Record<string, unknown>;
            this._validateParams(runParams);
            await this._run(runParams, context);
        }
    }

    async _run(
        params: Record<string, unknown>,
        context: Record<string, unknown> = {}
    ): Promise<void> {
        // validate params and instantiate any class to do work based on the
        // parameters
    }

    async send(params: WorkerSendParams, delay = 0): Promise<string | undefined> {
        this._validateParams(params);

        const queueURL = params.QueueUrl;

        const messageParams = omit(params, 'QueueUrl');
        const args: SendMessageCommandInput = {
            DelaySeconds: delay,
            MessageBody: JSON.stringify(messageParams),
            QueueUrl: queueURL,
        };
        return this.sendAsyncSQSMessage(args);
    }

    async sendAsyncSQSMessage(params: SendMessageCommandInput): Promise<string | undefined> {
        const command = new SendMessageCommand(params);
        const data = await sqs.send(command);
        return data.MessageId;
    }

    _validateParams(params: Record<string, unknown>): void {
        // Override in subclasses
    }

    _verifyParamExists(params: Record<string, unknown>, param: string): void {
        if (!(param in params)) {
            throw new RequiredPropertyError({
                parent: this as unknown as { name?: string },
                key: param,
            });
        }
    }
}

