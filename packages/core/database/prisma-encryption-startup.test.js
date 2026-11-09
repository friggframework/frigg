/**
 * Prisma client startup must not "continue without encryption" when the
 * app's encryption configuration is invalid: that would write every
 * encrypted field in plaintext. Other startup failures keep their current
 * behaviour (#663 tightens those separately).
 */
jest.mock('./config', () => ({
    DB_TYPE: 'postgresql',
    getDatabaseType: jest.fn(() => 'postgresql'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));
jest.mock(
    '../generated/prisma-postgresql',
    () => ({
        PrismaClient: class {
            $extends() {
                return this;
            }
        },
    }),
    { virtual: true }
);

const mockLoadCustomEncryptionSchema = jest.fn();
jest.mock('./encryption/encryption-schema-registry', () => {
    const actual = jest.requireActual('./encryption/encryption-schema-registry');
    return {
        ...actual,
        loadCustomEncryptionSchema: (...args) =>
            mockLoadCustomEncryptionSchema(...args),
    };
});

const {
    EncryptionSchemaError,
} = require('./encryption/encryption-schema-registry');

describe('Prisma client startup with encryption enabled', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env.STAGE = 'production';
        process.env.AES_KEY_ID = 'startup-test-key';
        process.env.AES_KEY = '12345678901234567890123456789012';
        delete global._prismaInstance;
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        delete global._prismaInstance;
        jest.restoreAllMocks();
    });

    it('fails startup on an invalid encryption schema instead of disabling encryption', () => {
        mockLoadCustomEncryptionSchema.mockImplementation(() => {
            throw new EncryptionSchemaError('Invalid app encryption.schema');
        });
        const { prisma } = require('./prisma');

        expect(() => prisma.user).toThrow(EncryptionSchemaError);
    });
});
