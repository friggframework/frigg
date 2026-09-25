const {
    REQUIRED_KEYS,
    RESOURCE_KEYS,
    TRACE_KEYS,
    DROPPED_KEYS_FIELD,
    OWNED_KEYS,
    SCOPE_KEYS,
    CONTRACT_KEYS,
    RESERVED_KEYS,
    PAYLOAD_KEYS,
} = require('./contract-keys');
const { addDeniedKeys, isDeniedKey } = require('./redact');

describe('logs/contract-keys', () => {
    it('owns the required, resource, trace and droppedKeys fields', () => {
        expect(REQUIRED_KEYS).toEqual(['timestamp', 'level', 'message', 'logger']);
        expect(RESOURCE_KEYS).toEqual(['appName', 'stage']);
        expect(TRACE_KEYS).toEqual(['trace_id', 'span_id', 'trace_flags']);
        expect(DROPPED_KEYS_FIELD).toBe('droppedKeys');
        expect([...OWNED_KEYS]).toEqual([
            ...REQUIRED_KEYS,
            ...RESOURCE_KEYS,
            ...TRACE_KEYS,
            DROPPED_KEYS_FIELD,
        ]);
    });

    it('lists the scope fields the scope builders set', () => {
        expect(SCOPE_KEYS).toEqual(
            expect.arrayContaining([
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
            ])
        );
    });

    it('CONTRACT_KEYS is the union plus eventName, statusCode and error', () => {
        expect(CONTRACT_KEYS).toEqual(
            expect.arrayContaining([
                ...OWNED_KEYS,
                ...SCOPE_KEYS,
                'eventName',
                'statusCode',
                'error',
            ])
        );
        expect(new Set(CONTRACT_KEYS).size).toBe(CONTRACT_KEYS.length);
    });

    it('keeps the reserved and payload sets', () => {
        expect(RESERVED_KEYS.has('status')).toBe(true);
        expect(RESERVED_KEYS.size).toBe(13);
        expect([...PAYLOAD_KEYS]).toEqual(['body', 'rawBody', 'payload', 'response']);
    });

    it.each(['receive_count', 'trace_id', 'appName', 'handler-name', 'invocation'])(
        'redact never denies the contract key %s',
        (key) => {
            expect(addDeniedKeys([key])).toEqual([key]);
            expect(isDeniedKey(key)).toBe(false);
        }
    );
});
