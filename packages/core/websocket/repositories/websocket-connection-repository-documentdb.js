const { prisma } = require('../../database/prisma');
const {
    StaleConnectionError,
} = require('../websocket-message-sender-interface');
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

/**
 * DocumentDB WebSocket Connection Repository Adapter
 *
 * BREAKING CHANGE (v3): A messageSender must be explicitly provided for
 * WebSocket send functionality. For AWS API Gateway, pass
 * `new ApiGatewayMessageSender()` from @friggframework/provider-aws.
 * See docs/architecture-decisions/010-decouple-aws-from-core.md for migration guide.
 */
class WebsocketConnectionRepositoryDocumentDB extends WebsocketConnectionRepositoryInterface {
    constructor(messageSender = null) {
        super();
        this.prisma = prisma;
        this._messageSender = messageSender;
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

        if (!this._messageSender) {
            throw new Error(
                'WebsocketConnectionRepositoryDocumentDB requires a messageSender for send functionality.\n' +
                'Pass one via constructor, e.g.:\n' +
                '  const { ApiGatewayMessageSender } = require("@friggframework/provider-aws");\n' +
                '  new WebsocketConnectionRepositoryDocumentDB(new ApiGatewayMessageSender())\n' +
                'See docs/architecture-decisions/010-decouple-aws-from-core.md for migration guide.'
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
