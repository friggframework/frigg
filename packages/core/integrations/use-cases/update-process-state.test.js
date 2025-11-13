/**
 * UpdateProcessState Use Case Tests
 * 
 * Tests state transitions and context updates.
 */

const { UpdateProcessState } = require('./update-process-state');

/**
 * @group unit
 * @group application
 */
describe('UpdateProcessState', () => {
    let updateProcessStateUseCase;
    let mockProcessRepository;

    beforeEach(() => {
        mockProcessRepository = {
            findById: jest.fn(),
            update: jest.fn(),
        };
        updateProcessStateUseCase = new UpdateProcessState({
            processRepository: mockProcessRepository,
        });
    });

    describe('constructor', () => {
        it('should require processRepository', () => {
            expect(() => new UpdateProcessState({})).toThrow('processRepository is required');
        });

        it('should initialize with processRepository', () => {
            expect(updateProcessStateUseCase.processRepository).toBe(mockProcessRepository);
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
            state: 'INITIALIZING',
            context: {
                syncType: 'INITIAL',
                totalRecords: 100,
                processedRecords: 0,
            },
            results: {
                aggregateData: {
                    totalSynced: 0,
                    totalFailed: 0,
                },
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        it('should update process state only', async () => {
            const updatedProcess = { ...mockProcess, state: 'FETCHING_TOTAL' };
            mockProcessRepository.findById.mockResolvedValue(mockProcess);
            mockProcessRepository.update.mockResolvedValue(updatedProcess);

            const result = await updateProcessStateUseCase.execute(processId, 'FETCHING_TOTAL');

            expect(mockProcessRepository.findById).toHaveBeenCalledWith(processId);
            expect(mockProcessRepository.update).toHaveBeenCalledWith(processId, {
                state: 'FETCHING_TOTAL',
            });
            expect(result).toEqual(updatedProcess);
        });

        it('should update process state with context updates', async () => {
            const contextUpdates = {
                currentPage: 5,
                pagination: { pageSize: 100, hasMore: true },
            };
            const expectedContext = {
                ...mockProcess.context,
                ...contextUpdates,
            };
            const updatedProcess = {
                ...mockProcess,
                state: 'PROCESSING_BATCHES',
                context: expectedContext,
            };
            mockProcessRepository.findById.mockResolvedValue(mockProcess);
            mockProcessRepository.update.mockResolvedValue(updatedProcess);

            const result = await updateProcessStateUseCase.execute(
                processId,
                'PROCESSING_BATCHES',
                contextUpdates
            );

            expect(mockProcessRepository.update).toHaveBeenCalledWith(processId, {
                state: 'PROCESSING_BATCHES',
                context: expectedContext,
            });
            expect(result).toEqual(updatedProcess);
        });

        it('should merge context updates with existing context', async () => {
            const contextUpdates = {
                currentPage: 3,
                // Should preserve existing context fields
            };
            const expectedContext = {
                syncType: 'INITIAL',
                totalRecords: 100,
                processedRecords: 0,
                currentPage: 3,
            };
            const updatedProcess = {
                ...mockProcess,
                state: 'QUEUING_PAGES',
                context: expectedContext,
            };
            mockProcessRepository.findById.mockResolvedValue(mockProcess);
            mockProcessRepository.update.mockResolvedValue(updatedProcess);

            const result = await updateProcessStateUseCase.execute(
                processId,
                'QUEUING_PAGES',
                contextUpdates
            );

            expect(mockProcessRepository.update).toHaveBeenCalledWith(processId, {
                state: 'QUEUING_PAGES',
                context: expectedContext,
            });
            expect(result).toEqual(updatedProcess);
        });

        it('should handle process with empty context', async () => {
            const processWithEmptyContext = { ...mockProcess, context: {} };
            const contextUpdates = { newField: 'value' };
            const expectedContext = { newField: 'value' };
            const updatedProcess = {
                ...processWithEmptyContext,
                state: 'COMPLETED',
                context: expectedContext,
            };
            mockProcessRepository.findById.mockResolvedValue(processWithEmptyContext);
            mockProcessRepository.update.mockResolvedValue(updatedProcess);

            const result = await updateProcessStateUseCase.execute(
                processId,
                'COMPLETED',
                contextUpdates
            );

            expect(mockProcessRepository.update).toHaveBeenCalledWith(processId, {
                state: 'COMPLETED',
                context: expectedContext,
            });
            expect(result).toEqual(updatedProcess);
        });

        it('should throw error if processId is missing', async () => {
            await expect(updateProcessStateUseCase.execute('', 'NEW_STATE'))
                .rejects.toThrow('processId must be a non-empty string');
        });

        it('should throw error if processId is not a string', async () => {
            await expect(updateProcessStateUseCase.execute(123, 'NEW_STATE'))
                .rejects.toThrow('processId must be a non-empty string');
        });

        it('should throw error if newState is missing', async () => {
            await expect(updateProcessStateUseCase.execute(processId, ''))
                .rejects.toThrow('newState must be a non-empty string');
        });

        it('should throw error if newState is not a string', async () => {
            await expect(updateProcessStateUseCase.execute(processId, 123))
                .rejects.toThrow('newState must be a non-empty string');
        });

        it('should throw error if contextUpdates is not an object', async () => {
            await expect(updateProcessStateUseCase.execute(processId, 'NEW_STATE', 'invalid'))
                .rejects.toThrow('contextUpdates must be an object');
        });

        it('should throw error if process not found', async () => {
            mockProcessRepository.findById.mockResolvedValue(null);

            await expect(updateProcessStateUseCase.execute(processId, 'NEW_STATE'))
                .rejects.toThrow('Process not found: process-123');
        });

        it('should handle repository errors during findById', async () => {
            const findError = new Error('Database connection failed');
            mockProcessRepository.findById.mockRejectedValue(findError);

            await expect(updateProcessStateUseCase.execute(processId, 'NEW_STATE'))
                .rejects.toThrow('Failed to update process state: Database connection failed');
        });

        it('should handle repository errors during update', async () => {
            const updateError = new Error('Update failed');
            mockProcessRepository.findById.mockResolvedValue(mockProcess);
            mockProcessRepository.update.mockRejectedValue(updateError);

            await expect(updateProcessStateUseCase.execute(processId, 'NEW_STATE'))
                .rejects.toThrow('Failed to update process state: Update failed');
        });
    });

    describe('updateStateOnly', () => {
        it('should call execute with empty context updates', async () => {
            const processId = 'process-123';
            const newState = 'COMPLETED';
            const updatedProcess = { id: processId, state: newState };
            
            jest.spyOn(updateProcessStateUseCase, 'execute').mockResolvedValue(updatedProcess);

            const result = await updateProcessStateUseCase.updateStateOnly(processId, newState);

            expect(updateProcessStateUseCase.execute).toHaveBeenCalledWith(processId, newState, {});
            expect(result).toEqual(updatedProcess);
        });
    });

    describe('updateContextOnly', () => {
        const processId = 'process-123';
        const mockProcess = {
            id: processId,
            state: 'PROCESSING_BATCHES',
            context: { existingField: 'value' },
        };

        it('should update context without changing state', async () => {
            const contextUpdates = { newField: 'newValue' };
            const expectedContext = { existingField: 'value', newField: 'newValue' };
            const updatedProcess = {
                ...mockProcess,
                context: expectedContext,
            };
            mockProcessRepository.findById.mockResolvedValue(mockProcess);
            mockProcessRepository.update.mockResolvedValue(updatedProcess);

            const result = await updateProcessStateUseCase.updateContextOnly(processId, contextUpdates);

            expect(mockProcessRepository.update).toHaveBeenCalledWith(processId, {
                context: expectedContext,
            });
            expect(result).toEqual(updatedProcess);
        });

        it('should throw error if process not found', async () => {
            mockProcessRepository.findById.mockResolvedValue(null);

            await expect(updateProcessStateUseCase.updateContextOnly(processId, {}))
                .rejects.toThrow('Process not found: process-123');
        });
    });
});
