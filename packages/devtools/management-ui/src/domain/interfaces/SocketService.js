/**
 * SocketService Interface (Port)
 * Defines the contract for socket communication
 */
export class SocketService {
    /**
     * Connect to socket server
     * @param {string} url
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async connect(url, options = {}) {
        throw new Error('Method connect must be implemented')
    }

    /**
     * Disconnect from socket server
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new Error('Method disconnect must be implemented')
    }

    /**
     * Check if connected
     * @returns {boolean}
     */
    isConnected() {
        throw new Error('Method isConnected must be implemented')
    }

    /**
     * Emit event
     * @param {string} event
     * @param {*} data
     * @returns {Promise<void>}
     */
    async emit(event, data) {
        throw new Error('Method emit must be implemented')
    }

    /**
     * Listen to event
     * @param {string} event
     * @param {Function} callback
     * @returns {Promise<void>}
     */
    async on(event, callback) {
        throw new Error('Method on must be implemented')
    }

    /**
     * Remove event listener
     * @param {string} event
     * @param {Function} callback
     * @returns {Promise<void>}
     */
    async off(event, callback) {
        throw new Error('Method off must be implemented')
    }

    /**
     * Join room
     * @param {string} room
     * @returns {Promise<void>}
     */
    async joinRoom(room) {
        throw new Error('Method joinRoom must be implemented')
    }

    /**
     * Leave room
     * @param {string} room
     * @returns {Promise<void>}
     */
    async leaveRoom(room) {
        throw new Error('Method leaveRoom must be implemented')
    }

    /**
     * Emit to room
     * @param {string} room
     * @param {string} event
     * @param {*} data
     * @returns {Promise<void>}
     */
    async emitToRoom(room, event, data) {
        throw new Error('Method emitToRoom must be implemented')
    }

    /**
     * Get connection status
     * @returns {string}
     */
    getStatus() {
        throw new Error('Method getStatus must be implemented')
    }

    /**
     * Reconnect
     * @returns {Promise<void>}
     */
    async reconnect() {
        throw new Error('Method reconnect must be implemented')
    }
}
