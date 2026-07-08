const { createTelemetry } = require('./telemetry-service');
const { NoOpTelemetry } = require('./no-op-telemetry');

/**
 * Process-wide telemetry singleton. Created lazily on first use and
 * reused for the life of the Lambda container, so the OTel SDK initialises at
 * most once per cold start. Building it never throws — any failure (e.g. no app
 * definition on disk in a unit test) falls back to the no-op so a handler is
 * never broken by telemetry setup.
 */
let instance = null;

function getTelemetry() {
    if (instance) return instance;
    try {
        // Lazy-required to avoid a load-time cycle with the handlers layer.
        const {
            loadAppDefinition,
        } = require('../handlers/app-definition-loader');
        const { telemetry = {} } = loadAppDefinition();
        const stage = process.env.STAGE || process.env.NODE_ENV || 'production';
        instance = createTelemetry({
            exporter: telemetry.exporter,
            sampleRatio: telemetry.sampleRatio,
            resource: {
                service: process.env.FRIGG_STACK || 'frigg',
                stage,
            },
        });
    } catch (_) {
        instance = new NoOpTelemetry();
    }
    return instance;
}

/** Test-only: drop the cached instance so the next getTelemetry rebuilds it. */
function resetTelemetryForTests() {
    instance = null;
}

module.exports = { getTelemetry, resetTelemetryForTests };
