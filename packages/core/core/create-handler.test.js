jest.mock('../database/prisma', () => ({
    connectPrisma: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./secrets-to-env', () => ({
    secretsToEnv: jest.fn().mockResolvedValue(undefined),
}));

const { connectPrisma } = require('../database/prisma');
const { createHandler } = require('./create-handler');
const { getLogger, createMemorySink } = require('../logs');
const { HaltError } = require('../errors/halt-error');
const { httpApiV2Event, sqsEvent } = require('../logs/__fixtures__/events');
const { SECRETS } = require('../logs/__fixtures__/secrets');

describe('createHandler — shouldUseDatabase', () => {
    const ctx = { awsRequestId: 'r1' };

    beforeEach(() => {
        connectPrisma.mockClear();
        connectPrisma.mockResolvedValue(undefined);
    });

    it('connects to the database when shouldUseDatabase is true', async () => {
        const handler = createHandler({
            eventName: 'X',
            shouldUseDatabase: true,
            method: async () => ({ statusCode: 200 }),
        });
        await handler({}, { ...ctx });
        expect(connectPrisma).toHaveBeenCalledTimes(1);
    });

    it('does NOT connect when shouldUseDatabase is false', async () => {
        const handler = createHandler({
            eventName: 'X',
            shouldUseDatabase: false,
            method: async () => ({ statusCode: 200 }),
        });
        await handler({}, { ...ctx });
        expect(connectPrisma).not.toHaveBeenCalled();
    });

    it('connects before invoking the method', async () => {
        const order = [];
        connectPrisma.mockImplementation(async () => {
            order.push('connect');
        });
        const handler = createHandler({
            eventName: 'X',
            shouldUseDatabase: true,
            method: async () => {
                order.push('method');
                return { statusCode: 200 };
            },
        });
        await handler({}, { ...ctx });
        expect(order).toEqual(['connect', 'method']);
    });

    it('defaults to connecting when shouldUseDatabase is omitted (backwards-compatible)', async () => {
        const handler = createHandler({
            eventName: 'X',
            method: async () => ({ statusCode: 200 }),
        });
        await handler({}, { ...ctx });
        expect(connectPrisma).toHaveBeenCalledTimes(1);
    });
});

describe('createHandler — telemetry flush (ADR-011 P4)', () => {
    const ctx = { awsRequestId: 'r1' };

    it('force-flushes enabled telemetry after the method resolves', async () => {
        const forceFlush = jest.fn().mockResolvedValue(undefined);
        const telemetry = { isEnabled: () => true, forceFlush };
        const handler = createHandler({
            isUserFacingResponse: false,
            shouldUseDatabase: false,
            method: async () => 'ok',
            telemetry,
        });

        await handler({}, { ...ctx });

        expect(forceFlush).toHaveBeenCalledTimes(1);
    });

    it('force-flushes even when the method throws (finally path)', async () => {
        const forceFlush = jest.fn().mockResolvedValue(undefined);
        const telemetry = { isEnabled: () => true, forceFlush };
        const handler = createHandler({
            isUserFacingResponse: false,
            shouldUseDatabase: false,
            method: async () => {
                throw new Error('boom');
            },
            telemetry,
        });

        await expect(handler({}, { ...ctx })).rejects.toThrow('boom');
        expect(forceFlush).toHaveBeenCalledTimes(1);
    });

    it('does not flush a disabled (no-op) telemetry', async () => {
        const forceFlush = jest.fn();
        const telemetry = { isEnabled: () => false, forceFlush };
        const handler = createHandler({
            isUserFacingResponse: false,
            shouldUseDatabase: false,
            method: async () => 'ok',
            telemetry,
        });

        await handler({}, { ...ctx });

        expect(forceFlush).not.toHaveBeenCalled();
    });

    it('returns the response even if forceFlush hangs (bounded by timeout)', async () => {
        const telemetry = {
            isEnabled: () => true,
            forceFlush: () => new Promise(() => {}), // never resolves
        };
        const handler = createHandler({
            isUserFacingResponse: false,
            shouldUseDatabase: false,
            method: async () => 'ok',
            telemetry,
            flushTimeoutMs: 20,
        });

        await expect(handler({}, { ...ctx })).resolves.toBe('ok');
    });

    it('never lets a throwing forceFlush break the handler response', async () => {
        const telemetry = {
            isEnabled: () => true,
            forceFlush: async () => {
                throw new Error('flush exploded');
            },
        };
        const handler = createHandler({
            isUserFacingResponse: false,
            shouldUseDatabase: false,
            method: async () => 'ok',
            telemetry,
        });

        await expect(handler({}, { ...ctx })).resolves.toBe('ok');
    });
});

describe('createHandler — usage rollup flush (ADR-011 P9)', () => {
    const ctx = { awsRequestId: 'r1' };
    const noopTelemetry = { isEnabled: () => false, forceFlush: jest.fn() };
    const makeRollup = () => ({
        flush: jest.fn().mockResolvedValue(),
        discard: jest.fn(),
    });
    const dbHandler = (usageRollup) =>
        createHandler({
            isUserFacingResponse: false,
            shouldUseDatabase: true,
            method: async () => 'ok',
            telemetry: noopTelemetry,
            usageRollup,
        });

    it('flushes the usage rollup after a normal (non-SQS) DB-connected invocation', async () => {
        const usageRollup = makeRollup();
        await dbHandler(usageRollup)({}, { ...ctx });

        expect(usageRollup.flush).toHaveBeenCalledTimes(1);
        expect(usageRollup.discard).not.toHaveBeenCalled();
    });

    it('discards (does not flush) on an SQS redelivery to avoid double-counting', async () => {
        const usageRollup = makeRollup();
        await dbHandler(usageRollup)(
            {
                Records: [
                    {
                        messageId: 'm1',
                        body: '{}',
                        attributes: { ApproximateReceiveCount: '2' },
                    },
                ],
            },
            { ...ctx }
        );

        expect(usageRollup.discard).toHaveBeenCalledTimes(1);
        expect(usageRollup.flush).not.toHaveBeenCalled();
    });

    it('flushes on first SQS delivery (receiveCount 1)', async () => {
        const usageRollup = makeRollup();
        await dbHandler(usageRollup)(
            {
                Records: [
                    {
                        messageId: 'm1',
                        body: '{}',
                        attributes: { ApproximateReceiveCount: '1' },
                    },
                ],
            },
            { ...ctx }
        );

        expect(usageRollup.flush).toHaveBeenCalledTimes(1);
    });

    it('flushes a MIXED batch (some redelivered, some fresh) so fresh records are not dropped', async () => {
        const usageRollup = makeRollup();
        await dbHandler(usageRollup)(
            {
                Records: [
                    {
                        messageId: 'm1',
                        body: '{}',
                        attributes: { ApproximateReceiveCount: '2' },
                    },
                    {
                        messageId: 'm2',
                        body: '{}',
                        attributes: { ApproximateReceiveCount: '1' },
                    },
                ],
            },
            { ...ctx }
        );

        expect(usageRollup.flush).toHaveBeenCalledTimes(1);
        expect(usageRollup.discard).not.toHaveBeenCalled();
    });

    it('discards only when the WHOLE batch is a redelivery', async () => {
        const usageRollup = makeRollup();
        await dbHandler(usageRollup)(
            {
                Records: [
                    {
                        messageId: 'm1',
                        body: '{}',
                        attributes: { ApproximateReceiveCount: '2' },
                    },
                    {
                        messageId: 'm2',
                        body: '{}',
                        attributes: { ApproximateReceiveCount: '3' },
                    },
                ],
            },
            { ...ctx }
        );

        expect(usageRollup.discard).toHaveBeenCalledTimes(1);
        expect(usageRollup.flush).not.toHaveBeenCalled();
    });

    it('discards (never persists) for a DB-free handler — no connectionless Prisma write', async () => {
        const usageRollup = makeRollup();
        const handler = createHandler({
            isUserFacingResponse: false,
            shouldUseDatabase: false,
            method: async () => 'ok',
            telemetry: noopTelemetry,
            usageRollup,
        });

        await handler({}, { ...ctx });

        expect(usageRollup.flush).not.toHaveBeenCalled();
        expect(usageRollup.discard).toHaveBeenCalledTimes(1);
    });
});

describe('createHandler — logger scope and records (ADR-048)', () => {
    const noopTelemetry = { isEnabled: () => false, forceFlush: jest.fn() };
    const ctx = () => ({ awsRequestId: 'req-123' });
    let sink;
    let consoleSpies;

    beforeEach(() => {
        sink = createMemorySink();
        consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
            jest.spyOn(console, m).mockImplementation(() => {})
        );
    });
    afterEach(() => {
        for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    const build = (method, options = {}) =>
        createHandler({
            eventName: 'MyHandler',
            shouldUseDatabase: false,
            telemetry: noopTelemetry,
            usageRollup: null,
            method,
            ...options,
        });
    const byEvent = (eventName) => sink.records.filter((r) => r.eventName === eventName);

    it('gives a record inside method the requestId from context.awsRequestId and the handlerName', async () => {
        await build(async () => getLogger('integration.test').info('inside'))({}, ctx());
        const inside = sink.records.find((r) => r.message === 'inside');
        expect(inside).toMatchObject({ requestId: 'req-123', handlerName: 'MyHandler' });
    });

    it('keeps path, header names and query keys off the other records', async () => {
        await build(async () => getLogger('integration.test').info('inside'))(httpApiV2Event(), ctx());
        const inside = sink.records.find((r) => r.message === 'inside');
        for (const key of ['path', 'headerNames', 'queryKeys']) {
            expect(inside).not.toHaveProperty(key);
            expect(inside.invocation).not.toHaveProperty(key);
        }
    });

    it('sets the route template, not the concrete path, for REST v1', async () => {
        await build(async () => getLogger('integration.test').info('inside'))(
            { httpMethod: 'GET', resource: '/api/integrations/{id}', path: '/api/integrations/abc123', headers: {} },
            ctx()
        );
        const inside = sink.records.find((r) => r.message === 'inside');
        expect(inside.route).toBe('/api/integrations/{id}');
        expect(JSON.stringify(inside)).not.toContain('abc123');
        expect(sink.records.find((r) => r.eventName === 'frigg.handler.invoked').path).toBe('/api/integrations/abc123');
    });

    it('sets method and route (not path) for HTTP', async () => {
        await build(async () => getLogger('integration.test').info('inside'))(httpApiV2Event(), ctx());
        const inside = sink.records.find((r) => r.message === 'inside');
        expect(inside).toMatchObject({
            method: 'GET',
            route: '/api/authorize',
            routeKey: 'GET /api/authorize',
            invocation: { source: 'http', method: 'GET', route: '/api/authorize' },
        });
        expect(inside).not.toHaveProperty('path');
        expect(inside.invocation).not.toHaveProperty('path');
    });

    it('sets invocation.recordCount for SQS and keeps the records out of the scope', async () => {
        const usageRollup = { flush: jest.fn(async () => {}), discard: jest.fn() };
        await build(async () => getLogger('integration.test').info('inside'), {
            shouldUseDatabase: true,
            usageRollup,
        })(sqsEvent(), ctx());
        const inside = sink.records.find((r) => r.message === 'inside');
        expect(inside.invocation).toEqual({ source: 'sqs', recordCount: 2 });
        expect(JSON.stringify(inside)).not.toContain('msg-1');
        expect(usageRollup.flush).toHaveBeenCalledTimes(1);
    });

    it('writes one INFO frigg.handler.invoked with the redacted invocation', async () => {
        await build(async () => 'ok')(httpApiV2Event(), ctx());
        const invoked = byEvent('frigg.handler.invoked');
        expect(invoked).toHaveLength(1);
        expect(invoked[0]).toMatchObject({
            level: 'INFO',
            logger: 'frigg.handler',
            requestId: 'req-123',
            path: '/api/authorize',
            headerNames: expect.arrayContaining(['x-frigg-api-key']),
            queryKeys: expect.arrayContaining(['code']),
            invocation: { source: 'http', method: 'GET', route: '/api/authorize', routeKey: 'GET /api/authorize' },
        });
        expect(sink.records).toContainNoSecretWindow(SECRETS);
    });

    it('sets no requestId when the context has none', async () => {
        await expect(build(async () => 'ok')({}, { })).resolves.toBe('ok');
        expect(byEvent('frigg.handler.invoked')[0]).not.toHaveProperty('requestId');
    });

    it('logs one ERROR frigg.handler.failed and rethrows a sanitized surrogate', async () => {
        const original = Object.assign(
            new TypeError(`GET https://h/p?api_key=${SECRETS.apiKeyQuery}`),
            { statusCode: 502, secretProp: SECRETS.accessToken }
        );
        const handler = build(async () => { throw original; }, { isUserFacingResponse: false });
        const thrown = await handler({}, ctx()).catch((e) => e);

        expect(thrown).not.toBe(original);
        expect(thrown).toBeInstanceOf(Error);
        expect(thrown.name).toBe('TypeError');
        expect(thrown.statusCode).toBe(502);
        expect(thrown.message).toBe('GET https://h/p?api_key=REDACTED');
        expect(thrown).toContainNoSecretWindow([SECRETS.apiKeyQuery, SECRETS.accessToken]);
        expect(thrown.stack).toContainNoSecretWindow([SECRETS.apiKeyQuery]);

        const failed = byEvent('frigg.handler.failed');
        expect(failed).toHaveLength(1);
        expect(failed[0]).toMatchObject({ level: 'ERROR', requestId: 'req-123', error: { type: 'TypeError', status: 502 } });
        expect(sink.records.filter((r) => r.level === 'ERROR')).toHaveLength(1);
        expect(sink.records).toContainNoSecretWindow([SECRETS.apiKeyQuery, SECRETS.accessToken]);
    });

    it('logs one ERROR frigg.handler.halted for a halt error and returns undefined', async () => {
        const handler = build(async () => { throw new HaltError('stop'); }, { isUserFacingResponse: false });
        await expect(handler({}, ctx())).resolves.toBeUndefined();
        expect(byEvent('frigg.handler.halted')).toHaveLength(1);
        expect(byEvent('frigg.handler.halted')[0].level).toBe('ERROR');
        expect(byEvent('frigg.handler.failed')).toHaveLength(0);
    });

    it('logs one ERROR for a user-facing error and still returns 500', async () => {
        const res = await build(async () => { throw new Error('internal detail'); })({}, ctx());
        expect(res.statusCode).toBe(500);
        expect(JSON.parse(res.body)).toEqual({ error: 'An Internal Error Occurred' });
        expect(byEvent('frigg.handler.failed')).toHaveLength(1);
    });

    it('logs one WARN frigg.handler.rejected for a client-safe error and returns its status', async () => {
        const error = Object.assign(new Error(`Bad input, Authorization: Bearer ${SECRETS.bearer}`), { isClientSafe: true, statusCode: 422 });
        const res = await build(async () => { throw error; })({}, ctx());
        expect(res.statusCode).toBe(422);
        expect(JSON.parse(res.body).error).toContain('Bad input');
        const rejected = byEvent('frigg.handler.rejected');
        expect(rejected).toHaveLength(1);
        expect(rejected[0]).toMatchObject({ level: 'WARN', statusCode: 422, error: { status: 422 } });
        expect(sink.records).toContainNoSecretWindow([SECRETS.bearer]);
        expect(sink.records.filter((r) => r.level === 'ERROR')).toHaveLength(0);
    });

    it('defaults the rejected status to 400', async () => {
        const error = Object.assign(new Error('Bad input'), { isClientSafe: true });
        const res = await build(async () => { throw error; })({}, ctx());
        expect(res.statusCode).toBe(400);
        expect(byEvent('frigg.handler.rejected')[0].statusCode).toBe(400);
    });

    it('puts a call-site requestId into droppedKeys', async () => {
        await build(async () => getLogger('integration.test').info('inside', { requestId: 'fake' }))({}, ctx());
        const inside = sink.records.find((r) => r.message === 'inside');
        expect(inside.requestId).toBe('req-123');
        expect(inside.droppedKeys).toEqual(['requestId']);
    });
});
