const { v4: uuid } = require('uuid');
const AWS = require('aws-sdk');
const awsConfigOptions = () => {
    const config = {};
    if (process.env.IS_OFFLINE) {
        console.log('Running in offline mode');
    }
    if (process.env.AWS_ENDPOINT) {
        config.endpoint = process.env.AWS_ENDPOINT;
    }
    return config;
};
AWS.config.update(awsConfigOptions());
const sqs = new AWS.SQS();

const QueuerUtil = {
    batchSend: async (entries = [], queueUrl) => {
        console.log(
            `Enqueuing ${entries.length} entries on SQS to queue ${queueUrl}`
        );
        const buffer = [];
        const batchSize = 10;

        for (const entry of entries) {
            buffer.push({
                Id: uuid(),
                MessageBody: JSON.stringify(entry),
            });
            // Sends 10, then purges the buffer
            if (buffer.length === batchSize) {
                console.log('Buffer at 10, sending batch');
                await sqs
                    .sendMessageBatch({
                        Entries: buffer,
                        QueueUrl: queueUrl,
                    })
                    .promise();
                // Purge the buffer
                buffer.splice(0, buffer.length);
            }
        }
        console.log('Buffer at end, sending final batch');

        // If any remaining entries under 10 are left in the buffer, send and return
        if (buffer.length > 0) {
            console.log(buffer);
            return sqs
                .sendMessageBatch({
                    Entries: buffer,
                    QueueUrl: queueUrl,
                })
                .promise();
        }

        // If we're exact... just return an empty object for now

        return {};
    },
};

module.exports = { QueuerUtil };
