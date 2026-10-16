/**
 * Queue Client Interface (Port)
 *
 * Defines the contract for low-level queue message operations.
 * Used by Worker class and QueuerUtil for sending/receiving queue messages.
 *
 * Following Frigg's hexagonal architecture pattern:
 * - Port defines WHAT the service does (contract)
 * - Adapters implement HOW (AWS SQS, Netlify, QStash, etc.)
 *
 * Distinct from QueueProvider which is the higher-level provider for
 * integration-level queue operations (send/batchSend/parseEvent).
 * QueueClientInterface is the lower-level "how do I talk to the queue service" port.
 */
class QueueClientInterface {
    /**
     * Send a single message to a queue
     *
     * @param {Object} params
     * @param {string} params.QueueUrl - Queue endpoint/identifier
     * @param {string} params.MessageBody - Serialized message body
     * @param {number} [params.DelaySeconds] - Delay before message becomes visible
     * @returns {Promise<{MessageId: string}>} Result with message identifier
     */
    async sendMessage(params) {
        throw new Error('Method sendMessage must be implemented by subclass');
    }

    /**
     * Send a batch of messages to a queue
     *
     * @param {Object} params
     * @param {string} params.QueueUrl - Queue endpoint/identifier
     * @param {Array<{Id: string, MessageBody: string}>} params.Entries - Messages to send
     * @returns {Promise<Object>} Batch send result
     */
    async sendMessageBatch(params) {
        throw new Error(
            'Method sendMessageBatch must be implemented by subclass'
        );
    }

    /**
     * Resolve a queue name to a URL/endpoint
     *
     * @param {Object} params
     * @param {string} params.QueueName - Queue name to resolve
     * @returns {Promise<string>} Resolved queue URL/endpoint
     */
    async getQueueUrl(params) {
        throw new Error('Method getQueueUrl must be implemented by subclass');
    }
}

module.exports = { QueueClientInterface };
