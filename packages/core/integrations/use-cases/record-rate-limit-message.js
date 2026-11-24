const { readRateLimitPolicy } = require('../../modules/requester/rate-limit');
const { MAX_MESSAGES_PER_TYPE } = require('./update-integration-messages');

const RATE_LIMITED_MESSAGE_CODE = 'RATE_LIMITED';
const SAME_LIMIT_WINDOW_MS = 60_000;
const MINUTE_MS = 60_000;

const isNonEmptyString = (value) => typeof value === 'string' && value !== '';

const isLink = (link) =>
    typeof link?.label === 'string' && typeof link?.url === 'string';

const linkActions = (links) =>
    (Array.isArray(links) ? links : [])
        .filter(isLink)
        .map(({ label, url }) => ({ type: 'LINK', label, url }));

function formatMinuteUtc(date) {
    const minute = new Date(Math.ceil(date.getTime() / MINUTE_MS) * MINUTE_MS);
    return `${minute.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function defaultText(module, retryAt, capped) {
    if (capped) {
        return `The ${module} API rate limit was reached for longer than the integration waits. Some work may not complete.`;
    }
    return `The ${module} API rate limit was reached. The integration tries again at ${formatMinuteUtc(
        retryAt
    )}.`;
}

/**
 * Writes the client-safe RATE_LIMITED warning of ADR-049 section 5. The text
 * and the links come from the `userHints` of the module's `static rateLimit`,
 * keyed by reason.
 * @class RecordRateLimitMessage
 */
class RecordRateLimitMessage {
    /**
     * @param {Object} params
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository
     * @param {Array<{moduleName: string, API: Function}>} [params.moduleDefinitions] - The API module definitions of the integration.
     */
    constructor({ integrationRepository, moduleDefinitions = [] }) {
        if (!integrationRepository) {
            throw new Error('integrationRepository is required');
        }
        this.integrationRepository = integrationRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    /**
     * @param {string} integrationId
     * @param {Object} limit
     * @param {string} limit.module - The module that the RATE_LIMITED event names.
     * @param {string} [limit.reason]
     * @param {Date} limit.retryAt - The retry time, or the probe time when the provider gave none.
     * @param {boolean} [limit.capped] - True when a cap ended the deferrals.
     * @returns {Promise<boolean>} True when it wrote the warning. False when
     *   the same limit is stored already, or the event names no module.
     */
    async execute(integrationId, { module, reason, retryAt, capped = false }) {
        if (!isNonEmptyString(module)) return false;
        const hint = this._userHint(module, reason);
        const item = {
            title: 'Rate limit reached',
            message: isNonEmptyString(hint?.message)
                ? hint.message
                : defaultText(module, retryAt, capped),
            timestamp: Date.now(),
            code: RATE_LIMITED_MESSAGE_CODE,
            module,
            reason: reason ?? 'unknown',
            retryAt: retryAt.toISOString(),
            actions: [
                { type: 'RETRY_WHEN_READY' },
                ...linkActions(hint?.links),
            ],
        };
        return this.integrationRepository.appendRateLimitMessage(
            integrationId,
            'warnings',
            item,
            {
                retryAtFrom: new Date(
                    retryAt.getTime() - SAME_LIMIT_WINDOW_MS
                ).toISOString(),
                retryAtTo: new Date(
                    retryAt.getTime() + SAME_LIMIT_WINDOW_MS
                ).toISOString(),
                keepLast: MAX_MESSAGES_PER_TYPE,
            }
        );
    }

    _userHint(module, reason) {
        const definition = this.moduleDefinitions.find(
            (candidate) => candidate?.moduleName === module
        );
        return readRateLimitPolicy(definition?.API)?.userHints?.[reason];
    }
}

module.exports = { RATE_LIMITED_MESSAGE_CODE, RecordRateLimitMessage };
