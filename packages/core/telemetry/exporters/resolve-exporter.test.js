const { resolveExporter } = require('./resolve-exporter');
const { OtlpExporter } = require('./otlp-exporter');
const { DatadogExporter } = require('./datadog-exporter');
const { HoneycombExporter } = require('./honeycomb-exporter');
const { ConsoleExporter } = require('./console-exporter');
const { PassthroughExporter } = require('./passthrough-exporter');

describe('resolveExporter (registry)', () => {
    it('maps each type to its adapter', () => {
        expect(resolveExporter({ type: 'console' })).toBeInstanceOf(
            ConsoleExporter
        );
        expect(resolveExporter({ type: 'otlp' })).toBeInstanceOf(OtlpExporter);
        expect(resolveExporter({ type: 'datadog' })).toBeInstanceOf(
            DatadogExporter
        );
        expect(resolveExporter({ type: 'honeycomb' })).toBeInstanceOf(
            HoneycombExporter
        );
    });

    it('defaults an unknown/absent type to plain OTLP', () => {
        expect(resolveExporter({ type: 'mystery' })).toBeInstanceOf(
            OtlpExporter
        );
        expect(resolveExporter({})).toBeInstanceOf(OtlpExporter);
    });

    it('defaults Object.prototype key names to OTLP (no prototype-chain leakage)', () => {
        for (const type of [
            'constructor',
            'toString',
            'hasOwnProperty',
            '__proto__',
            'valueOf',
        ]) {
            expect(resolveExporter({ type })).toBeInstanceOf(OtlpExporter);
        }
    });

    it('returns a passthrough for pre-built instances (instances win over type)', () => {
        const traceExporter = { export() {} };
        const resolved = resolveExporter({ type: 'otlp', traceExporter });
        expect(resolved).toBeInstanceOf(PassthroughExporter);
        expect(resolved.build()).toEqual({ traceExporter, metricExporter: null });
    });
});

describe('OtlpExporter', () => {
    it('joins endpoint + signal path (trailing slash trimmed) into the url', () => {
        const opts = new OtlpExporter({
            endpoint: 'https://otlp.example/',
        })._options('/v1/traces');
        expect(opts.url).toBe('https://otlp.example/v1/traces');
    });

    it('leaves url unset with no endpoint (SDK falls back to the OTLP env var)', () => {
        const opts = new OtlpExporter({})._options('/v1/metrics');
        expect(opts.url).toBeUndefined();
    });

    it('build() returns a trace + metric exporter', () => {
        const { traceExporter, metricExporter } = new OtlpExporter({
            endpoint: 'https://x',
        }).build();
        expect(traceExporter).toBeTruthy();
        expect(metricExporter).toBeTruthy();
    });
});

describe('HoneycombExporter', () => {
    it('presets the endpoint and x-honeycomb-team header from apiKey', () => {
        const hc = new HoneycombExporter({ apiKey: 'secret' });
        expect(hc.endpoint).toBe('https://api.honeycomb.io');
        expect(hc.headers).toEqual({ 'x-honeycomb-team': 'secret' });
    });

    it('is an OTLP exporter under the hood', () => {
        expect(new HoneycombExporter({ apiKey: 'k' })).toBeInstanceOf(
            OtlpExporter
        );
    });
});

describe('ConsoleExporter', () => {
    it('build() returns console trace + metric exporters', () => {
        const { traceExporter, metricExporter } = new ConsoleExporter().build();
        expect(traceExporter).toBeTruthy();
        expect(metricExporter).toBeTruthy();
    });
});

describe('DatadogExporter', () => {
    it('is a plain OTLP exporter today', () => {
        expect(new DatadogExporter({ endpoint: 'https://dd' })).toBeInstanceOf(
            OtlpExporter
        );
    });
});
