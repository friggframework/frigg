const { v4: uuid } = require('uuid');

// Queue client is lazy-loaded to avoid pulling in AWS SDK on non-AWS platforms.
let _queueClient = null;

function getQueueClient() {
    if (!_queueClient) {
        const { SqsQueueClient } = require('@friggframework/provider-aws');
        _queueClient = new SqsQueueClient();
    }
    return _queueClient;
}

const QueuerUtil = {
    /**
     * Override the queue client (useful for testing or non-AWS platforms).
     * @param {QueueClientInterface} client
     */
    setQueueClient(client) {
        _queueClient = client;
    },

    send: async (message, queueUrl) => {
        return getQueueClient().sendMessage({
            MessageBody: JSON.stringify(message),
            QueueUrl: queueUrl,
        });
    },

    batchSend: async (entries = [], queueUrl) => {
        const buffer = [];
        const batchSize = 10;

        for (const entry of entries) {
            buffer.push({
                Id: uuid(),
                MessageBody: JSON.stringify(entry),
            });
            // Sends 10, then purges the buffer
            if (buffer.length === batchSize) {
                await getQueueClient().sendMessageBatch({
                    Entries: buffer,
                    QueueUrl: queueUrl,
                });
                // Purge the buffer
                buffer.splice(0, buffer.length);
            }
        }

        // If any remaining entries under 10 are left in the buffer, send and return
        if (buffer.length > 0) {
            return getQueueClient().sendMessageBatch({
                Entries: buffer,
                QueueUrl: queueUrl,
            });
        }

        // If we're exact... just return an empty object for now

        return {};
    },
};

module.exports = { QueuerUtil };
