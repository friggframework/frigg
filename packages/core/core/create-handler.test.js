jest.mock('../database/prisma', () => ({
    connectPrisma: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./secrets-to-env', () => ({
    secretsToEnv: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../logs', () => ({
    initDebugLog: jest.fn(),
    flushDebugLog: jest.fn(),
}));

const { connectPrisma } = require('../database/prisma');
const { createHandler } = require('./create-handler');

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
