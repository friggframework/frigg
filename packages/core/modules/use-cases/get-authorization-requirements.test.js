const {
    GetAuthorizationRequirements,
    normalizeRequirements,
} = require('./get-authorization-requirements');

const oauthDefinition = { moduleName: 'oauthy', API: { requesterType: 'oauth2' } };
const formStep = (step) => ({
    type: step === 1 ? 'email' : 'otp',
    data: { jsonSchema: { type: 'object', properties: {} } },
});
const multiStepDefinition = {
    moduleName: 'stepper',
    getAuthStepCount: () => 2,
    getAuthRequirementsForStep: jest.fn(async (step) => formStep(step)),
};

function build() {
    const createModule = jest.fn(() => ({
        api: {
            getAuthorizationRequirements: () => ({
                type: 'oauth2',
                url: 'https://provider.example/authorize?state=s1',
            }),
        },
    }));
    return {
        useCase: new GetAuthorizationRequirements({
            moduleDefinitions: [oauthDefinition, multiStepDefinition],
            createModule,
        }),
        createModule,
    };
}

describe('GetAuthorizationRequirements', () => {
    it('wraps single-step requirements in the v2 shape', async () => {
        const { useCase, createModule } = build();
        const result = await useCase.execute({
            entityType: 'oauthy',
            userId: 'u1',
            state: 's1',
        });
        expect(result).toEqual({
            type: 'oauth2',
            data: { url: 'https://provider.example/authorize?state=s1' },
            step: 1,
            totalSteps: 1,
            isMultiStep: false,
        });
        expect(createModule).toHaveBeenCalledWith({
            userId: 'u1',
            definition: oauthDefinition,
            state: 's1',
        });
    });

    it('asks a multi-step module for the requested step', async () => {
        const { useCase, createModule } = build();
        const result = await useCase.execute({ entityType: 'stepper', step: 2 });
        expect(result).toMatchObject({
            type: 'otp',
            step: 2,
            totalSteps: 2,
            isMultiStep: true,
        });
        expect(createModule).not.toHaveBeenCalled();
    });

    it.each([0, 3, 1.5, NaN])('rejects step %p with 400 INVALID_STEP', async (step) => {
        const { useCase } = build();
        await expect(
            useCase.execute({ entityType: 'stepper', step })
        ).rejects.toMatchObject({
            output: { statusCode: 400 },
            data: { code: 'INVALID_STEP' },
        });
    });

    it('answers 404 for an unknown entity type', async () => {
        const { useCase } = build();
        await expect(useCase.execute({ entityType: 'nope' })).rejects.toMatchObject({
            output: { statusCode: 404 },
        });
    });

    it('prefers requiredAuthMethods.getAuthorizationRequirements(api) (form-based API-key modules)', async () => {
        const formModule = {
            moduleName: 'formy',
            requiredAuthMethods: {
                getAuthorizationRequirements: jest.fn((api) => ({
                    type: 'api-key',
                    data: { jsonSchema: { type: 'object' }, apiSeen: Boolean(api) },
                })),
            },
        };
        const useCase = new GetAuthorizationRequirements({
            moduleDefinitions: [formModule],
            createModule: () => ({ api: {} }),
        });
        expect(await useCase.execute({ entityType: 'formy' })).toMatchObject({
            type: 'api-key',
            data: { jsonSchema: { type: 'object' }, apiSeen: true },
        });
    });

    it('answers 501 when a module declares no requirements at all', async () => {
        const useCase = new GetAuthorizationRequirements({
            moduleDefinitions: [{ moduleName: 'bare' }],
            createModule: () => ({ api: {} }),
        });
        await expect(useCase.execute({ entityType: 'bare' })).rejects.toMatchObject({
            output: { statusCode: 501 },
            data: { code: 'REQUIREMENTS_NOT_DECLARED' },
        });
    });

    it('normalises odd module output', () => {
        expect(normalizeRequirements(null)).toEqual({ type: 'custom', data: {} });
        expect(normalizeRequirements({ url: 'x' })).toEqual({
            type: 'custom',
            data: { url: 'x' },
        });
    });
});
