const { mongoose, Auther } = require('@friggframework/core');
const { Definition} = require('../definition');
const Authenticator = require("@friggframework/test-environment/Authenticator");
describe('HubSpot Manager Tests', () => {
    let manager, authUrl;
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        manager = await Auther.getInstance({
            definition: Definition,
            userId: new mongoose.Types.ObjectId(),
        });
    });

    afterAll(async () => {
        await Manager.Credential.deleteMany();
        await Manager.Entity.deleteMany();
        await mongoose.disconnect();
    });

    describe('getAuthorizationRequirements() test', () => {
        it('should return auth requirements', async () => {
            const requirements = manager.getAuthorizationRequirements();
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
            firstRes = await manager.processAuthorizationCallback({
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
            const res = await manager.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(res).toEqual(firstRes);
        });
    });
    describe('Test credential retrieval and manager instantiation', () => {
        it('retrieve by entity id', async () => {
            const newManager = await Auther.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
                definition: Definition,
            });
            expect(newManager).toBeDefined();
            expect(newManager.entity).toBeDefined();
            expect(newManager.credential).toBeDefined();
            expect(await newManager.testAuth()).toBeTruthy();

        });

        it('retrieve by credential id', async () => {
            const newManager = await Auther.getInstance({
                userId: manager.userId,
                credentialId: manager.credential.id,
                definition: Definition,
            });
            expect(newManager).toBeDefined();
            expect(newManager.credential).toBeDefined();
            expect(await newManager.testAuth()).toBeTruthy();

        });
    });
});
