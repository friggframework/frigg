const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Ambient telemetry context. A single process-wide AsyncLocalStorage
 * holds the standard identifiers ({integrationId, integrationType, userId,
 * version, ...}) for the duration of a handler, set once at the handler seam via
 * `telemetry.withContext(...)`. Any emission during that async scope — including
 * deep calls like an API-module request — reads the ambient context, so the
 * usage rollup can attribute counters per-integration WITHOUT threading context
 * through every call and WITHOUT relying on OTel baggage (which does not exist
 * on the no-op path). This is the propagation mechanism the plan intended.
 *
 * Only bus-payload `context` is populated from here; high-cardinality ids never
 * touch OTel metric labels.
 */
const store = new AsyncLocalStorage();

function runWithTelemetryContext(context, fn) {
    return store.run(context || {}, fn);
}

function getTelemetryContextStore() {
    return store.getStore() || null;
}

/**
 * Merge the ambient context with an explicit per-call context (explicit keys
 * win, e.g. a request `url`). Returns undefined when there is nothing to attach.
 */
function mergeTelemetryContext(explicit) {
    const ambient = store.getStore();
    if (!ambient && !explicit) return undefined;
    return { ...(ambient || {}), ...(explicit || {}) };
}

module.exports = {
    runWithTelemetryContext,
    getTelemetryContextStore,
    mergeTelemetryContext,
};
