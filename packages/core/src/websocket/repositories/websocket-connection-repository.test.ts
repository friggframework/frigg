import { mockClient } from 'aws-sdk-client-mock';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { WebsocketConnectionRepository } from './websocket-connection-repository';

jest.mock('../../database/prisma', () => ({
    prisma: {
        websocketConnection: {
            create: jest.fn(),
            delete: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            deleteMany: jest.fn(),
        },
    },
}));

import { prisma } from '../../database/prisma';

const mockedPrisma = prisma as any;

describe('WebsocketConnectionRepository - AWS SDK v3', () => {
    let apiGatewayMock: any;
    let repository: InstanceType<typeof WebsocketConnectionRepository>;
    const originalEnv = process.env;

    beforeEach(() => {
        apiGatewayMock = mockClient(ApiGatewayManagementApiClient);
        repository = new WebsocketConnectionRepository();
        jest.clearAllMocks();
        process.env = {
            ...originalEnv,
            WEBSOCKET_API_ENDPOINT: 'https://test.execute-api.us-east-1.amazonaws.com/dev'
        };
    });

    afterEach(() => {
        apiGatewayMock.reset();
        process.env = originalEnv;
    });

    describe('createConnection()', () => {
        it('should create websocket connection record', async () => {
            const mockConnection = { id: '1', connectionId: 'test-connection-123' };
            mockedPrisma.websocketConnection.create.mockResolvedValue(mockConnection);

            const result = await repository.createConnection('test-connection-123');

            expect(result).toEqual(mockConnection);
            expect(mockedPrisma.websocketConnection.create).toHaveBeenCalledWith({
                data: { connectionId: 'test-connection-123' },
            });
        });
    });

    describe('deleteConnection()', () => {
        it('should delete websocket connection', async () => {
            mockedPrisma.websocketConnection.delete.mockResolvedValue({});

            const result = await repository.deleteConnection('test-connection-123');

            expect(result).toEqual({ acknowledged: true, deletedCount: 1 });
            expect(mockedPrisma.websocketConnection.delete).toHaveBeenCalledWith({
                where: { connectionId: 'test-connection-123' },
            });
        });

        it('should handle connection not found', async () => {
            const error: any = new Error('Record not found');
            error.code = 'P2025';
            mockedPrisma.websocketConnection.delete.mockRejectedValue(error);

            const result = await repository.deleteConnection('nonexistent');

            expect(result).toEqual({ acknowledged: true, deletedCount: 0 });
        });
    });

    describe('getActiveConnections()', () => {
        it('should return empty array if no WEBSOCKET_API_ENDPOINT', async () => {
            delete process.env.WEBSOCKET_API_ENDPOINT;

            const result = await repository.getActiveConnections();

            expect(result).toEqual([]);
            expect(mockedPrisma.websocketConnection.findMany).not.toHaveBeenCalled();
        });

        it('should get active connections with send capability', async () => {
            mockedPrisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'conn-1' },
                { connectionId: 'conn-2' },
            ]);

            apiGatewayMock.on(PostToConnectionCommand).resolves({});

            const connections = await repository.getActiveConnections();

            expect(connections).toHaveLength(2);
            expect(connections[0].connectionId).toBe('conn-1');
            expect(connections[1].connectionId).toBe('conn-2');
            expect(typeof connections[0].send).toBe('function');
        });

        it('should send data through API Gateway Management API', async () => {
            mockedPrisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'conn-test' },
            ]);

            apiGatewayMock.on(PostToConnectionCommand).resolves({});

            const connections = await repository.getActiveConnections();
            await connections[0].send({ message: 'hello' });

            expect(apiGatewayMock.calls()).toHaveLength(1);

            const call = apiGatewayMock.call(0);
            expect(call.args[0].input).toMatchObject({
                ConnectionId: 'conn-test',
                Data: JSON.stringify({ message: 'hello' }),
            });
        });

        it('should delete stale connection on 410 error', async () => {
            mockedPrisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'stale-conn' },
            ]);

            const error: any = new Error('Gone');
            error.statusCode = 410;
            apiGatewayMock.on(PostToConnectionCommand).rejects(error);

            mockedPrisma.websocketConnection.deleteMany.mockResolvedValue({ count: 1 });

            const connections = await repository.getActiveConnections();
            await connections[0].send({ message: 'test' });

            expect(mockedPrisma.websocketConnection.deleteMany).toHaveBeenCalledWith({
                where: { connectionId: 'stale-conn' },
            });
        });

        it('should delete stale connection on 410 error (v3 metadata format)', async () => {
            mockedPrisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'stale-conn' },
            ]);

            const error: any = new Error('Gone');
            error.$metadata = { httpStatusCode: 410 };
            apiGatewayMock.on(PostToConnectionCommand).rejects(error);

            mockedPrisma.websocketConnection.deleteMany.mockResolvedValue({ count: 1 });

            const connections = await repository.getActiveConnections();
            await connections[0].send({ message: 'test' });

            expect(mockedPrisma.websocketConnection.deleteMany).toHaveBeenCalledWith({
                where: { connectionId: 'stale-conn' },
            });
        });

        it('should throw non-410 errors', async () => {
            mockedPrisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'conn-1' },
            ]);

            apiGatewayMock.on(PostToConnectionCommand).rejects(new Error('Network error'));

            const connections = await repository.getActiveConnections();

            await expect(connections[0].send({ message: 'test' })).rejects.toThrow('Network error');
        });
    });

    describe('findConnection()', () => {
        it('should find connection by connectionId', async () => {
            const mockConnection = { id: '1', connectionId: 'conn-123' };
            mockedPrisma.websocketConnection.findFirst.mockResolvedValue(mockConnection);

            const result = await repository.findConnection('conn-123');

            expect(result).toEqual(mockConnection);
            expect(mockedPrisma.websocketConnection.findFirst).toHaveBeenCalledWith({
                where: { connectionId: 'conn-123' },
            });
        });

        it('should return null if not found', async () => {
            mockedPrisma.websocketConnection.findFirst.mockResolvedValue(null);

            const result = await repository.findConnection('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('getAllConnections()', () => {
        it('should get all connections', async () => {
            const mockConnections = [
                { id: '1', connectionId: 'conn-1' },
                { id: '2', connectionId: 'conn-2' },
            ];
            mockedPrisma.websocketConnection.findMany.mockResolvedValue(mockConnections);

            const result = await repository.getAllConnections();

            expect(result).toEqual(mockConnections);
        });
    });

    describe('deleteAllConnections()', () => {
        it('should delete all connections', async () => {
            mockedPrisma.websocketConnection.deleteMany.mockResolvedValue({ count: 5 });

            const result = await repository.deleteAllConnections();

            expect(result).toEqual({ acknowledged: true, deletedCount: 5 });
        });
    });
});
