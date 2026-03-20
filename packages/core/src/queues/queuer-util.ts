import { v4 as uuid } from 'uuid';
import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';

const awsConfigOptions = (): Record<string, unknown> => {
    const config: Record<string, unknown> = {};
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

const sqs = new SQSClient(awsConfigOptions() as any);

export const QueuerUtil = {
    send: async (message: unknown, queueUrl: string): Promise<unknown> => {
        const command = new SendMessageCommand({
            MessageBody: JSON.stringify(message),
            QueueUrl: queueUrl,
        });
        return sqs.send(command);
    },

    batchSend: async (entries: unknown[] = [], queueUrl: string): Promise<unknown> => {
        const buffer: Array<{ Id: string; MessageBody: string }> = [];
        const batchSize = 10;

        for (const entry of entries) {
            buffer.push({
                Id: uuid(),
                MessageBody: JSON.stringify(entry),
            });
            if (buffer.length === batchSize) {
                const command = new SendMessageBatchCommand({
                    Entries: [...buffer],
                    QueueUrl: queueUrl,
                });
                await sqs.send(command);
                buffer.splice(0, buffer.length);
            }
        }

        if (buffer.length > 0) {
            const command = new SendMessageBatchCommand({
                Entries: buffer,
                QueueUrl: queueUrl,
            });
            return sqs.send(command);
        }

        return {};
    },
};
