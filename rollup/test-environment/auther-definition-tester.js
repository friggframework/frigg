const {Auther, ModuleConstants} = require('@friggframework/module-plugin');
const { createObjectId, connectToDatabase, disconnectFromDatabase } = require('@friggframework/database/mongo');
const { createMockApiObject } = require("./mock-integration");


function testAutherDefinition(definition, mocks) {
    const getModule = async (params) => {
        const module = await Auther.getInstance({
            definition,
            userId: createObjectId(),
            ...params,
        });
        module.api = createMockApiObject(jest, module.api, mocks);
        return module
    }


    describe(`${definition.moduleName} Module Tests`, () => {
        let module, authUrl;
        beforeAll(async () => {
            await connectToDatabase();
            module = await getModule();
        });

        afterAll(async () => {
            await disconnectFromDatabase();
        });

        let requirements, authorizeParams;
        if (definition.API.requesterType === ModuleConstants.authType.oauth2) {
            authorizeParams = mocks.authorizeResponse;
            describe('getAuthorizationRequirements() test', () => {
                it('should return auth requirements', async () => {
                    requirements = module.getAuthorizationRequirements();
                    expect(requirements).toBeDefined();
                    expect(requirements.type).toEqual(ModuleConstants.authType.oauth2);
                    expect(requirements.url).toBeDefined();
                    authUrl = requirements.url;
                });
            });
        } else if (definition.API.requesterType === ModuleConstants.authType.basic) {
            // could also confirm authorizeParams against the auth requirements
            authorizeParams = mocks.authorizeParams
            describe('getAuthorizationRequirements() test', () => {
                it('should return auth requirements', async () => {
                    requirements = module.getAuthorizationRequirements();
                    expect(requirements).toBeDefined();
                    expect(requirements.type).toEqual(ModuleConstants.authType.basic);
                });
            });
        } else if (definition.API.requesterType === ModuleConstants.authType.apiKey) {
            // could also confirm authorizeParams against the auth requirements
            authorizeParams = mocks.authorizeParams
            describe('getAuthorizationRequirements() test', () => {
                it('should return auth requirements', async () => {
                    requirements = module.getAuthorizationRequirements();
                    expect(requirements).toBeDefined();
                    expect(requirements.type).toEqual(ModuleConstants.authType.apiKey);
                });
            });
        }

        describe('Authorization requests', () => {
            let firstRes;
            it('processAuthorizationCallback()', async () => {
                firstRes = await module.processAuthorizationCallback(authorizeParams);
                expect(firstRes).toBeDefined();
                expect(firstRes.entity_id).toBeDefined();
                expect(firstRes.credential_id).toBeDefined();
            });
            it('retrieves existing entity on subsequent calls', async () => {
                const res = await module.processAuthorizationCallback(authorizeParams);
                expect(res).toEqual(firstRes);
            });
        });

        describe('Test credential retrieval and module instantiation', () => {
            it('retrieve by entity id', async () => {
                const newModule = await getModule({
                    userId: module.userId,
                    entityId: module.entity.id
                });
                expect(newModule).toBeDefined();
                expect(newModule.entity).toBeDefined();
                expect(newModule.credential).toBeDefined();
                expect(await newModule.testAuth()).toBeTruthy();

            });

            it('retrieve by credential id', async () => {
                const newModule = await getModule({
                    userId: module.userId,
                    credentialId: module.credential.id
                });
                expect(newModule).toBeDefined();
                expect(newModule.credential).toBeDefined();
                expect(await newModule.testAuth()).toBeTruthy();
            });
        });
    });
}

module.exports = { testAutherDefinition }

