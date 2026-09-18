const { resolveTelemetryConfig } = require('./telemetry-config');

describe('resolveTelemetryConfig — exporter default by stage', () => {
    it('defaults to no-op in production-like stages when telemetry is absent', () => {
        const cfg = resolveTelemetryConfig({}, { stage: 'production' });
        expect(cfg.exporter).toEqual({ type: 'none' });
        expect(cfg.sampleRatio).toBe(1);
        expect(cfg.northStar).toBeNull();
    });

    it('defaults to console only for a genuinely local run (STAGE=local)', () => {
        expect(resolveTelemetryConfig({}, { stage: 'local' }).exporter).toEqual(
            {
                type: 'console',
            }
        );
    });

    it.each(['dev', 'test', 'staging'])(
        'defaults to none in deployed stage "%s" (no surprise CloudWatch spans)',
        (stage) => {
            expect(resolveTelemetryConfig({}, { stage }).exporter).toEqual({
                type: 'none',
            });
        }
    );

    it('passes an explicit exporter through unchanged', () => {
        const exporter = { type: 'otlp', endpoint: 'https://otlp.example' };
        const cfg = resolveTelemetryConfig(
            { telemetry: { exporter } },
            { stage: 'production' }
        );
        expect(cfg.exporter).toEqual(exporter);
    });

    it('rejects an unknown exporter type', () => {
        expect(() =>
            resolveTelemetryConfig(
                { telemetry: { exporter: { type: 'kafka' } } },
                { stage: 'production' }
            )
        ).toThrow(/exporter/i);
    });
});

describe('resolveTelemetryConfig — sampleRatio', () => {
    it('accepts a ratio in [0,1]', () => {
        const cfg = resolveTelemetryConfig(
            { telemetry: { exporter: { type: 'console' }, sampleRatio: 0.1 } },
            { stage: 'production' }
        );
        expect(cfg.sampleRatio).toBe(0.1);
    });

    it.each([2, -1, 'x', NaN])('rejects an out-of-range ratio %p', (bad) => {
        expect(() =>
            resolveTelemetryConfig(
                { telemetry: { sampleRatio: bad } },
                { stage: 'production' }
            )
        ).toThrow(/sampleRatio/i);
    });
});

describe('resolveTelemetryConfig — northStar', () => {
    it('accepts a default north-star referencing a counter key', () => {
        const cfg = resolveTelemetryConfig(
            {
                telemetry: {
                    northStar: { default: { name: 'records.synced' } },
                },
            },
            { stage: 'production' }
        );
        expect(cfg.northStar).toEqual({
            default: { name: 'records.synced' },
        });
    });

    it('accepts byType with a derived-from-trace mapping', () => {
        const northStar = {
            byType: {
                crm: {
                    name: 'contacts_synced',
                    deriveFrom: {
                        apiRequest: { endpoint: '/contacts', method: 'POST' },
                    },
                },
            },
        };
        const cfg = resolveTelemetryConfig(
            { telemetry: { northStar } },
            { stage: 'production' }
        );
        expect(cfg.northStar).toEqual(northStar);
    });

    it('rejects a north-star entry missing a counter name', () => {
        expect(() =>
            resolveTelemetryConfig(
                { telemetry: { northStar: { default: {} } } },
                { stage: 'production' }
            )
        ).toThrow(/northStar/i);
    });
});

describe('resolveTelemetryConfig — subscribers (Decision 6 plugin/extension taps)', () => {
    it('defaults subscribers to an empty array when absent', () => {
        const cfg = resolveTelemetryConfig({}, { stage: 'production' });
        expect(cfg.subscribers).toEqual([]);
    });

    it('passes through function and { handler } subscribers unchanged', () => {
        const fn = () => {};
        const obj = { event: 'metric', handler: () => {} };
        const cfg = resolveTelemetryConfig(
            { telemetry: { subscribers: [fn, obj] } },
            { stage: 'production' }
        );
        expect(cfg.subscribers).toEqual([fn, obj]);
    });

    it('rejects a non-array subscribers value', () => {
        expect(() =>
            resolveTelemetryConfig(
                { telemetry: { subscribers: {} } },
                { stage: 'production' }
            )
        ).toThrow(/subscribers/i);
    });

    it('rejects a subscriber that is neither a function nor a { handler }', () => {
        expect(() =>
            resolveTelemetryConfig(
                { telemetry: { subscribers: [{ event: 'metric' }] } },
                { stage: 'production' }
            )
        ).toThrow(/subscriber/i);
    });
});
