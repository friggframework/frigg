const { RecordRateLimitWait } = require('./record-rate-limit-wait');

describe('RecordRateLimitWait', () => {
    const NOW = Date.parse('2026-09-28T12:00:00.000Z');
    const MINUTE = 60_000;
    const processId = 'process-123';
    const at = (ms) => new Date(NOW + ms);
    const stored = (retryAt, status = 'WAITING') => ({
        status,
        mechanism: 'delay',
        deferrals: 1,
        retryAt: retryAt.toISOString(),
        reason: 'burst',
        module: 'hubspot',
    });
    const wait = (retryAt, status = 'WAITING') => ({
        status,
        mechanism: 'delay',
        deferrals: 1,
        retryAt,
        reason: 'burst',
        module: 'hubspot',
    });
    let recordRateLimitWait;
    let mockProcessRepository;

    const storeOnProcess = (rateLimit) =>
        mockProcessRepository.findById.mockResolvedValue({
            id: processId,
            context: { rateLimit },
        });

    beforeEach(() => {
        mockProcessRepository = {
            findById: jest
                .fn()
                .mockResolvedValue({ id: processId, context: {} }),
            applyProcessUpdate: jest.fn().mockResolvedValue({ id: processId }),
        };
        recordRateLimitWait = new RecordRateLimitWait({
            processRepository: mockProcessRepository,
        });
    });

    describe('constructor', () => {
        it('should require processRepository', () => {
            expect(() => new RecordRateLimitWait({})).toThrow(
                'processRepository is required'
            );
        });

        it('should initialize with processRepository', () => {
            expect(recordRateLimitWait.processRepository).toBe(
                mockProcessRepository
            );
        });
    });

    describe('execute', () => {
        it('writes the wait as context.rateLimit on the process', async () => {
            await recordRateLimitWait.execute(processId, wait(at(20 * MINUTE)));

            expect(
                mockProcessRepository.applyProcessUpdate
            ).toHaveBeenCalledWith(processId, {
                set: {
                    'context.rateLimit': {
                        status: 'WAITING',
                        mechanism: 'delay',
                        retryAt: '2026-09-28T12:20:00.000Z',
                        reason: 'burst',
                        module: 'hubspot',
                        deferrals: 1,
                        updatedAt: expect.any(String),
                    },
                },
            });
        });

        it('replaces an earlier wait', async () => {
            storeOnProcess(stored(at(5 * MINUTE)));

            await recordRateLimitWait.execute(processId, wait(at(20 * MINUTE)));

            expect(
                mockProcessRepository.applyProcessUpdate
            ).toHaveBeenCalledTimes(1);
        });

        it('keeps a later wait that another message recorded', async () => {
            storeOnProcess(stored(at(40 * MINUTE)));

            await recordRateLimitWait.execute(processId, wait(at(20 * MINUTE)));

            expect(
                mockProcessRepository.applyProcessUpdate
            ).not.toHaveBeenCalled();
        });

        it('shows a cap even when a later wait is recorded', async () => {
            storeOnProcess(stored(at(40 * MINUTE)));

            await recordRateLimitWait.execute(
                processId,
                wait(at(20 * MINUTE), 'EXHAUSTED')
            );

            expect(
                mockProcessRepository.applyProcessUpdate
            ).toHaveBeenCalledTimes(1);
        });

        it('never hides a cap behind a later wait', async () => {
            storeOnProcess(stored(at(5 * MINUTE), 'EXHAUSTED'));

            await recordRateLimitWait.execute(processId, wait(at(20 * MINUTE)));

            expect(
                mockProcessRepository.applyProcessUpdate
            ).not.toHaveBeenCalled();
        });

        it('does not fail when the process is gone', async () => {
            mockProcessRepository.findById.mockResolvedValue(null);
            mockProcessRepository.applyProcessUpdate.mockResolvedValue(null);

            await expect(
                recordRateLimitWait.execute(processId, wait(at(MINUTE)))
            ).resolves.toBeUndefined();
        });
    });
});
