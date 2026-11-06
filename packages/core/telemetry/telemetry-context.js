const {
    runInContext,
    getContext,
    hasOnlyLoggerKeys,
    LOGGER_SCOPE_KEY,
} = require('../logs/context');

/**
 * Ambient telemetry context. The one process-wide AsyncLocalStorage
 * (owned by logs/context.js, shared with the logger scope) holds the standard identifiers ({integrationId, integrationType, userId,
 * version, ...}) for the duration of a handler, set once at the handler seam via
 * `telemetry.withContext(...)`. Any emission during that async scope — including
 * deep calls like an API-module request — reads the ambient context, so the
 * usage rollup can attribute counters per-integration WITHOUT threading context
 * through every call and WITHOUT relying on OTel baggage (which does not exist
 * on the no-op path). This is the propagation mechanism the plan intended.
 *
 * Only bus-payload `context` is populated from here; high-cardinality ids never
 * touch OTel metric labels. A nested run merges: an undefined key keeps the
 * outer value, an explicit null is stored as null.
 */
function withoutLoggerKeys(store) {
    if (!store || hasOnlyLoggerKeys(store)) return null;
    const { [LOGGER_SCOPE_KEY]: _logger, ...rest } = store;
    return rest;
}

function runWithTelemetryContext(context, fn) {
    return runInContext(context, fn);
}

function getTelemetryContextStore() {
    return withoutLoggerKeys(getContext());
}

/**
 * Merge the ambient context with an explicit per-call context (explicit keys
 * win, e.g. a request `url`). Returns undefined when there is nothing to attach.
 * The logger sub-object never reaches the bus payload.
 */
function mergeTelemetryContext(explicit) {
    const ambient = withoutLoggerKeys(getContext());
    if (!ambient && !explicit) return undefined;
    return { ...(ambient || {}), ...(explicit || {}) };
}

module.exports = {
    runWithTelemetryContext,
    getTelemetryContextStore,
    mergeTelemetryContext,
};
