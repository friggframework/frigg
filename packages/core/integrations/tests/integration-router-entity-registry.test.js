/**
 * ADR-059 at the v1 router: POST /api/authorize accepts an entity type that is
 * registered in appDefinition.entities and bound by no integration.
 */
const mockAppDefinition = { current: null };
jest.mock('../../handlers/app-definition-loader', () => ({
    loadAppDefinition: () => mockAppDefinition.current,
}));
jest.mock('../repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({}),
}));
jest.mock(
    '../../credential/repositories/credential-repository-factory',
    () => ({
        createCredentialRepository: () => ({}),
    })
);
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({}),
}));
jest.mock('../../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));

const { createIntegrationRouter } = require('../integration-router');
const { createApp } = require('../../handlers/app-handler-helpers');
const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');
const {
    ProcessAuthorizationCallback,
} = require('../../modules/use-cases/process-authorization-callback');

const {
    getEntityTypeRegistry,
    getEntityTypeDefinitions,
} = require('../../modules/entity-type-registry');

// What loadAppDefinition() hands back: the definition plus its registry.
const loaded = (appDefinition) => ({
    ...appDefinition,
    moduleDefinitions: getEntityTypeDefinitions(
        getEntityTypeRegistry(appDefinition)
    ),
});

const acme = { moduleName: 'acme' };
const hubspot = { moduleName: 'hubspot' };

async function postAuthorize(body) {
    const app = createApp((a) => a.use(createIntegrationRouter()));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    try {
        const res = await fetch(
            `http://127.0.0.1:${server.address().port}/api/authorize`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            }
        );
        return { status: res.status, text: await res.text() };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

describe('POST /api/authorize and the entity registry (ADR-059)', () => {
    let seenDefinitions;

    beforeEach(() => {
        seenDefinitions = null;
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(AuthenticateUser.prototype, 'execute').mockResolvedValue({
            getId: () => 'user-1',
        });
        // Replace only what runs after the lookup; keep the wiring under test.
        jest.spyOn(
            ProcessAuthorizationCallback.prototype,
            'execute'
        ).mockImplementation(async function (_userId, entityType) {
            seenDefinitions = this.moduleDefinitions;
            if (
                !this.moduleDefinitions.some(
                    (def) => def.moduleName === entityType
                )
            ) {
                throw new Error(
                    `Module definition not found for entity type: ${entityType}`
                );
            }
            return { credential_id: 'cred-1', entity_id: 'ent-1' };
        });
    });
    afterEach(() => jest.restoreAllMocks());

    it('accepts a registry-only type', async () => {
        mockAppDefinition.current = loaded({
            integrations: [
                {
                    Definition: {
                        name: 'sync',
                        modules: { crm: { definition: hubspot } },
                    },
                },
            ],
            entities: { acme: { definition: acme } },
            userConfig: {},
        });

        const res = await postAuthorize({
            entityType: 'acme',
            data: { code: 'x' },
        });

        expect(res.status).toBe(200);
        expect(JSON.parse(res.text)).toEqual({
            credential_id: 'cred-1',
            entity_id: 'ent-1',
        });
        expect(seenDefinitions).toEqual(
            expect.arrayContaining([acme, hubspot])
        );
    });

    it('does not accept the same type when the app registers nothing', async () => {
        mockAppDefinition.current = loaded({
            integrations: [
                {
                    Definition: {
                        name: 'sync',
                        modules: { crm: { definition: hubspot } },
                    },
                },
            ],
            userConfig: {},
        });

        const res = await postAuthorize({
            entityType: 'acme',
            data: { code: 'x' },
        });

        expect(res.status).toBe(500);
        expect(seenDefinitions).toEqual([hubspot]);
    });
});
