const { NetlifySchedulerAdapter } = require('./netlify-scheduler-adapter');

describe('NetlifySchedulerAdapter', () => {
    let adapter;
    let mockRepository;
    let mockQueueProvider;

    beforeEach(() => {
        mockRepository = {
            save: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue(undefined),
            findByName: jest.fn().mockResolvedValue(null),
            findDue: jest.fn().mockResolvedValue([]),
        };
        mockQueueProvider = {
            send: jest.fn().mockResolvedValue(undefined),
        };

        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('warns when no repository is provided', () => {
            adapter = new NetlifySchedulerAdapter();

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('No repository provided')
            );
            expect(adapter._inMemorySchedules).toBeInstanceOf(Map);
        });

        it('does not warn when repository is provided', () => {
            adapter = new NetlifySchedulerAdapter({
                repository: mockRepository,
            });

            expect(console.warn).not.toHaveBeenCalled();
            expect(adapter._inMemorySchedules).toBeUndefined();
        });
    });

    describe('scheduleOneTime', () => {
        beforeEach(() => {
            adapter = new NetlifySchedulerAdapter({
                repository: mockRepository,
            });
        });

        it('saves schedule to repository', async () => {
            const scheduleAt = new Date(Date.now() + 60000);

            const result = await adapter.scheduleOneTime({
                scheduleName: 'job-1',
                scheduleAt,
                queueResourceId: '/.netlify/functions/worker-background',
                payload: { event: 'SYNC' },
            });

            expect(mockRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    scheduleName: 'job-1',
                    scheduledAt: scheduleAt.toISOString(),
                    queueResourceId:
                        '/.netlify/functions/worker-background',
                    payload: { event: 'SYNC' },
                    state: 'PENDING',
                })
            );
            expect(result.scheduledJobId).toBe('netlify-schedule-job-1');
        });

        it('rejects missing scheduleName', async () => {
            await expect(
                adapter.scheduleOneTime({
                    scheduleAt: new Date(),
                    queueResourceId: '/fn',
                })
            ).rejects.toThrow('scheduleName is required');
        });

        it('rejects invalid scheduleAt', async () => {
            await expect(
                adapter.scheduleOneTime({
                    scheduleName: 'job-1',
                    scheduleAt: 'not-a-date',
                    queueResourceId: '/fn',
                })
            ).rejects.toThrow('scheduleAt must be a valid Date');
        });

        it('rejects missing queueResourceId', async () => {
            await expect(
                adapter.scheduleOneTime({
                    scheduleName: 'job-1',
                    scheduleAt: new Date(),
                })
            ).rejects.toThrow('queueResourceId is required');
        });

        it('uses in-memory map when no repository', async () => {
            adapter = new NetlifySchedulerAdapter();
            const scheduleAt = new Date(Date.now() + 60000);

            await adapter.scheduleOneTime({
                scheduleName: 'mem-job',
                scheduleAt,
                queueResourceId: '/fn',
                payload: {},
            });

            expect(adapter._inMemorySchedules.has('mem-job')).toBe(true);
        });
    });

    describe('deleteSchedule', () => {
        beforeEach(() => {
            adapter = new NetlifySchedulerAdapter({
                repository: mockRepository,
            });
        });

        it('deletes from repository', async () => {
            await adapter.deleteSchedule('job-1');
            expect(mockRepository.delete).toHaveBeenCalledWith('job-1');
        });

        it('rejects missing scheduleName', async () => {
            await expect(adapter.deleteSchedule()).rejects.toThrow(
                'scheduleName is required'
            );
        });

        it('deletes from in-memory map when no repository', async () => {
            adapter = new NetlifySchedulerAdapter();
            adapter._inMemorySchedules.set('mem-job', { state: 'PENDING' });

            await adapter.deleteSchedule('mem-job');
            expect(adapter._inMemorySchedules.has('mem-job')).toBe(false);
        });
    });

    describe('getScheduleStatus', () => {
        beforeEach(() => {
            adapter = new NetlifySchedulerAdapter({
                repository: mockRepository,
            });
        });

        it('returns exists: false when not found', async () => {
            const result = await adapter.getScheduleStatus('nonexistent');
            expect(result).toEqual({ exists: false });
        });

        it('returns schedule details when found', async () => {
            mockRepository.findByName.mockResolvedValue({
                scheduledAt: '2025-06-01T00:00:00.000Z',
                state: 'PENDING',
            });

            const result = await adapter.getScheduleStatus('job-1');

            expect(result).toEqual({
                exists: true,
                scheduledAt: '2025-06-01T00:00:00.000Z',
                state: 'PENDING',
            });
        });
    });

    // ─── processDueSchedules: the core dispatch + race condition fix ───

    describe('processDueSchedules', () => {
        beforeEach(() => {
            adapter = new NetlifySchedulerAdapter({
                repository: mockRepository,
                queueProvider: mockQueueProvider,
            });
        });

        it('returns early when no repository', async () => {
            adapter = new NetlifySchedulerAdapter();

            const result = await adapter.processDueSchedules();

            expect(result).toEqual({ processed: 0, errors: 0 });
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Cannot process due schedules')
            );
        });

        it('processes nothing when no schedules are due', async () => {
            mockRepository.findDue.mockResolvedValue([]);

            const result = await adapter.processDueSchedules();

            expect(result).toEqual({ processed: 0, errors: 0 });
            expect(mockQueueProvider.send).not.toHaveBeenCalled();
        });

        it('dispatches due schedules to queue provider', async () => {
            mockRepository.findDue.mockResolvedValue([
                {
                    scheduleName: 'job-1',
                    scheduledAt: '2025-01-01T00:00:00.000Z',
                    queueResourceId: '/fn/worker-background',
                    payload: { event: 'SYNC' },
                    state: 'PENDING',
                },
            ]);

            const result = await adapter.processDueSchedules();

            expect(mockQueueProvider.send).toHaveBeenCalledWith(
                { event: 'SYNC' },
                '/fn/worker-background'
            );
            expect(result).toEqual({ processed: 1, errors: 0 });
        });

        it('marks schedule as PROCESSING before dispatching', async () => {
            const schedule = {
                scheduleName: 'job-1',
                scheduledAt: '2025-01-01T00:00:00.000Z',
                queueResourceId: '/fn/worker-background',
                payload: { event: 'SYNC' },
                state: 'PENDING',
            };
            mockRepository.findDue.mockResolvedValue([schedule]);

            // Track call order
            const callOrder = [];
            mockRepository.save.mockImplementation((data) => {
                callOrder.push(`save:${data.state}`);
                return Promise.resolve({});
            });
            mockQueueProvider.send.mockImplementation(() => {
                callOrder.push('send');
                return Promise.resolve();
            });
            mockRepository.delete.mockImplementation(() => {
                callOrder.push('delete');
                return Promise.resolve();
            });

            await adapter.processDueSchedules();

            expect(callOrder).toEqual([
                'save:PROCESSING',
                'send',
                'delete',
            ]);
        });

        it('deletes schedule after successful dispatch', async () => {
            mockRepository.findDue.mockResolvedValue([
                {
                    scheduleName: 'job-1',
                    scheduledAt: '2025-01-01T00:00:00.000Z',
                    queueResourceId: '/fn/worker-background',
                    payload: {},
                    state: 'PENDING',
                },
            ]);

            await adapter.processDueSchedules();

            expect(mockRepository.delete).toHaveBeenCalledWith('job-1');
        });

        it('marks schedule as FAILED when send throws', async () => {
            const schedule = {
                scheduleName: 'job-1',
                scheduledAt: '2025-01-01T00:00:00.000Z',
                queueResourceId: '/fn/worker-background',
                payload: {},
                state: 'PENDING',
            };
            mockRepository.findDue.mockResolvedValue([schedule]);
            mockQueueProvider.send.mockRejectedValue(
                new Error('Connection refused')
            );

            const result = await adapter.processDueSchedules();

            expect(result).toEqual({ processed: 0, errors: 1 });
            // Should save with FAILED state
            expect(mockRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ state: 'FAILED' })
            );
            // Should NOT delete
            expect(mockRepository.delete).not.toHaveBeenCalled();
        });

        it('does not re-dispatch PROCESSING schedules (findDue only returns PENDING)', async () => {
            // Simulate: first cron picks up job, marks PROCESSING, then
            // second cron fires while job is still PROCESSING.
            // findDue only returns PENDING, so the second cron gets nothing.
            mockRepository.findDue.mockResolvedValue([]);

            const result = await adapter.processDueSchedules();

            expect(result).toEqual({ processed: 0, errors: 0 });
            expect(mockQueueProvider.send).not.toHaveBeenCalled();
        });

        it('marks FAILED even if PROCESSING save succeeded but send fails', async () => {
            const schedule = {
                scheduleName: 'job-1',
                scheduledAt: '2025-01-01T00:00:00.000Z',
                queueResourceId: '/fn/worker-background',
                payload: { id: 123 },
                state: 'PENDING',
            };
            mockRepository.findDue.mockResolvedValue([schedule]);

            // save(PROCESSING) succeeds, send fails
            let saveCallCount = 0;
            mockRepository.save.mockImplementation((data) => {
                saveCallCount++;
                if (data.state === 'PROCESSING') return Promise.resolve({});
                if (data.state === 'FAILED') return Promise.resolve({});
                return Promise.resolve({});
            });
            mockQueueProvider.send.mockRejectedValue(
                new Error('Timeout')
            );

            const result = await adapter.processDueSchedules();

            // save called twice: once PROCESSING, once FAILED
            expect(saveCallCount).toBe(2);
            expect(result).toEqual({ processed: 0, errors: 1 });
        });

        it('handles FAILED save gracefully (catch swallows)', async () => {
            const schedule = {
                scheduleName: 'job-1',
                scheduledAt: '2025-01-01T00:00:00.000Z',
                queueResourceId: '/fn/worker-background',
                payload: {},
                state: 'PENDING',
            };
            mockRepository.findDue.mockResolvedValue([schedule]);

            // save(PROCESSING) succeeds, send fails, save(FAILED) also fails
            mockRepository.save
                .mockResolvedValueOnce({}) // PROCESSING
                .mockRejectedValueOnce(new Error('DB down')); // FAILED
            mockQueueProvider.send.mockRejectedValue(
                new Error('Timeout')
            );

            // Should NOT throw — the .catch(() => {}) swallows the save(FAILED) error
            const result = await adapter.processDueSchedules();

            expect(result).toEqual({ processed: 0, errors: 1 });
        });

        it('logs payload when no queue provider is configured', async () => {
            adapter = new NetlifySchedulerAdapter({
                repository: mockRepository,
                // no queueProvider
            });

            mockRepository.findDue.mockResolvedValue([
                {
                    scheduleName: 'job-1',
                    scheduledAt: '2025-01-01T00:00:00.000Z',
                    queueResourceId: '/fn/worker-background',
                    payload: { event: 'SYNC' },
                    state: 'PENDING',
                },
            ]);

            const result = await adapter.processDueSchedules();

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('No queue provider'),
                expect.stringContaining('"event":"SYNC"')
            );
            expect(result).toEqual({ processed: 1, errors: 0 });
        });

        it('processes multiple schedules independently', async () => {
            mockRepository.findDue.mockResolvedValue([
                {
                    scheduleName: 'job-1',
                    scheduledAt: '2025-01-01T00:00:00.000Z',
                    queueResourceId: '/fn/worker-background',
                    payload: { id: 1 },
                    state: 'PENDING',
                },
                {
                    scheduleName: 'job-2',
                    scheduledAt: '2025-01-01T00:01:00.000Z',
                    queueResourceId: '/fn/worker-background',
                    payload: { id: 2 },
                    state: 'PENDING',
                },
            ]);

            // job-1 succeeds, job-2 fails
            mockQueueProvider.send
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('fail'));

            const result = await adapter.processDueSchedules();

            expect(result).toEqual({ processed: 1, errors: 1 });
            // job-1 deleted, job-2 marked FAILED
            expect(mockRepository.delete).toHaveBeenCalledWith('job-1');
            expect(mockRepository.delete).not.toHaveBeenCalledWith('job-2');
        });
    });
});
