const { HealthCheckRepositoryMongoDB } = require('./health-check-repository-mongodb');

describe('HealthCheckRepositoryMongoDB', () => {
    let repository;
    let mockPrismaClient;

    beforeEach(() => {
        mockPrismaClient = {
            $runCommandRaw: jest.fn(),
        };
        
        repository = new HealthCheckRepositoryMongoDB({ 
            prismaClient: mockPrismaClient 
        });
    });

    describe('getDatabaseConnectionState()', () => {
        it('should return connected state when ping succeeds', async () => {
            mockPrismaClient.$runCommandRaw.mockResolvedValue({ ok: 1 });

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 1,
                stateName: 'connected',
                isConnected: true,
            });
            expect(mockPrismaClient.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
        });

        it('should return disconnected state when ping fails', async () => {
            mockPrismaClient.$runCommandRaw.mockRejectedValue(new Error('Connection failed'));

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });
            expect(mockPrismaClient.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
        });

        it('should return disconnected state when ping throws network error', async () => {
            mockPrismaClient.$runCommandRaw.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });
        });

        it('should return disconnected state when ping times out', async () => {
            mockPrismaClient.$runCommandRaw.mockRejectedValue(new Error('Timeout'));

            const result = await repository.getDatabaseConnectionState();

            expect(result.isConnected).toBe(false);
            expect(result.stateName).toBe('disconnected');
        });
    });

    describe('pingDatabase()', () => {
        it('should return response time when ping succeeds', async () => {
            mockPrismaClient.$runCommandRaw.mockResolvedValue({ ok: 1 });

            const responseTime = await repository.pingDatabase(2000);

            expect(typeof responseTime).toBe('number');
            expect(responseTime).toBeGreaterThanOrEqual(0);
            expect(mockPrismaClient.$runCommandRaw).toHaveBeenCalledWith({ ping: 1 });
        });

        it('should throw error when ping fails', async () => {
            const error = new Error('Database unreachable');
            mockPrismaClient.$runCommandRaw.mockRejectedValue(error);

            await expect(repository.pingDatabase(2000)).rejects.toThrow('Database unreachable');
        });

        it('should measure actual response time', async () => {
            mockPrismaClient.$runCommandRaw.mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve({ ok: 1 }), 50))
            );

            const responseTime = await repository.pingDatabase(2000);

            expect(responseTime).toBeGreaterThanOrEqual(50);
            expect(responseTime).toBeLessThan(200);
        });
    });
});

