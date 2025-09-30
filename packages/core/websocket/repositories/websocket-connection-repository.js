const { prisma } = require('../../database/prisma');
const AWS = require('aws-sdk');
const {
    WebsocketConnectionRepositoryInterface,
} = require('./websocket-connection-repository-interface');

/**
 * Prisma-based WebSocket Connection Repository
 * Handles persistence of active WebSocket connections
 *
 * Works identically for both MongoDB and PostgreSQL:
 * - MongoDB: String IDs with @db.ObjectId
 * - PostgreSQL: Integer IDs with auto-increment
 * - Both use same query patterns (no many-to-many differences)
 *
 * Migration from Mongoose:
 * - Constructor injection of Prisma client
 * - Static method getActiveConnections() → Instance method
 * - AWS API Gateway Management API integration preserved
 */
class WebsocketConnectionRepository extends WebsocketConnectionRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Create a new WebSocket connection record
     * Replaces: WebsocketConnection.create({ connectionId })
     *
     * @param {string} connectionId - The WebSocket connection ID
     * @returns {Promise<Object>} The created connection record
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

            return connections.map((conn) => ({
                connectionId: conn.connectionId,
                send: async (data) => {
                    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
                        apiVersion: '2018-11-29',
                        endpoint: process.env.WEBSOCKET_API_ENDPOINT,
                    });

                    try {
                        await apigwManagementApi
                            .postToConnection({
                                ConnectionId: conn.connectionId,
                                Data: JSON.stringify(data),
                            })
                            .promise();
                    } catch (error) {
                        if (error.statusCode === 410) {
                            console.log(
                                `Stale connection ${conn.connectionId}`
                            );
                            // Delete stale connection
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
     * Find a connection by ID
     * Replaces: WebsocketConnection.findOne({ connectionId })
     *
     * @param {string} connectionId - The WebSocket connection ID
     * @returns {Promise<Object|null>} The connection record or null
     */
    async findConnection(connectionId) {
        return await this.prisma.websocketConnection.findFirst({
            where: { connectionId },
        });
    }

    /**
     * Find connection by internal ID
     * @param {string} id - The internal connection ID
     * @returns {Promise<Object|null>} The connection record or null
     */
    async findConnectionById(id) {
        return await this.prisma.websocketConnection.findUnique({
            where: { id },
        });
    }

    /**
     * Get all connections
     * @returns {Promise<Array>} Array of all connection records
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

module.exports = { WebsocketConnectionRepository };
