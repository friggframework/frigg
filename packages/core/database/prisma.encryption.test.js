/**
 * Prisma client creation against the field-level encryption rule: a deployed
 * runtime with no key refuses to start rather than writing plaintext.
 */

jest.mock('./config', () => ({ DB_TYPE: 'postgresql' }));

const mockExtends = jest.fn();
jest.mock(
    '../generated/prisma-postgresql',
    () => ({
        PrismaClient: class {
            $extends(extension) {
                mockExtends(extension);
                return this;
            }
        },
    }),
    { virtual: true }
);

jest.mock('./encryption/encryption-schema-registry', () => ({
    ...jest.requireActual('./encryption/encryption-schema-registry'),
    loadCustomEncryptionSchema: jest.fn(),
}));

const {
    loadCustomEncryptionSchema,
} = require('./encryption/encryption-schema-registry');
const { logger } = require('./encryption/logger');
const {
    EncryptionConfigurationError,
} = require('./encryption/encryption-config');
const { prisma } = require('./prisma');

const ENV_KEYS = [
    'AWS_LAMBDA_FUNCTION_NAME',
    'LAMBDA_TASK_ROOT',
    'AWS_EXECUTION_ENV',
    'IS_OFFLINE',
    'IS_LOCAL',
    'JEST_WORKER_ID',
    'STAGE',
    'NODE_ENV',
    'KMS_KEY_ARN',
    'AES_KEY_ID',
    'AES_KEY',
    'FRIGG_ENCRYPTION_DISABLED',
];

function createClient() {
    // Any property read creates the singleton.
    return prisma.$extends;
}

describe('Prisma client creation and field-level encryption', () => {
    let savedEnv;

    beforeEach(() => {
        savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
        for (const key of ENV_KEYS) delete process.env[key];
        delete global._prismaInstance;
        mockExtends.mockReset();
        loadCustomEncryptionSchema.mockReset();
        jest.spyOn(logger, 'warn').mockImplementation(() => {});
        jest.spyOn(logger, 'info').mockImplementation(() => {});
        jest.spyOn(logger, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        delete global._prismaInstance;
        jest.restoreAllMocks();
    });

    function deployed(extra = {}) {
        Object.assign(process.env, {
            AWS_LAMBDA_FUNCTION_NAME: 'my-app-dev-auth',
            LAMBDA_TASK_ROOT: '/var/task',
            STAGE: 'dev',
            ...extra,
        });
    }

    it('throws at startup when deployed with no key, even on STAGE=dev', () => {
        deployed();
        expect(createClient).toThrow(EncryptionConfigurationError);
        expect(createClient).toThrow(/No field-level encryption key/);
        expect(global._prismaInstance).toBeUndefined();
        expect(mockExtends).not.toHaveBeenCalled();
    });

    it('installs the encryption extension when deployed with a KMS key on STAGE=dev', () => {
        deployed({ KMS_KEY_ARN: 'arn:aws:kms:us-east-1:123456789012:key/abc' });
        createClient();
        expect(mockExtends).toHaveBeenCalledTimes(1);
    });

    it('starts without encryption when deployed with the explicit opt-out', () => {
        deployed({ FRIGG_ENCRYPTION_DISABLED: 'true' });
        createClient();
        expect(mockExtends).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringMatching(/FRIGG_ENCRYPTION_DISABLED/)
        );
    });

    it('starts without encryption under frigg start (serverless-offline)', () => {
        deployed({ IS_OFFLINE: 'true' });
        createClient();
        expect(mockExtends).not.toHaveBeenCalled();
    });

    it('refuses to start when the encryption extension fails to initialise', () => {
        deployed({ KMS_KEY_ARN: 'arn:aws:kms:us-east-1:123456789012:key/abc' });
        loadCustomEncryptionSchema.mockImplementation(() => {
            throw new Error('bad custom schema');
        });
        expect(createClient).toThrow(/bad custom schema/);
        expect(global._prismaInstance).toBeUndefined();
    });
});
