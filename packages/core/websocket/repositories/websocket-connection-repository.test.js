/**
 * Tests for WebSocket Connection Repository - AWS SDK v3 Migration
 * 
 * Tests API Gateway Management API operations using aws-sdk-client-mock
 */

const { mockClient } = require('aws-sdk-client-mock');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { WebsocketConnectionRepository } = require('./websocket-connection-repository');

// Mock Prisma
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

const { prisma } = require('../../database/prisma');

/**
 * @group unit
 * @group infrastructure
 */
describe('WebsocketConnectionRepository - AWS SDK v3', () => {
    let apiGatewayMock;
    let repository;
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
            prisma.websocketConnection.create.mockResolvedValue(mockConnection);

            const result = await repository.createConnection('test-connection-123');

            expect(result).toEqual(mockConnection);
            expect(prisma.websocketConnection.create).toHaveBeenCalledWith({
                data: { connectionId: 'test-connection-123' },
            });
        });
    });

    describe('deleteConnection()', () => {
        it('should delete websocket connection', async () => {
            prisma.websocketConnection.delete.mockResolvedValue({});

            const result = await repository.deleteConnection('test-connection-123');

            expect(result).toEqual({ acknowledged: true, deletedCount: 1 });
            expect(prisma.websocketConnection.delete).toHaveBeenCalledWith({
                where: { connectionId: 'test-connection-123' },
            });
        });

        it('should handle connection not found', async () => {
            const error = new Error('Record not found');
            error.code = 'P2025';
            prisma.websocketConnection.delete.mockRejectedValue(error);

            const result = await repository.deleteConnection('nonexistent');

            expect(result).toEqual({ acknowledged: true, deletedCount: 0 });
        });
    });

    describe('getActiveConnections()', () => {
        it('should return empty array if no WEBSOCKET_API_ENDPOINT', async () => {
            delete process.env.WEBSOCKET_API_ENDPOINT;

            const result = await repository.getActiveConnections();

            expect(result).toEqual([]);
            expect(prisma.websocketConnection.findMany).not.toHaveBeenCalled();
        });

        it('should get active connections with send capability', async () => {
            prisma.websocketConnection.findMany.mockResolvedValue([
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
            prisma.websocketConnection.findMany.mockResolvedValue([
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
            prisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'stale-conn' },
            ]);

            const error = new Error('Gone');
            error.statusCode = 410;
            apiGatewayMock.on(PostToConnectionCommand).rejects(error);

            prisma.websocketConnection.deleteMany.mockResolvedValue({ count: 1 });

            const connections = await repository.getActiveConnections();
            await connections[0].send({ message: 'test' });

            // Should have called deleteMany to remove stale connection
            expect(prisma.websocketConnection.deleteMany).toHaveBeenCalledWith({
                where: { connectionId: 'stale-conn' },
            });
        });

        it('should delete stale connection on 410 error (v3 metadata format)', async () => {
            prisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'stale-conn' },
            ]);

            const error = new Error('Gone');
            error.$metadata = { httpStatusCode: 410 };
            apiGatewayMock.on(PostToConnectionCommand).rejects(error);

            prisma.websocketConnection.deleteMany.mockResolvedValue({ count: 1 });

            const connections = await repository.getActiveConnections();
            await connections[0].send({ message: 'test' });

            expect(prisma.websocketConnection.deleteMany).toHaveBeenCalledWith({
                where: { connectionId: 'stale-conn' },
            });
        });

        it('should throw non-410 errors', async () => {
            prisma.websocketConnection.findMany.mockResolvedValue([
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
            prisma.websocketConnection.findFirst.mockResolvedValue(mockConnection);

            const result = await repository.findConnection('conn-123');

            expect(result).toEqual(mockConnection);
            expect(prisma.websocketConnection.findFirst).toHaveBeenCalledWith({
                where: { connectionId: 'conn-123' },
            });
        });

        it('should return null if not found', async () => {
            prisma.websocketConnection.findFirst.mockResolvedValue(null);

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
            prisma.websocketConnection.findMany.mockResolvedValue(mockConnections);

            const result = await repository.getAllConnections();

            expect(result).toEqual(mockConnections);
        });
    });

    describe('deleteAllConnections()', () => {
        it('should delete all connections', async () => {
            prisma.websocketConnection.deleteMany.mockResolvedValue({ count: 5 });

            const result = await repository.deleteAllConnections();

            expect(result).toEqual({ acknowledged: true, deletedCount: 5 });
        });
    });
});

