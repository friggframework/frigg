const RATE_LIMITED_MESSAGE_CODE = 'RATE_LIMITED';
const SAME_LIMIT_WINDOW_MS = 60_000;
const MINUTE_MS = 60_000;

const isLink = (link) =>
    typeof link?.label === 'string' && typeof link?.url === 'string';

const linkActions = (links) =>
    (Array.isArray(links) ? links : [])
        .filter(isLink)
        .map(({ label, url }) => ({ type: 'LINK', label, url }));

function formatResetTime(date) {
    const minute = new Date(Math.ceil(date.getTime() / MINUTE_MS) * MINUTE_MS);
    return `${minute.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * @class RecordRateLimitMessage
 */
class RecordRateLimitMessage {
    /**
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     */
    constructor({ integrationRepository }) {
        this.integrationRepository = integrationRepository;
    }

    /**
     * @async
     * @param {string} integrationId - ID of the integration to warn on.
     * @param {Object} payload - The RATE_LIMITED payload of the Module.
     * @param {string} payload.moduleName
     * @param {string} payload.reason
     * @param {Date|string|number} payload.retryAt
     * @param {Array<{label: string, url: string}>} [payload.links]
     * @returns {Promise<boolean>} True when it wrote a warning.
     */
    async execute(integrationId, { moduleName, reason, retryAt, links }) {
        const resetAt = new Date(retryAt);
        const warnings =
            await this.integrationRepository.findIntegrationMessages(
                integrationId,
                'warnings'
            );
        const alreadyRecorded = warnings.some(
            (warning) =>
                warning?.code === RATE_LIMITED_MESSAGE_CODE &&
                warning.module === moduleName &&
                Math.abs(Date.parse(warning.retryAt) - resetAt.getTime()) <=
                    SAME_LIMIT_WINDOW_MS
        );
        if (alreadyRecorded) return false;

        const resetsAt = formatResetTime(resetAt);
        await this.integrationRepository.updateIntegrationMessages(
            integrationId,
            'warnings',
            {
                title: 'Rate limit reached',
                message: `The ${moduleName} API rate limit was reached and resets at ${resetsAt}.`,
                timestamp: Date.now(),
                code: RATE_LIMITED_MESSAGE_CODE,
                module: moduleName,
                reason,
                retryAt: resetAt.toISOString(),
                actions: [{ type: 'RETRY_WHEN_READY' }, ...linkActions(links)],
            }
        );
        return true;
    }
}

module.exports = { RecordRateLimitMessage };
