const {
    toApiModuleDefinitionSchemaView,
    toFunctionDescriptor,
} = require('../api-module-definition');
const { validateApiModuleDefinition } = require('../index');
const { Definition: fathomDefinition } = require('./fixtures/fathom-definition');

describe('toApiModuleDefinitionSchemaView', () => {
    test('converts functions and the API class for schema validation', () => {
        class Api {}
        const view = toApiModuleDefinitionSchemaView({
            moduleName: 'acme',
            modelName: 'Acme',
            API: Api,
            getName: () => 'acme',
            requiredAuthMethods: {
                getEntityDetails: async () => ({}),
                setAuthParams: async () => {},
                getAuthorizationRequirements: () => ({ type: 'apiKey' }),
                apiPropertiesToPersist: { credential: [], entity: [] },
            },
            env: { api_key: undefined, base_url: 'https://example.com' },
        });

        expect(view.API).toEqual({});
        expect(view.getName).toEqual({ type: 'function' });
        expect(view.requiredAuthMethods.getEntityDetails).toEqual({
            type: 'function',
            async: true,
        });
        expect(view.requiredAuthMethods.getAuthorizationRequirements).toEqual({
            type: 'function',
        });
        expect(view.requiredAuthMethods.apiPropertiesToPersist).toEqual({
            credential: [],
            entity: [],
        });
        expect(view.env).toEqual({ base_url: 'https://example.com' });
    });

    test('toFunctionDescriptor marks AsyncFunction', () => {
        expect(toFunctionDescriptor(() => {})).toEqual({ type: 'function' });
        expect(toFunctionDescriptor(async () => {})).toEqual({
            type: 'function',
            async: true,
        });
    });

    test('Fathom fixture view validates', () => {
        const view = toApiModuleDefinitionSchemaView(fathomDefinition);
        expect(view.modelName).toBe('Fathom');
        expect(view.requiredAuthMethods.getAuthorizationRequirements.type).toBe(
            'function'
        );
        expect(view.requiredAuthMethods.setAuthParams.async).toBe(true);
        expect(validateApiModuleDefinition(fathomDefinition).valid).toBe(true);
    });
});
