const { connectToDatabase, disconnectFromDatabase, createObjectId, Auther } = require('@friggframework/core');
const {
    Authenticator,
    testDefinitionRequiredAuthMethods,
    testAutherDefinition
} = require("@friggframework/devtools");
const { Definition} = require('../definition');


const mocks = {
    getUserDetails: {
    },
    authorizeResponse: {
    },
    getTokenFromCode: async function (code) {
        const tokenResponse ={
            "access_token": "foo",
            "token_type": "Bearer",
            "refresh_token": "bar",
            "expires_in": 3600
        }
        await this.setTokens(tokenResponse);
        return tokenResponse
    }
}
//testAutherDefinition(Definition, mocks)


describe(`${Definition.moduleName} Module Live Tests`, () => {
    let module, authUrl;
    beforeAll(async () => {
        await connectToDatabase();
        module = await Auther.getInstance({
            definition: Definition,
            userId: createObjectId(),
        });
    });

    afterAll(async () => {
        await module.Credential.deleteMany();
        await module.Entity.deleteMany();
        await disconnectFromDatabase();
    });

    describe('getAuthorizationRequirements() test', () => {
        it('should return auth requirements', async () => {
            const requirements = await module.getAuthorizationRequirements();
            expect(requirements).toBeDefined();
            expect(requirements.type).toEqual('oauth2');
            expect(requirements.url).toBeDefined();
            authUrl = requirements.url;
        });
    });

    describe('Authorization requests', () => {
        let firstRes;
        it('processAuthorizationCallback()', async () => {
            const response = await Authenticator.oauth2(authUrl);
            firstRes = await module.processAuthorizationCallback(response);
            expect(firstRes).toBeDefined();
            expect(firstRes.entity_id).toBeDefined();
            expect(firstRes.credential_id).toBeDefined();
        });
        it.skip('retrieves existing entity on subsequent calls', async () =>{
            const response = await Authenticator.oauth2(authUrl);
            const res = await module.processAuthorizationCallback(response);
            expect(res).toEqual(firstRes);
        });
    });
    describe('Test credential retrieval and module instantiation', () => {
        it('retrieve by entity id', async () => {
            const newModule = await Auther.getInstance({
                userId: module.userId,
                entityId: module.entity.id,
                definition: Definition,
            });
            expect(newModule).toBeDefined();
            expect(newModule.entity).toBeDefined();
            expect(newModule.credential).toBeDefined();
            expect(await newModule.testAuth()).toBeTruthy();

        });

        it.skip('retrieve by credential id', async () => {
            const newModule = await Auther.getInstance({
                userId: module.userId,
                credentialId: module.credential.id,
                definition: Definition,
            });
            expect(newModule).toBeDefined();
            expect(newModule.credential).toBeDefined();
            expect(await newModule.testAuth()).toBeTruthy();

        });
    });

    describe('Test app auth and bot auth', () => {
        it('processAuthorizationCallback()', async () => {
            const newModule = await Auther.getInstance({
                userId: module.userId,
                entityId: module.entity.id,
                definition: Definition,
            });
            await newModule.processAuthorizationCallback();
            const res = await newModule.testAuth();
            expect(res).toBeTruthy();
            expect(newModule.api.graphApi.access_token).toBeTruthy();
            expect(newModule.api.botFrameworkApi.access_token).toBeTruthy();
        })
    })

});
