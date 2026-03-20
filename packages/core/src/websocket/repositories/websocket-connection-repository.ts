import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { WebsocketConnectionRepositoryInterface } from './websocket-connection-repository-interface';
import type { ConnectionData, ActiveConnection, ConnectionDeleteResult } from './websocket-connection-repository-interface';

const { prisma } = require('../../database/prisma');

export class WebsocketConnectionRepository extends WebsocketConnectionRepositoryInterface {
    private readonly prisma: any;

    constructor(prismaClient?: any) {
        super();
        this.prisma = prismaClient || prisma;
    }

    async createConnection(connectionId: string): Promise<ConnectionData> {
        return await this.prisma.websocketConnection.create({
            data: { connectionId },
        });
    }

    async deleteConnection(connectionId: string): Promise<ConnectionDeleteResult> {
        try {
            await this.prisma.websocketConnection.delete({
                where: { connectionId },
            });
            return { acknowledged: true, deletedCount: 1 };
        } catch (error: any) {
            if (error.code === 'P2025') {
                return { acknowledged: true, deletedCount: 0 };
            }
            throw error;
        }
    }

    async getActiveConnections(): Promise<ActiveConnection[]> {
        try {
            if (!process.env.WEBSOCKET_API_ENDPOINT) {
                return [];
            }

            const connections = await this.prisma.websocketConnection.findMany({
                select: { connectionId: true },
            });

            return connections.map((conn: { connectionId: string }) => ({
                connectionId: conn.connectionId,
                send: async (data: unknown) => {
                    const apigwManagementApi = new ApiGatewayManagementApiClient({
                        endpoint: process.env.WEBSOCKET_API_ENDPOINT,
                    });

                    try {
                        const command = new PostToConnectionCommand({
                            ConnectionId: conn.connectionId,
                            Data: JSON.stringify(data),
                        } as any);
                        await apigwManagementApi.send(command);
                    } catch (error: any) {
                        if (error.statusCode === 410 || error.$metadata?.httpStatusCode === 410) {
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

    async findConnection(connectionId: string): Promise<ConnectionData | null> {
        return await this.prisma.websocketConnection.findFirst({
            where: { connectionId },
        });
    }

    async findConnectionById(id: string): Promise<ConnectionData | null> {
        return await this.prisma.websocketConnection.findUnique({
            where: { id },
        });
    }

    async getAllConnections(): Promise<ConnectionData[]> {
        return await this.prisma.websocketConnection.findMany();
    }

    async deleteAllConnections(): Promise<ConnectionDeleteResult> {
        const result = await this.prisma.websocketConnection.deleteMany();
        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }
}
