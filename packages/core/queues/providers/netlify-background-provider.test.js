const crypto = require('crypto');
const { NetlifyBackgroundProvider } = require('./netlify-background-provider');
const {
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    isProductionEnvironment,
    allowsUnsignedMessages,
} = require('../queue-message-auth');

const SECRET = 'test-signing-secret-0123456789abcdef';
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const prodEnv = (extra = {}) => ({ STAGE: 'production', NODE_ENV: 'production', ...extra });

const provider = (opts = {}) =>
    new NetlifyBackgroundProvider({
        baseUrl: 'https://site.example',
        env: prodEnv({ FRIGG_QUEUE_SIGNING_SECRET: SECRET }),
        now: () => NOW,
        ...opts,
    });

// Captures what send() would put on the wire and turns it into the event the
// background function receives.
async function sendAndCapture(p, message) {
    const calls = [];
    global.fetch = jest.fn(async (url, init) => {
        calls.push({ url, init });
        return { ok: false, status: 202, statusText: 'Accepted' };
    });
    await p.send(message, '/.netlify/functions/worker-background');
    const { init } = calls[0];
    return {
        url: calls[0].url,
        headers: init.headers,
        event: {
            httpMethod: 'POST',
            headers: Object.fromEntries(
                Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v])
            ),
            body: init.body,
            isBase64Encoded: false,
        },
    };
}

describe('NetlifyBackgroundProvider message signing', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
    });

    it('signs with HMAC-SHA256 over `${timestamp}.${body}` and the receiver accepts it', async () => {
        const p = provider();
        const message = { integrationName: 'hubspot', event: 'SYNC', data: { a: 1 } };
        const { url, headers, event } = await sendAndCapture(p, message);

        expect(url).toBe('https://site.example/.netlify/functions/worker-background');
        const ts = String(Math.floor(NOW / 1000));
        expect(headers[TIMESTAMP_HEADER]).toBe(ts);
        const expected = crypto
            .createHmac('sha256', SECRET)
            .update(`${ts}.${JSON.stringify(message)}`)
            .digest('hex');
        expect(headers[SIGNATURE_HEADER]).toBe(`v1=${expected}`);

        await expect(p.verifyEvent(event)).resolves.toEqual({ ok: true });
        expect(p.parseEvent(event)).toEqual([message]);
    });

    it('accepts a signed event whose header names arrive in another case', async () => {
        const p = provider();
        const { event } = await sendAndCapture(p, { x: 1 });
        event.headers = {
            'X-Frigg-Queue-Signature': event.headers[SIGNATURE_HEADER],
            'X-Frigg-Queue-Timestamp': event.headers[TIMESTAMP_HEADER],
        };
        await expect(p.verifyEvent(event)).resolves.toEqual({ ok: true });
    });

    it('accepts a base64-encoded body (verified over the decoded bytes)', async () => {
        const p = provider();
        const { event } = await sendAndCapture(p, { x: 'é' });
        event.body = Buffer.from(event.body, 'utf8').toString('base64');
        event.isBase64Encoded = true;
        await expect(p.verifyEvent(event)).resolves.toEqual({ ok: true });
        expect(p.parseEvent(event)).toEqual([{ x: 'é' }]);
    });

    it('rejects an unsigned event', async () => {
        await expect(
            provider().verifyEvent({ headers: {}, body: '{"integrationName":"x"}' })
        ).resolves.toEqual({ ok: false, reason: 'missing_signature' });
    });

    it('rejects a signature without its timestamp', async () => {
        const p = provider();
        const { event } = await sendAndCapture(p, { x: 1 });
        delete event.headers[TIMESTAMP_HEADER];
        await expect(p.verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'missing_signature',
        });
    });

    it('rejects a tampered body', async () => {
        const p = provider();
        const { event } = await sendAndCapture(p, { integrationName: 'a', event: 'E' });
        event.body = event.body.replace('"a"', '"b"');
        await expect(p.verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects a timestamp moved forward to extend the window (it is signed)', async () => {
        const p = provider();
        const { event } = await sendAndCapture(p, { x: 1 });
        event.headers[TIMESTAMP_HEADER] = String(Number(event.headers[TIMESTAMP_HEADER]) + 1);
        await expect(p.verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects a signature made with another secret', async () => {
        const { event } = await sendAndCapture(
            provider({ env: prodEnv({ FRIGG_QUEUE_SIGNING_SECRET: 'some-other-secret' }) }),
            { x: 1 }
        );
        await expect(provider().verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects a signature of another length without throwing', async () => {
        const p = provider();
        const { event } = await sendAndCapture(p, { x: 1 });
        event.headers[SIGNATURE_HEADER] = 'v1=abc';
        await expect(p.verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects a stale timestamp (older than 5 minutes) even with a valid signature', async () => {
        const { event } = await sendAndCapture(provider(), { x: 1 });
        const later = provider({ now: () => NOW + 5 * 60 * 1000 + 1000 });
        await expect(later.verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'stale_timestamp',
        });
        // Just inside the window is still accepted.
        const inside = provider({ now: () => NOW + 5 * 60 * 1000 });
        await expect(inside.verifyEvent(event)).resolves.toEqual({ ok: true });
    });

    it('rejects a timestamp more than 5 minutes in the future', async () => {
        const { event } = await sendAndCapture(
            provider({ now: () => NOW + 6 * 60 * 1000 }),
            { x: 1 }
        );
        await expect(provider().verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'stale_timestamp',
        });
    });

    it('rejects a non-numeric timestamp', async () => {
        const p = provider();
        const { event } = await sendAndCapture(p, { x: 1 });
        event.headers[TIMESTAMP_HEADER] = '1e3';
        await expect(p.verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'invalid_timestamp',
        });
    });

    it('rejects a signed event whose body is missing', async () => {
        const p = provider();
        const { event } = await sendAndCapture(p, { x: 1 });
        event.body = null;
        await expect(p.verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'missing_body',
        });
    });

    it('reads the secret at call time, not construction time', async () => {
        const env = prodEnv();
        const p = provider({ env });
        env.FRIGG_QUEUE_SIGNING_SECRET = SECRET;
        const { event } = await sendAndCapture(p, { x: 1 });
        await expect(p.verifyEvent(event)).resolves.toEqual({ ok: true });
    });
});

describe('NetlifyBackgroundProvider without a signing secret', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
    });

    it('in production: refuses every event, signed or not', async () => {
        const { event } = await sendAndCapture(provider(), { x: 1 });
        const p = provider({ env: prodEnv() });
        await expect(p.verifyEvent(event)).resolves.toEqual({
            ok: false,
            reason: 'signing_secret_not_configured',
        });
        await expect(p.verifyEvent({ headers: {}, body: '{}' })).resolves.toEqual({
            ok: false,
            reason: 'signing_secret_not_configured',
        });
    });

    it('in production: FRIGG_QUEUE_ALLOW_UNSIGNED=true does not open it', async () => {
        const p = provider({ env: prodEnv({ FRIGG_QUEUE_ALLOW_UNSIGNED: 'true' }) });
        await expect(p.verifyEvent({ headers: {}, body: '{}' })).resolves.toEqual({
            ok: false,
            reason: 'signing_secret_not_configured',
        });
    });

    it('with no STAGE and no NODE_ENV (counts as production): refuses even with the opt-in', async () => {
        const p = provider({ env: { FRIGG_QUEUE_ALLOW_UNSIGNED: 'true' } });
        await expect(p.verifyEvent({ headers: {}, body: '{}' })).resolves.toEqual({
            ok: false,
            reason: 'signing_secret_not_configured',
        });
    });

    it('in production: send() throws instead of posting an unsigned message', async () => {
        global.fetch = jest.fn();
        const p = provider({ env: prodEnv() });
        await expect(p.send({ x: 1 }, '/w')).rejects.toThrow(/FRIGG_QUEUE_SIGNING_SECRET/);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('outside production without the opt-in: still refuses', async () => {
        const p = provider({ env: { STAGE: 'dev' } });
        await expect(p.verifyEvent({ headers: {}, body: '{}' })).resolves.toEqual({
            ok: false,
            reason: 'signing_secret_not_configured',
        });
    });

    it('outside production with FRIGG_QUEUE_ALLOW_UNSIGNED=true: accepts and sends unsigned', async () => {
        const env = { STAGE: 'local', FRIGG_QUEUE_ALLOW_UNSIGNED: 'true' };
        const p = provider({ env });
        await expect(p.verifyEvent({ headers: {}, body: '{}' })).resolves.toEqual({
            ok: true,
            unsigned: true,
        });
        const { headers } = await sendAndCapture(p, { x: 1 });
        expect(headers[SIGNATURE_HEADER]).toBeUndefined();
    });
});

describe('isProductionEnvironment / allowsUnsignedMessages', () => {
    it.each([
        [{}, true],
        [{ STAGE: 'production' }, true],
        [{ STAGE: 'prod', NODE_ENV: 'production' }, true],
        [{ STAGE: 'dev' }, false],
        [{ STAGE: 'test' }, false],
        [{ STAGE: 'local' }, false],
        [{ NODE_ENV: 'development' }, false],
        [{ NODE_ENV: 'test' }, false],
        [{ NETLIFY_DEV: 'true' }, false],
    ])('%j -> production %s', (env, expected) => {
        expect(isProductionEnvironment(env)).toBe(expected);
    });

    it('allows unsigned only for the exact string "true" outside production', () => {
        expect(allowsUnsignedMessages({ STAGE: 'dev', FRIGG_QUEUE_ALLOW_UNSIGNED: 'true' })).toBe(true);
        expect(allowsUnsignedMessages({ STAGE: 'dev', FRIGG_QUEUE_ALLOW_UNSIGNED: '1' })).toBe(false);
        expect(allowsUnsignedMessages({ STAGE: 'dev' })).toBe(false);
        expect(allowsUnsignedMessages({ FRIGG_QUEUE_ALLOW_UNSIGNED: 'true' })).toBe(false);
    });
});
