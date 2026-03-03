const { prisma } = require('../../database/prisma');
const {
    StaleConnectionError,
} = require('../websocket-message-sender-interface');
const {
    WebsocketConnectionRepositoryInterface,
} = require('./websocket-connection-repository-interface');

/**
 * MongoDB WebSocket Connection Repository Adapter
 * Handles persistence of active WebSocket connections
 *
 * MongoDB-specific characteristics:
 * - Uses String IDs (ObjectId)
 * - No ID conversion needed (IDs are already strings)
 *
 * BREAKING CHANGE (v3): A messageSender must be explicitly provided for
 * WebSocket send functionality. For AWS API Gateway, pass
 * `new ApiGatewayMessageSender()` from @friggframework/provider-aws.
 * See docs/adr/001-decouple-aws-from-core.md for migration guide.
 */
class WebsocketConnectionRepositoryMongo extends WebsocketConnectionRepositoryInterface {
    constructor(messageSender = null) {
        super();
        this.prisma = prisma;
        this._messageSender = messageSender;
    }

    /**
     * Create a new WebSocket connection record
     * Replaces: WebsocketConnection.create({ connectionId })
     *
     * @param {string} connectionId - The WebSocket connection ID
     * @returns {Promise<Object>} The created connection record with string IDs
     */
    async createConnection(connectionId) {
        return await this.prisma.websocketConnection.create({
            data: { connectionId },
        });
    }

    /**
     * Delete a WebSocket connection record
     * Replaces: WebsocketConnection.deleteOne({ connectionId })
     *
     * @param {string} connectionId - The WebSocket connection ID to delete
     * @returns {Promise<Object>} The deletion result
     */
    async deleteConnection(connectionId) {
        try {
            await this.prisma.websocketConnection.delete({
                where: { connectionId },
            });
            return { acknowledged: true, deletedCount: 1 };
        } catch (error) {
            if (error.code === 'P2025') {
                // Record not found
                return { acknowledged: true, deletedCount: 0 };
            }
            throw error;
        }
    }

    /**
     * Get all active WebSocket connections with send capability
     * Replaces: WebsocketConnection.getActiveConnections()
     *
     * @returns {Promise<Array>} Array of active connection objects with send capability
     */
    async getActiveConnections() {
        try {
            // Return empty array if websockets are not configured
            if (!process.env.WEBSOCKET_API_ENDPOINT) {
                return [];
            }

            const connections = await this.prisma.websocketConnection.findMany({
                select: { connectionId: true },
            });

            if (!this._messageSender) {
                throw new Error(
                    'WebsocketConnectionRepositoryMongo requires a messageSender for send functionality.\n' +
                    'Pass one via constructor, e.g.:\n' +
                    '  const { ApiGatewayMessageSender } = require("@friggframework/provider-aws");\n' +
                    '  new WebsocketConnectionRepositoryMongo(new ApiGatewayMessageSender())\n' +
                    'See docs/adr/001-decouple-aws-from-core.md for migration guide.'
                );
            }
            const sender = this._messageSender;

            return connections.map((conn) => ({
                connectionId: conn.connectionId,
                send: async (data) => {
                    try {
                        await sender.send(
                            conn.connectionId,
                            data,
                            process.env.WEBSOCKET_API_ENDPOINT
                        );
                    } catch (error) {
                        if (error instanceof StaleConnectionError) {
                            console.log(
                                `Stale connection ${conn.connectionId}`
                            );
                            await this.prisma.websocketConnection.deleteMany({
                                where: { connectionId: conn.connectionId },
                            });
                        } else {
                            throw error;
                        }
                    }
                },
            }));
        } catch (error) {
            console.error('Error getting active connections:', error);
            throw error;
        }
    }

    /**
     * Find a connection by connection ID
     * Replaces: WebsocketConnection.findOne({ connectionId })
     *
     * @param {string} connectionId - The WebSocket connection ID
     * @returns {Promise<Object|null>} The connection record with string IDs or null
     */
    async findConnection(connectionId) {
        return await this.prisma.websocketConnection.findFirst({
            where: { connectionId },
        });
    }

    /**
     * Find connection by internal ID
     * @param {string} id - The internal connection ID
     * @returns {Promise<Object|null>} The connection record with string IDs or null
     */
    async findConnectionById(id) {
        return await this.prisma.websocketConnection.findUnique({
            where: { id },
        });
    }

    /**
     * Get all connections
     * @returns {Promise<Array>} Array of all connection records with string IDs
     */
    async getAllConnections() {
        return await this.prisma.websocketConnection.findMany();
    }

    /**
     * Delete all connections
     * @returns {Promise<Object>} The deletion result
     */
    async deleteAllConnections() {
        const result = await this.prisma.websocketConnection.deleteMany();
        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }
}

module.exports = { WebsocketConnectionRepositoryMongo };
