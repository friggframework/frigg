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
