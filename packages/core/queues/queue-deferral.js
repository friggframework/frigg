const MAX_DEFERRALS = 30;
const MAX_DEFERRED_MS = 26 * 60 * 60 * 1000;
const MAX_DELAY_SECONDS = 900;
const MAX_VISIBILITY_TIMEOUT_SECONDS = 43_200;
const MAX_DEFERRALS_ENV = 'FRIGG_QUEUE_MAX_DEFERRALS';
const MAX_DEFERRED_MS_ENV = 'FRIGG_QUEUE_MAX_DEFERRED_MS';

const toPositiveInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : undefined;
};

const readDeferralLimits = (env = process.env) => ({
    maxDeferrals: toPositiveInteger(env[MAX_DEFERRALS_ENV]) ?? MAX_DEFERRALS,
    maxDeferredMs:
        toPositiveInteger(env[MAX_DEFERRED_MS_ENV]) ?? MAX_DEFERRED_MS,
});

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
