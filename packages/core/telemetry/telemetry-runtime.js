// The process composition root for telemetry: one shared state, per-part lazy
// getters, one atomic reset — replacing three separate singleton module caches
// (telemetry / usage-rollup / plugin-subscribers) that previously had to be
// reset together in the right order. Bus identity across the parts is guaranteed
// by construction: the rollup and plugin subscribers attach to the same
// getTelemetry() instance reached through this module's own closure.

const { createTelemetry } = require('./telemetry-service');
const { NoOpTelemetry } = require('./no-op-telemetry');

const UNSET = Symbol('unset');

function newState() {
    return { telemetry: null, usageRollup: UNSET, pluginSubscribers: UNSET };
}
let state = newState();

function loadTelemetryConfig() {
    // Lazy-required to avoid a load-time cycle with the handlers layer.
    const { loadAppDefinition } = require('../handlers/app-definition-loader');
    return loadAppDefinition();
}

/**
 * The process telemetry service. Created lazily on first use and reused for the
 * life of the Lambda container, so the OTel SDK initialises at most once per cold
 * start. Never throws — any failure falls back to the no-op.
 */
function getTelemetry() {
    if (state.telemetry) return state.telemetry;
    try {
        const { telemetry = {} } = loadTelemetryConfig();
        const stage = process.env.STAGE || process.env.NODE_ENV || 'production';
        state.telemetry = createTelemetry({
            exporter: telemetry.exporter,
            sampleRatio: telemetry.sampleRatio,
            resource: { service: process.env.FRIGG_STACK || 'frigg', stage },
        });
    } catch (_) {
        state.telemetry = new NoOpTelemetry();
    }
    return state.telemetry;
}

/**
 * The process usage-rollup subscriber, wired to getTelemetry()'s bus. Returns
 * null when usage is disabled (no Definition.usage opt-in and no North Star) or
 * the app definition can't load. Never throws — the warn lets operators tell
 * "usage off" from "usage broken" (e.g. unresolved DB_TYPE).
 */
function getUsageRollupSubscriber() {
    if (state.usageRollup !== UNSET) return state.usageRollup;
    state.usageRollup = null;
    try {
        const { computeTrackedMetrics } = require('../usage/tracked-metrics');
        const {
            northStarKeys,
            createNorthStarDerivationSubscriber,
        } = require('./north-star');
        const { integrations = [], telemetry = {} } = loadTelemetryConfig();

        // Track both Definition.usage opt-ins and any North Star counter keys,
        // so a derived North Star persists even without an explicit usage decl.
        const trackedMetrics = computeTrackedMetrics(integrations);
        for (const key of northStarKeys(telemetry.northStar)) {
            trackedMetrics.add(key);
        }
        if (trackedMetrics.size === 0) return state.usageRollup;

        const {
            createUsageRepository,
        } = require('../usage/repositories/usage-repository-factory');
        const {
            createUsageRollupSubscriber,
        } = require('./usage-rollup-subscriber');
        const telemetryService = getTelemetry(); // same memo → shared bus

        state.usageRollup = createUsageRollupSubscriber({
            telemetry: telemetryService,
            usageRepository: createUsageRepository(),
            trackedMetrics,
        });

        // North Star derived-from-trace: emits the North Star counter when a
        // configured signal matches; the emission flows to the rollup above.
        if (telemetry.northStar) {
            createNorthStarDerivationSubscriber({
                telemetry: telemetryService,
                northStar: telemetry.northStar,
            });
        }
    } catch (error) {
        console.warn(
            `[Frigg][usage] rollup disabled: ${error && error.message}`
        );
        state.usageRollup = null;
    }
    return state.usageRollup;
}

/**
 * Adopter-declared telemetry subscribers, wired to getTelemetry()'s bus once per
 * cold start. Independent of the usage rollup (adopter taps wire even when no
 * integration declares Definition.usage). Never throws.
 */
function getPluginTelemetrySubscribers() {
    if (state.pluginSubscribers !== UNSET) return state.pluginSubscribers;
    state.pluginSubscribers = [];
    try {
        const { wireTelemetrySubscribers } = require('./plugin-subscribers');
        const { telemetry = {} } = loadTelemetryConfig();
        const subscribers = telemetry.subscribers || [];
        if (subscribers.length === 0) return state.pluginSubscribers;

        state.pluginSubscribers = wireTelemetrySubscribers({
            telemetry: getTelemetry(),
            subscribers,
        });
    } catch (error) {
        console.warn(
            `[Frigg][telemetry] plugin subscribers disabled: ${
                error && error.message
            }`
        );
        state.pluginSubscribers = [];
    }
    return state.pluginSubscribers;
}

/** Test-only: reset the whole runtime — no stale cross-memo states possible. */
function resetTelemetryRuntimeForTests() {
    state = newState();
}

/** Test-only: install a telemetry service; dependent memos clear atomically. */
function setTelemetryForTests(telemetry) {
    state = newState();
    state.telemetry = telemetry;
}

module.exports = {
    getTelemetry,
    getUsageRollupSubscriber,
    getPluginTelemetrySubscribers,
    resetTelemetryRuntimeForTests,
    setTelemetryForTests,
};
