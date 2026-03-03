/**
 * WebSocket Message Sender Interface (Port)
 *
 * Defines the contract for sending messages to active WebSocket connections.
 * Used by WebSocket connection repositories to push data to connected clients.
 *
 * Following Frigg's hexagonal architecture pattern:
 * - Port defines WHAT the service does (contract)
 * - Adapters implement HOW (AWS API Gateway, Netlify, etc.)
 */
class WebSocketMessageSenderInterface {
    /**
     * Send data to a specific WebSocket connection
     *
     * @param {string} connectionId - The WebSocket connection identifier
     * @param {*} data - Data to send (will be JSON-serialized by the adapter)
     * @param {string} endpoint - The WebSocket API endpoint URL
     * @returns {Promise<void>}
     * @throws {StaleConnectionError} If the connection is no longer active (410 Gone)
     */
    async send(connectionId, data, endpoint) {
        throw new Error('Method send must be implemented by subclass');
    }
}

/**
 * Error thrown when a WebSocket connection is stale (disconnected).
 * Repositories should catch this and clean up the stale connection record.
 */
class StaleConnectionError extends Error {
    constructor(connectionId) {
        super(`Stale WebSocket connection: ${connectionId}`);
        this.name = 'StaleConnectionError';
        this.connectionId = connectionId;
    }
}

module.exports = { WebSocketMessageSenderInterface, StaleConnectionError };
