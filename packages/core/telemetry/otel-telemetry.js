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
const { resolveExporter } = require('./exporters');
const { createTelemetryEventBus } = require('./telemetry-event-bus');
const {
    runWithTelemetryContext,
    mergeTelemetryContext,
} = require('./telemetry-context');

const TRACER_NAME = 'frigg';
const METRIC_EXPORT_INTERVAL_MS =
    Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS) || 60000;

/**
 * Register an AsyncLocalStorage-backed OTel context manager once per process.
 * Without it `BasicTracerProvider` uses the Noop context manager, so
 * `startActiveSpan` never sets an active context — spans would be unparented
 * roots, `getActiveSpan()` always undefined, and baggage inert. Guarded so
 * repeated telemetry construction (tests) doesn't re-register.
 */
let contextManagerRegistered = false;
function ensureContextManager() {
    if (contextManagerRegistered) return;
    contextManagerRegistered = true;
    try {
        const {
            AsyncLocalStorageContextManager,
        } = require('@opentelemetry/context-async-hooks');
        const manager = new AsyncLocalStorageContextManager();
        manager.enable();
        otelApi.context.setGlobalContextManager(manager);
    } catch (_) {
        // If registration fails, traces are flat but usage attribution (which
        // rides the separate telemetry-context ALS) is unaffected.
    }
}

/**
 * OpenTelemetry-backed telemetry adapter. Constructed only when a real exporter
 * is configured (`createTelemetry` returns the no-op otherwise). `BatchSpanProcessor`
 * is used uniformly — spans are delivered by the bounded `forceFlush()` the Lambda
 * handler awaits before the container freezes (`callbackWaitsForEmptyEventLoop=false`),
 * never by background timers.
 */
class OtelTelemetry {
    constructor({
        exporter,
        resource = {},
        sampleRatio,
        bus = createTelemetryEventBus(),
    } = {}) {
        ensureContextManager();
        const { traceExporter, metricExporter } = resolveExporter(exporter);

        const resourceAttrs = { 'service.name': resource.service || 'frigg' };
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

        this._tracerProvider = new BasicTracerProvider({
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
        this._meterProvider = new MeterProvider({
            resource: res,
            readers: metricReader ? [metricReader] : [],
        });

        this._bus = bus;
        this._tracer = this._tracerProvider.getTracer(TRACER_NAME);
        this._meter = this._meterProvider.getMeter(TRACER_NAME);
        // One instrument instance per metric name — OTel requires it, and
        // re-creating a counter would drop data points.
        this._counters = new Map();
    }

    _getCounter(name) {
        if (!this._counters.has(name)) {
            this._counters.set(name, this._meter.createCounter(name));
        }
        return this._counters.get(name);
    }

    count(name, value = 1, attributes = {}, context) {
        try {
            this._getCounter(name).add(value, attributes);
        } catch (_) {
            // Telemetry must never break the wrapped path.
        }
        // Mirror onto the internal stream for the usage rollup + plugin taps; the
        // bus context (incl. high-cardinality ids) rides the bus only, never the
        // OTel metric attributes.
        const merged = mergeTelemetryContext(context);
        const payload = { name, value, attributes };
        if (merged) payload.context = merged;
        this._bus.emit('metric', payload);
    }

    event(name, attributes = {}, context) {
        try {
            const active = otelApi.trace.getActiveSpan();
            if (active) active.addEvent(name, attributes);
        } catch (_) {}
        const merged = mergeTelemetryContext(context);
        const payload = { name, attributes };
        if (merged) payload.context = merged;
        this._bus.emit('event', payload);
    }

    startSpan(name, options) {
        return this._tracer.startSpan(name, options);
    }

    async span(name, fn, options = {}) {
        return this._tracer.startActiveSpan(name, options, async (span) => {
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
    }

    /**
     * Run `fn` with the given identifiers on (a) the AsyncLocalStorage telemetry
     * context — which the usage rollup reads to attribute emissions per-integration
     * on ANY path — and (b) OTel baggage for trace propagation. High-cardinality
     * ids ride here, never on metric labels.
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
    }

    on(eventType, callback) {
        return this._bus.on(eventType, callback);
    }

    async forceFlush() {
        await Promise.allSettled([
            this._tracerProvider.forceFlush(),
            this._meterProvider.forceFlush(),
        ]);
    }

    async shutdown() {
        await Promise.allSettled([
            this._tracerProvider.shutdown(),
            this._meterProvider.shutdown(),
        ]);
    }

    isEnabled() {
        return true;
    }
}

module.exports = { OtelTelemetry };
