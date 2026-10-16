/**
 * Extension bootstraps run from createHandler (the handler every AWS Lambda
 * and Netlify function goes through), once per process, after the database
 * connect, and the env they install reaches the modules the use cases build.
 *
 * Drives the real db-credentials extension: its bootstrap swaps the module
 * definition's env for a DB loader, then GetAuthorizationRequirements builds
 * the module through its default factory and the API client receives the
 * client_id stored in the database.
 */
const mockPrisma = {
    oAuthAppCredential: { findUnique: jest.fn() },
};

jest.mock('../../database/prisma', () => ({
    connectPrisma: jest.fn(async () => undefined),
    prisma: mockPrisma,
}));
jest.mock('../../handlers/app-definition-loader', () => ({
    loadAppDefinition: jest.fn(),
}));
jest.mock('../../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: () => ({}),
}));
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({}),
}));

const dbCredentials = require('@friggframework/extension-db-credentials');
const { connectPrisma } = require('../../database/prisma');
const { loadAppDefinition } = require('../../handlers/app-definition-loader');
const { createHandler } = require('../../core/create-handler');
const { resetInitialization } = require('../initialize-app');
const {
    GetAuthorizationRequirements,
} = require('../../modules/use-cases/get-authorization-requirements');

class OAuthApi {
    constructor(params) {
        this.params = params;
    }
    getAuthorizationRequirements() {
        return { type: 'oauth2', data: { url: `https://auth?client_id=${this.params.client_id}` } };
    }
}

function makeApp(extensionBootstrap) {
    const definition = {
        moduleName: 'hubspot',
        modelName: 'HubSpot',
        API: OAuthApi,
        env: { client_id: 'static-id', client_secret: 'static-secret' },
        requiredAuthMethods: {
            getToken: async () => {},
            getEntityDetails: async () => {},
            getCredentialDetails: async () => {},
            apiPropertiesToPersist: { credential: [], entity: [] },
            testAuthRequest: async () => true,
        },
        getName: () => 'hubspot',
    };
    class HubSpotIntegration {
        static Definition = { name: 'hubspot', modules: { hubspot: { definition } } };
    }
    const extensions = extensionBootstrap
        ? [{ name: 'probe', bootstrap: extensionBootstrap }]
        : [dbCredentials];
    return { definition, appDefinition: { name: 'app', integrations: [HubSpotIntegration], extensions } };
}

describe('createHandler runs extension bootstraps', () => {
    beforeEach(() => {
        resetInitialization();
        connectPrisma.mockClear();
        mockPrisma.oAuthAppCredential.findUnique.mockReset();
    });

    it('db-credentials: the stored client_id reaches the OAuth module the use case builds', async () => {
        const { definition, appDefinition } = makeApp();
        loadAppDefinition.mockReturnValue({ appDefinition });
        mockPrisma.oAuthAppCredential.findUnique.mockResolvedValue({
            moduleName: 'hubspot',
            clientId: 'db-client-id',
            clientSecret: 'db-secret',
            extra: {},
        });

        const handler = createHandler({
            eventName: 'Auth',
            method: async () =>
                new GetAuthorizationRequirements({ moduleDefinitions: [definition] }).execute({
                    entityType: 'hubspot',
                }),
        });

        const result = await handler({}, {});
        expect(result.data.url).toBe('https://auth?client_id=db-client-id');
        expect(mockPrisma.oAuthAppCredential.findUnique).toHaveBeenCalledWith({
            where: { moduleName: 'hubspot' },
        });
    });

    it('runs the bootstrap once per process, after the database connect', async () => {
        const order = [];
        connectPrisma.mockImplementation(async () => order.push('connect'));
        const bootstrap = jest.fn(async () => order.push('bootstrap'));
        loadAppDefinition.mockReturnValue({ appDefinition: makeApp(bootstrap).appDefinition });

        const handler = createHandler({
            eventName: 'X',
            method: async () => order.push('method'),
        });
        await handler({}, {});
        await handler({}, {});

        expect(bootstrap).toHaveBeenCalledTimes(1);
        expect(bootstrap).toHaveBeenCalledWith(mockPrisma, expect.objectContaining({ name: 'app' }));
        expect(order).toEqual(['connect', 'bootstrap', 'method', 'connect', 'method']);
        connectPrisma.mockImplementation(async () => undefined);
    });

    it('does not run bootstraps for a handler that does not use the database', async () => {
        const bootstrap = jest.fn();
        loadAppDefinition.mockReturnValue({ appDefinition: makeApp(bootstrap).appDefinition });
        const handler = createHandler({
            eventName: 'X',
            shouldUseDatabase: false,
            method: async () => ({ statusCode: 200 }),
        });
        await handler({}, {});
        expect(bootstrap).not.toHaveBeenCalled();
    });
});

describe('use cases build modules through Module.create', () => {
    // `new Module(...)` reads definition.env synchronously, so a function env
    // (installed by the db-credentials bootstrap) would give the API client no
    // client_id. Every use case must go through the async factory.
    it('no use case constructs a Module directly', () => {
        const fs = require('fs');
        const path = require('path');
        const dir = path.join(__dirname, '../../modules/use-cases');
        const offenders = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
            .filter((f) => /new Module\s*\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
        expect(offenders).toEqual([]);
    });
});
