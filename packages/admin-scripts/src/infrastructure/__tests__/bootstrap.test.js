const { ScriptFactory } = require('../../application/script-factory');
const { AdminScriptBase } = require('../../application/admin-script-base');

jest.mock('@friggframework/core/handlers/app-definition-loader');

const {
    loadAppDefinition,
} = require('@friggframework/core/handlers/app-definition-loader');
const {
    bootstrapAdminScripts,
    _resetBootstrapForTests,
} = require('../bootstrap');

class TestScript extends AdminScriptBase {
    static Definition = {
        name: 'test-script',
        version: '1.0.0',
        description: 'Test script',
    };
}

describe('bootstrapAdminScripts', () => {
    beforeEach(() => {
        _resetBootstrapForTests();
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
    });

    it('registers the app definition admin scripts into the returned factory', () => {
        loadAppDefinition.mockReturnValue({ adminScripts: [TestScript] });

        const { scriptFactory, integrationFactory } = bootstrapAdminScripts();

        expect(scriptFactory).toBeInstanceOf(ScriptFactory);
        expect(scriptFactory.has('test-script')).toBe(true);
        expect(integrationFactory).toBeTruthy();
    });

    it('never throws and returns an empty factory when the app definition cannot load', () => {
        loadAppDefinition.mockImplementation(() => {
            throw new Error('cannot load app definition');
        });

        let result;
        expect(() => {
            result = bootstrapAdminScripts();
        }).not.toThrow();

        expect(result.scriptFactory).toBeInstanceOf(ScriptFactory);
        expect(result.scriptFactory.size).toBe(0);
        expect(result.integrationFactory).toBeTruthy();
        expect(console.error).toHaveBeenCalled();
    });

    it('memoizes: repeated calls reuse the same factory and load the definition once', () => {
        loadAppDefinition.mockReturnValue({ adminScripts: [TestScript] });

        const first = bootstrapAdminScripts();
        const second = bootstrapAdminScripts();

        expect(second.scriptFactory).toBe(first.scriptFactory);
        expect(second.integrationFactory).toBe(first.integrationFactory);
        expect(loadAppDefinition).toHaveBeenCalledTimes(1);
    });

    it('tolerates an app definition with no adminScripts', () => {
        loadAppDefinition.mockReturnValue({});

        const { scriptFactory } = bootstrapAdminScripts();

        expect(scriptFactory).toBeInstanceOf(ScriptFactory);
        expect(scriptFactory.size).toBe(0);
    });
});
