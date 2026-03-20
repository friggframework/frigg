import { prisma } from '../../database/prisma';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { toObjectId, fromObjectId, findMany, findOne, insertOne, deleteOne, deleteMany } from '../../database/documentdb-utils';
import { WebsocketConnectionRepositoryInterface } from './websocket-connection-repository-interface';
import type { ConnectionData, ActiveConnection, ConnectionDeleteResult } from './websocket-connection-repository-interface';

export class WebsocketConnectionRepositoryDocumentDB extends WebsocketConnectionRepositoryInterface {
    readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    async createConnection(connectionId: string): Promise<ConnectionData> {
        const now = new Date();
        const document = { connectionId, createdAt: now, updatedAt: now };
        const insertedId = await insertOne(this.prisma, 'WebsocketConnection', document);
        const created = await findOne(this.prisma, 'WebsocketConnection', { _id: insertedId });
        return this._mapConnection(created)!;
    }

    async deleteConnection(connectionId: string): Promise<ConnectionDeleteResult> {
        const result = await deleteOne(this.prisma, 'WebsocketConnection', { connectionId });
        const deleted = (result?.n as number) ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async getActiveConnections(): Promise<ActiveConnection[]> {
        if (!process.env.WEBSOCKET_API_ENDPOINT) return [];

        const connections = await findMany(
            this.prisma, 'WebsocketConnection', {},
            { projection: { connectionId: 1 } }
        );

        return connections.map((conn: any) => ({
            connectionId: conn.connectionId,
            send: async (data: unknown) => {
                const apigwManagementApi = new ApiGatewayManagementApiClient({
                    endpoint: process.env.WEBSOCKET_API_ENDPOINT!,
                });
                try {
                    const command = new PostToConnectionCommand({
                        ConnectionId: conn.connectionId,
                        Data: JSON.stringify(data),
                    });
                    await apigwManagementApi.send(command);
                } catch (error: any) {
                    if (error.statusCode === 410 || error.$metadata?.httpStatusCode === 410) {
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

    async findConnection(connectionId: string): Promise<ConnectionData | null> {
        const doc = await findOne(this.prisma, 'WebsocketConnection', { connectionId });
        return doc ? this._mapConnection(doc) : null;
    }

    async findConnectionById(id: string): Promise<ConnectionData | null> {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'WebsocketConnection', { _id: objectId });
        return doc ? this._mapConnection(doc) : null;
    }

    async getAllConnections(): Promise<ConnectionData[]> {
        const docs = await findMany(this.prisma, 'WebsocketConnection');
        return docs.map((doc: any) => this._mapConnection(doc)!);
    }

    async deleteAllConnections(): Promise<ConnectionDeleteResult> {
        const result = await deleteMany(this.prisma, 'WebsocketConnection', {});
        const deleted = (result?.n as number) ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    private _mapConnection(doc: any): ConnectionData | null {
        if (!doc) return null;
        return {
            id: fromObjectId(doc._id) || undefined,
            connectionId: doc.connectionId,
        };
    }
}
