const { createTelemetry, isNoOpExporter } = require('./telemetry-service');
const {
    TelemetryServiceInterface,
} = require('./telemetry-service-interface');
const { NoOpTelemetry } = require('./no-op-telemetry');
const { createTelemetryEventBus } = require('./telemetry-event-bus');
const { resolveTelemetryConfig } = require('./telemetry-config');
const {
    getTelemetry,
    resetTelemetryForTests,
} = require('./telemetry-singleton');
const { resolveExporter } = require('./exporters');
const { instrumentHandler } = require('./instrument-handler');
const { bindTelemetryContext } = require('./bind-telemetry-context');
const { createUsageRollupSubscriber } = require('./usage-rollup-subscriber');
const {
    getUsageRollupSubscriber,
    resetUsageRollupForTests,
} = require('./usage-rollup-singleton');
const { computeUsageWindows } = require('../usage/usage-windows');
const {
    resolveNorthStarEntry,
    northStarKeys,
    createNorthStarDerivationSubscriber,
} = require('./north-star');
const {
    CANONICAL_COUNTERS,
    isCanonicalCounter,
} = require('./canonical-counters');
const { wireTelemetrySubscribers } = require('./plugin-subscribers');
const {
    getPluginTelemetrySubscribers,
    resetPluginTelemetrySubscribersForTests,
} = require('./plugin-subscribers-singleton');

module.exports = {
    createTelemetry,
    TelemetryServiceInterface,
    NoOpTelemetry,
    createTelemetryEventBus,
    resolveTelemetryConfig,
    getTelemetry,
    resetTelemetryForTests,
    isNoOpExporter,
    resolveExporter,
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
    isCanonicalCounter,
    wireTelemetrySubscribers,
    getPluginTelemetrySubscribers,
    resetPluginTelemetrySubscribersForTests,
};
