/**
 * SQS Queue Provider (Adapter)
 *
 * AWS SQS implementation of the QueueProvider port, from
 * friggframework/frigg#545 (where it lives in @friggframework/provider-aws).
 * Kept in core here because the AWS SDK is still a core dependency; the SDK
 * is required on first send, not at module load.
 */
const { v4: uuid } = require('uuid');
const { QueueProvider } = require('../queue-provider');
const {
    SqsQueueClient,
    defaultSqsClientConfig,
} = require('../sqs-queue-client');

const SQS_BATCH_SIZE = 10;

class SqsQueueProvider extends QueueProvider {
    /**
     * @param {Object} [options]
     * @param {QueueClientInterface} [options.queueClient] - defaults to an SqsQueueClient.
     */
    constructor({ queueClient } = {}) {
        super();
        this.queueClient =
            queueClient ||
            new SqsQueueClient({ clientConfig: defaultSqsClientConfig() });
    }

    async send(message, queueUrl) {
        return this.queueClient.sendMessage({
            MessageBody: JSON.stringify(message),
            QueueUrl: queueUrl,
        });
    }

    async batchSend(entries = [], queueUrl) {
        let last = {};
        for (let i = 0; i < entries.length; i += SQS_BATCH_SIZE) {
            const Entries = entries.slice(i, i + SQS_BATCH_SIZE).map((entry) => ({
                Id: uuid(),
                MessageBody: JSON.stringify(entry),
            }));
            last = await this.queueClient.sendMessageBatch({
                Entries,
                QueueUrl: queueUrl,
            });
        }
        return last;
    }

    /**
     * Parse an SQS event: event.Records[].body (JSON string).
     */
    parseEvent(event) {
        const records = event?.Records || [];
        return records.map((record) => JSON.parse(record.body));
    }

    /**
     * SQS events reach a Lambda only through its event source mapping, which
     * AWS authenticates; there is no public URL to post to.
     */
    async verifyEvent() {
        return { ok: true };
    }
}

module.exports = { SqsQueueProvider };
