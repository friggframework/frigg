/**
 * Values in fields that become encrypted (e.g. a module's credentialFields
 * registered for the first time) used to be stored in plaintext. Through the
 * Prisma extension, with a real AES Cryptor:
 * - plaintext that merely contains colons is not mistaken for ciphertext;
 * - values round-trip with their type (a numeric string stays a string);
 * - a real ciphertext that can't be decrypted still throws.
 */
const { createEncryptionExtension } = require('../prisma-encryption-extension');
const {
    registerCustomSchema,
    resetCustomSchema,
} = require('../encryption-schema-registry');
const { Cryptor } = require('../../../encrypt/Cryptor');

describe('Prisma encryption extension with legacy and typed values', () => {
    const originalEnv = { ...process.env };
    let extension;
    let stored;

    // Stand-in for the database: create stores args.data, find returns it.
    const create = (data) =>
        extension.query.$allModels.create({
            model: 'Credential',
            args: { data },
            query: async (args) => {
                stored = args.data;
                return args.data;
            },
        });
    const read = (row) =>
        extension.query.$allModels.findUnique({
            model: 'Credential',
            args: { where: { id: 'c1' } },
            query: async () => row,
        });

    beforeEach(() => {
        process.env.AES_KEY_ID = 'legacy-values-key';
        process.env.AES_KEY = '12345678901234567890123456789012';
        registerCustomSchema({
            Credential: { fields: ['data.webhook_secret', 'data.pin'] },
        });
        extension = createEncryptionExtension({
            cryptor: new Cryptor({ shouldUseAws: false }),
            enabled: true,
        });
    });

    afterEach(() => {
        resetCustomSchema();
        process.env = { ...originalEnv };
    });

    it('reads legacy plaintext containing colons as plaintext', async () => {
        const legacy = {
            id: 'c1',
            data: {
                webhook_secret: 'a:b:c:d',
                pin: 'https://user:pass@example.com:8443/x',
            },
        };

        const result = await read(legacy);

        expect(result.data.webhook_secret).toBe('a:b:c:d');
        expect(result.data.pin).toBe('https://user:pass@example.com:8443/x');
    });

    it('encrypts plaintext containing colons on write', async () => {
        await create({ data: { webhook_secret: 'a:b:c:d' } });

        expect(stored.data.webhook_secret).not.toBe('a:b:c:d');
        const result = await read(stored);
        expect(result.data.webhook_secret).toBe('a:b:c:d');
    });

    it('round-trips a numeric string as a string', async () => {
        await create({ data: { pin: '123456', webhook_secret: 'true' } });

        const result = await read(stored);

        expect(result.data.pin).toBe('123456');
        expect(result.data.webhook_secret).toBe('true');
    });

    it('round-trips non-string values with their type', async () => {
        await create({ data: { pin: 1234, webhook_secret: { k: 'v' } } });

        const result = await read(stored);

        expect(result.data.pin).toBe(1234);
        expect(result.data.webhook_secret).toEqual({ k: 'v' });
    });

    it('still throws when a real ciphertext cannot be decrypted', async () => {
        await create({ data: { webhook_secret: 'secret' } });
        process.env.AES_KEY_ID = 'rotated-away';

        await expect(read(stored)).rejects.toThrow('Encryption key not found');
    });
});
