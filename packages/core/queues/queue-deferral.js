const MAX_DEFERRALS = 10;
const MAX_DEFERRED_MS = 24 * 60 * 60 * 1000;
const MAX_DELAY_SECONDS = 900;
const MAX_VISIBILITY_TIMEOUT_SECONDS = 43_200;
const MAX_DEFERRALS_ENV = 'FRIGG_QUEUE_MAX_DEFERRALS';
const MAX_DEFERRED_MS_ENV = 'FRIGG_QUEUE_MAX_DEFERRED_MS';

const toPositiveInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : undefined;
};

/**
 * @typedef {Object} DeferralLimits
 * @property {number} maxDeferrals Times one message may be put back for a rate limit.
 * @property {number} maxDeferredMs Longest total time from the first deferral to the last retry time.
 */

/**
 * @param {Object} [env=process.env]
 * @returns {DeferralLimits}
 */
const readDeferralLimits = (env = process.env) => ({
    maxDeferrals: toPositiveInteger(env[MAX_DEFERRALS_ENV]) ?? MAX_DEFERRALS,
    maxDeferredMs:
        toPositiveInteger(env[MAX_DEFERRED_MS_ENV]) ?? MAX_DEFERRED_MS,
});

/**
 * The deferral counters a message body carries in `_frigg`.
 * @returns {{deferrals: number, firstDeferredAt: string|undefined}}
 */
const readDeferral = (body) => {
    const frigg = body?._frigg;
    const deferrals =
        Number.isInteger(frigg?.deferrals) && frigg.deferrals > 0
            ? frigg.deferrals
            : 0;
    const firstDeferredAt =
        typeof frigg?.firstDeferredAt === 'string' &&
        !Number.isNaN(Date.parse(frigg.firstDeferredAt))
            ? frigg.firstDeferredAt
            : undefined;
    return { deferrals, firstDeferredAt };
};

const nextDeferral = (body, now = Date.now()) => {
    const current = readDeferral(body);
    return {
        deferrals: current.deferrals + 1,
        firstDeferredAt: current.firstDeferredAt ?? new Date(now).toISOString(),
    };
};

const withDeferral = (body, deferral) => ({
    ...body,
    _frigg: { ...body._frigg, ...deferral },
});

const isDeferralCapped = (
    { deferrals, firstDeferredAt, retryAt },
    { maxDeferrals, maxDeferredMs }
) =>
    deferrals > maxDeferrals ||
    retryAt.getTime() - Date.parse(firstDeferredAt) > maxDeferredMs;

module.exports = {
    MAX_DEFERRALS,
    MAX_DEFERRALS_ENV,
    MAX_DEFERRED_MS,
    MAX_DEFERRED_MS_ENV,
    MAX_DELAY_SECONDS,
    MAX_VISIBILITY_TIMEOUT_SECONDS,
    isDeferralCapped,
    nextDeferral,
    readDeferral,
    readDeferralLimits,
    withDeferral,
};
