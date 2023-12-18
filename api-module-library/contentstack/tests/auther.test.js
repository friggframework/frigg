const { Definition} = require('../definition');
const { Auther } = require('@friggframework/module-plugin');
const { mongoose } = require('@friggframework/database/mongoose');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('Contentful Manager Tests', () => {
    let module, authUrl;
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        module = await Auther.getInstance({
            definition: Definition,
            userId: new mongoose.Types.ObjectId(),
        });
    });

    afterAll(async () => {
        await Auther.CredentialModel.deleteMany();
        await Auther.EntityModel.deleteMany();
        await mongoose.disconnect();
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
    describe('Test credential retrieval and manager instantiation', () => {
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
