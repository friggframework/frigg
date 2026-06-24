const { v4: uuid } = require('uuid');
const { QueuerUtil } = require('../../queues');

const SCHEMA_VERSION = 1;

// ON_DELETE is excluded: it dispatches directly and the record is gone before a
// queued worker could re-hydrate it. Custom (non-default) events are mutating.
const MUTATING_DEFAULT_EVENTS = new Set(['ON_CREATE', 'ON_UPDATE']);

function isMutatingEvent(instance, event) {
    if (!instance.defaultEvents || !instance.defaultEvents[event]) {
        return true;
    }
    return MUTATING_DEFAULT_EVENTS.has(event);
}

// Enqueues the event (returning a { queued } ack) when it opts into
// dispatch:'queue' and the queue is configured; otherwise runs it in-process
// and returns the result. Missing queue URL degrades to in-process.
async function dispatchIntegrationEvent({ instance, event, data, userId }) {
    const mode = instance.on?.[event]?.dispatch;
    const queueUrl = process.env.USER_ACTION_QUEUE_URL;

    const eligible = mode === 'queue' && isMutatingEvent(instance, event);

    if (eligible && !queueUrl) {
        console.warn(
            `[dispatchIntegrationEvent] event "${event}" requested dispatch:'queue' ` +
                `but USER_ACTION_QUEUE_URL is not set — running in-process (sync)`
        );
    }

    if (eligible && queueUrl) {
        const requestId = uuid();
        // Routing metadata at the top level keeps `data` identical to the sync path.
        const envelope = {
            schemaVersion: SCHEMA_VERSION,
            event,
            integrationId: instance.id,
            userId,
            requestId,
            data,
        };
        const result = await QueuerUtil.send(envelope, queueUrl, {
            messageGroupId: instance.id,
            messageDeduplicationId: requestId,
        });
        return { queued: true, messageId: result?.MessageId, requestId };
    }

    return { result: await instance.send(event, data) };
}

module.exports = { dispatchIntegrationEvent, SCHEMA_VERSION };
