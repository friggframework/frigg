const { Requester } = require('./requester');
const { NoOpTelemetry } = require('../../telemetry/no-op-telemetry');
const {
    createTelemetryEventBus,
} = require('../../telemetry/telemetry-event-bus');

class TestRequester extends Requester {
    async addAuthHeaders(headers) {
        return headers;
    }
}

function harness(fetchImpl) {
    const bus = createTelemetryEventBus();
    const telemetry = new NoOpTelemetry({ bus });
    const metrics = [];
    bus.on('metric', (m) => metrics.push(m));
    const requester = new TestRequester({
        telemetry,
        fetch: fetchImpl,
        backOff: [],
    });
    return { requester, metrics };
}

const jsonOk = (body = { ok: true }) => ({
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
});

describe('Requester — apimodule.requests instrumentation (ADR-011 P7)', () => {
    it('emits one frigg.apimodule.requests metric on a successful request', async () => {
        const { requester, metrics } = harness(async () => jsonOk());

        await requester._request('https://api.example.com/contacts/8842361', {
            method: 'GET',
        });

        const apiMetrics = metrics.filter(
            (m) => m.name === 'frigg.apimodule.requests'
        );
        expect(apiMetrics).toHaveLength(1);
        expect(apiMetrics[0].attributes).toMatchObject({
            method: 'GET',
            status: 'ok',
        });
    });

    it('never puts the (unbounded) endpoint URL on the metric attributes', async () => {
        const { requester, metrics } = harness(async () => jsonOk());

        await requester._request('https://api.example.com/contacts/8842361', {
            method: 'GET',
        });

        const attrs = metrics.find(
            (m) => m.name === 'frigg.apimodule.requests'
        ).attributes;
        expect(attrs).not.toHaveProperty('endpoint');
        expect(JSON.stringify(attrs)).not.toContain('8842361');
    });

    it('redacts the query string from the emitted URL (no secrets in telemetry)', async () => {
        const { requester, metrics } = harness(async () => jsonOk());

        await requester._request(
            'https://api.example.com/contacts?api_key=SECRET123&token=abc',
            { method: 'GET' }
        );

        const ctx = metrics.find(
            (m) => m.name === 'frigg.apimodule.requests'
        ).context;
        expect(ctx.url).toBe('https://api.example.com/contacts');
        expect(JSON.stringify(ctx)).not.toContain('SECRET123');
        expect(JSON.stringify(ctx)).not.toContain('token=abc');
    });

    it('emits an error-status metric when the request fails', async () => {
        const { requester, metrics } = harness(async () => ({
            status: 404,
            headers: { get: () => 'application/json' },
            text: async () => 'not found',
            json: async () => ({}),
        }));

        await expect(
            requester._request('https://api.example.com/missing', {
                method: 'GET',
            })
        ).rejects.toBeDefined();

        const apiMetrics = metrics.filter(
            (m) => m.name === 'frigg.apimodule.requests'
        );
        expect(apiMetrics).toHaveLength(1);
        expect(apiMetrics[0].attributes.status).not.toBe('ok');
    });
});
