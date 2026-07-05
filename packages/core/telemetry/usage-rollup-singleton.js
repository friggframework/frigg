const { createUsageRollupSubscriber } = require('./usage-rollup-subscriber');

/**
 * Process-wide usage-rollup subscriber (ADR-011 P9). Built once per cold start,
 * subscribed to the telemetry singleton's bus, and reused across invocations.
 * Returns null when usage is disabled (no integration declares Definition.usage)
 * or when the app definition can't be loaded — the handler then skips the flush.
 * Never throws.
 */
let subscriber = null;
let initialized = false;

function getUsageRollupSubscriber() {
    if (initialized) return subscriber;
    initialized = true;
    try {
        const {
            loadAppDefinition,
        } = require('../handlers/app-definition-loader');
        const { computeTrackedMetrics } = require('../usage/tracked-metrics');
        const {
            northStarKeys,
            createNorthStarDerivationSubscriber,
        } = require('./north-star');
        const { integrations = [], telemetry = {} } = loadAppDefinition();

        // Track both Definition.usage opt-ins and any North Star counter keys,
        // so a derived North Star persists even without an explicit usage decl.
        const trackedMetrics = computeTrackedMetrics(integrations);
        for (const key of northStarKeys(telemetry.northStar)) {
            trackedMetrics.add(key);
        }
        if (trackedMetrics.size === 0) {
            subscriber = null;
            return subscriber;
        }

        const { getTelemetry } = require('./telemetry-singleton');
        const {
            createUsageRepository,
        } = require('../usage/repositories/usage-repository-factory');
        const telemetryService = getTelemetry();

        subscriber = createUsageRollupSubscriber({
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
        // Usage disabled for this process — surface it so operators can tell
        // "usage off" from "usage broken" (e.g. unresolved DB_TYPE).
        console.warn(
            `[Frigg][usage] rollup disabled: ${error && error.message}`
        );
        subscriber = null;
    }
    return subscriber;
}

function resetUsageRollupForTests() {
    subscriber = null;
    initialized = false;
}

module.exports = { getUsageRollupSubscriber, resetUsageRollupForTests };
