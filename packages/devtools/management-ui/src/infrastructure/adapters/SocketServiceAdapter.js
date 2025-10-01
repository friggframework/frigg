/**
 * SocketServiceAdapter
 * Concrete implementation of SocketService interface
 */
import { SocketService } from '../../domain/interfaces/SocketService.js'

export class SocketServiceAdapter extends SocketService {
    constructor(socketClient) {
        super()
        this.socket = socketClient
        this.isConnectedFlag = false
        this.eventListeners = new Map()
    }

    /**
     * Connect to socket server
     * @param {string} url
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async connect(url, options = {}) {
        try {
            this.socket.connect(url, options)
            this.isConnectedFlag = true
        } catch (error) {
            console.error('Error connecting to socket:', error)
            throw new Error('Failed to connect to socket')
        }
    }

    /**
     * Disconnect from socket server
     * @returns {Promise<void>}
     */
    async disconnect() {
        try {
            this.socket.disconnect()
            this.isConnectedFlag = false
            this.eventListeners.clear()
        } catch (error) {
            console.error('Error disconnecting from socket:', error)
            throw new Error('Failed to disconnect from socket')
        }
    }

    /**
     * Check if connected
     * @returns {boolean}
     */
    isConnected() {
        return this.isConnectedFlag && this.socket.connected
    }

    /**
     * Emit event
     * @param {string} event
     * @param {*} data
     * @returns {Promise<void>}
     */
    async emit(event, data) {
        try {
            this.socket.emit(event, data)
        } catch (error) {
            console.error('Error emitting event:', error)
            throw new Error('Failed to emit event')
        }
    }

    /**
     * Listen to event
     * @param {string} event
     * @param {Function} callback
     * @returns {Promise<void>}
     */
    async on(event, callback) {
        try {
            this.socket.on(event, callback)
            if (!this.eventListeners.has(event)) {
                this.eventListeners.set(event, [])
            }
            this.eventListeners.get(event).push(callback)
        } catch (error) {
            console.error('Error adding event listener:', error)
            throw new Error('Failed to add event listener')
        }
    }

    /**
     * Remove event listener
     * @param {string} event
     * @param {Function} callback
     * @returns {Promise<void>}
     */
    async off(event, callback) {
        try {
            this.socket.off(event, callback)
            if (this.eventListeners.has(event)) {
                const listeners = this.eventListeners.get(event)
                const index = listeners.indexOf(callback)
                if (index > -1) {
                    listeners.splice(index, 1)
                }
            }
        } catch (error) {
            console.error('Error removing event listener:', error)
            throw new Error('Failed to remove event listener')
        }
    }

    /**
     * Join room
     * @param {string} room
     * @returns {Promise<void>}
     */
    async joinRoom(room) {
        try {
            this.socket.emit('join-room', room)
        } catch (error) {
            console.error('Error joining room:', error)
            throw new Error('Failed to join room')
        }
    }

    /**
     * Leave room
     * @param {string} room
     * @returns {Promise<void>}
     */
    async leaveRoom(room) {
        try {
            this.socket.emit('leave-room', room)
        } catch (error) {
            console.error('Error leaving room:', error)
            throw new Error('Failed to leave room')
        }
    }

    /**
     * Emit to room
     * @param {string} room
     * @param {string} event
     * @param {*} data
     * @returns {Promise<void>}
     */
    async emitToRoom(room, event, data) {
        try {
            this.socket.emit('room-message', { room, event, data })
        } catch (error) {
            console.error('Error emitting to room:', error)
            throw new Error('Failed to emit to room')
        }
    }

    /**
     * Get connection status
     * @returns {string}
     */
    getStatus() {
        if (this.isConnected()) {
            return 'connected'
        } else if (this.socket.connecting) {
            return 'connecting'
        } else {
            return 'disconnected'
        }
    }

    /**
     * Reconnect
     * @returns {Promise<void>}
     */
    async reconnect() {
        try {
            this.socket.reconnect()
        } catch (error) {
            console.error('Error reconnecting:', error)
            throw new Error('Failed to reconnect')
        }
    }
}
