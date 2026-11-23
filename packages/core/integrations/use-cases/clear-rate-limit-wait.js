const CLEAR_RATE_LIMIT_TOLERANCE_MS = 5_000;

const isOwnWait = (current, deferralId) =>
    Boolean(deferralId) && current.deferralId === deferralId;

const isOver = (current) =>
    Date.parse(current.retryAt) - Date.now() <= CLEAR_RATE_LIMIT_TOLERANCE_MS;

class ClearRateLimitWait {
    constructor({ processRepository }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
    }

    async execute(processId, { deferralId } = {}) {
        const process = await this.processRepository.findById(processId);
        const current = process?.context?.rateLimit;
        if (current?.status !== 'WAITING') return;
        if (!isOwnWait(current, deferralId) && !isOver(current)) return;
        await this.processRepository.applyProcessUpdate(processId, {
            set: { 'context.rateLimit': null },
        });
    }
}

module.exports = { ClearRateLimitWait };
