/**
 * Tests for HealthCheckRepositoryMongoDB
 * 
 * Tests database connection state detection and ping functionality
 */

const { HealthCheckRepositoryMongoDB } = require('./health-check-repository-mongodb');

// Mock the prisma module
jest.mock('../prisma', () => ({
    prisma: {
        $runCommandRaw: jest.fn(),
        $queryRaw: jest.fn(),
    },
}));

const { prisma } = require('../prisma');

describe('HealthCheckRepositoryMongoDB', () => {
    let repository;

    beforeEach(() => {
        repository = new HealthCheckRepositoryMongoDB();
        jest.clearAllMocks();
    });

    describe('getDatabaseConnectionState()', () => {
        it('should return connected state when ping succeeds', async () => {
            prisma.$runCommandRaw.mockResolvedValue({ ok: 1 });

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 1,
                stateName: 'connected',
                isConnected: true,
            });
            expect(prisma.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
        });

        it('should return disconnected state when ping fails', async () => {
            prisma.$runCommandRaw.mockRejectedValue(new Error('Connection failed'));

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });
            expect(prisma.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
        });

        it('should return disconnected state when ping throws network error', async () => {
            prisma.$runCommandRaw.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });
        });

        it('should return disconnected state when ping times out', async () => {
            prisma.$runCommandRaw.mockRejectedValue(new Error('Timeout'));

            const result = await repository.getDatabaseConnectionState();

            expect(result.isConnected).toBe(false);
            expect(result.stateName).toBe('disconnected');
        });
    });

    describe('pingDatabase()', () => {
        it('should return response time when ping succeeds', async () => {
            // MongoDB ping uses $queryRaw which fails, then falls back to $runCommandRaw
            prisma.$queryRaw.mockRejectedValue(new Error('Not MongoDB'));
            prisma.$runCommandRaw.mockResolvedValue({ ok: 1 });

            const responseTime = await repository.pingDatabase(2000);

            expect(typeof responseTime).toBe('number');
            expect(responseTime).toBeGreaterThanOrEqual(0);
            expect(prisma.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
        });

        it('should throw error when ping fails', async () => {
            const error = new Error('Database unreachable');
            prisma.$queryRaw.mockRejectedValue(new Error('Not MongoDB'));
            prisma.$runCommandRaw.mockRejectedValue(error);

            await expect(repository.pingDatabase(2000)).rejects.toThrow('Database unreachable');
        });

        it('should measure actual response time', async () => {
            prisma.$queryRaw.mockRejectedValue(new Error('Not MongoDB'));
            prisma.$runCommandRaw.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve({ ok: 1 }), 50))
            );

            const responseTime = await repository.pingDatabase(2000);

            expect(responseTime).toBeGreaterThanOrEqual(50);
            expect(responseTime).toBeLessThan(200); // Allow some buffer
        });
    });
});

