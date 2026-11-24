/**
 * loadCustomEncryptionSchema against an app definition: bad input must be
 * visible, and one bad module entry must not drop every other module field.
 */
const path = require('node:path');

// A fresh (virtual) backend directory per app definition, so a module
// registered for one test is never served to another.
let backendCount = 0;
function fakeBackendPaths() {
    backendCount += 1;
    const dir = path.join(__dirname, `__fake-backend-${backendCount}__`);
    return {
        packageJson: path.join(dir, 'package.json'),
        index: path.join(dir, 'index.js'),
    };
}

// One shared mock: the registry requires utils lazily, at call time, so a
// per-registry mock instance would not be the one it sees.
const mockFindBackend = jest.fn();
jest.mock('../../../utils', () => ({
    findNearestBackendPackageJson: (...args) => mockFindBackend(...args),
}));

function moduleIntegration(credentialFields) {
    return {
        Definition: {
            modules: {
                m: { definition: { encryption: { credentialFields } } },
            },
        },
    };
}

function loadRegistryWithApp(appDefinition) {
    const backend = fakeBackendPaths();
    let registry;
    jest.isolateModules(() => {
        jest.doMock(backend.index, () => ({ Definition: appDefinition }), {
            virtual: true,
        });
        mockFindBackend.mockReturnValue(backend.packageJson);
        registry = require('../encryption-schema-registry');
    });
    return registry;
}

describe('loadCustomEncryptionSchema with an app definition', () => {
    const originalStage = process.env.STAGE;
    let warnSpy;
    let errorSpy;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env.STAGE = originalStage;
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('skips and warns about an invalid module entry, keeping the valid ones', () => {
        process.env.STAGE = 'production';
        const registry = loadRegistryWithApp({
            integrations: [
                moduleIntegration(['webhook_secret', 42]),
                moduleIntegration(['signing_key']),
            ],
        });

        registry.loadCustomEncryptionSchema();

        const fields = registry.getEncryptedFields('Credential');
        expect(fields).toContain('data.webhook_secret');
        expect(fields).toContain('data.signing_key');
        expect(warnSpy).toHaveBeenCalledWith(
            '[Frigg]',
            expect.stringContaining('credentialFields'),
        );
    });

    it('throws an EncryptionSchemaError and logs an error for an invalid app schema in a deployed stage', () => {
        process.env.STAGE = 'production';
        const registry = loadRegistryWithApp({
            encryption: { schema: { Credential: { fields: ['data.api_key'] } } },
            integrations: [moduleIntegration(['webhook_secret'])],
        });

        expect(() => registry.loadCustomEncryptionSchema()).toThrow(
            registry.EncryptionSchemaError
        );
        expect(errorSpy).toHaveBeenCalled();
    });

    it('warns but keeps going for an invalid app schema in a local stage', () => {
        process.env.STAGE = 'dev';
        const registry = loadRegistryWithApp({
            encryption: { schema: { Credential: { fields: ['data.api_key'] } } },
            integrations: [moduleIntegration(['webhook_secret'])],
        });

        expect(() => registry.loadCustomEncryptionSchema()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        expect(registry.getEncryptedFields('Credential')).toContain(
            'data.webhook_secret'
        );
    });

    it('stays quiet when there is no backend at all', () => {
        process.env.STAGE = 'production';
        let registry;
        jest.isolateModules(() => {
            mockFindBackend.mockReturnValue(null);
            registry = require('../encryption-schema-registry');
        });

        expect(() => registry.loadCustomEncryptionSchema()).not.toThrow();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
