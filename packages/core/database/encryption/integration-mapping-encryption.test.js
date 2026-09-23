jest.mock('./encryption-schema-registry', () => ({
    ...jest.requireActual('./encryption-schema-registry'),
    loadCustomEncryptionSchema: jest.fn(),
}));

const {
    loadCustomEncryptionSchema,
    registerCustomSchema,
    registerEncryptionOptOut,
    resetCustomSchema,
    resetEncryptionOptOut,
} = require('./encryption-schema-registry');
const { logger } = require('./logger');
const {
    getMappingFieldsEncryptedOnWrite,
    resetMappingEncryptionCheck,
} = require('./integration-mapping-encryption');

describe('getMappingFieldsEncryptedOnWrite', () => {
    const ENV_KEYS = ['STAGE', 'NODE_ENV', 'AES_KEY_ID', 'KMS_KEY_ARN'];
    let savedEnv;

    beforeEach(() => {
        savedEnv = Object.fromEntries(
            ENV_KEYS.map((key) => [key, process.env[key]])
        );
        loadCustomEncryptionSchema.mockReset();
        resetEncryptionOptOut();
        resetCustomSchema();
        resetMappingEncryptionCheck();
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        resetEncryptionOptOut();
        resetCustomSchema();
        resetMappingEncryptionCheck();
        jest.restoreAllMocks();
    });

    const enableEncryption = () => {
        process.env.STAGE = 'production';
        process.env.AES_KEY_ID = 'test-key';
        delete process.env.KMS_KEY_ARN;
    };

    it('names mapping while encryption is on and nothing opts it out', () => {
        enableEncryption();

        expect(getMappingFieldsEncryptedOnWrite()).toEqual(['mapping']);
    });

    it("loads the app definition's opt-out before deciding", () => {
        enableEncryption();
        loadCustomEncryptionSchema.mockImplementation(() =>
            registerEncryptionOptOut({ IntegrationMapping: ['mapping'] })
        );

        expect(getMappingFieldsEncryptedOnWrite()).toEqual([]);
    });

    it('names a nested mapping path that a custom schema still encrypts', () => {
        enableEncryption();
        registerCustomSchema({
            IntegrationMapping: { fields: ['mapping.secret'] },
        });
        registerEncryptionOptOut({ IntegrationMapping: ['mapping'] });

        expect(getMappingFieldsEncryptedOnWrite()).toEqual(['mapping.secret']);
    });

    it('is empty once the nested mapping path is opted out too', () => {
        enableEncryption();
        registerCustomSchema({
            IntegrationMapping: { fields: ['mapping.secret'] },
        });
        registerEncryptionOptOut({
            IntegrationMapping: ['mapping', 'mapping.secret'],
        });

        expect(getMappingFieldsEncryptedOnWrite()).toEqual([]);
    });

    it('ignores an encrypted field that only shares the mapping prefix', () => {
        enableEncryption();
        registerCustomSchema({
            IntegrationMapping: { fields: ['mappingVersion'] },
        });
        registerEncryptionOptOut({ IntegrationMapping: ['mapping'] });

        expect(getMappingFieldsEncryptedOnWrite()).toEqual([]);
    });

    it.each([['dev'], ['test'], ['local']])(
        'is empty on STAGE=%s, where encryption is off and the opt-out is never registered',
        (stage) => {
            process.env.STAGE = stage;
            process.env.AES_KEY_ID = 'test-key';

            expect(getMappingFieldsEncryptedOnWrite()).toEqual([]);
        }
    );

    it('keeps a pass for the process, so a stage without keys warns once', () => {
        process.env.STAGE = 'production';
        delete process.env.AES_KEY_ID;
        delete process.env.KMS_KEY_ARN;
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});

        getMappingFieldsEncryptedOnWrite();
        getMappingFieldsEncryptedOnWrite();

        const noKeyWarnings = warn.mock.calls.filter(([message]) =>
            /No encryption keys configured/.test(message)
        );
        expect(noKeyWarnings).toHaveLength(1);
    });

    it('checks again on every call while mapping is encrypted', () => {
        enableEncryption();

        expect(getMappingFieldsEncryptedOnWrite()).toEqual(['mapping']);
        expect(getMappingFieldsEncryptedOnWrite()).toEqual(['mapping']);
        expect(loadCustomEncryptionSchema).toHaveBeenCalledTimes(2);
    });

    it('checks again after resetMappingEncryptionCheck', () => {
        process.env.STAGE = 'dev';
        expect(getMappingFieldsEncryptedOnWrite()).toEqual([]);

        enableEncryption();
        resetMappingEncryptionCheck();

        expect(getMappingFieldsEncryptedOnWrite()).toEqual(['mapping']);
    });
});
