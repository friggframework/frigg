/**
 * Queue event authentication for the Netlify worker (adapter layer).
 *
 * The worker-background function, and the /api/queue redirect to it, are
 * public URLs. Two senders reach it legitimately:
 * - Frigg itself through NetlifyBackgroundProvider (scheduled-sync, the
 *   Netlify scheduler adapter, and any app on the default queue), signed
 *   with FRIGG_QUEUE_SIGNING_SECRET;
 * - the configured queue provider when it is another HTTP queue (QStash),
 *   signed by that service.
 *
 * An event is accepted when either adapter verifies it. Anything else gets
 * a 401 before the event is parsed, before the database is connected and
 * before any integration code runs. A background function always answers
 * the caller 202, so the 401 is only visible in the logs: one WARN,
 * eventName frigg.netlify.queue.rejected, with the reasons.
 */
const { getLogger } = require('@friggframework/core/logs');
const {
    NetlifyBackgroundProvider,
} = require('@friggframework/core/queues/providers/netlify-background-provider');

const log = getLogger('frigg.netlify.queue');

/**
 * The HTTP entry accepts only proofs that make sense for an HTTP delivery:
 * Frigg's own HMAC, always, and the configured provider's check only when
 * that provider declares `verifiesHttpDelivery` (QStash does). A provider
 * whose trust comes from its transport (SQS: the Lambda event source)
 * answers ok to anything, so it is never consulted here, whatever
 * QUEUE_PROVIDER says: an unsigned POST of `{ Records: [...] }` would
 * otherwise be dispatched.
 *
 * @param {Object} params
 * @param {Object} params.queueProvider - the worker's configured provider
 * @param {Object} [params.friggProvider] - verifies Frigg-signed messages
 * @returns {(event: Object) => Promise<{ ok: boolean, reasons: string[], unsigned?: boolean }>}
 */
function createQueueEventVerifier({ queueProvider, friggProvider }) {
    const signedBy = friggProvider || new NetlifyBackgroundProvider();
    const verifiers = [signedBy];
    if (queueProvider && queueProvider !== signedBy && queueProvider.verifiesHttpDelivery === true) {
        verifiers.push(queueProvider);
    }

    return async (event) => {
        const reasons = [];
        for (const verifier of verifiers) {
            let result;
            try {
                result = await verifier.verifyEvent(event);
            } catch (_) {
                result = { ok: false, reason: 'verification_error' };
            }
            if (result && result.ok === true) {
                return { ok: true, reasons, unsigned: result.unsigned === true };
            }
            reasons.push((result && result.reason) || 'rejected');
        }
        return { ok: false, reasons };
    };
}

/**
 * Wrap a worker handler so it runs only for a verified event.
 *
 * Verification happens outside createHandler on purpose: createHandler
 * connects the database before calling its method, and an unverified
 * request must not cost a connection.
 *
 * @param {Object} params
 * @param {(event: Object, context: Object) => Promise<any>} params.handler
 * @param {(event: Object) => Promise<{ ok: boolean, reasons: string[] }>} params.verify
 */
function withQueueEventAuth({ handler, verify }) {
    return async (event, context) => {
        const verdict = await verify(event);
        if (!verdict.ok) {
            log.warn('Queue message rejected', {
                eventName: 'frigg.netlify.queue.rejected',
                statusCode: 401,
                reasons: verdict.reasons,
            });
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' }),
            };
        }
        return handler(event, context);
    };
}

module.exports = { createQueueEventVerifier, withQueueEventAuth };
