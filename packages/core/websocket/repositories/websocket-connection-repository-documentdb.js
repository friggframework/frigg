const { prisma } = require('../../database/prisma');
// AWS API Gateway SDK is lazy-loaded to avoid pulling in the SDK on non-AWS platforms.
let _apigwModule = null;
function getApigwModule() {
    if (!_apigwModule) {
        _apigwModule = require('@aws-sdk/client-apigatewaymanagementapi');
    }
    return _apigwModule;
}
const {
    toObjectId,
    fromObjectId,
    findMany,
    findOne,
    insertOne,
    deleteOne,
    deleteMany,
} = require('../../database/documentdb-utils');
const {
    WebsocketConnectionRepositoryInterface,
} = require('./websocket-connection-repository-interface');

class WebsocketConnectionRepositoryDocumentDB extends WebsocketConnectionRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async createConnection(connectionId) {
        const now = new Date();
        const document = {
            connectionId,
            createdAt: now,
            updatedAt: now,
        };
        const insertedId = await insertOne(
            this.prisma,
            'WebsocketConnection',
            document
        );
        const created = await findOne(this.prisma, 'WebsocketConnection', {
            _id: insertedId,
        });
        return this._mapConnection(created);
    }

    async deleteConnection(connectionId) {
        const result = await deleteOne(this.prisma, 'WebsocketConnection', {
            connectionId,
        });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async getActiveConnections() {
        if (!process.env.WEBSOCKET_API_ENDPOINT) {
            return [];
        }

        const connections = await findMany(
            this.prisma,
            'WebsocketConnection',
            {},
            { projection: { connectionId: 1 } }
        );

        return connections.map((conn) => ({
            connectionId: conn.connectionId,
            send: async (data) => {
                const apigwManagementApi = new (getApigwModule().ApiGatewayManagementApiClient)({
                    endpoint: process.env.WEBSOCKET_API_ENDPOINT,
                });

                try {
                    const command = new (getApigwModule().PostToConnectionCommand)({
                        ConnectionId: conn.connectionId,
                        Data: JSON.stringify(data),
                    });
                    await apigwManagementApi.send(command);
                } catch (error) {
                    if (
                        error.statusCode === 410 ||
                        error.$metadata?.httpStatusCode === 410
                    ) {
                        console.log(`Stale connection ${conn.connectionId}`);
                        await deleteMany(this.prisma, 'WebsocketConnection', {
                            connectionId: conn.connectionId,
                        });
                    } else {
                        throw error;
                    }
                }
            },
        }));
    }

    async findConnection(connectionId) {
        const doc = await findOne(this.prisma, 'WebsocketConnection', {
            connectionId,
        });
        return doc ? this._mapConnection(doc) : null;
    }

    async findConnectionById(id) {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'WebsocketConnection', {
            _id: objectId,
        });
        return doc ? this._mapConnection(doc) : null;
    }

    async getAllConnections() {
        const docs = await findMany(this.prisma, 'WebsocketConnection');
        return docs.map((doc) => this._mapConnection(doc));
    }

    async deleteAllConnections() {
        const result = await deleteMany(this.prisma, 'WebsocketConnection', {});
        const deleted = result?.n ?? 0;
        return {
            acknowledged: true,
            deletedCount: deleted,
        };
    }

    _mapConnection(doc) {
        if (!doc) return null;
        return {
            id: fromObjectId(doc._id),
            connectionId: doc.connectionId,
        };
    }
}

module.exports = { WebsocketConnectionRepositoryDocumentDB };
