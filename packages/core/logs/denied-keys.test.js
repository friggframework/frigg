const { registerDeniedKeys } = require('./denied-keys');
const { isDeniedKey } = require('./redact');
const { createMemorySink } = require('./sinks');

const warnings = (sink) =>
    sink.records.filter((r) => r.eventName === 'frigg.logger.denied_key_ignored');

describe('logs/denied-keys registerDeniedKeys', () => {
    it('adds the keys and returns the skipped contract keys', () => {
        createMemorySink();

        expect(registerDeniedKeys(['data.vault_pin', 'data.entity_id'])).toEqual([
            'entity_id',
        ]);
        expect(isDeniedKey('vaultPin')).toBe(true);
        expect(isDeniedKey('entityId')).toBe(false);
    });

    it('warns once per skipped key per process', () => {
        const sink = createMemorySink();

        registerDeniedKeys(['data.request_id', 'data.route']);
        registerDeniedKeys(['data.request_id']);

        expect(warnings(sink)).toEqual([
            expect.objectContaining({ level: 'WARN', key: 'request_id' }),
            expect.objectContaining({ level: 'WARN', key: 'route' }),
        ]);
    });

    it('writes nothing when no key is skipped', () => {
        const sink = createMemorySink();
        registerDeniedKeys(['data.other_pin']);
        registerDeniedKeys(undefined);
        expect(sink.records).toEqual([]);
    });
});
