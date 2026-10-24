/**
 * App-level extension encryption (friggframework/frigg#545): an extension's
 * `encryption` block registers its models' fields, merged with the app's own
 * encryption.schema, and is read from a definition preset with
 * setAppDefinition() (provider-netlify) without discovery.
 */
jest.mock('../../utils', () => ({
    findNearestBackendPackageJson: jest.fn(() => null),
}));

const {
    loadCustomEncryptionSchema,
    loadExtensionEncryptionSchemas,
    registerCustomSchema,
    getEncryptedFields,
    resetCustomSchema,
} = require('./encryption-schema-registry');
const { setAppDefinition } = require('../../handlers/app-definition-loader');

const dbCredentials = {
    name: 'db-credentials',
    encryption: { OAuthAppCredential: { fields: ['clientSecret'] } },
};

describe('extension encryption schemas', () => {
    afterEach(() => {
        resetCustomSchema();
        setAppDefinition(null);
    });

    it('registers an extension model field', () => {
        loadExtensionEncryptionSchemas([dbCredentials]);
        expect(getEncryptedFields('OAuthAppCredential')).toEqual(['clientSecret']);
    });

    it('merges with the app schema instead of replacing it', () => {
        registerCustomSchema({ CustomModel: { fields: ['secret'] } });
        loadExtensionEncryptionSchemas([
            dbCredentials,
            { name: 'second', encryption: { CustomModel: { fields: ['other'] } } },
        ]);

        expect(getEncryptedFields('CustomModel')).toEqual(['secret', 'other']);
        expect(getEncryptedFields('OAuthAppCredential')).toEqual(['clientSecret']);
    });

    it('loads extension schemas from a preset definition, even with integrations present', () => {
        setAppDefinition({
            integrations: [{ Definition: { name: 'x', modules: {} } }],
            encryption: { schema: { CustomModel: { fields: ['secret'] } } },
            coreExtensions: [dbCredentials],
        });

        loadCustomEncryptionSchema();

        expect(getEncryptedFields('OAuthAppCredential')).toEqual(['clientSecret']);
        expect(getEncryptedFields('CustomModel')).toEqual(['secret']);
    });
});
