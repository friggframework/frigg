const {
    ListEntityTypes,
    GetEntityType,
    describeEntityType,
} = require('./entity-types');

const oauthModule = {
    moduleName: 'zeta',
    API: { requesterType: 'oauth2' },
    env: { client_secret: 'never-shown' },
};
const multiStepModule = {
    moduleName: 'alpha',
    API: { requesterType: 'apiKey' },
    getDisplayName: () => 'Alpha CRM',
    getDescription: () => 'Email then one-time code',
    getAuthStepCount: () => 2,
    getCapabilities: () => ['contacts'],
};

const { getEntityTypeRegistry } = require('../entity-type-registry');

const registryOf = (...definitions) =>
    getEntityTypeRegistry({
        integrations: definitions.map((definition, i) => ({
            Definition: { name: `i${i}`, modules: { m: { definition } } },
        })),
    });

describe('entity types', () => {
    it('describes a module from its definition only', () => {
        expect(describeEntityType(oauthModule)).toEqual({
            type: 'zeta',
            name: 'zeta',
            authType: 'oauth2',
            isMultiStep: false,
            stepCount: 1,
        });
        expect(JSON.stringify(describeEntityType(oauthModule))).not.toContain(
            'never-shown'
        );
    });

    it('uses display metadata and multi-step methods when the module has them', () => {
        expect(describeEntityType(multiStepModule)).toEqual({
            type: 'alpha',
            name: 'Alpha CRM',
            description: 'Email then one-time code',
            authType: 'api-key',
            isMultiStep: true,
            stepCount: 2,
            capabilities: ['contacts'],
        });
    });

    it('lists types sorted by name', async () => {
        const types = await new ListEntityTypes({
            entityTypeRegistry: registryOf(oauthModule, multiStepModule),
        }).execute();
        expect(types.map((t) => t.type)).toEqual(['alpha', 'zeta']);
    });

    it('answers 404 for an unknown type', async () => {
        await expect(
            new GetEntityType({
                entityTypeRegistry: registryOf(oauthModule),
            }).execute('nope')
        ).rejects.toMatchObject({
            output: { statusCode: 404 },
            data: { code: 'ENTITY_TYPE_NOT_FOUND' },
        });
    });
    describe('usedBy and the registry (ADR-059)', () => {
        // Only getName(): found by registry key, never by moduleName.
        const getNameOnly = {
            getName: () => 'gamma',
            API: { requesterType: 'oauth2' },
        };
        const registry = getEntityTypeRegistry({
            entities: {
                zeta: { definition: oauthModule },
                gamma: { definition: getNameOnly },
            },
            integrations: [
                {
                    Definition: {
                        name: 'sync',
                        modules: { crm: { definition: multiStepModule } },
                    },
                },
            ],
        });

        it('lists registry-only types with an empty usedBy and bound types with their integrations', async () => {
            const types = await new ListEntityTypes({
                entityTypeRegistry: registry,
            }).execute();

            expect(types.map((t) => [t.type, t.usedBy])).toEqual([
                ['alpha', ['sync']],
                ['gamma', []],
                ['zeta', []],
            ]);
        });

        it('describes one registry-only type', async () => {
            const type = await new GetEntityType({
                entityTypeRegistry: registry,
            }).execute('zeta');

            expect(type).toMatchObject({ type: 'zeta', usedBy: [] });
        });

        it('looks up by registry key, so every listed type can be described', async () => {
            const listed = await new ListEntityTypes({
                entityTypeRegistry: registry,
            }).execute();
            const get = new GetEntityType({ entityTypeRegistry: registry });

            for (const { type } of listed) {
                await expect(get.execute(type)).resolves.toMatchObject({
                    type,
                });
            }
        });

        it('is case sensitive: ZETA is not zeta', async () => {
            await expect(
                new GetEntityType({ entityTypeRegistry: registry }).execute(
                    'ZETA'
                )
            ).rejects.toMatchObject({
                data: { code: 'ENTITY_TYPE_NOT_FOUND' },
            });
        });

        it('reports the registry key as type for a definition that only has getName()', async () => {
            const named = {
                getName: () => 'only-getname',
                API: { requesterType: 'oauth2' },
            };
            const types = await new ListEntityTypes({
                entityTypeRegistry: registryOf(named),
            }).execute();

            expect(types.map((t) => t.type)).toEqual(['only-getname']);
        });

        it('requires a registry', () => {
            expect(
                () => new ListEntityTypes({ moduleDefinitions: [oauthModule] })
            ).toThrow(/entityTypeRegistry is required/);
            expect(() => new GetEntityType({})).toThrow(
                /entityTypeRegistry is required/
            );
        });
    });
});
