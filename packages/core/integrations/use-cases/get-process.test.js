/**
 * GetProcess Use Case Tests
 * 
 * Tests process retrieval with error handling.
 */

const { GetProcess } = require('./get-process');

/**
 * @group unit
 * @group application
 */
describe('GetProcess', () => {
    let getProcessUseCase;
    let mockProcessRepository;

    beforeEach(() => {
        mockProcessRepository = {
            findById: jest.fn(),
        };
        getProcessUseCase = new GetProcess({
            processRepository: mockProcessRepository,
        });
    });

    describe('constructor', () => {
        it('should require processRepository', () => {
            expect(() => new GetProcess({})).toThrow('processRepository is required');
        });

        it('should initialize with processRepository', () => {
            expect(getProcessUseCase.processRepository).toBe(mockProcessRepository);
        });
    });

    describe('execute', () => {
        const processId = 'process-123';
        const mockProcess = {
            id: processId,
            userId: 'user-456',
            integrationId: 'integration-789',
            name: 'test-sync',
            type: 'CRM_SYNC',
            state: 'PROCESSING_BATCHES',
            context: {
                syncType: 'INITIAL',
                totalRecords: 1000,
                processedRecords: 500,
            },
            results: {
                aggregateData: {
                    totalSynced: 480,
                    totalFailed: 20,
                    duration: 120000,
                    recordsPerSecond: 4.17,
                },
            },
            createdAt: new Date('2024-01-01T10:00:00Z'),
            updatedAt: new Date('2024-01-01T10:02:00Z'),
        };

        it('should retrieve a process by ID', async () => {
            mockProcessRepository.findById.mockResolvedValue(mockProcess);

            const result = await getProcessUseCase.execute(processId);

            expect(mockProcessRepository.findById).toHaveBeenCalledWith(processId);
            expect(result).toEqual(mockProcess);
        });

        it('should return null if process not found', async () => {
            mockProcessRepository.findById.mockResolvedValue(null);

            const result = await getProcessUseCase.execute(processId);

            expect(mockProcessRepository.findById).toHaveBeenCalledWith(processId);
            expect(result).toBeNull();
        });

        it('should throw error if processId is missing', async () => {
            await expect(getProcessUseCase.execute(''))
                .rejects.toThrow('processId must be a non-empty string');
        });

        it('should throw error if processId is not a string', async () => {
            await expect(getProcessUseCase.execute(123))
                .rejects.toThrow('processId must be a non-empty string');
        });

        it('should handle repository errors', async () => {
            const repositoryError = new Error('Database connection failed');
            mockProcessRepository.findById.mockRejectedValue(repositoryError);

            await expect(getProcessUseCase.execute(processId))
                .rejects.toThrow('Failed to retrieve process: Database connection failed');
        });
    });

    describe('executeOrThrow', () => {
        const processId = 'process-123';
        const mockProcess = {
            id: processId,
            userId: 'user-456',
            integrationId: 'integration-789',
            name: 'test-sync',
            type: 'CRM_SYNC',
            state: 'COMPLETED',
        };

        it('should return process if found', async () => {
            mockProcessRepository.findById.mockResolvedValue(mockProcess);

            const result = await getProcessUseCase.executeOrThrow(processId);

            expect(result).toEqual(mockProcess);
        });

        it('should throw error if process not found', async () => {
            mockProcessRepository.findById.mockResolvedValue(null);

            await expect(getProcessUseCase.executeOrThrow(processId))
                .rejects.toThrow('Process not found: process-123');
        });

        it('should propagate repository errors', async () => {
            const repositoryError = new Error('Database connection failed');
            mockProcessRepository.findById.mockRejectedValue(repositoryError);

            await expect(getProcessUseCase.executeOrThrow(processId))
                .rejects.toThrow('Failed to retrieve process: Database connection failed');
        });
    });

    describe('executeMany', () => {
        const processIds = ['process-1', 'process-2', 'process-3'];
        const mockProcesses = [
            { id: 'process-1', name: 'sync-1', state: 'COMPLETED' },
            { id: 'process-2', name: 'sync-2', state: 'PROCESSING' },
            // process-3 will not be found
        ];

        it('should retrieve multiple processes', async () => {
            mockProcessRepository.findById
                .mockResolvedValueOnce(mockProcesses[0])  // process-1 found
                .mockResolvedValueOnce(mockProcesses[1])  // process-2 found
                .mockResolvedValueOnce(null);             // process-3 not found

            const result = await getProcessUseCase.executeMany(processIds);

            expect(mockProcessRepository.findById).toHaveBeenCalledTimes(3);
            expect(mockProcessRepository.findById).toHaveBeenCalledWith('process-1');
            expect(mockProcessRepository.findById).toHaveBeenCalledWith('process-2');
            expect(mockProcessRepository.findById).toHaveBeenCalledWith('process-3');
            
            // Should return only found processes
            expect(result).toEqual([mockProcesses[0], mockProcesses[1]]);
        });

        it('should return empty array if no processes found', async () => {
            mockProcessRepository.findById
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null);

            const result = await getProcessUseCase.executeMany(processIds);

            expect(result).toEqual([]);
        });

        it('should throw error if processIds is not an array', async () => {
            await expect(getProcessUseCase.executeMany('not-an-array'))
                .rejects.toThrow('processIds must be an array');
        });

        it('should handle mixed success and failure', async () => {
            const repositoryError = new Error('Database error');
            mockProcessRepository.findById
                .mockResolvedValueOnce(mockProcesses[0])  // process-1 found
                .mockRejectedValueOnce(repositoryError)   // process-2 error
                .mockResolvedValueOnce(null);             // process-3 not found

            // Should propagate the repository error
            await expect(getProcessUseCase.executeMany(processIds))
                .rejects.toThrow('Failed to retrieve process: Database error');
        });

        it('should handle empty array', async () => {
            const result = await getProcessUseCase.executeMany([]);

            expect(mockProcessRepository.findById).not.toHaveBeenCalled();
            expect(result).toEqual([]);
        });
    });
});
