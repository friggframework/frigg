// Public telemetry surface. Framework-internal modules (adapters, bus, config,
// exporters, subscribers, rollup) are deep-required by their consumers, not
// re-exported here — every barrel export is semver surface.
const { createTelemetry } = require('./telemetry-service');
const {
    getTelemetry,
    setTelemetryForTests,
    resetTelemetryRuntimeForTests,
} = require('./telemetry-runtime');
const { bindTelemetryContext } = require('./bind-telemetry-context');
const { instrumentHandler } = require('./instrument-handler');
const {
    CANONICAL_COUNTERS,
    isCanonicalCounter,
} = require('./canonical-counters');

module.exports = {
    createTelemetry,
    getTelemetry,
    setTelemetryForTests,
    resetTelemetryRuntimeForTests,
    bindTelemetryContext,
    instrumentHandler,
    CANONICAL_COUNTERS,
    isCanonicalCounter,
};
