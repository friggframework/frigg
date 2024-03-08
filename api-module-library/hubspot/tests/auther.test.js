const { connectToDatabase, disconnectFromDatabase, createObjectId, Auther} = require('@friggframework/core');
const { Authenticator, testAutherDefinition } = require('@friggframework/devtools');
const { Definition} = require('../definition');

const authorizeResponse = {
    "base": "/redirect/hubspot",
    "data": {
        "code": "test-code",
        "state": "null"
    }
}

const tokenResponse = {
    "token_type": "bearer",
    "refresh_token": "test-refresh-token",
    "access_token": "test-access-token",
    "expires_in": 1800
}

const mocks = {
    getUserDetails: {
        "portalId": 111111111,
        "timeZone": "US/Eastern",
        "accountType": "DEVELOPER_TEST",
        "currency": "USD",
        "utcOffset": "-05:00",
        "utcOffsetMilliseconds": -18000000,
        "token": "test-token",
        "user": "projectteam@lefthook.co",
        "hub_domain": "Testing Object Things-dev-44613847.com",
        "scopes": [
            "content",
            "oauth",
            "crm.objects.contacts.read",
            "crm.objects.contacts.write",
            "crm.objects.companies.write",
            "crm.objects.companies.read",
            "crm.objects.deals.read",
            "crm.schemas.deals.read"
        ],
        "hub_id": 111111111,
        "app_id": 22222222,
        "expires_in": 1704,
        "user_id": 33333333,
        "token_type": "access"
    },
    tokenResponse: {
        "token_type": "bearer",
        "refresh_token": "test-refresh-token",
        "access_token": "test-access-token",
        "expires_in": 1800
    },
    authorizeResponse: {
        "base": "/redirect/hubspot",
        "data": {
            "code": "test-code",
            "state": "null"
        }
    }
}

testAutherDefinition(Definition, mocks)

describe.skip('HubSpot Module Live Tests', () => {
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
