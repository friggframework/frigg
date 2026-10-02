const { Requester } = require('./requester');
const {
    createMemorySink,
    getLogger,
    resetLoggerForTests,
} = require('../../logs');

class TestRequester extends Requester {
    async addAuthHeaders(headers) {
        return headers;
    }
}

let sink;

beforeEach(() => {
    sink = createMemorySink();
});

describe('Requester logger', () => {
    it('uses params.logger', () => {
        const logger = getLogger('module.custom');
        const requester = new TestRequester({ logger });
        expect(requester.logger).toBe(logger);
    });

    it('falls back to module.<label> from _telemetryModuleLabel()', () => {
        const requester = new TestRequester({});
        requester.logger.info('x');
        expect(sink.records[0].logger).toBe('module.TestRequester');
    });

    it('resolves the fallback lazily, so a later delegate is honoured', () => {
        const requester = new TestRequester({});
        requester.delegate = { name: 'hubspot' };
        requester.logger.info('x');
        expect(sink.records[0].logger).toBe('module.hubspot');
    });

    it('honours moduleName over the delegate', () => {
        const requester = new TestRequester({ delegate: { name: 'hubspot' } });
        requester.moduleName = 'hubspot-v2';
        expect(requester.logger.name).toBe('module.hubspot-v2');
    });

    it('accepts an assigned logger', () => {
        const requester = new TestRequester({});
        const logger = getLogger('module.assigned');
        requester.logger = logger;
        expect(requester.logger).toBe(logger);
    });

    it('does not throw without params', () => {
        expect(() => new Requester()).not.toThrow();
        expect(new Requester().logger.name).toBe('module.Requester');
    });

    it('writes no DEBUG record at INFO and never reads the request headers', async () => {
        resetLoggerForTests({ level: 'INFO', sinks: [] });
        sink = createMemorySink();
        const headersRead = jest.fn(() => ({}));
        const fetch = jest.fn(async (_url, options) => {
            expect(options).toBeDefined();
            return {
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => ({ ok: true }),
            };
        });
        const requester = new TestRequester({ fetch, requestTimeoutMs: 0 });
        const options = { url: 'https://h.example/p' };
        Object.defineProperty(options, 'headers', {
            enumerable: true,
            get: headersRead,
        });

        await requester._get(options);

        expect(sink.records.filter((r) => r.level === 'DEBUG')).toEqual([]);
        expect(headersRead).toHaveBeenCalledTimes(1);
    });
});
