const { HealthCheckRepositoryPostgreSQL } = require('./health-check-repository-postgres');

describe('HealthCheckRepositoryPostgreSQL', () => {
    let repository;
    let mockPrismaClient;

    beforeEach(() => {
        mockPrismaClient = {
            $queryRaw: jest.fn(),
        };
        
        repository = new HealthCheckRepositoryPostgreSQL({ 
            prismaClient: mockPrismaClient 
        });
    });

    describe('getDatabaseConnectionState()', () => {
        it('should return connected state when query succeeds', async () => {
            mockPrismaClient.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 1,
                stateName: 'connected',
                isConnected: true,
            });
            expect(mockPrismaClient.$queryRaw).toHaveBeenCalled();
        });

        it('should return disconnected state when query fails', async () => {
            mockPrismaClient.$queryRaw.mockRejectedValue(new Error('Connection failed'));

            const result = await repository.getDatabaseConnectionState();

            expect(result).toEqual({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });
        });

        it('should return disconnected state when database is unreachable', async () => {
            mockPrismaClient.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await repository.getDatabaseConnectionState();

            expect(result.isConnected).toBe(false);
            expect(result.stateName).toBe('disconnected');
        });

        it('should return disconnected state on authentication error', async () => {
            mockPrismaClient.$queryRaw.mockRejectedValue(new Error('Authentication failed'));

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
            mockPrismaClient.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

            const responseTime = await repository.pingDatabase(2000);

            expect(typeof responseTime).toBe('number');
            expect(responseTime).toBeGreaterThanOrEqual(0);
            expect(mockPrismaClient.$queryRaw).toHaveBeenCalled();
        });

        it('should throw error when ping fails', async () => {
            const error = new Error('Database unreachable');
            mockPrismaClient.$queryRaw.mockRejectedValue(error);

            await expect(repository.pingDatabase(2000)).rejects.toThrow('Database unreachable');
        });

        it('should measure actual response time', async () => {
            // Control the clock instead of sleeping: a 30 ms setTimeout can
            // measure as 29 ms with Date.now(), which made this flaky.
            const nowSpy = jest
                .spyOn(Date, 'now')
                .mockReturnValueOnce(1_000)
                .mockReturnValueOnce(1_030);
            mockPrismaClient.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

            try {
                const responseTime = await repository.pingDatabase(2000);
                expect(responseTime).toBe(30);
            } finally {
                nowSpy.mockRestore();
            }
        });
    });
});

