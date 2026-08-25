/**
 * Handler-level guard for ADR-034 §4: the raw apiKey (and password) in the
 * request body MUST NOT reach any log sink, even on the 5xx / provider-outage
 * path where the whole Lambda event is dumped by flushDebugLog.
 *
 * This drives the apiKey login through the REAL handler stack
 * (createAppHandler → createHandler → serverless-http → express router →
 * app-handler-helpers error middleware) so it exercises the actual buffering
 * and flush, not a stand-in. The use case is stubbed to fail 503 (provider
 * unavailable), which is precisely the path that triggers flushDebugLog.
 */

// DB-free: never load Prisma. (createAppHandler is called with
// shouldUseDatabase=false below, but mock defensively in case that changes.)
jest.mock('../../database/prisma', () => ({
    connectPrisma: jest.fn().mockResolvedValue(undefined),
}));

const Boom = require('@hapi/boom');
const { createAppHandler } = require('../app-handler-helpers');
const { buildUserRouter } = require('./user-router');
const { FixedWindowRateLimiter } = require('../rate-limiter');

const RAW_KEY = 'top-secret-key-DO-NOT-LOG-abc123';
const RAW_PASSWORD = 'p@ssw0rd-DO-NOT-LOG';

function makeApiGatewayEvent(body) {
    return {
        httpMethod: 'POST',
        path: '/user/login',
        headers: {
            'Content-Type': 'application/json',
            host: 'example.com',
        },
        multiValueHeaders: {},
        queryStringParameters: null,
        pathParameters: null,
        body: JSON.stringify(body),
        isBase64Encoded: false,
        requestContext: { identity: {}, http: {} },
    };
}

describe('apiKey login handler — request-body redaction on 503', () => {
    const OLD_STAGE = process.env.STAGE;
    let sinks;
    let spies;

    beforeEach(() => {
        process.env.STAGE = 'test';
        sinks = [];
        const capture =
            (name) =>
            (...args) => {
                sinks.push(`${name}: ${args.map((a) => String(a)).join(' ')}`);
            };
        spies = ['debug', 'error', 'info', 'warn', 'log'].map((m) =>
            // eslint-disable-next-line no-console
            jest.spyOn(console, m).mockImplementation(capture(m))
        );
    });

    afterEach(() => {
        spies.forEach((s) => s.mockRestore());
        process.env.STAGE = OLD_STAGE;
    });

    function buildHandler() {
        const loginWithApiKey = {
            tokenExpiryMinutes: 120,
            execute: jest
                .fn()
                .mockRejectedValue(
                    Boom.serverUnavailable('Identity provider unavailable')
                ),
        };
        const router = buildUserRouter({
            userConfig: { authModes: { apiKey: { module: 'reevo' } } },
            loginUser: { execute: jest.fn() },
            createIndividualUser: { execute: jest.fn() },
            createTokenForUserId: { execute: jest.fn() },
            loginWithApiKey,
            apiKeyLoginLimiter: new FixedWindowRateLimiter({
                maxPerKey: 100,
                maxGlobal: 1000,
            }),
        });
        // shouldUseDatabase=false → no Prisma connection needed in the test.
        return createAppHandler('HTTP Event: User', router, false);
    }

    it('never emits the raw apiKey to any console sink on the 503 path', async () => {
        const handler = buildHandler();

        const res = await handler(makeApiGatewayEvent({ apiKey: RAW_KEY }), {
            awsRequestId: 'req-1',
        });

        // The provider-outage path returns 503 (the flushDebugLog trigger).
        expect(res.statusCode).toBe(503);

        const allOutput = sinks.join('\n');
        // The whole point: the raw key is nowhere in the logs...
        expect(allOutput).not.toContain(RAW_KEY);
        // ...but the event WAS buffered and dumped (so this is a real test of
        // redaction, not of the event simply being absent).
        expect(allOutput).toContain('[REDACTED]');
    });

    it('never emits the raw password on the same path', async () => {
        const handler = buildHandler();

        // A password body still reaches the apiKey stub only if apiKey present;
        // send both so the login dispatches to the (stubbed 503) apiKey branch
        // while a password field also rides along in the buffered event.
        await handler(
            makeApiGatewayEvent({ apiKey: RAW_KEY, password: RAW_PASSWORD }),
            { awsRequestId: 'req-2' }
        );

        const allOutput = sinks.join('\n');
        expect(allOutput).not.toContain(RAW_PASSWORD);
        expect(allOutput).not.toContain(RAW_KEY);
    });
});
