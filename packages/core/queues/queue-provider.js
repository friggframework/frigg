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
}

module.exports = { QueueProvider };
