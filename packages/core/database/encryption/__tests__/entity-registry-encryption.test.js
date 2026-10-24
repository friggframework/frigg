/**
 * ADR-059 at the encryption schema: credential fields declared by a module
 * that is registered in appDefinition.entities (and bound by no integration)
 * are encrypted, through the same path an app takes at load.
 */
jest.mock('../../../utils', () => ({
    findNearestBackendPackageJson: () => '/virtual/backend/package.json',
}));

const mockBackend = { Definition: null };
jest.mock('/virtual/backend/index.js', () => mockBackend, { virtual: true });

const {
    loadCustomEncryptionSchema,
    loadModuleEncryptionSchemas,
    registerCustomSchema,
    getEncryptedFields,
    resetCustomSchema,
} = require('../encryption-schema-registry');
const {
    EntityRegistryError,
} = require('../../../modules/entity-type-registry');
const { logger } = require('../logger');

const xero = {
    moduleName: 'xero',
    encryption: { credentialFields: ['xero_tenant_secret'] },
};
const hubspot = {
    moduleName: 'hubspot',
    encryption: { credentialFields: ['hub_private_token'] },
};
const integration = (definition) => ({
    Definition: { name: 'sync', modules: { crm: { definition } } },
});

describe('encryption schema and the entity registry (ADR-059)', () => {
    afterEach(() => {
        resetCustomSchema();
        mockBackend.Definition = null;
    });

    it('encrypts a registry-only module’s credential fields when the app loads', () => {
        mockBackend.Definition = {
            integrations: [integration(hubspot)],
            entities: { xero: { definition: xero } },
        };

        loadCustomEncryptionSchema();

        const fields = getEncryptedFields('Credential');
        expect(fields).toContain('data.xero_tenant_secret');
        expect(fields).toContain('data.hub_private_token');
    });

    it('encrypts it for an app with no integrations at all', () => {
        mockBackend.Definition = {
            integrations: [],
            entities: { xero: { definition: xero } },
        };

        loadCustomEncryptionSchema();

        expect(getEncryptedFields('Credential')).toContain(
            'data.xero_tenant_secret'
        );
    });

    it('an app with no entities key still gets only its integrations’ fields', () => {
        mockBackend.Definition = { integrations: [integration(hubspot)] };

        loadCustomEncryptionSchema();

        const fields = getEncryptedFields('Credential');
        expect(fields).toContain('data.hub_private_token');
        expect(fields).not.toContain('data.xero_tenant_secret');
    });

    it('adds module fields to the app’s own custom Credential fields instead of replacing them', () => {
        mockBackend.Definition = {
            integrations: [integration(hubspot)],
            entities: { xero: { definition: xero } },
            encryption: {
                schema: { Credential: { fields: ['data.app_owned_secret'] } },
            },
        };

        loadCustomEncryptionSchema();

        const fields = getEncryptedFields('Credential');
        expect(fields).toEqual(
            expect.arrayContaining([
                'data.app_owned_secret',
                'data.xero_tenant_secret',
                'data.hub_private_token',
            ])
        );
    });

    it('keeps an app custom schema for another model when module fields are added', () => {
        mockBackend.Definition = {
            integrations: [integration(hubspot)],
            entities: { xero: { definition: xero } },
            encryption: {
                schema: {
                    Integration: { fields: ['config.appOwnedSecret'] },
                    Credential: { fields: ['data.app_owned_secret'] },
                },
            },
        };

        loadCustomEncryptionSchema();

        expect(getEncryptedFields('Integration')).toContain(
            'config.appOwnedSecret'
        );
        expect(getEncryptedFields('Credential')).toEqual(
            expect.arrayContaining([
                'data.app_owned_secret',
                'data.xero_tenant_secret',
                'data.hub_private_token',
            ])
        );
    });

    it('keeps an app custom schema for another model when only entities declare fields', () => {
        mockBackend.Definition = {
            integrations: [],
            entities: { xero: { definition: xero } },
            encryption: {
                schema: { Integration: { fields: ['config.appOwnedSecret'] } },
            },
        };

        loadCustomEncryptionSchema();

        expect(getEncryptedFields('Integration')).toContain(
            'config.appOwnedSecret'
        );
        expect(getEncryptedFields('Credential')).toContain(
            'data.xero_tenant_secret'
        );
    });

    it('does not let a module field that core already encrypts abort the registration', () => {
        mockBackend.Definition = {
            integrations: [],
            entities: {
                xero: {
                    definition: {
                        ...xero,
                        encryption: {
                            credentialFields: ['api_key', 'xero_tenant_secret'],
                        },
                    },
                },
            },
        };

        loadCustomEncryptionSchema();

        expect(getEncryptedFields('Credential')).toContain(
            'data.xero_tenant_secret'
        );
    });

    it('surfaces a registry error instead of swallowing it as "no custom schema"', () => {
        mockBackend.Definition = {
            integrations: [],
            entities: { crm: { definition: xero } },
        };

        expect(() => loadCustomEncryptionSchema()).toThrow(EntityRegistryError);
    });

    describe('a schema the app declares but that cannot be registered', () => {
        const savedEnv = { ...process.env };
        const badSchema = () => {
            mockBackend.Definition = {
                encryption: { schema: { Credential: { fields: 'data.secret' } } },
                integrations: [],
            };
        };
        let warn;

        beforeEach(() => {
            warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        });

        afterEach(() => {
            warn.mockRestore();
            process.env = { ...savedEnv };
        });

        it('refuses to start a deployed function, which would store those fields in plaintext', () => {
            badSchema();
            delete process.env.JEST_WORKER_ID;
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'app-prod-auth';

            expect(() => loadCustomEncryptionSchema()).toThrow(
                /Invalid custom encryption schema/
            );
        });

        it('warns (not a debug line) on a local run', () => {
            badSchema();

            expect(() => loadCustomEncryptionSchema()).not.toThrow();
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(/could not be registered; those fields stay plaintext/)
            );
        });

        it('still carries on quietly when there is no app definition to read', () => {
            mockBackend.Definition = null;

            expect(() => loadCustomEncryptionSchema()).not.toThrow();
            expect(warn).not.toHaveBeenCalled();
        });
    });

    it('loadModuleEncryptionSchemas(integrations, entities) takes the registry directly', () => {
        loadModuleEncryptionSchemas([], { xero: { definition: xero } });

        expect(getEncryptedFields('Credential')).toContain(
            'data.xero_tenant_secret'
        );
    });

    it('keeps the legacy one-argument call working', () => {
        loadModuleEncryptionSchemas([integration(hubspot)]);

        expect(getEncryptedFields('Credential')).toContain(
            'data.hub_private_token'
        );
    });

    it('registerCustomSchema is untouched by module loading when nothing declares fields', () => {
        registerCustomSchema({ Other: { fields: ['x'] } });
        loadModuleEncryptionSchemas([integration({ moduleName: 'plain' })]);

        expect(getEncryptedFields('Other')).toEqual(['x']);
    });
});
