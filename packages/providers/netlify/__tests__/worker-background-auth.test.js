/**
 * worker-background refuses any queue event it cannot verify: no parse, no
 * database connection, no dispatch, one WARN (frigg.netlify.queue.rejected).
 *
 * The function file is loaded as Netlify loads it; only the app definition,
 * the queue worker factory and the database connect are stubbed, so the
 * verification, createHandler and the real queue providers all run.
 */
const crypto = require('crypto');
const path = require('path');
const jose = require('jose');

const corePath = path.dirname(require.resolve('@friggframework/core/package.json'));
const { createMemorySink } = require('@friggframework/core/logs');

const SECRET = 'worker-test-secret-0123456789';
const QSTASH_KEY = 'qstash-current-key';

const runSpy = jest.fn(async () => {});
const connectPrisma = jest.fn(async () => ({}));

jest.doMock(path.join(corePath, 'database/prisma'), () => ({
    prisma: {},
    connectPrisma,
    disconnectPrisma: jest.fn(async () => {}),
    getEncryptionConfig: () => ({ enabled: false }),
}));
jest.doMock(path.join(corePath, 'handlers/app-definition-loader'), () => ({
    loadAppDefinition: () => ({
        appDefinition: { queue: { provider: process.env.TEST_WORKER_QUEUE_PROVIDER } },
        integrations: [{ Definition: { name: 'hubspot' } }],
        moduleDefinitions: [],
    }),
}));
jest.doMock(path.join(corePath, 'handlers/backend-utils'), () => ({
    createQueueWorker: () =>
        class FakeWorker {
            async _run(params, context) {
                return runSpy(params, context);
            }
        },
}));

const ENV_KEYS = [
    'FRIGG_QUEUE_SIGNING_SECRET',
    'FRIGG_QUEUE_ALLOW_UNSIGNED',
    'STAGE',
    'NODE_ENV',
    'QUEUE_PROVIDER',
    'TEST_WORKER_QUEUE_PROVIDER',
    'QSTASH_CURRENT_SIGNING_KEY',
    'QSTASH_NEXT_SIGNING_KEY',
];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function setEnv(values) {
    for (const k of ENV_KEYS) delete process.env[k];
    Object.assign(process.env, values);
}

function loadWorker() {
    let handler;
    jest.isolateModules(() => {
        ({ handler } = require('../functions/worker-background'));
    });
    return handler;
}

const MESSAGE = { integrationName: 'hubspot', event: 'SYNC', data: { id: 1 } };

function signedEvent(body, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
    const mac = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    return {
        httpMethod: 'POST',
        path: '/.netlify/functions/worker-background',
        headers: {
            'content-type': 'application/json',
            'x-frigg-queue-timestamp': String(ts),
            'x-frigg-queue-signature': `v1=${mac}`,
        },
        body,
        isBase64Encoded: false,
    };
}

describe('worker-background authentication', () => {
    let sink;
    beforeEach(() => {
        sink = createMemorySink();
        runSpy.mockClear();
        connectPrisma.mockClear();
    });
    afterAll(() => setEnv(Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined))));

    const rejections = () => sink.records.filter((r) => r.eventName === 'frigg.netlify.queue.rejected');

    const expectRejected = async (handler, event, reason) => {
        const res = await handler(event, {});
        expect(res.statusCode).toBe(401);
        expect(runSpy).not.toHaveBeenCalled();
        expect(connectPrisma).not.toHaveBeenCalled();
        expect(rejections()).toHaveLength(1);
        expect(rejections()[0]).toMatchObject({ level: 'WARN', statusCode: 401 });
        expect(rejections()[0].reasons).toContain(reason);
        // The rejected body never reaches the log.
        expect(JSON.stringify(sink.records)).not.toContain('hubspot');
    };

    describe('with FRIGG_QUEUE_SIGNING_SECRET (production)', () => {
        let handler;
        beforeAll(() => {
            setEnv({ STAGE: 'production', NODE_ENV: 'production', FRIGG_QUEUE_SIGNING_SECRET: SECRET });
            handler = loadWorker();
        });

        it('runs a signed message', async () => {
            const res = await handler(signedEvent(JSON.stringify(MESSAGE)), {});
            expect(res.statusCode).toBe(200);
            expect(connectPrisma).toHaveBeenCalledTimes(1);
            expect(runSpy).toHaveBeenCalledWith({ event: 'SYNC', data: { id: 1 } }, expect.any(Object));
            expect(rejections()).toHaveLength(0);
        });

        it('refuses an unsigned message (the GET that answered 202 included)', async () => {
            await expectRejected(
                handler,
                { httpMethod: 'POST', headers: {}, body: JSON.stringify(MESSAGE) },
                'missing_signature'
            );
        });

        it('refuses a bodiless GET', async () => {
            await expectRejected(handler, { httpMethod: 'GET', headers: {}, body: null }, 'missing_signature');
        });

        it('refuses a tampered body', async () => {
            const event = signedEvent(JSON.stringify(MESSAGE));
            event.body = event.body.replace('SYNC', 'DELETE');
            await expectRejected(handler, event, 'invalid_signature');
        });

        it('refuses a stale timestamp', async () => {
            const event = signedEvent(JSON.stringify(MESSAGE), {
                ts: Math.floor(Date.now() / 1000) - 301,
            });
            await expectRejected(handler, event, 'stale_timestamp');
        });

        it('refuses a message signed with another secret', async () => {
            const event = signedEvent(JSON.stringify(MESSAGE), { secret: 'wrong' });
            await expectRejected(handler, event, 'invalid_signature');
        });
    });

    describe('without a secret in production', () => {
        it('fails closed, even with FRIGG_QUEUE_ALLOW_UNSIGNED=true', async () => {
            setEnv({ STAGE: 'production', NODE_ENV: 'production', FRIGG_QUEUE_ALLOW_UNSIGNED: 'true' });
            const handler = loadWorker();
            await expectRejected(
                handler,
                signedEvent(JSON.stringify(MESSAGE)),
                'signing_secret_not_configured'
            );
        });
    });

    describe('local development', () => {
        it('runs unsigned messages only with FRIGG_QUEUE_ALLOW_UNSIGNED=true', async () => {
            setEnv({ STAGE: 'local', FRIGG_QUEUE_ALLOW_UNSIGNED: 'true' });
            const handler = loadWorker();
            const res = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(MESSAGE) }, {});
            expect(res.statusCode).toBe(200);
            expect(runSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('with the qstash provider', () => {
        let handler;
        beforeAll(() => {
            setEnv({
                STAGE: 'production',
                NODE_ENV: 'production',
                FRIGG_QUEUE_SIGNING_SECRET: SECRET,
                TEST_WORKER_QUEUE_PROVIDER: 'qstash',
                QSTASH_CURRENT_SIGNING_KEY: QSTASH_KEY,
                QSTASH_NEXT_SIGNING_KEY: 'qstash-next-key',
            });
            handler = loadWorker();
        });

        const qstashEvent = async (body, key = QSTASH_KEY) => {
            const now = Math.floor(Date.now() / 1000);
            const sig = await new jose.SignJWT({
                iss: 'Upstash',
                sub: 'https://site/api/queue',
                iat: now,
                nbf: now,
                exp: now + 300,
                body: crypto.createHash('sha256').update(body).digest('base64url'),
            })
                .setProtectedHeader({ alg: 'HS256' })
                .sign(new TextEncoder().encode(key));
            return { httpMethod: 'POST', headers: { 'upstash-signature': sig }, body };
        };

        it('runs a valid QStash delivery', async () => {
            const res = await handler(await qstashEvent(JSON.stringify(MESSAGE)), {});
            expect(res.statusCode).toBe(200);
            expect(runSpy).toHaveBeenCalledTimes(1);
        });

        it('still runs Frigg-signed messages (scheduled-sync posts with the netlify provider)', async () => {
            const res = await handler(signedEvent(JSON.stringify(MESSAGE)), {});
            expect(res.statusCode).toBe(200);
        });

        it('refuses a QStash delivery signed with an unknown key', async () => {
            await expectRejected(
                handler,
                await qstashEvent(JSON.stringify(MESSAGE), 'not-the-key'),
                'invalid_signature'
            );
        });

        it('refuses a QStash delivery whose body was changed', async () => {
            const event = await qstashEvent(JSON.stringify(MESSAGE));
            event.body = event.body.replace('SYNC', 'DELETE');
            await expectRejected(handler, event, 'body_mismatch');
        });
    });
});
