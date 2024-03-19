const { connectToDatabase, disconnectFromDatabase, createObjectId, Auther } = require('@friggframework/core');
const { Definition} = require('../definition');
const {
    Authenticator,
    testDefinitionRequiredAuthMethods,
    testAutherDefinition
} = require("@friggframework/devtools");

const mocks = {
    getUserDetails: {
        "kind": "drive#user",
        "displayName": "John Doe",
        "photoLink": "https://lh3.googleusercontent.com/a/foo",
        "me": true,
        "permissionId": "12345",
        "emailAddress": "john.doe@friggframework.com"
    },
    authorizeResponse: {
        "base": "/redirect/google-drive",
        "data": {
            "state": "null",
            "code": "foo",
            "scope": "email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.metadata https://www.googleapis.com/auth/drive.activity",
            "authuser": "0",
            "hd": "friggframework.com",
            "prompt": "consent"
        }
    },
    tokenResponse: {
        "access_token": "foo",
        "token_type": "Bearer",
        "refresh_token": "bar",
        "expires_in": 360
    }
}
testAutherDefinition(Definition, mocks)


describe.skip(`${Definition.moduleName} Module Live Tests`, () => {
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
        it('retrieves existing entity on subsequent calls', async () =>{
            const response = await Authenticator.oauth2(authUrl);
            const res = await module.processAuthorizationCallback(response);
            expect(res).toEqual(firstRes);
        });
    });
    describe('Test credential retrieval and module instantiation', () => {
        it('retrieve by entity id', async () => {
            const newManager = await Auther.getInstance({
                userId: module.userId,
                entityId: module.entity.id,
                definition: Definition,
            });
            expect(newManager).toBeDefined();
            expect(newManager.entity).toBeDefined();
            expect(newManager.credential).toBeDefined();
            expect(await newManager.testAuth()).toBeTruthy();

        });

        it('retrieve by credential id', async () => {
            const newManager = await Auther.getInstance({
                userId: module.userId,
                credentialId: module.credential.id,
                definition: Definition,
            });
            expect(newManager).toBeDefined();
            expect(newManager.credential).toBeDefined();
            expect(await newManager.testAuth()).toBeTruthy();

        });
    });
});
