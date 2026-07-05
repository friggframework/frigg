const { createTelemetry, isNoOpExporter } = require('./telemetry-service');
const { createNoOpTelemetry } = require('./no-op-telemetry');
const { createTelemetryEventBus } = require('./telemetry-event-bus');
const { resolveTelemetryConfig } = require('./telemetry-config');
const {
    getTelemetry,
    resetTelemetryForTests,
} = require('./telemetry-singleton');
const { buildExporters } = require('./exporters/exporter-factory');
const { instrumentHandler } = require('./instrument-handler');
const { bindTelemetryContext } = require('./bind-telemetry-context');
const { createUsageRollupSubscriber } = require('./usage-rollup-subscriber');
const {
    getUsageRollupSubscriber,
    resetUsageRollupForTests,
} = require('./usage-rollup-singleton');
const { computeUsageWindows } = require('./usage-windows');
const {
    resolveNorthStarEntry,
    northStarKeys,
    createNorthStarDerivationSubscriber,
} = require('./north-star');
const {
    CANONICAL_COUNTERS,
    AUTO_SIGNAL_TO_CANONICAL,
    isCanonicalCounter,
    canonicalForSignal,
} = require('./canonical-counters');

module.exports = {
    createTelemetry,
    createNoOpTelemetry,
    createTelemetryEventBus,
    resolveTelemetryConfig,
    getTelemetry,
    resetTelemetryForTests,
    isNoOpExporter,
    buildExporters,
    instrumentHandler,
    bindTelemetryContext,
    createUsageRollupSubscriber,
    getUsageRollupSubscriber,
    resetUsageRollupForTests,
    computeUsageWindows,
    resolveNorthStarEntry,
    northStarKeys,
    createNorthStarDerivationSubscriber,
    CANONICAL_COUNTERS,
    AUTO_SIGNAL_TO_CANONICAL,
    isCanonicalCounter,
    canonicalForSignal,
};
