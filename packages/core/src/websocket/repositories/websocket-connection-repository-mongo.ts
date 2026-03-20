import { prisma } from '../../database/prisma';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { WebsocketConnectionRepositoryInterface } from './websocket-connection-repository-interface';
import type { ConnectionData, ActiveConnection, ConnectionDeleteResult } from './websocket-connection-repository-interface';

export class WebsocketConnectionRepositoryMongo extends WebsocketConnectionRepositoryInterface {
    readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    async createConnection(connectionId: string): Promise<ConnectionData> {
        return await this.prisma.websocketConnection.create({ data: { connectionId } });
    }

    async deleteConnection(connectionId: string): Promise<ConnectionDeleteResult> {
        try {
            await this.prisma.websocketConnection.delete({ where: { connectionId } });
            return { acknowledged: true, deletedCount: 1 };
        } catch (error: any) {
            if (error.code === 'P2025') return { acknowledged: true, deletedCount: 0 };
            throw error;
        }
    }

    async getActiveConnections(): Promise<ActiveConnection[]> {
        if (!process.env.WEBSOCKET_API_ENDPOINT) return [];

        const connections = await this.prisma.websocketConnection.findMany({
            select: { connectionId: true },
        });

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
                        await this.prisma.websocketConnection.deleteMany({
                            where: { connectionId: conn.connectionId },
                        });
                    } else {
                        throw error;
                    }
                }
            },
        }));
    }

    async findConnection(connectionId: string): Promise<ConnectionData | null> {
        return await this.prisma.websocketConnection.findFirst({ where: { connectionId } });
    }

    async findConnectionById(id: string): Promise<ConnectionData | null> {
        return await this.prisma.websocketConnection.findUnique({ where: { id } });
    }

    async getAllConnections(): Promise<ConnectionData[]> {
        return await this.prisma.websocketConnection.findMany();
    }

    async deleteAllConnections(): Promise<ConnectionDeleteResult> {
        const result = await this.prisma.websocketConnection.deleteMany();
        return { acknowledged: true, deletedCount: result.count };
    }
}
