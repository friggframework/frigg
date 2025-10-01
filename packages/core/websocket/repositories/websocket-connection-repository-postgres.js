const { prisma } = require('../../database/prisma');
const AWS = require('aws-sdk');
const {
    WebsocketConnectionRepositoryInterface,
} = require('./websocket-connection-repository-interface');

/**
 * PostgreSQL WebSocket Connection Repository Adapter
 * Handles persistence of active WebSocket connections
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 */
class WebsocketConnectionRepositoryPostgres extends WebsocketConnectionRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Convert string ID to integer for PostgreSQL queries
     * @private
     * @param {string|number|null|undefined} id - ID to convert
     * @returns {number|null|undefined} Integer ID or null/undefined
     * @throws {Error} If ID cannot be converted to integer
     */
    _convertId(id) {
        if (id === null || id === undefined) return id;
        const parsed = parseInt(id, 10);
        if (isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Convert connection object IDs to strings
     * @private
     * @param {Object|null} connection - Connection object from database
     * @returns {Object|null} Connection with string IDs
     */
    _convertConnectionIds(connection) {
        if (!connection) return connection;
        return {
            ...connection,
            id: connection.id?.toString(),
        };
    }

    /**
     * Create a new WebSocket connection record
     * Replaces: WebsocketConnection.create({ connectionId })
     *
     * @param {string} connectionId - The WebSocket connection ID
     * @returns {Promise<Object>} The created connection record with string IDs
     */
    async createConnection(connectionId) {
        const connection = await this.prisma.websocketConnection.create({
            data: { connectionId },
        });
        return this._convertConnectionIds(connection);
    }

    /**
     * Delete a WebSocket connection record
     * Replaces: WebsocketConnection.deleteOne({ connectionId })
     *
     * Note: connectionId is a string field in schema, not the primary key,
     * so no conversion needed here.
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
     * Find a connection by connection ID
     * Replaces: WebsocketConnection.findOne({ connectionId })
     *
     * Note: connectionId is a string field, not the primary key
     *
     * @param {string} connectionId - The WebSocket connection ID
     * @returns {Promise<Object|null>} The connection record with string IDs or null
     */
    async findConnection(connectionId) {
        const connection = await this.prisma.websocketConnection.findFirst({
            where: { connectionId },
        });
        return this._convertConnectionIds(connection);
    }

    /**
     * Find connection by internal ID
     * @param {string} id - The internal connection ID (string from application layer)
     * @returns {Promise<Object|null>} The connection record with string IDs or null
     */
    async findConnectionById(id) {
        const intId = this._convertId(id);
        const connection = await this.prisma.websocketConnection.findUnique({
            where: { id: intId },
        });
        return this._convertConnectionIds(connection);
    }

    /**
     * Get all connections
     * @returns {Promise<Array>} Array of all connection records with string IDs
     */
    async getAllConnections() {
        const connections = await this.prisma.websocketConnection.findMany();
        return connections.map((conn) => this._convertConnectionIds(conn));
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

module.exports = { WebsocketConnectionRepositoryPostgres };
