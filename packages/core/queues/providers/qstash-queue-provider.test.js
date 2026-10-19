const crypto = require('crypto');
const jose = require('jose');
const { QStashQueueProvider } = require('./qstash-queue-provider');

const CURRENT = 'sig_current_key_0123456789';
const NEXT = 'sig_next_key_9876543210';
const DEST = 'https://site.example/api/queue';
const prodEnv = (extra = {}) => ({ STAGE: 'production', NODE_ENV: 'production', ...extra });

const provider = (opts = {}) =>
    new QStashQueueProvider({
        env: prodEnv({ QSTASH_CURRENT_SIGNING_KEY: CURRENT, QSTASH_NEXT_SIGNING_KEY: NEXT }),
        ...opts,
    });

const bodyHash = (body) => crypto.createHash('sha256').update(body).digest('base64url');

// Builds an Upstash-Signature the way QStash does (see @upstash/qstash Receiver).
async function upstashSignature(body, key, overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
        iss: 'Upstash',
        sub: DEST,
        iat: now,
        nbf: now,
        exp: now + 300,
        jti: 'jwt_1',
        body: bodyHash(body),
        ...overrides,
    };
    let jwt = new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256', typ: 'JWT' });
    return jwt.sign(new TextEncoder().encode(key));
}

const event = (body, signature, rawUrl = DEST) => ({
    httpMethod: 'POST',
    rawUrl,
    headers: signature ? { 'upstash-signature': signature } : {},
    body,
    isBase64Encoded: false,
});

const BODY = JSON.stringify({ integrationName: 'hubspot', event: 'SYNC', data: {} });

describe('QStashQueueProvider.verifyEvent', () => {
    it('accepts a delivery signed with the current key', async () => {
        const sig = await upstashSignature(BODY, CURRENT);
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({ ok: true });
    });

    it('accepts a delivery signed with the next key (rotation)', async () => {
        const sig = await upstashSignature(BODY, NEXT);
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({ ok: true });
    });

    it('accepts a body claim that keeps its base64 padding', async () => {
        const padded = bodyHash(BODY) + '=';
        const sig = await upstashSignature(BODY, CURRENT, { body: padded });
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({ ok: true });
    });

    it('accepts the header in another case (Upstash-Signature)', async () => {
        const sig = await upstashSignature(BODY, CURRENT);
        const e = event(BODY);
        e.headers = { 'Upstash-Signature': sig };
        await expect(provider().verifyEvent(e)).resolves.toEqual({ ok: true });
    });

    it('rejects a delivery with no signature', async () => {
        await expect(provider().verifyEvent(event(BODY))).resolves.toEqual({
            ok: false,
            reason: 'missing_signature',
        });
    });

    it('rejects a signature made with an unknown key', async () => {
        const sig = await upstashSignature(BODY, 'not-a-qstash-key');
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects a tampered body', async () => {
        const sig = await upstashSignature(BODY, CURRENT);
        const tampered = BODY.replace('hubspot', 'salesforce');
        await expect(provider().verifyEvent(event(tampered, sig))).resolves.toEqual({
            ok: false,
            reason: 'body_mismatch',
        });
    });

    it('rejects an expired signature', async () => {
        const past = Math.floor(Date.now() / 1000) - 3600;
        const sig = await upstashSignature(BODY, CURRENT, {
            iat: past,
            nbf: past,
            exp: past + 300,
        });
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects a signature with no exp (no replay bound)', async () => {
        const sig = await upstashSignature(BODY, CURRENT, { exp: undefined });
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects a signature from another issuer', async () => {
        const sig = await upstashSignature(BODY, CURRENT, { iss: 'Someone' });
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects an unsigned (alg none) token', async () => {
        const unsigned = new jose.UnsecuredJWT({
            iss: 'Upstash',
            exp: Math.floor(Date.now() / 1000) + 300,
            body: bodyHash(BODY),
        }).encode();
        await expect(provider().verifyEvent(event(BODY, unsigned))).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('checks the subject against a configured destination URL', async () => {
        const sig = await upstashSignature(BODY, CURRENT, { sub: 'https://elsewhere/x' });
        await expect(
            provider({ destinationUrl: DEST }).verifyEvent(event(BODY, sig, null))
        ).resolves.toEqual({ ok: false, reason: 'invalid_subject' });
        const good = await upstashSignature(BODY, CURRENT);
        await expect(
            provider({ destinationUrl: DEST }).verifyEvent(event(BODY, good, null))
        ).resolves.toEqual({ ok: true });
    });

    it('checks the subject against the request URL when no destination is configured', async () => {
        // A valid delivery published to another endpoint, replayed here.
        const sig = await upstashSignature(BODY, CURRENT, { sub: 'https://site.example/other' });
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({
            ok: false,
            reason: 'invalid_subject',
        });
    });

    it('refuses when the request URL cannot be determined', async () => {
        const sig = await upstashSignature(BODY, CURRENT);
        await expect(provider().verifyEvent(event(BODY, sig, null))).resolves.toEqual({
            ok: false,
            reason: 'missing_request_url',
        });
    });

    it('rejects a signature with no sub', async () => {
        const sig = await upstashSignature(BODY, CURRENT, { sub: undefined });
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects a signature with no nbf', async () => {
        const sig = await upstashSignature(BODY, CURRENT, { nbf: undefined });
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('rejects a signature that is not valid yet (nbf in the future)', async () => {
        const later = Math.floor(Date.now() / 1000) + 600;
        const sig = await upstashSignature(BODY, CURRENT, { nbf: later, exp: later + 300 });
        await expect(provider().verifyEvent(event(BODY, sig))).resolves.toEqual({
            ok: false,
            reason: 'invalid_signature',
        });
    });

    it('in production with no signing keys: refuses, even with the unsigned opt-in', async () => {
        const sig = await upstashSignature(BODY, CURRENT);
        const p = provider({ env: prodEnv({ FRIGG_QUEUE_ALLOW_UNSIGNED: 'true' }) });
        await expect(p.verifyEvent(event(BODY, sig))).resolves.toEqual({
            ok: false,
            reason: 'signing_keys_not_configured',
        });
    });

    it('outside production with the opt-in and no keys: accepts unsigned', async () => {
        const p = provider({ env: { STAGE: 'dev', FRIGG_QUEUE_ALLOW_UNSIGNED: 'true' } });
        await expect(p.verifyEvent(event(BODY))).resolves.toEqual({ ok: true, unsigned: true });
    });
});
