/**
 * DLQ Processor — logs failed messages from the InternalErrorQueue
 * with structured context for monitoring and debugging.
 *
 * This handler MUST NOT throw. If it throws, the message goes back to
 * the DLQ and creates an infinite loop. All errors are caught and logged.
 */

function extractQueueName(eventSourceARN) {
    if (!eventSourceARN) return 'UNKNOWN';
    const parts = eventSourceARN.split(':');
    return parts[parts.length - 1] || 'UNKNOWN';
}

function parseMessageBody(body) {
    try {
        const parsed = JSON.parse(body);
        return {
            event: parsed.event || 'UNKNOWN',
            integrationId: parsed.data?.integrationId || null,
            processId: parsed.data?.processId || null,
            data: parsed.data,
        };
    } catch {
        return {
            event: 'UNKNOWN',
            integrationId: null,
            processId: null,
            rawBody: body,
        };
    }
}

async function dlqProcessor(event) {
    for (const record of event.Records) {
        try {
            const parsed = parseMessageBody(record.body);

            console.error('[DLQ] Failed message', {
                messageId: record.messageId,
                event: parsed.event,
                integrationId: parsed.integrationId,
                processId: parsed.processId,
                receiveCount: record.attributes?.ApproximateReceiveCount,
                sourceQueue: extractQueueName(record.eventSourceARN),
                ...(parsed.rawBody !== undefined && { rawBody: parsed.rawBody }),
            });
        } catch (error) {
            console.error('[DLQ] Error processing DLQ record', {
                messageId: record.messageId,
                error: error.message,
            });
        }
    }
}

module.exports = { dlqProcessor };
