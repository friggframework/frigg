const { connectToDatabase, disconnectFromDatabase, createObjectId, Auther } = require('@friggframework/core');
const {
    Authenticator,
    testAutherDefinition
} = require('@friggframework/devtools');
const { Definition} = require('../definition');

const mocks = {
    authorizeResponse:{
        "base": "/redirect/google-calendar",
        "data": {
            "state": "null",
            "code": "<redacted>",
            "scope": "email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
            "authuser": "0",
            "hd": "lefthook.com",
            "prompt": "consent"
        }
    },
    getTokenIdentity: {
        "identifier": "redacted",
        "name": "redacted"
    },
    getUserDetails: {
        "identifier": "redacted",
        "name": "redacted"
    },
    getTokenFromCode: async function (code) {
        const tokenResponse = {
            "access_token": "redacted",
            "expires_in": 3599,
            "refresh_token": "redacted",
            "scope": "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.readonly openid https://www.googleapis.com/auth/userinfo.profile",
            "token_type": "Bearer",
            "id_token": "redacted"
        }
        await this.setTokens(tokenResponse);
        return tokenResponse
    }
}

testAutherDefinition(Definition, mocks)

describe.skip(`${Definition.name} Module Live Tests`, () => {
    let module, authUrl;
    beforeAll(async () => {
        await connectToDatabase();
        module = await Auther.getInstance({
            definition: Definition,
            userId: createObjectId(),
        });
    });

    afterAll(async () => {
        await module.CredentialModel.deleteMany();
        await module.EntityModel.deleteMany();
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
    });

    describe('Authorization requests', () => {
        let firstRes;
        it('processAuthorizationCallback()', async () => {
            const response = await Authenticator.oauth2(authUrl);
            firstRes = await module.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(firstRes).toBeDefined();
            expect(firstRes.entity_id).toBeDefined();
            expect(firstRes.credential_id).toBeDefined();
        });
        it.skip('retrieves existing entity on subsequent calls', async () =>{
            const response = await Authenticator.oauth2(authUrl);
            const res = await module.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
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

        it('retrieve by credential id', async () => {
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
});
