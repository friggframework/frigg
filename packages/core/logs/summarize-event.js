const { redactUrl } = require('./redact');

// Best-effort extraction of the logical event/processId/integrationId from a
// JSON message body: `data.*` first, then the top level. Used only for log
// correlation. Never throws.
function summarizeMessageBody(bodyStr) {
    try {
        const parsed = JSON.parse(bodyStr);
        return {
            event: parsed?.event,
            processId: parsed?.data?.processId ?? parsed?.processId,
            integrationId: parsed?.data?.integrationId ?? parsed?.integrationId,
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

// The route template keeps ids out of the field: REST v1 `resource`, or the
// path part of an HTTP API v2 `routeKey` such as `GET /api/{id}`.
function routeTemplate(event, path) {
    if (typeof event.resource === 'string' && event.resource) {
        return event.resource;
    }
    if (typeof event.routeKey === 'string') {
        const space = event.routeKey.indexOf(' ');
        if (space > 0) return event.routeKey.slice(space + 1);
    }
    return path;
}

function summarizeHttp(event) {
    const path = event.path || event.rawPath;
    const summary = {
        source: 'http',
        method: event.httpMethod || event.requestContext?.http?.method,
        path,
        route: routeTemplate(event, path),
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
        };
        if (summary.routeKey) invocation.routeKey = summary.routeKey;
        return invocation;
    }
    return { source: summary.source };
}

// Per-request detail for the entry and failure records, never for the
// scope. A raw path can hold a token, so it goes through redactUrl.
function toRequestDetails(summary) {
    if (!summary || summary.source !== 'http') return {};
    return {
        path: redactUrl(summary.path ?? ''),
        queryKeys: summary.queryKeys ?? [],
        headerNames: summary.headerNames ?? [],
    };
}

// The full redacted request summary (ADR-048 §6: it goes under `invocation`).
function toRequestInvocation(summary) {
    return { ...toScopeInvocation(summary), ...toRequestDetails(summary) };
}

// The same shape from an express request, for the express error boundary.
function summarizeExpressRequest(req) {
    try {
        if (!req || typeof req !== 'object') return { source: 'http' };
        return {
            source: 'http',
            method: req.method,
            path: redactUrl(req.path ?? ''),
            queryKeys: objectKeys(req.query),
            headerNames: unique(objectKeys(req.headers).map((name) => name.toLowerCase())),
        };
    } catch {
        return { source: 'http' };
    }
}

module.exports = {
    summarizeLambdaEvent,
    summarizeMessageBody,
    toScopeInvocation,
    toRequestDetails,
    toRequestInvocation,
    summarizeExpressRequest,
};
