/**
 * DLQ Processor — logs failed messages from the InternalErrorQueue
 * with structured context for monitoring and debugging.
 *
 * This handler MUST NOT throw. If it throws, the message goes back to
 * the DLQ and creates an infinite loop. All errors are caught and logged.
 */
const crypto = require('node:crypto');
const { getLogger } = require('../../logs');
const {
    summarizeLambdaEvent,
    toScopeInvocation,
} = require('../../logs/summarize-event');
const {
    runInvocationScope,
    runMessageScope,
} = require('../../core/invocation-scope');

const log = getLogger('frigg.queue.dlq');

function extractQueueName(eventSourceARN) {
    if (!eventSourceARN) return 'UNKNOWN';
    const parts = eventSourceARN.split(':');
    return parts[parts.length - 1] || 'UNKNOWN';
}

// The body can hold credentials, so only its size and digest are logged.
function describeBody(body) {
    const text = typeof body === 'string' ? body : String(body ?? '');
    return {
        bodyLength: Buffer.byteLength(text),
        bodySha256: crypto.createHash('sha256').update(text).digest('hex'),
    };
}

function isJson(body) {
    try {
        JSON.parse(body);
        return true;
    } catch {
        return false;
    }
}

function logRecord(record) {
    const body = describeBody(record.body);
    if (!isJson(record.body)) {
        log.warn('DLQ message body is not JSON', {
            eventName: 'frigg.queue.dlq.body_unparsed',
            ...body,
        });
    }
    // messageId, receiveCount and the body ids come from the message scope.
    log.error('Message reached the DLQ', {
        eventName: 'frigg.queue.dlq.message_failed',
        sentTimestamp: record.attributes?.SentTimestamp,
        sourceQueue: extractQueueName(record.eventSourceARN),
        ...body,
    });
}

async function dlqProcessor(event, context) {
    if (!event?.Records?.length) return { batchItemFailures: [] };

    await runInvocationScope(
        {
            requestId: context?.awsRequestId,
            handlerName: 'dlqProcessor',
            invocation: toScopeInvocation(summarizeLambdaEvent(event)),
        },
        async () => {
            for (const record of event.Records) {
                await runMessageScope(record, async () => {
                    try {
                        logRecord(record);
                    } catch (error) {
                        log.error('DLQ record failed', {
                            eventName: 'frigg.queue.dlq.record_failed',
                            error,
                        });
                    }
                });
            }
        },
        { shouldUseDatabase: false, context }
    );

    return { batchItemFailures: [] };
}

module.exports = { dlqProcessor };
