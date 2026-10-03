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
            moduleDefinitions: [oauthModule, multiStepModule],
        }).execute();
        expect(types.map((t) => t.type)).toEqual(['alpha', 'zeta']);
    });

    it('answers 404 for an unknown type', async () => {
        await expect(
            new GetEntityType({ moduleDefinitions: [oauthModule] }).execute('nope')
        ).rejects.toMatchObject({
            output: { statusCode: 404 },
            data: { code: 'ENTITY_TYPE_NOT_FOUND' },
        });
    });
});
