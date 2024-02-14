const {Auther} = require("@friggframework/module-plugin");
const { createObjectId, connectToDatabase, disconnectFromDatabase } = require("@friggframework/database/mongo");
const { createMockApiObject } = require("./mock-integration");


function testAutherDefinition(jest, definition, mocks) {
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


        describe('getAuthorizationRequirements() test', () => {
            it('should return auth requirements', async () => {
                const requirements = module.getAuthorizationRequirements();
                expect(requirements).toBeDefined();
                expect(requirements.type).toEqual('oauth2');
                expect(requirements.url).toBeDefined();
                authUrl = requirements.url;
            });
            describe('Authorization requests', () => {
                let firstRes;
                it('processAuthorizationCallback()', async () => {
                    const response = mocks.authorizeResponse;
                    firstRes = await module.processAuthorizationCallback({
                        data: {
                            code: response.data.code,
                        },
                    });
                    expect(firstRes).toBeDefined();
                    expect(firstRes.entity_id).toBeDefined();
                    expect(firstRes.credential_id).toBeDefined();
                });
                it('retrieves existing entity on subsequent calls', async () => {
                    const response = mocks.authorizeResponse;
                    const res = await module.processAuthorizationCallback({
                        data: {
                            code: response.data.code,
                        },
                    });
                    expect(res).toEqual(firstRes);
                });
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

