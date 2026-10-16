/**
 * Queue Provider Interface (Port)
 *
 * Defines the contract for queue message sending.
 * All queue adapters must extend this interface.
 *
 * Following Frigg's hexagonal architecture pattern:
 * - Port defines WHAT the service does (contract)
 * - Adapters implement HOW (AWS SQS, Netlify Background Functions, QStash, etc.)
 */
class QueueProvider {
    /**
     * Send a single message to a queue
     *
     * @param {Object} message - Message payload (will be JSON-serialized)
     * @param {string} queueId - Queue identifier (URL, name, or endpoint depending on provider)
     * @returns {Promise<Object>} Provider-specific response
     */
    async send(message, queueId) {
        throw new Error('Method send must be implemented by subclass');
    }

    /**
     * Send a batch of messages to a queue
     *
     * @param {Object[]} entries - Array of message payloads
     * @param {string} queueId - Queue identifier
     * @returns {Promise<Object>} Provider-specific response
     */
    async batchSend(entries, queueId) {
        throw new Error('Method batchSend must be implemented by subclass');
    }

    /**
     * Parse an incoming event into an array of message payloads.
     * Each provider has its own event shape (SQS Records, HTTP body, etc.)
     *
     * @param {Object} event - Raw event from the runtime (Lambda event, HTTP request, etc.)
     * @returns {Object[]} Array of parsed message payloads
     */
    parseEvent(event) {
        throw new Error('Method parseEvent must be implemented by subclass');
    }

    /**
     * Prove an incoming event was sent by Frigg before anything is parsed or
     * dispatched. HTTP-delivered queues (Netlify Background Functions,
     * QStash) are public URLs, so their adapters check a signature here.
     *
     * The default refuses: an adapter that does not know how to verify its
     * events must not have them run. An adapter whose transport already
     * authenticates the caller (SQS triggering a Lambda) overrides this.
     *
     * @param {Object} event - Raw event from the runtime
     * @returns {Promise<{ ok: boolean, reason?: string, unsigned?: boolean }>}
     */
    async verifyEvent(event) {
        return { ok: false, reason: 'verification_not_implemented' };
    }
}

module.exports = { QueueProvider };
