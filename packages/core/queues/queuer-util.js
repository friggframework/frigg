const { v4: uuid } = require('uuid');

/**
 * QueuerUtil - Queue message utility.
 *
 * BREAKING CHANGE (v3): A queue client must be set via setQueueClient()
 * before calling send() or batchSend().
 * For AWS/SQS, pass `new SqsQueueClient()` from @friggframework/provider-aws.
 * See docs/adr/001-decouple-aws-from-core.md for migration guide.
 */
let _queueClient = null;

function getQueueClient() {
    if (!_queueClient) {
        throw new Error(
            'QueuerUtil requires a queue client. Call QueuerUtil.setQueueClient() first, e.g.:\n' +
            '  const { SqsQueueClient } = require("@friggframework/provider-aws");\n' +
            '  QueuerUtil.setQueueClient(new SqsQueueClient());\n' +
            'See docs/adr/001-decouple-aws-from-core.md for migration guide.'
        );
    }
    return _queueClient;
}

const QueuerUtil = {
    /**
     * Set the queue client. Must be called before send() or batchSend().
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
                    Entries: [...buffer],
                    QueueUrl: queueUrl,
                });
                buffer.length = 0;
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
