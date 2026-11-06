const { checkIntegrations } = require('../checks/integrations');

class FakeApi {
    static requesterType = 'oauth2';
}

const moduleDefinition = () => ({
    moduleName: 'acme',
    API: FakeApi,
    requiredAuthMethods: {
        getToken: async () => {},
        getEntityDetails: async () => {},
        getCredentialDetails: async () => {},
        testAuthRequest: async () => {},
        apiPropertiesToPersist: { credential: [], entity: [] },
    },
});

function integrationClass(definition) {
    return class Integration {
        static Definition = definition;
    };
}

const goodIntegration = () =>
    integrationClass({
        name: 'acme',
        version: '1.0.0',
        modules: { acme: { definition: moduleDefinition() } },
    });

const codes = (issues) =>
    issues.map((i) => `${i.severity}:${i.code}:${i.pointer}`);

describe('checkIntegrations', () => {
    it('accepts a well-formed integration class', () => {
        expect(
            checkIntegrations({ integrations: [goodIntegration()] })
        ).toEqual([]);
    });

    it('warns when the app lists no integrations', () => {
        expect(codes(checkIntegrations({ integrations: [] }))).toEqual([
            'warning:no-integrations:/integrations',
        ]);
    });

    it('rejects an entry that is not a class', () => {
        expect(
            codes(
                checkIntegrations({
                    integrations: [{ Definition: { name: 'x' } }],
                })
            )
        ).toEqual(['error:integration-not-a-class:/integrations/0']);
    });

    it('rejects a class without a static Definition', () => {
        class Bare {}
        expect(codes(checkIntegrations({ integrations: [Bare] }))).toEqual([
            'error:integration-definition-missing:/integrations/0/Definition',
        ]);
    });

    it('requires a valid name and modules, and warns on a missing version', () => {
        const Cls = integrationClass({ name: '1 bad name' });
        expect(codes(checkIntegrations({ integrations: [Cls] }))).toEqual([
            'error:integration-name-invalid:/integrations/0/Definition/name',
            'warning:integration-version-missing:/integrations/0/Definition/version',
            'error:integration-modules-missing:/integrations/0/Definition/modules',
        ]);
    });

    it('reports duplicate integration names', () => {
        expect(
            codes(
                checkIntegrations({
                    integrations: [goodIntegration(), goodIntegration()],
                })
            )
        ).toEqual([
            'error:integration-name-duplicate:/integrations/1/Definition/name',
        ]);
    });

    it('checks module definitions the way Module.validateDefinition does', () => {
        const definition = moduleDefinition();
        delete definition.requiredAuthMethods.getToken;
        delete definition.moduleName;
        const Cls = integrationClass({
            name: 'acme',
            version: '1',
            modules: { acme: { definition }, other: {} },
        });

        expect(codes(checkIntegrations({ integrations: [Cls] }))).toEqual([
            'error:module-name-missing:/integrations/0/Definition/modules/acme/definition/moduleName',
            'error:module-auth-method-missing:/integrations/0/Definition/modules/acme/definition/requiredAuthMethods/getToken',
            'error:module-definition-missing:/integrations/0/Definition/modules/other/definition',
        ]);
    });

    it('does not require getToken for non-OAuth2 modules', () => {
        const definition = moduleDefinition();
        definition.API = class {
            static requesterType = 'apiKey';
        };
        delete definition.requiredAuthMethods.getToken;
        const Cls = integrationClass({
            name: 'acme',
            version: '1',
            modules: { acme: { definition } },
        });

        expect(checkIntegrations({ integrations: [Cls] })).toEqual([]);
    });

    it('warns that a module rateLimit is not applied', () => {
        const definition = {
            ...moduleDefinition(),
            rateLimit: { requests: 10, period: 'second' },
        };
        const Cls = integrationClass({
            name: 'acme',
            version: '1',
            modules: { acme: { definition } },
        });

        expect(codes(checkIntegrations({ integrations: [Cls] }))).toEqual([
            'warning:module-rate-limit-ignored:/integrations/0/Definition/modules/acme/definition/rateLimit',
        ]);
    });
});
