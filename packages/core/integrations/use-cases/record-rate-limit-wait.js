const keepsCurrentRateLimit = (current, next) => {
    if (!current) return false;
    if (next.status === 'EXHAUSTED') return false;
    if (current.status === 'EXHAUSTED') return true;
    return Date.parse(current.retryAt) > next.retryAt.getTime();
};

class RecordRateLimitWait {
    constructor({ processRepository }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
    }

    async execute(processId, wait) {
        const process = await this.processRepository.findById(processId);
        if (keepsCurrentRateLimit(process?.context?.rateLimit, wait)) return;
        await this.processRepository.applyProcessUpdate(processId, {
            set: {
                'context.rateLimit': {
                    status: wait.status,
                    mechanism: wait.mechanism,
                    retryAt: wait.retryAt.toISOString(),
                    reason: wait.reason,
                    module: wait.module,
                    deferrals: wait.deferrals,
                    deferralId: wait.deferralId,
                    updatedAt: new Date().toISOString(),
                },
            },
        });
    }
}

module.exports = { RecordRateLimitWait };
