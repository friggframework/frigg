// Field names of the record contract (ADR-048 §3). A leaf: no requires.

const REQUIRED_KEYS = ['timestamp', 'level', 'message', 'logger'];
const RESOURCE_KEYS = ['appName', 'stage'];
const TRACE_KEYS = ['trace_id', 'span_id', 'trace_flags'];
const DROPPED_KEYS_FIELD = 'droppedKeys';
const OWNED_KEYS = new Set([
    ...REQUIRED_KEYS,
    ...RESOURCE_KEYS,
    ...TRACE_KEYS,
    DROPPED_KEYS_FIELD,
]);

// Set by the scope builders (logs/context.js, core/invocation-scope.js,
// core/create-handler.js) and the Module and IntegrationBase bindings.
const SCOPE_KEYS = [
    'integrationId',
    'integrationType',
    'userId',
    'version',
    'entityId',
    'credentialId',
    'requestId',
    'messageId',
    'receiveCount',
    'processId',
    'integrationEvent',
    'handlerName',
    'method',
    'route',
    'routeKey',
    'invocation',
];

const CONTRACT_KEYS = [
    ...new Set([...OWNED_KEYS, ...SCOPE_KEYS, 'eventName', 'statusCode', 'error']),
];

const RESERVED_KEYS = new Set([
    'tenantId',
    'type',
    'time',
    'record',
    'errorType',
    'errorMessage',
    'stackTrace',
    'service',
    'env',
    'host',
    'source',
    'status',
    'severity',
]);

const PAYLOAD_KEYS = new Set(['body', 'rawBody', 'payload', 'response']);

module.exports = {
    REQUIRED_KEYS,
    RESOURCE_KEYS,
    TRACE_KEYS,
    DROPPED_KEYS_FIELD,
    OWNED_KEYS,
    SCOPE_KEYS,
    CONTRACT_KEYS,
    RESERVED_KEYS,
    PAYLOAD_KEYS,
};
