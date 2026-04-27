/**
 * UpdateProcessMetrics Use Case Tests
 *
 * Covers the atomic-path refactor: increments and errorDetails push go
 * through applyProcessUpdate; derived fields are computed and written
 * via the legacy update() as a non-fatal follow-up.
 */

const { UpdateProcessMetrics } = require('./update-process-metrics');

describe('UpdateProcessMetrics', () => {
    let useCase;
    let mockProcessRepository;
    let mockWebsocketService;

    beforeEach(() => {
        mockProcessRepository = {
            findById: jest.fn(),
            update: jest.fn(),
            applyProcessUpdate: jest.fn(),
        };
        mockWebsocketService = { broadcast: jest.fn() };
        useCase = new UpdateProcessMetrics({
            processRepository: mockProcessRepository,
            websocketService: mockWebsocketService,
        });
    });

    describe('constructor', () => {
        it('requires processRepository', () => {
            expect(() => new UpdateProcessMetrics({})).toThrow(
                'processRepository is required'
            );
        });
        it('initializes with repository and optional websocket', () => {
            expect(useCase.processRepository).toBe(mockProcessRepository);
            expect(useCase.websocketService).toBe(mockWebsocketService);
        });
        it('works without websocket', () => {
            const uc = new UpdateProcessMetrics({
                processRepository: mockProcessRepository,
            });
            expect(uc.websocketService).toBeUndefined();
        });
    });

    describe('execute — atomic phase', () => {
        const processId = 'process-123';
        const baseTime = new Date('2024-01-01T10:00:00Z');

        // Post-atomic snapshot returned by applyProcessUpdate. Counters
        // have already been incremented server-side.
        const atomicSnapshot = {
            id: processId,
            state: 'PROCESSING_BATCHES',
            context: {
                syncType: 'INITIAL',
                totalRecords: 1000,
                processedRecords: 150, // prior 100 + this batch's 50
                startTime: baseTime.toISOString(),
            },
            results: {
                aggregateData: {
                    totalSynced: 143,
                    totalFailed: 7,
                    errors: [
                        {
                            contactId: 'contact-2',
                            error: 'Invalid phone',
                            timestamp: '2024-01-01T10:00:45Z',
                        },
                    ],
                },
            },
            createdAt: baseTime,
        };

        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date(baseTime.getTime() + 45000)); // +45s
        });
        afterEach(() => {
            jest.useRealTimers();
        });

        it('routes processed/success/errors to applyProcessUpdate.increment', async () => {
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);

            await useCase.execute(processId, {
                processed: 50,
                success: 48,
                errors: 2,
            });

            expect(mockProcessRepository.applyProcessUpdate).toHaveBeenCalledWith(
                processId,
                {
                    increment: {
                        'context.processedRecords': 50,
                        'results.aggregateData.totalSynced': 48,
                        'results.aggregateData.totalFailed': 2,
                    },
                    pushSlice: {},
                }
            );
        });

        it('routes errorDetails to pushSlice with keepLast 100', async () => {
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);

            const errorDetails = [
                {
                    contactId: 'contact-2',
                    error: 'Invalid phone',
                    timestamp: '2024-01-01T10:00:45Z',
                },
            ];
            await useCase.execute(processId, {
                processed: 5,
                errors: 5,
                errorDetails,
            });

            const [, ops] =
                mockProcessRepository.applyProcessUpdate.mock.calls[0];
            expect(ops.pushSlice).toEqual({
                'results.aggregateData.errors': {
                    values: errorDetails,
                    keepLast: 100,
                },
            });
        });

        it('omits zero-value counters from the increment map', async () => {
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);

            await useCase.execute(processId, {
                processed: 50,
                success: 50,
                errors: 0,
            });

            const [, ops] =
                mockProcessRepository.applyProcessUpdate.mock.calls[0];
            // toHaveProperty interprets dots as nested paths; use `in`
            // against the object keyed by our literal dot-paths.
            expect('results.aggregateData.totalFailed' in ops.increment).toBe(
                false
            );
            expect('context.processedRecords' in ops.increment).toBe(true);
            expect('results.aggregateData.totalSynced' in ops.increment).toBe(
                true
            );
        });

        it('short-circuits on an all-zero update without hitting applyProcessUpdate', async () => {
            mockProcessRepository.findById.mockResolvedValue(atomicSnapshot);
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);

            await useCase.execute(processId, {
                processed: 0,
                success: 0,
                errors: 0,
            });

            expect(
                mockProcessRepository.applyProcessUpdate
            ).not.toHaveBeenCalled();
            expect(mockProcessRepository.findById).toHaveBeenCalledWith(
                processId
            );
        });
    });

    describe('execute — derived-fields phase', () => {
        const processId = 'process-123';
        const baseTime = new Date('2024-01-01T10:00:00Z');
        const atomicSnapshot = {
            id: processId,
            context: {
                totalRecords: 1000,
                processedRecords: 150,
                startTime: baseTime.toISOString(),
            },
            results: { aggregateData: { totalSynced: 143, totalFailed: 7 } },
            createdAt: baseTime,
        };

        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date(baseTime.getTime() + 45000));
        });
        afterEach(() => {
            jest.useRealTimers();
        });

        it('writes duration, recordsPerSecond, and estimatedCompletion via update()', async () => {
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);

            await useCase.execute(processId, { processed: 50, success: 50 });

            const [id, derived] =
                mockProcessRepository.update.mock.calls[0];
            expect(id).toBe(processId);
            expect(derived.results.aggregateData.duration).toBe(45000);
            expect(derived.results.aggregateData.recordsPerSecond).toBeCloseTo(
                150 / 45,
                2
            );
            expect(derived.context.estimatedCompletion).toEqual(
                expect.any(String)
            );
        });

        it('continues returning the atomic snapshot when the derived-fields write fails (non-fatal)', async () => {
            const consoleErr = jest.spyOn(console, 'error').mockImplementation();
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockRejectedValue(new Error('disk full'));

            const result = await useCase.execute(processId, {
                processed: 50,
                success: 50,
            });

            expect(result).toBe(atomicSnapshot);
            expect(consoleErr).toHaveBeenCalledWith(
                expect.stringContaining('derived-fields write failed'),
                expect.stringContaining('disk full')
            );
            consoleErr.mockRestore();
        });

        it('skips derived fields entirely for a never-processed process (both counters zero)', async () => {
            const fresh = {
                ...atomicSnapshot,
                context: { totalRecords: 0, processedRecords: 0 },
            };
            mockProcessRepository.findById.mockResolvedValue(fresh);

            await useCase.execute(processId, { processed: 0 });

            expect(mockProcessRepository.update).not.toHaveBeenCalled();
        });
    });

    describe('execute — validation', () => {
        it('throws when processId is empty', async () => {
            await expect(useCase.execute('', {})).rejects.toThrow(
                'processId must be a non-empty string'
            );
        });
        it('throws when metricsUpdate is null', async () => {
            await expect(
                useCase.execute('p1', null)
            ).rejects.toThrow('metricsUpdate must be an object');
        });
        it('throws when the atomic update yields no process', async () => {
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(null);
            await expect(
                useCase.execute('p1', { processed: 1 })
            ).rejects.toThrow('Process not found: p1');
        });
        it('wraps applyProcessUpdate errors in "Failed to update process metrics"', async () => {
            mockProcessRepository.applyProcessUpdate.mockRejectedValue(
                new Error('db connection lost')
            );
            await expect(
                useCase.execute('p1', { processed: 1 })
            ).rejects.toThrow(
                'Failed to update process metrics: db connection lost'
            );
        });
    });

    describe('execute — websocket broadcast', () => {
        const atomicSnapshot = {
            id: 'p1',
            name: 'sync',
            type: 'CRM_SYNC',
            state: 'PROCESSING_BATCHES',
            context: { totalRecords: 10, processedRecords: 3 },
            results: { aggregateData: { totalSynced: 3, totalFailed: 0 } },
            createdAt: new Date(),
        };

        it('broadcasts progress after a successful update', async () => {
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);

            await useCase.execute('p1', { processed: 3, success: 3 });

            expect(mockWebsocketService.broadcast).toHaveBeenCalledWith({
                type: 'PROCESS_PROGRESS',
                data: expect.objectContaining({
                    processId: 'p1',
                    processed: 3,
                    total: 10,
                    successCount: 3,
                    errorCount: 0,
                }),
            });
        });

        it('swallows websocket errors without failing the operation', async () => {
            const consoleErr = jest.spyOn(console, 'error').mockImplementation();
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);
            mockWebsocketService.broadcast.mockRejectedValue(
                new Error('ws closed')
            );

            const result = await useCase.execute('p1', { processed: 3 });

            expect(result).toBe(atomicSnapshot);
            consoleErr.mockRestore();
        });
    });

    describe('race simulation', () => {
        it('N concurrent invocations produce N calls to applyProcessUpdate (DB is responsible for serializing)', async () => {
            const snap = {
                id: 'p1',
                context: { processedRecords: 0, startTime: new Date().toISOString() },
                results: { aggregateData: {} },
                createdAt: new Date(),
            };
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(snap);
            mockProcessRepository.update.mockResolvedValue(snap);

            const calls = Array.from({ length: 25 }, () =>
                useCase.execute('p1', { processed: 1, success: 1 })
            );
            await Promise.all(calls);

            // Every invocation lands an atomic increment at the repo. Any
            // clobbering is the DB's problem (and it handles it) — this
            // layer just forwards.
            expect(
                mockProcessRepository.applyProcessUpdate
            ).toHaveBeenCalledTimes(25);
            expect(
                mockProcessRepository.applyProcessUpdate.mock.calls.every(
                    ([, ops]) => ops.increment['context.processedRecords'] === 1
                )
            ).toBe(true);
        });
    });
});
