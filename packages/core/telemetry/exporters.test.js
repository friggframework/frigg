const { resolveExporter, otlpTarget, joinPath } = require('./exporters');

describe('otlpTarget', () => {
    it('presets honeycomb endpoint + x-honeycomb-team header from apiKey', () => {
        expect(otlpTarget({ type: 'honeycomb', apiKey: 'secret' })).toEqual({
            endpoint: 'https://api.honeycomb.io',
            headers: { 'x-honeycomb-team': 'secret' },
        });
    });

    it('passes endpoint/headers through for otlp/datadog', () => {
        expect(
            otlpTarget({
                type: 'datadog',
                endpoint: 'https://dd',
                headers: { a: 1 },
            })
        ).toEqual({ endpoint: 'https://dd', headers: { a: 1 } });
    });
});

describe('joinPath', () => {
    it('joins base + signal path, trimming a trailing slash', () => {
        expect(joinPath('https://otlp.example/', '/v1/traces')).toBe(
            'https://otlp.example/v1/traces'
        );
        expect(joinPath('https://otlp.example', '/v1/metrics')).toBe(
            'https://otlp.example/v1/metrics'
        );
    });
});

describe('resolveExporter', () => {
    it('returns pre-built instances as-is (they win over type)', () => {
        const traceExporter = { export() {} };
        expect(resolveExporter({ type: 'otlp', traceExporter })).toEqual({
            traceExporter,
            metricExporter: null,
        });
    });

    it('builds a trace + metric pair for a known type', () => {
        const { traceExporter, metricExporter } = resolveExporter({
            type: 'otlp',
            endpoint: 'https://x',
        });
        expect(traceExporter).toBeTruthy();
        expect(metricExporter).toBeTruthy();
    });

    it('builds console exporters', () => {
        const { traceExporter, metricExporter } = resolveExporter({
            type: 'console',
        });
        expect(traceExporter).toBeTruthy();
        expect(metricExporter).toBeTruthy();
    });

    it('falls back to OTLP for an unknown/absent type', () => {
        expect(resolveExporter({ type: 'mystery' }).traceExporter).toBeTruthy();
        expect(resolveExporter({}).traceExporter).toBeTruthy();
    });

    it('does not resolve Object.prototype keys as builders', () => {
        for (const type of [
            'constructor',
            'toString',
            'hasOwnProperty',
            '__proto__',
            'valueOf',
        ]) {
            // falls through to OTLP, never throws
            expect(resolveExporter({ type }).traceExporter).toBeTruthy();
        }
    });
});
