/**
 * Tests for WebSocket Connection Repository - Provider-Agnostic
 *
 * Tests WebSocket operations using a mock WebSocketMessageSenderInterface.
 * No AWS SDK dependency — the message sender is injected via constructor.
 */

const {
    WebsocketConnectionRepository,
} = require('./websocket-connection-repository');
const {
    StaleConnectionError,
} = require('../websocket-message-sender-interface');

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

describe('WebsocketConnectionRepository', () => {
    let mockMessageSender;
    let repository;
    const originalEnv = process.env;

    beforeEach(() => {
        mockMessageSender = {
            send: jest.fn().mockResolvedValue(undefined),
        };
        repository = new WebsocketConnectionRepository(
            prisma,
            mockMessageSender
        );
        jest.clearAllMocks();
        process.env = {
            ...originalEnv,
            WEBSOCKET_API_ENDPOINT:
                'https://test.execute-api.us-east-1.amazonaws.com/dev',
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('createConnection()', () => {
        it('should create websocket connection record', async () => {
            const mockConnection = {
                id: '1',
                connectionId: 'test-connection-123',
            };
            prisma.websocketConnection.create.mockResolvedValue(mockConnection);

            const result = await repository.createConnection(
                'test-connection-123'
            );

            expect(result).toEqual(mockConnection);
            expect(prisma.websocketConnection.create).toHaveBeenCalledWith({
                data: { connectionId: 'test-connection-123' },
            });
        });
    });

    describe('deleteConnection()', () => {
        it('should delete websocket connection', async () => {
            prisma.websocketConnection.delete.mockResolvedValue({});

            const result = await repository.deleteConnection(
                'test-connection-123'
            );

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

        it('should throw if no messageSender is provided', async () => {
            const repoNoSender = new WebsocketConnectionRepository(prisma);
            prisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'conn-1' },
            ]);

            await expect(
                repoNoSender.getActiveConnections()
            ).rejects.toThrow('requires a messageSender');
        });

        it('should get active connections with send capability', async () => {
            prisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'conn-1' },
                { connectionId: 'conn-2' },
            ]);

            const connections = await repository.getActiveConnections();

            expect(connections).toHaveLength(2);
            expect(connections[0].connectionId).toBe('conn-1');
            expect(connections[1].connectionId).toBe('conn-2');
            expect(typeof connections[0].send).toBe('function');
        });

        it('should send data through injected message sender', async () => {
            prisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'conn-test' },
            ]);

            const connections = await repository.getActiveConnections();
            await connections[0].send({ message: 'hello' });

            expect(mockMessageSender.send).toHaveBeenCalledWith(
                'conn-test',
                { message: 'hello' },
                'https://test.execute-api.us-east-1.amazonaws.com/dev'
            );
        });

        it('should delete stale connection on StaleConnectionError', async () => {
            prisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'stale-conn' },
            ]);

            mockMessageSender.send.mockRejectedValue(
                new StaleConnectionError('stale-conn')
            );

            prisma.websocketConnection.deleteMany.mockResolvedValue({
                count: 1,
            });

            const connections = await repository.getActiveConnections();
            await connections[0].send({ message: 'test' });

            expect(prisma.websocketConnection.deleteMany).toHaveBeenCalledWith({
                where: { connectionId: 'stale-conn' },
            });
        });

        it('should throw non-StaleConnectionError errors', async () => {
            prisma.websocketConnection.findMany.mockResolvedValue([
                { connectionId: 'conn-1' },
            ]);

            mockMessageSender.send.mockRejectedValue(
                new Error('Network error')
            );

            const connections = await repository.getActiveConnections();

            await expect(
                connections[0].send({ message: 'test' })
            ).rejects.toThrow('Network error');
        });
    });

    describe('findConnection()', () => {
        it('should find connection by connectionId', async () => {
            const mockConnection = { id: '1', connectionId: 'conn-123' };
            prisma.websocketConnection.findFirst.mockResolvedValue(
                mockConnection
            );

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
            prisma.websocketConnection.findMany.mockResolvedValue(
                mockConnections
            );

            const result = await repository.getAllConnections();

            expect(result).toEqual(mockConnections);
        });
    });

    describe('deleteAllConnections()', () => {
        it('should delete all connections', async () => {
            prisma.websocketConnection.deleteMany.mockResolvedValue({
                count: 5,
            });

            const result = await repository.deleteAllConnections();

            expect(result).toEqual({ acknowledged: true, deletedCount: 5 });
        });
    });
});
