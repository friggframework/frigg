/**
 * Websocket Connection Repository Interface
 * Abstract base class defining the contract for websocket connection persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Note: Currently, WebsocketConnection model has identical structure across MongoDB and PostgreSQL,
 * so WebsocketConnectionRepository serves both. This interface exists for consistency and
 * future-proofing if database-specific implementations become needed.
 *
 * @abstract
 */
class WebsocketConnectionRepositoryInterface {
    /**
     * Create a new websocket connection
     *
     * @param {string} connectionId - Connection ID
     * @returns {Promise<Object>} Created connection object
     * @abstract
     */
    async createConnection(connectionId) {
        throw new Error(
            'Method createConnection must be implemented by subclass'
        );
    }

    /**
     * Delete a websocket connection
     *
     * @param {string} connectionId - Connection ID
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteConnection(connectionId) {
        throw new Error(
            'Method deleteConnection must be implemented by subclass'
        );
    }

    /**
     * Get active connections
     *
     * @returns {Promise<Array>} Array of active connection objects
     * @abstract
     */
    async getActiveConnections() {
        throw new Error(
            'Method getActiveConnections must be implemented by subclass'
        );
    }

    /**
     * Find connection by connection ID
     *
     * @param {string} connectionId - Connection ID
     * @returns {Promise<Object|null>} Connection object or null
     * @abstract
     */
    async findConnection(connectionId) {
        throw new Error(
            'Method findConnection must be implemented by subclass'
        );
    }

    /**
     * Find connection by database ID
     *
     * @param {string|number} id - Database ID
     * @returns {Promise<Object|null>} Connection object or null
     * @abstract
     */
    async findConnectionById(id) {
        throw new Error(
            'Method findConnectionById must be implemented by subclass'
        );
    }

    /**
     * Get all connections
     *
     * @returns {Promise<Array>} Array of all connection objects
     * @abstract
     */
    async getAllConnections() {
        throw new Error(
            'Method getAllConnections must be implemented by subclass'
        );
    }

    /**
     * Delete all connections
     *
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteAllConnections() {
        throw new Error(
            'Method deleteAllConnections must be implemented by subclass'
        );
    }
}

module.exports = { WebsocketConnectionRepositoryInterface };
