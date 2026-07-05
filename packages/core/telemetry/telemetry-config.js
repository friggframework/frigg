/**
 * Resolves and validates the telemetry section of an app definition
 * (ADR-011 Decisions 1 & 5) into a normalized config the TelemetryService and
 * usage rollup consume: `{ exporter, northStar, sampleRatio }`.
 *
 * Exporter default is keyed off STAGE (Fable advisor sharp-question #3):
 * local-dev stages get `console` (visible, free — telemetry "rides for free" in
 * dev), everything else gets `none` (zero cost in prod unless the adopter
 * explicitly configures an OTLP backend, which also has real per-event cost).
 */
const LOCAL_DEV_STAGES = ['dev', 'test', 'local'];
const VALID_EXPORTER_TYPES = [
    'none',
    'noop',
    'console',
    'otlp',
    'honeycomb',
    'datadog',
];

function resolveExporter(exporter, stage) {
    if (!exporter) {
        return LOCAL_DEV_STAGES.includes(stage)
            ? { type: 'console' }
            : { type: 'none' };
    }

    // Pre-built exporter instances (tests / advanced adopters) bypass type checks.
    if (exporter.traceExporter || exporter.metricExporter) {
        return exporter;
    }

    if (!VALID_EXPORTER_TYPES.includes(exporter.type)) {
        throw new Error(
            `[Frigg][telemetry] invalid exporter type "${exporter.type}". ` +
                `Supported: ${VALID_EXPORTER_TYPES.join(', ')}`
        );
    }
    return exporter;
}

function resolveSampleRatio(sampleRatio) {
    if (sampleRatio === undefined || sampleRatio === null) return 1;
    if (
        typeof sampleRatio !== 'number' ||
        Number.isNaN(sampleRatio) ||
        sampleRatio < 0 ||
        sampleRatio > 1
    ) {
        throw new Error(
            `[Frigg][telemetry] sampleRatio must be a number in [0,1], got ${sampleRatio}`
        );
    }
    return sampleRatio;
}

function validateNorthStarEntry(entry, where) {
    if (!entry || typeof entry.name !== 'string' || !entry.name) {
        throw new Error(
            `[Frigg][telemetry] northStar.${where} must reference a counter { name }`
        );
    }
}

function resolveNorthStar(northStar) {
    if (!northStar) return null;
    if (northStar.default) validateNorthStarEntry(northStar.default, 'default');
    if (northStar.byType) {
        for (const [type, entry] of Object.entries(northStar.byType)) {
            validateNorthStarEntry(entry, `byType.${type}`);
        }
    }
    return northStar;
}

/**
 * @param {object} appDefinition The backend `Definition` export.
 * @param {object} [ctx]
 * @param {string} [ctx.stage] Deployment stage (defaults to STAGE/NODE_ENV).
 * @returns {{ exporter: object, northStar: object|null, sampleRatio: number }}
 */
function resolveTelemetryConfig(appDefinition = {}, ctx = {}) {
    const stage =
        ctx.stage || process.env.STAGE || process.env.NODE_ENV || 'production';
    const telemetry = appDefinition.telemetry || {};

    return {
        exporter: resolveExporter(telemetry.exporter, stage),
        northStar: resolveNorthStar(telemetry.northStar),
        sampleRatio: resolveSampleRatio(telemetry.sampleRatio),
    };
}

module.exports = { resolveTelemetryConfig };
