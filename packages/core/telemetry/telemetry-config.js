/**
 * Resolves and validates the telemetry section of an app definition
 * into a normalized config the TelemetryService and
 * usage rollup consume: `{ exporter, northStar, sampleRatio }`.
 *
 * Exporter default is keyed off STAGE: only a genuinely LOCAL run (STAGE=local)
 * gets `console` (visible, free); every deployed stage — including `dev` —
 * defaults to `none`. `dev` is a deployed AWS stage, and `console` there would
 * write full spans to CloudWatch by default (cost + a data-exposure surface).
 * Adopters opt into `console`/`otlp` explicitly for deployed stages.
 */
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
        return stage === 'local' ? { type: 'console' } : { type: 'none' };
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

// Fraction of TRACES exported (0..1, default 1) — a cost knob wired to the OTel
// sampler in otel-telemetry. Does NOT thin usage counters; those stay exact.
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

/**
 * Adopter-declared telemetry subscribers. Each is either a factory
 * function `fn(telemetry)` or a declarative `{ event?, handler }` object. Kept as
 * an array so `wireTelemetrySubscribers` can attach them to the bus at runtime.
 */
function resolveSubscribers(subscribers) {
    if (subscribers === undefined || subscribers === null) return [];
    if (!Array.isArray(subscribers)) {
        throw new Error(
            '[Frigg][telemetry] subscribers must be an array of functions or { handler } objects'
        );
    }
    for (const subscriber of subscribers) {
        const ok =
            typeof subscriber === 'function' ||
            (subscriber && typeof subscriber.handler === 'function');
        if (!ok) {
            throw new Error(
                '[Frigg][telemetry] each subscriber must be a function or an object with a handler function'
            );
        }
    }
    return subscribers;
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
        subscribers: resolveSubscribers(telemetry.subscribers),
    };
}

module.exports = { resolveTelemetryConfig };
