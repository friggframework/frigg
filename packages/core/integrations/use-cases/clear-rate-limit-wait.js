const CLEAR_RATE_LIMIT_TOLERANCE_MS = 5_000;

class ClearRateLimitWait {
    constructor({ processRepository }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
    }

    async execute(processId) {
        const process = await this.processRepository.findById(processId);
        const current = process?.context?.rateLimit;
        if (current?.status !== 'WAITING') return;
        const remainingMs = Date.parse(current.retryAt) - Date.now();
        if (remainingMs > CLEAR_RATE_LIMIT_TOLERANCE_MS) return;
        await this.processRepository.applyProcessUpdate(processId, {
            set: { 'context.rateLimit': null },
        });
    }
}

module.exports = { ClearRateLimitWait };
