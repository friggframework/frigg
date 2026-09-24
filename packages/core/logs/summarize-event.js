// Best-effort extraction of the logical event/processId/integrationId from a
// JSON message body. Used only for log correlation. Never throws.
function summarizeMessageBody(bodyStr) {
    try {
        const parsed = JSON.parse(bodyStr);
        return {
            event: parsed?.event,
            processId: parsed?.data?.processId,
            integrationId: parsed?.data?.integrationId,
        };
    } catch {
        return {};
    }
}

function objectKeys(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value)
        : [];
}

function rawQueryKeys(rawQueryString) {
    if (typeof rawQueryString !== 'string' || !rawQueryString) return [];
    try {
        return [...new URLSearchParams(rawQueryString).keys()];
    } catch {
        return [];
    }
}

function unique(list) {
    return [...new Set(list)];
}

function summarizeHttp(event) {
    const path = event.path || event.rawPath;
    const summary = {
        source: 'http',
        method: event.httpMethod || event.requestContext?.http?.method,
        path,
        route: path,
        queryKeys: unique([
            ...objectKeys(event.queryStringParameters),
            ...objectKeys(event.multiValueQueryStringParameters),
            ...rawQueryKeys(event.rawQueryString),
        ]),
        headerNames: unique(
            [...objectKeys(event.headers), ...objectKeys(event.multiValueHeaders)].map(
                (name) => name.toLowerCase()
            )
        ),
    };
    if (typeof event.routeKey === 'string' && event.routeKey) {
        summary.routeKey = event.routeKey;
    }
    return summary;
}

// Best-effort extraction of correlation identifiers from a Lambda event.
// For SQS: messageIds plus the parsed event/processId/integrationId of each
// record body. For HTTP: method, route, query keys and header names. Never
// throws and never returns a body, a query value or a header value.
function summarizeLambdaEvent(event) {
    try {
        if (!event || typeof event !== 'object') return {};
        if (Array.isArray(event.Records)) {
            return {
                source: 'sqs',
                records: event.Records.map((r) => ({
                    messageId: r?.messageId,
                    receiveCount: r?.attributes?.ApproximateReceiveCount,
                    ...summarizeMessageBody(r?.body),
                })),
            };
        }
        if (event.httpMethod || event.requestContext?.http) {
            return summarizeHttp(event);
        }
        return { source: 'other' };
    } catch {
        return { source: 'other' };
    }
}

// The bounded form that goes into the logger scope: no per-record array.
function toScopeInvocation(summary) {
    if (!summary || typeof summary !== 'object' || !summary.source) {
        return { source: 'other' };
    }
    if (summary.source === 'sqs') {
        return {
            source: 'sqs',
            recordCount: Array.isArray(summary.records) ? summary.records.length : 0,
        };
    }
    if (summary.source === 'http') {
        const invocation = {
            source: 'http',
            method: summary.method,
            route: summary.route,
            queryKeys: summary.queryKeys ?? [],
            headerNames: summary.headerNames ?? [],
        };
        if (summary.routeKey) invocation.routeKey = summary.routeKey;
        return invocation;
    }
    return { source: summary.source };
}

module.exports = { summarizeLambdaEvent, summarizeMessageBody, toScopeInvocation };
