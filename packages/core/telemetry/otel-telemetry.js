const otelApi = require('@opentelemetry/api');
const {
    BasicTracerProvider,
    BatchSpanProcessor,
    ParentBasedSampler,
    TraceIdRatioBasedSampler,
    AlwaysOnSampler,
} = require('@opentelemetry/sdk-trace-base');
const {
    MeterProvider,
    PeriodicExportingMetricReader,
} = require('@opentelemetry/sdk-metrics');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { buildExporters } = require('./exporters/exporter-factory');
const { createTelemetryEventBus } = require('./telemetry-event-bus');
const {
    runWithTelemetryContext,
    mergeTelemetryContext,
} = require('./telemetry-context');

const TRACER_NAME = 'frigg';
const METRIC_EXPORT_INTERVAL_MS =
    Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS) || 60000;

/**
 * The OpenTelemetry-backed telemetry service (ADR-011 Decision 1). Reached only
 * when a real exporter is configured; `createTelemetry` returns the no-op
 * otherwise. `BatchSpanProcessor` is used uniformly — spans are delivered by the
 * bounded `forceFlush()` the Lambda handler awaits before the container freezes
 * (`callbackWaitsForEmptyEventLoop=false`), never by background timers.
 */
function createOtelTelemetry({
    exporter,
    resource = {},
    sampleRatio,
    bus = createTelemetryEventBus(),
} = {}) {
    const { traceExporter, metricExporter } = buildExporters(exporter);

    const resourceAttrs = {
        'service.name': resource.service || 'frigg',
    };
    if (resource.stage) {
        resourceAttrs['deployment.environment'] = resource.stage;
        resourceAttrs.stage = resource.stage;
    }
    if (resource.appName) resourceAttrs.appName = resource.appName;
    const res = resourceFromAttributes(resourceAttrs);

    const sampler =
        typeof sampleRatio === 'number' && sampleRatio < 1
            ? new ParentBasedSampler({
                  root: new TraceIdRatioBasedSampler(sampleRatio),
              })
            : new AlwaysOnSampler();

    const tracerProvider = new BasicTracerProvider({
        resource: res,
        sampler,
        spanProcessors: traceExporter
            ? [new BatchSpanProcessor(traceExporter)]
            : [],
    });

    const metricReader = metricExporter
        ? new PeriodicExportingMetricReader({
              exporter: metricExporter,
              exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
          })
        : null;
    const meterProvider = new MeterProvider({
        resource: res,
        readers: metricReader ? [metricReader] : [],
    });

    const tracer = tracerProvider.getTracer(TRACER_NAME);
    const meter = meterProvider.getMeter(TRACER_NAME);

    // Counters/UpDownCounters are cached — OTel requires one instrument instance
    // per metric name, and re-creating them would drop data points.
    const counters = new Map();
    function getCounter(name) {
        if (!counters.has(name)) counters.set(name, meter.createCounter(name));
        return counters.get(name);
    }

    const service = {
        count(name, value = 1, attributes = {}, context) {
            try {
                getCounter(name).add(value, attributes);
            } catch (_) {
                // Telemetry must never break the wrapped path.
            }
            // Mirror onto the internal stream for the usage rollup + plugin taps.
            // The bus `context` merges the ambient handler context (incl.
            // high-cardinality ids) with any explicit per-call context — it rides
            // the bus only, never the OTel metric attributes (Cardinality note).
            const merged = mergeTelemetryContext(context);
            const payload = { name, value, attributes };
            if (merged) payload.context = merged;
            bus.emit('metric', payload);
        },

        event(name, attributes = {}, context) {
            try {
                const active = otelApi.trace.getActiveSpan();
                if (active) active.addEvent(name, attributes);
            } catch (_) {}
            const merged = mergeTelemetryContext(context);
            const payload = { name, attributes };
            if (merged) payload.context = merged;
            bus.emit('event', payload);
        },

        startSpan(name, options) {
            return tracer.startSpan(name, options);
        },

        async span(name, fn, options = {}) {
            return tracer.startActiveSpan(name, options, async (span) => {
                try {
                    const result =
                        typeof fn === 'function' ? await fn(span) : undefined;
                    span.setStatus({ code: otelApi.SpanStatusCode.OK });
                    return result;
                } catch (err) {
                    span.recordException(err);
                    span.setStatus({
                        code: otelApi.SpanStatusCode.ERROR,
                        message: err && err.message,
                    });
                    throw err;
                } finally {
                    span.end();
                }
            });
        },

        /**
         * Run `fn` with the given identifiers on (a) the AsyncLocalStorage
         * telemetry context — which the usage rollup reads to attribute emissions
         * per-integration on ANY path — and (b) OTel baggage for trace
         * propagation. High-cardinality ids ride here, never on metric labels.
         */
        async withContext(attributes = {}, fn) {
            const entries = {};
            for (const [key, value] of Object.entries(attributes)) {
                if (value !== undefined && value !== null) {
                    entries[key] = { value: String(value) };
                }
            }
            const baggage = otelApi.propagation.createBaggage(entries);
            const ctx = otelApi.propagation.setBaggage(
                otelApi.context.active(),
                baggage
            );
            return runWithTelemetryContext(attributes, () =>
                otelApi.context.with(ctx, () =>
                    typeof fn === 'function' ? fn() : undefined
                )
            );
        },

        on(eventType, callback) {
            return bus.on(eventType, callback);
        },

        async forceFlush() {
            await Promise.allSettled([
                tracerProvider.forceFlush(),
                meterProvider.forceFlush(),
            ]);
        },

        async shutdown() {
            await Promise.allSettled([
                tracerProvider.shutdown(),
                meterProvider.shutdown(),
            ]);
        },

        isEnabled() {
            return true;
        },
    };

    return service;
}

module.exports = { createOtelTelemetry };
