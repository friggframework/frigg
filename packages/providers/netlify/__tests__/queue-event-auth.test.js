const { createMemorySink } = require('@friggframework/core/logs');
const { createQueueEventVerifier, withQueueEventAuth } = require('../lib/queue-event-auth');

const verifierReturning = (result) => ({
    verifiesHttpDelivery: true,
    verifyEvent: jest.fn(async () => result),
});

describe('createQueueEventVerifier', () => {
    it('accepts when either the Frigg signature or the queue provider verifies', async () => {
        const verify = createQueueEventVerifier({
            friggProvider: verifierReturning({ ok: false, reason: 'missing_signature' }),
            queueProvider: verifierReturning({ ok: true }),
        });
        await expect(verify({})).resolves.toEqual({
            ok: true,
            reasons: ['missing_signature'],
            unsigned: false,
        });
    });

    it('refuses with every reason when none verifies', async () => {
        const verify = createQueueEventVerifier({
            friggProvider: verifierReturning({ ok: false, reason: 'invalid_signature' }),
            queueProvider: verifierReturning({ ok: false, reason: 'body_mismatch' }),
        });
        await expect(verify({})).resolves.toEqual({
            ok: false,
            reasons: ['invalid_signature', 'body_mismatch'],
        });
    });

    it('treats a verifier that throws as a refusal, never an acceptance', async () => {
        const verify = createQueueEventVerifier({
            friggProvider: { verifyEvent: jest.fn(async () => { throw new Error('boom'); }) },
            queueProvider: verifierReturning({ ok: false, reason: 'missing_signature' }),
        });
        await expect(verify({})).resolves.toEqual({
            ok: false,
            reasons: ['verification_error', 'missing_signature'],
        });
    });

    it('does not accept a truthy non-true ok', async () => {
        const verify = createQueueEventVerifier({
            friggProvider: verifierReturning({ ok: 'yes' }),
            queueProvider: verifierReturning({}),
        });
        await expect(verify({})).resolves.toMatchObject({ ok: false });
    });
});

describe('createQueueEventVerifier and transport-trust providers', () => {
    it('never consults a provider that does not verify HTTP deliveries (SQS answers ok to anything)', async () => {
        const sqsLike = { verifyEvent: jest.fn(async () => ({ ok: true })) };
        const verify = createQueueEventVerifier({
            friggProvider: verifierReturning({ ok: false, reason: 'missing_signature' }),
            queueProvider: sqsLike,
        });
        await expect(verify({ body: '{"Records":[]}' })).resolves.toEqual({
            ok: false,
            reasons: ['missing_signature'],
        });
        expect(sqsLike.verifyEvent).not.toHaveBeenCalled();
    });

    it('the real SqsQueueProvider is not an HTTP verifier', () => {
        const { SqsQueueProvider } = require('@friggframework/core/queues/providers/sqs-queue-provider');
        const sqs = new SqsQueueProvider({ queueClient: {} });
        expect(sqs.verifiesHttpDelivery).not.toBe(true);
    });
});

describe('withQueueEventAuth', () => {
    it('answers 401 and never calls the handler for a refused event', async () => {
        const sink = createMemorySink();
        const handler = jest.fn();
        const wrapped = withQueueEventAuth({
            handler,
            verify: async () => ({ ok: false, reasons: ['missing_signature'] }),
        });
        await expect(wrapped({}, {})).resolves.toMatchObject({ statusCode: 401 });
        expect(handler).not.toHaveBeenCalled();
        const warns = sink.records.filter((r) => r.eventName === 'frigg.netlify.queue.rejected');
        expect(warns).toHaveLength(1);
        expect(warns[0]).toMatchObject({ level: 'WARN', reasons: ['missing_signature'] });
    });
});
