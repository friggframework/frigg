const { WebsocketConnection } = require('./models/WebsocketConnection');

/**
 * Repository for WebSocket connection operations.
 * Handles persistence of active WebSocket connections.
 */
class WebsocketConnectionRepository {
    /**
     * Create a new WebSocket connection record
     * @param {string} connectionId - The WebSocket connection ID
     * @returns {Promise<Object>} The created connection record
     */
    async createConnection(connectionId) {
        return await WebsocketConnection.create({ connectionId });
    }

    /**
     * Delete a WebSocket connection record
     * @param {string} connectionId - The WebSocket connection ID to delete
     * @returns {Promise<Object>} The deletion result
     */
    async deleteConnection(connectionId) {
        return await WebsocketConnection.deleteOne({ connectionId });
    }

    /**
     * Get all active WebSocket connections
     * @returns {Promise<Array>} Array of active connection objects with send capability
     */
    async getActiveConnections() {
        return await WebsocketConnection.getActiveConnections();
    }

    /**
     * Find a connection by ID
     * @param {string} connectionId - The WebSocket connection ID
     * @returns {Promise<Object|null>} The connection record or null
     */
    async findConnection(connectionId) {
        return await WebsocketConnection.findOne({ connectionId });
    }
}

module.exports = { WebsocketConnectionRepository };