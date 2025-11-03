/**
 * Tests for HealthCheckRepositoryPostgreSQL
 * 
 * Tests database connection state detection and ping functionality
 */

const { HealthCheckRepositoryPostgreSQL } = require('./health-check-repository-postgres');

// Mock the prisma module
jest.mock('../prisma', () => ({
    prisma: {
        $queryRaw: jest.fn(),
    },
}));

const { prisma } = require('../prisma');

describe('HealthCheckRepositoryPostgreSQL', () => {
    let repository;

    beforeEach(() => {
        repository = new HealthCheckRepositoryPostgreSQL();
        jest.clearAllMocks();
    });

    describe('getDatabaseConnectionState()', () => {
        it('should return connected state when query succeeds', async () => {
            prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 1,
                stateName: 'connected',
                isConnected: true,
            });
            expect(prisma.$queryRaw).toHaveBeenCalled();
        });

        it('should return disconnected state when query fails', async () => {
            prisma.$queryRaw.mockRejectedValue(new Error('Connection failed'));

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });
        });

        it('should return disconnected state when database is unreachable', async () => {
            prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await repository.getDatabaseConnectionState();

            expect(result.isConnected).toBe(false);
            expect(result.stateName).toBe('disconnected');
        });

        it('should return disconnected state on authentication error', async () => {
            prisma.$queryRaw.mockRejectedValue(new Error('Authentication failed'));

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });
        });
    });

    describe('pingDatabase()', () => {
        it('should return response time when ping succeeds', async () => {
            prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

            const responseTime = await repository.pingDatabase(2000);

            expect(typeof responseTime).toBe('number');
            expect(responseTime).toBeGreaterThanOrEqual(0);
            expect(prisma.$queryRaw).toHaveBeenCalled();
        });

        it('should throw error when ping fails', async () => {
            const error = new Error('Database unreachable');
            prisma.$queryRaw.mockRejectedValue(error);

            await expect(repository.pingDatabase(2000)).rejects.toThrow('Database unreachable');
        });

        it('should measure actual response time', async () => {
            prisma.$queryRaw.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve([{ '?column?': 1 }]), 30))
            );

            const responseTime = await repository.pingDatabase(2000);

            expect(responseTime).toBeGreaterThanOrEqual(30);
            expect(responseTime).toBeLessThan(150); // Allow some buffer
        });
    });
});

