const { CheckDatabaseHealthUseCase } = require('./check-database-health-use-case');

/**
 * @group unit
 * @group application
 */
describe('CheckDatabaseHealthUseCase', () => {
    let useCase;
    let mockRepository;

    beforeEach(() => {
        mockRepository = {
            getDatabaseConnectionState: jest.fn(),
            pingDatabase: jest.fn(),
        };
        useCase = new CheckDatabaseHealthUseCase({ 
            healthCheckRepository: mockRepository 
        });
    });

    describe('execute()', () => {
        it('should return healthy status when database is connected', async () => {
            mockRepository.getDatabaseConnectionState.mockResolvedValue({
                readyState: 1,
                stateName: 'connected',
                isConnected: true,
            });
            mockRepository.pingDatabase.mockResolvedValue(5);

            const result = await useCase.execute();

            expect(result).toEqual({
                status: 'healthy',
                state: 'connected',
                responseTime: 5,
            });
            expect(mockRepository.getDatabaseConnectionState).toHaveBeenCalled();
            expect(mockRepository.pingDatabase).toHaveBeenCalledWith(2000);
        });

        it('should return unhealthy status when database is disconnected', async () => {
            mockRepository.getDatabaseConnectionState.mockResolvedValue({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });

            const result = await useCase.execute();

            expect(result).toEqual({
                status: 'unhealthy',
                state: 'disconnected',
            });
            expect(mockRepository.getDatabaseConnectionState).toHaveBeenCalled();
            expect(mockRepository.pingDatabase).not.toHaveBeenCalled();
        });

        it('should return unhealthy status when database is connecting', async () => {
            mockRepository.getDatabaseConnectionState.mockResolvedValue({
                readyState: 2,
                stateName: 'connecting',
                isConnected: false,
            });

            const result = await useCase.execute();

            expect(result).toEqual({
                status: 'unhealthy',
                state: 'connecting',
            });
            expect(mockRepository.pingDatabase).not.toHaveBeenCalled();
        });

        it('should return unhealthy status when database is disconnecting', async () => {
            mockRepository.getDatabaseConnectionState.mockResolvedValue({
                readyState: 3,
                stateName: 'disconnecting',
                isConnected: false,
            });

            const result = await useCase.execute();

            expect(result).toEqual({
                status: 'unhealthy',
                state: 'disconnecting',
            });
        });

        it('should not include responseTime when database is unhealthy', async () => {
            mockRepository.getDatabaseConnectionState.mockResolvedValue({
                readyState: 0,
                stateName: 'disconnected',
                isConnected: false,
            });

            const result = await useCase.execute();

            expect(result.responseTime).toBeUndefined();
        });

        it('should handle connection state check errors gracefully', async () => {
            mockRepository.getDatabaseConnectionState.mockRejectedValue(
                new Error('Failed to check connection')
            );

            await expect(useCase.execute()).rejects.toThrow('Failed to check connection');
        });

        it('should handle ping errors when database appears connected', async () => {
            mockRepository.getDatabaseConnectionState.mockResolvedValue({
                readyState: 1,
                stateName: 'connected',
                isConnected: true,
            });
            mockRepository.pingDatabase.mockRejectedValue(
                new Error('Ping timeout')
            );

            await expect(useCase.execute()).rejects.toThrow('Ping timeout');
        });

        it('should pass timeout parameter to pingDatabase', async () => {
            mockRepository.getDatabaseConnectionState.mockResolvedValue({
                readyState: 1,
                stateName: 'connected',
                isConnected: true,
            });
            mockRepository.pingDatabase.mockResolvedValue(10);

            await useCase.execute();

            expect(mockRepository.pingDatabase).toHaveBeenCalledWith(2000);
        });
    });
});

