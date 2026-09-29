const { ClearRateLimitWait } = require('./clear-rate-limit-wait');

describe('ClearRateLimitWait', () => {
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
    let clearRateLimitWait;
    let mockProcessRepository;
    let nowSpy;

    const storeOnProcess = (rateLimit) =>
        mockProcessRepository.findById.mockResolvedValue({
            id: processId,
            context: { rateLimit },
        });

    beforeEach(() => {
        nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
        mockProcessRepository = {
            findById: jest
                .fn()
                .mockResolvedValue({ id: processId, context: {} }),
            applyProcessUpdate: jest.fn().mockResolvedValue({ id: processId }),
        };
        clearRateLimitWait = new ClearRateLimitWait({
            processRepository: mockProcessRepository,
        });
    });

    afterEach(() => nowSpy.mockRestore());

    describe('constructor', () => {
        it('should require processRepository', () => {
            expect(() => new ClearRateLimitWait({})).toThrow(
                'processRepository is required'
            );
        });

        it('should initialize with processRepository', () => {
            expect(clearRateLimitWait.processRepository).toBe(
                mockProcessRepository
            );
        });
    });

    describe('execute', () => {
        it('clears a wait that is over', async () => {
            storeOnProcess(stored(at(-MINUTE)));

            await clearRateLimitWait.execute(processId);

            expect(
                mockProcessRepository.applyProcessUpdate
            ).toHaveBeenCalledWith(processId, {
                set: { 'context.rateLimit': null },
            });
        });

        it('clears a wait that ends within a few seconds', async () => {
            storeOnProcess(stored(at(3_000)));

            await clearRateLimitWait.execute(processId);

            expect(
                mockProcessRepository.applyProcessUpdate
            ).toHaveBeenCalledTimes(1);
        });

        it('keeps a wait that other messages still wait for', async () => {
            storeOnProcess(stored(at(10 * MINUTE)));

            await clearRateLimitWait.execute(processId);

            expect(
                mockProcessRepository.applyProcessUpdate
            ).not.toHaveBeenCalled();
        });

        it('leaves a cap in place', async () => {
            storeOnProcess(stored(at(-MINUTE), 'EXHAUSTED'));

            await clearRateLimitWait.execute(processId);

            expect(
                mockProcessRepository.applyProcessUpdate
            ).not.toHaveBeenCalled();
        });

        it('writes nothing when no wait is recorded', async () => {
            await clearRateLimitWait.execute(processId);

            expect(
                mockProcessRepository.applyProcessUpdate
            ).not.toHaveBeenCalled();
        });

        it('does not fail when the process is gone', async () => {
            mockProcessRepository.findById.mockResolvedValue(null);

            await expect(
                clearRateLimitWait.execute(processId)
            ).resolves.toBeUndefined();
            expect(
                mockProcessRepository.applyProcessUpdate
            ).not.toHaveBeenCalled();
        });
    });
});
