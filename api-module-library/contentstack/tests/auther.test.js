const { connectToDatabase, disconnectFromDatabase, createObjectId, Auther } = require('@friggframework/core');
const { Definition} = require('../definition');
const { Authenticator,
    testDefinitionRequiredAuthMethods,
    testAutherDefinition
} = require('@friggframework/devtools');


const mocks = {
    listRoles: {
        "roles": [
            {
                "stack": {
                    "name": "dev stack",
                }
            }
        ]
    },
    authorizeResponse: {
        "base": "/redirect/contentstack",
        "data": {
            "code": "<redacted>",
            "location": "NA",
            "region": "NA",
            "installation_uid": "657bcb287942c5fca4b8a76f"
        }
    },
    getTokenFromCode: async function (code) {
        const tokenResponse = {
            "access_token": "<redacted>",
            "refresh_token": "<redacted>",
            "token_type": "Bearer",
            "expires_in": 3600,
            "location": "NA",
            "region": "NA",
            "organization_uid": "blte54e9d67322069d9",
            "authorization_type": "app",
            "user_uid": "",
            "stack_api_key": "blta1c1401d90c07e67"
        }
        await this.setTokens(tokenResponse);
        return tokenResponse
    }
}
testAutherDefinition(Definition, mocks)


describe.skip('Contentful Module Live Tests', () => {
    let module, authUrl;
    beforeAll(async () => {
        await connectToDatabase();
        module = await Auther.getInstance({
            definition: Definition,
            userId: createObjectId(),
        });
    });

    afterAll(async () => {
        await Auther.CredentialModel.deleteMany();
        await Auther.EntityModel.deleteMany();
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
                    location: response.data.location
                },
            });
            const rolesResponse = await module.api.listRoles();
            expect(firstRes).toBeDefined();
            expect(firstRes.entity_id).toBeDefined();
            expect(firstRes.credential_id).toBeDefined();
        });
        it.skip('retrieves existing entity on subsequent calls', async () =>{
            const response = await Authenticator.oauth2(authUrl);
            const res = await module.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                    location: response.data.location
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
