import { UpdateProcessMetrics } from './update-process-metrics';

describe('UpdateProcessMetrics', () => {
    let updateProcessMetricsUseCase: InstanceType<typeof UpdateProcessMetrics>;
    let mockProcessRepository: any;
    let mockWebsocketService: any;

    beforeEach(() => {
        mockProcessRepository = {
            findById: jest.fn(),
            update: jest.fn(),
        };
        mockWebsocketService = {
            broadcast: jest.fn(),
        };
        updateProcessMetricsUseCase = new UpdateProcessMetrics({
            processRepository: mockProcessRepository,
            websocketService: mockWebsocketService,
        });
    });

    describe('constructor', () => {
        it('should require processRepository', () => {
            expect(() => new UpdateProcessMetrics({} as any)).toThrow('processRepository is required');
        });

        it('should initialize with processRepository and optional websocketService', () => {
            expect((updateProcessMetricsUseCase as any).processRepository).toBe(mockProcessRepository);
            expect((updateProcessMetricsUseCase as any).websocketService).toBe(mockWebsocketService);
        });

        it('should work without websocketService', () => {
            const useCase = new UpdateProcessMetrics({
                processRepository: mockProcessRepository,
            });
            expect((useCase as any).websocketService).toBeUndefined();
        });
    });

    describe('execute', () => {
        const processId = 'process-123';
        const baseTime = new Date('2024-01-01T10:00:00Z');

        let mockProcess: any;

        beforeEach(() => {
            mockProcess = {
                id: processId,
                userId: 'user-456',
                integrationId: 'integration-789',
                name: 'test-sync',
                type: 'CRM_SYNC',
                state: 'PROCESSING_BATCHES',
                context: {
                    syncType: 'INITIAL',
                    totalRecords: 1000,
                    processedRecords: 100,
                    startTime: baseTime.toISOString(),
                },
                results: {
                    aggregateData: {
                        totalSynced: 95,
                        totalFailed: 5,
                        duration: 30000,
                        recordsPerSecond: 3.33,
                        errors: [
                            { contactId: 'contact-1', error: 'Missing email', timestamp: '2024-01-01T10:00:30Z' }
                        ],
                    },
                },
                createdAt: baseTime,
                updatedAt: baseTime,
            };
            jest.useFakeTimers();
            jest.setSystemTime(new Date(baseTime.getTime() + 45000));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should update metrics with new batch data', async () => {
            const metricsUpdate = {
                processed: 50,
                success: 48,
                errors: 2,
                errorDetails: [
                    { contactId: 'contact-2', error: 'Invalid phone', timestamp: '2024-01-01T10:00:45Z' }
                ],
            };

            mockProcessRepository.findById.mockResolvedValue(mockProcess);
            mockProcessRepository.update.mockResolvedValue(mockProcess);

            await updateProcessMetricsUseCase.execute(processId, metricsUpdate);

            expect(mockProcessRepository.findById).toHaveBeenCalledWith(processId);
            const updateCall = mockProcessRepository.update.mock.calls[0];
            expect(updateCall[0]).toBe(processId);
            const updateData = updateCall[1];
            expect(updateData.context.processedRecords).toBe(150);
            expect(updateData.results.aggregateData.totalSynced).toBe(143);
            expect(updateData.results.aggregateData.totalFailed).toBe(7);
            expect(updateData.results.aggregateData.recordsPerSecond).toBeCloseTo(3.33, 1);
            expect(updateData.results.aggregateData.errors).toHaveLength(2);
        });

        it('should calculate ETA when total records known', async () => {
            const metricsUpdate = { processed: 100, success: 100, errors: 0 };

            const expectedETA = new Date(Date.now() + (850 / 3.33 * 1000));

            const updatedProcess = {
                ...mockProcess,
                context: {
                    ...mockProcess.context,
                    processedRecords: 200,
                    estimatedCompletion: expectedETA.toISOString(),
                },
                results: {
                    aggregateData: {
                        totalSynced: 195,
                        totalFailed: 5,
                        duration: 45000,
                        recordsPerSecond: 4.44,
                    },
                },
            };

            mockProcessRepository.findById.mockResolvedValue(mockProcess);
            mockProcessRepository.update.mockResolvedValue(updatedProcess);

            const result = await updateProcessMetricsUseCase.execute(processId, metricsUpdate);

            const updateCall = mockProcessRepository.update.mock.calls[0][1];
            expect(updateCall.context.estimatedCompletion).toBeDefined();
            expect(new Date(updateCall.context.estimatedCompletion)).toBeInstanceOf(Date);
        });

        it('should limit error details to last 100', async () => {
            const existingErrors = Array.from({ length: 98 }, (_, i) => ({
                contactId: `contact-${i}`,
                error: `Error ${i}`,
                timestamp: new Date().toISOString(),
            }));

            const processWithManyErrors = {
                ...mockProcess,
                results: {
                    aggregateData: {
                        totalSynced: 95,
                        totalFailed: 5,
                        duration: 30000,
                        recordsPerSecond: 3.33,
                        errors: existingErrors,
                    },
                },
            };

            const newErrors = Array.from({ length: 5 }, (_, i) => ({
                contactId: `new-contact-${i}`,
                error: `New error ${i}`,
                timestamp: new Date().toISOString(),
            }));

            const metricsUpdate = {
                processed: 5,
                success: 0,
                errors: 5,
                errorDetails: newErrors,
            };

            mockProcessRepository.findById.mockResolvedValue(processWithManyErrors);
            mockProcessRepository.update.mockResolvedValue({});

            await updateProcessMetricsUseCase.execute(processId, metricsUpdate);

            const updateCall = mockProcessRepository.update.mock.calls[0][1];
            const errorCount = updateCall.results.aggregateData.errors.length;
            expect(errorCount).toBe(100);
            expect(updateCall.results.aggregateData.errors[0]).toEqual(existingErrors[3]);
        });

        it('should handle process with no existing context', async () => {
            const processWithNoContext = {
                ...mockProcess,
                context: null,
                results: null,
            };

            const metricsUpdate = { processed: 10, success: 8, errors: 2 };
            const updatedProcess = { ...processWithNoContext };

            mockProcessRepository.findById.mockResolvedValue(processWithNoContext);
            mockProcessRepository.update.mockResolvedValue(updatedProcess);

            const result = await updateProcessMetricsUseCase.execute(processId, metricsUpdate);

            const updateCall = mockProcessRepository.update.mock.calls[0][1];
            expect(updateCall.context.processedRecords).toBe(10);
            expect(updateCall.results.aggregateData.totalSynced).toBe(8);
            expect(updateCall.results.aggregateData.totalFailed).toBe(2);
        });

        it('should broadcast progress via WebSocket', async () => {
            const metricsUpdate = { processed: 50, success: 48, errors: 2 };
            const updatedProcess = { ...mockProcess };

            mockProcessRepository.findById.mockResolvedValue(mockProcess);
            mockProcessRepository.update.mockResolvedValue(updatedProcess);

            await updateProcessMetricsUseCase.execute(processId, metricsUpdate);

            expect(mockWebsocketService.broadcast).toHaveBeenCalledWith({
                type: 'PROCESS_PROGRESS',
                data: {
                    processId,
                    processName: mockProcess.name,
                    processType: mockProcess.type,
                    state: mockProcess.state,
                    processed: 150,
                    total: 1000,
                    successCount: 143,
                    errorCount: 7,
                    recordsPerSecond: expect.any(Number),
                    estimatedCompletion: expect.any(String),
                    timestamp: expect.any(String),
                },
            });
        });

        it('should handle WebSocket broadcast errors gracefully', async () => {
            const websocketError = new Error('WebSocket connection failed');
            mockWebsocketService.broadcast.mockRejectedValue(websocketError);

            const metricsUpdate = { processed: 10, success: 10, errors: 0 };
            const updatedProcess = { ...mockProcess };

            mockProcessRepository.findById.mockResolvedValue(mockProcess);
            mockProcessRepository.update.mockResolvedValue(updatedProcess);

            const result = await updateProcessMetricsUseCase.execute(processId, metricsUpdate);

            expect(result).toEqual(updatedProcess);
            expect(mockWebsocketService.broadcast).toHaveBeenCalled();
        });

        it('should throw error if processId is missing', async () => {
            await expect(updateProcessMetricsUseCase.execute('', {}))
                .rejects.toThrow('processId must be a non-empty string');
        });

        it('should throw error if processId is not a string', async () => {
            await expect(updateProcessMetricsUseCase.execute(123 as any, {}))
                .rejects.toThrow('processId must be a non-empty string');
        });

        it('should throw error if metricsUpdate is missing', async () => {
            await expect(updateProcessMetricsUseCase.execute(processId, null as any))
                .rejects.toThrow('metricsUpdate must be an object');
        });

        it('should throw error if process not found', async () => {
            mockProcessRepository.findById.mockResolvedValue(null);

            await expect(updateProcessMetricsUseCase.execute(processId, {}))
                .rejects.toThrow('Process not found: process-123');
        });

        it('should handle repository errors', async () => {
            const repositoryError = new Error('Database connection failed');
            mockProcessRepository.findById.mockRejectedValue(repositoryError);

            await expect(updateProcessMetricsUseCase.execute(processId, {}))
                .rejects.toThrow('Database connection failed');
        });
    });
});
