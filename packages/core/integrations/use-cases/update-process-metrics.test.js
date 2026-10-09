/**
 * UpdateProcessMetrics Use Case Tests
 *
 * Covers the atomic-path refactor: increments and errorDetails push go
 * through applyProcessUpdate; derived fields are computed from that
 * snapshot and written back through a scoped `set` op as a non-fatal
 * follow-up — never as a full context/results overwrite.
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

        it('routes skipped to applyProcessUpdate.increment as totalSkipped', async () => {
            // Records that were intentionally not synced (hash-skip, loop
            // protection, etc.) must increment a real counter so the UI
            // can show processed = synced + failed + skipped. Previously
            // the skipped count was silently dropped from the atomic phase.
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);

            await useCase.execute(processId, {
                processed: 10,
                success: 7,
                errors: 0,
                skipped: 3,
            });

            expect(mockProcessRepository.applyProcessUpdate).toHaveBeenCalledWith(
                processId,
                {
                    increment: {
                        'context.processedRecords': 10,
                        'results.aggregateData.totalSynced': 7,
                        'results.aggregateData.totalSkipped': 3,
                    },
                    pushSlice: {},
                }
            );
        });

        it('omits totalSkipped from the increment map when skipped is zero', async () => {
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);

            await useCase.execute(processId, {
                processed: 5,
                success: 5,
                errors: 0,
                skipped: 0,
            });

            const [, ops] =
                mockProcessRepository.applyProcessUpdate.mock.calls[0];
            expect('results.aggregateData.totalSkipped' in ops.increment).toBe(
                false
            );
        });

        it('treats a skipped-only batch as atomic work (does not short-circuit)', async () => {
            // Regression guard: hasAtomicWork must include skipped so that
            // a batch of skipped-only events still issues the UPDATE.
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );
            mockProcessRepository.update.mockResolvedValue(atomicSnapshot);

            await useCase.execute(processId, {
                processed: 0,
                success: 0,
                errors: 0,
                skipped: 1,
            });

            const [, ops] =
                mockProcessRepository.applyProcessUpdate.mock.calls[0];
            expect(ops.increment).toEqual({
                'results.aggregateData.totalSkipped': 1,
            });
            expect(mockProcessRepository.findById).not.toHaveBeenCalled();
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

        it('short-circuits an all-zero update to a read, issuing no counter write', async () => {
            mockProcessRepository.findById.mockResolvedValue(atomicSnapshot);
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );

            await useCase.execute(processId, {
                processed: 0,
                success: 0,
                errors: 0,
            });

            expect(mockProcessRepository.findById).toHaveBeenCalledWith(
                processId
            );
            // The only atomic write left is the derived-fields pass; no
            // increment/pushSlice op is issued for an empty batch.
            const counterWrites =
                mockProcessRepository.applyProcessUpdate.mock.calls.filter(
                    ([, ops]) => ops.increment || ops.pushSlice
                );
            expect(counterWrites).toHaveLength(0);
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

        it('writes duration, recordsPerSecond, and estimatedCompletion as a scoped atomic set', async () => {
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(
                atomicSnapshot
            );

            await useCase.execute(processId, { processed: 50, success: 50 });

            const [id, ops] =
                mockProcessRepository.applyProcessUpdate.mock.calls[1];
            expect(id).toBe(processId);
            // Only the three derived paths — never the whole blob, which
            // would replay stale counters over a concurrent caller's write.
            expect(Object.keys(ops)).toEqual(['set']);
            expect(ops.set['results.aggregateData.duration']).toBe(45000);
            expect(
                ops.set['results.aggregateData.recordsPerSecond']
            ).toBeCloseTo(150 / 45, 2);
            expect(ops.set['context.estimatedCompletion']).toEqual(
                expect.any(String)
            );
            expect(mockProcessRepository.update).not.toHaveBeenCalled();
        });

        it('continues returning the atomic snapshot when the derived-fields write fails (non-fatal)', async () => {
            const consoleErr = jest.spyOn(console, 'error').mockImplementation();
            mockProcessRepository.applyProcessUpdate
                .mockResolvedValueOnce(atomicSnapshot)
                .mockRejectedValueOnce(new Error('disk full'));

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

            expect(
                mockProcessRepository.applyProcessUpdate
            ).not.toHaveBeenCalled();
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

    describe('concurrent writers — lost update regression', () => {
        // Models the production failure (Clockwork, 2026-08-12): two batch
        // handlers update the same process. Each one's phase-1 increment is
        // atomic, but the phase-2 derived-fields write used to persist the
        // WHOLE context/results blob captured in phase 1's RETURNING
        // snapshot. A late-arriving snapshot therefore rolled the row back
        // to a pre-concurrent state and one chunk vanished for good.
        const startTime = '2024-01-01T10:00:00.000Z';
        const baseTime = new Date(startTime);

        const clone = (value) => JSON.parse(JSON.stringify(value));

        const readPath = (doc, path) =>
            path
                .split('.')
                .reduce(
                    (acc, segment) =>
                        acc === null || acc === undefined
                            ? undefined
                            : acc[segment],
                    doc
                );

        const writePath = (doc, path, value) => {
            const segments = path.split('.');
            let cursor = doc;
            for (const segment of segments.slice(0, -1)) {
                if (!cursor[segment] || typeof cursor[segment] !== 'object') {
                    cursor[segment] = {};
                }
                cursor = cursor[segment];
            }
            cursor[segments[segments.length - 1]] = value;
        };

        /**
         * Repository double where `applyProcessUpdate` behaves like the real
         * atomic backends (mutate-then-snapshot) and `update` behaves like
         * the legacy blind full-column overwrite.
         *
         * With `parkFirstWriter`, the first atomic write commits its
         * mutation immediately but its RETURNING snapshot is withheld until
         * the test releases it — the deterministic stand-in for "caller A's
         * phase 2 runs after caller B has fully finished".
         */
        const createRepository = ({ parkFirstWriter = false } = {}) => {
            const doc = {
                id: 'p1',
                state: 'PROCESSING_BATCHES',
                context: {
                    totalRecords: 100,
                    processedRecords: 0,
                    startTime,
                },
                results: { aggregateData: { totalSynced: 0, totalFailed: 0 } },
                createdAt: startTime,
            };

            let parkedResolve;
            const parked = new Promise((resolve) => {
                parkedResolve = resolve;
            });
            let releaseResolve;
            const released = new Promise((resolve) => {
                releaseResolve = resolve;
            });

            let atomicWrites = 0;
            const repository = {
                findById: jest.fn(async () => clone(doc)),
                update: jest.fn(async (_processId, updates) => {
                    if (updates.context !== undefined) {
                        doc.context = clone(updates.context);
                    }
                    if (updates.results !== undefined) {
                        doc.results = clone(updates.results);
                    }
                    return clone(doc);
                }),
                applyProcessUpdate: jest.fn(async (_processId, ops) => {
                    atomicWrites += 1;
                    const isFirstWriter = atomicWrites === 1;

                    for (const [path, delta] of Object.entries(
                        ops.increment || {}
                    )) {
                        writePath(doc, path, (readPath(doc, path) || 0) + delta);
                    }
                    for (const [path, value] of Object.entries(ops.set || {})) {
                        writePath(doc, path, value);
                    }
                    for (const [path, spec] of Object.entries(
                        ops.pushSlice || {}
                    )) {
                        const next = [
                            ...(readPath(doc, path) || []),
                            ...spec.values,
                        ];
                        writePath(doc, path, next.slice(-spec.keepLast));
                    }

                    const snapshot = clone(doc);
                    if (parkFirstWriter && isFirstWriter) {
                        parkedResolve();
                        await released;
                    }
                    return snapshot;
                }),
            };

            return {
                repository,
                doc,
                firstWriterParked: parked,
                releaseFirstWriter: () => releaseResolve(),
            };
        };

        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date(baseTime.getTime() + 45000));
        });
        afterEach(() => {
            jest.useRealTimers();
        });

        it('keeps both callers’ increments when a stale snapshot writes derived fields last', async () => {
            const { repository, doc, firstWriterParked, releaseFirstWriter } =
                createRepository({ parkFirstWriter: true });
            const useCaseUnderTest = new UpdateProcessMetrics({
                processRepository: repository,
            });

            const firstCaller = useCaseUnderTest.execute('p1', {
                processed: 25,
                success: 25,
            });
            await firstWriterParked;

            await useCaseUnderTest.execute('p1', {
                processed: 25,
                success: 25,
            });

            releaseFirstWriter();
            await firstCaller;

            expect(doc.context.processedRecords).toBe(50);
            expect(doc.results.aggregateData.totalSynced).toBe(50);
        });

        it('never routes the derived-fields write through the legacy blind-overwrite update()', async () => {
            const { repository } = createRepository();
            const useCaseUnderTest = new UpdateProcessMetrics({
                processRepository: repository,
            });

            await useCaseUnderTest.execute('p1', {
                processed: 25,
                success: 25,
            });

            expect(repository.update).not.toHaveBeenCalled();
        });

        it('persists duration, recordsPerSecond and estimatedCompletion via the atomic set op', async () => {
            const { repository, doc } = createRepository();
            const useCaseUnderTest = new UpdateProcessMetrics({
                processRepository: repository,
            });

            await useCaseUnderTest.execute('p1', {
                processed: 25,
                success: 25,
            });

            expect(doc.results.aggregateData.duration).toBe(45000);
            expect(doc.results.aggregateData.recordsPerSecond).toBeCloseTo(
                25 / 45,
                5
            );
            expect(doc.context.estimatedCompletion).toEqual(expect.any(String));
            expect(doc.context.processedRecords).toBe(25);
            expect(doc.results.aggregateData.totalSynced).toBe(25);
        });

        it('omits estimatedCompletion when totalRecords is unknown', async () => {
            const { repository, doc } = createRepository();
            doc.context.totalRecords = 0;
            const useCaseUnderTest = new UpdateProcessMetrics({
                processRepository: repository,
            });

            await useCaseUnderTest.execute('p1', {
                processed: 25,
                success: 25,
            });

            const derivedOps =
                repository.applyProcessUpdate.mock.calls[1][1].set;
            expect('context.estimatedCompletion' in derivedOps).toBe(false);
            expect(doc.context.estimatedCompletion).toBeUndefined();
        });
    });

    describe('error codes', () => {
        it('tags validation errors with INVALID_PROCESS_DATA', async () => {
            await expect(useCase.execute('', {})).rejects.toHaveProperty(
                'code',
                'INVALID_PROCESS_DATA'
            );
            await expect(useCase.execute('p1', null)).rejects.toHaveProperty(
                'code',
                'INVALID_PROCESS_DATA'
            );
        });

        it('tags not-found with PROCESS_NOT_FOUND', async () => {
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(null);

            await expect(
                useCase.execute('p1', { processed: 1 })
            ).rejects.toHaveProperty('code', 'PROCESS_NOT_FOUND');
        });
    });
});
