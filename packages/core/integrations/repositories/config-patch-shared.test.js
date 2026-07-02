const { validateConfigPatch } = require('./config-patch-shared');

describe('validateConfigPatch', () => {
    it('accepts a patch of JSON-serializable values', () => {
        const patch = {
            attioWebhookId: 'wh_123',
            retryCount: 3,
            resourceIds: ['a', 'b'],
            phoneNumbersMetadata: { id: 'PN1', name: 'Main' },
        };
        expect(() => validateConfigPatch(patch)).not.toThrow();
    });

    it('throws when patch is null', () => {
        expect(() => validateConfigPatch(null)).toThrow(
            'patch must be a non-null object'
        );
    });

    it('throws when patch is undefined', () => {
        expect(() => validateConfigPatch(undefined)).toThrow(
            'patch must be a non-null object'
        );
    });

    it('throws when patch is an array', () => {
        expect(() => validateConfigPatch(['a', 'b'])).toThrow(
            'patch must be a non-null object'
        );
    });

    it('throws when patch is a non-object primitive', () => {
        expect(() => validateConfigPatch('attioWebhookId')).toThrow(
            'patch must be a non-null object'
        );
    });

    it('throws when patch is an empty object', () => {
        expect(() => validateConfigPatch({})).toThrow(
            'patch must contain at least one key'
        );
    });

    it('throws when a patch value is null', () => {
        expect(() =>
            validateConfigPatch({ attioWebhookId: null })
        ).toThrow("patch['attioWebhookId'] cannot be null or undefined");
    });

    it('throws when a patch value is undefined', () => {
        expect(() =>
            validateConfigPatch({ attioWebhookId: undefined })
        ).toThrow("patch['attioWebhookId'] cannot be null or undefined");
    });

    it('throws when a key contains a dot', () => {
        expect(() =>
            validateConfigPatch({ 'attio.webhookId': 'wh_123' })
        ).toThrow("patch key 'attio.webhookId' cannot contain '.' or start with '$'");
    });

    it('throws when a key starts with $', () => {
        expect(() =>
            validateConfigPatch({ $set: 'wh_123' })
        ).toThrow("patch key '$set' cannot contain '.' or start with '$'");
    });
});
