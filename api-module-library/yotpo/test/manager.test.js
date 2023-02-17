const Manager = require('../manager');
const mongoose = require('mongoose');
const config = require('../defaultConfig.json');
const Authenticator = require('@friggframework/test-environment/Authenticator');
const authFields = require('../authFields');

const yotpoCreds = {
    store_id: process.env.YOTPO_STORE_ID,
    secret: process.env.YOTPO_SECRET,
    loyalty_guid: process.env.YOTPO_LOYALTY_GUID,
    loyalty_api_key: process.env.YOTPO_LOYALTY_API_KEY,
};
describe(`Should fully test the ${config.label} Manager`, () => {
    let manager, authUrl;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        manager = await Manager.getInstance({
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
            const requirements = await manager.getAuthorizationRequirements();
            expect(requirements).toBeDefined();
            expect(requirements.type).toEqual('oauth2');
            expect(requirements.data).toEqual(authFields);
            authUrl = requirements.url;
        });
    });

    describe('processAuthorizationCallback() test', () => {
        it('should return an entity_id, credential_id, and type for successful auth', async () => {
            const response = await Authenticator.oauth2(authUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;
            response.data = {
                ...response.data,
                ...yotpoCreds,
            };

            const res = await manager.processAuthorizationCallback(response);
            expect(res).toBeDefined();
            expect(res.entity_id).toBeDefined();
            expect(res.credential_id).toBeDefined();
            expect(res.type).toEqual(response.entityType);
        });

        describe('findOrCreateEntity() tests', () => {
            // TODO maybe... retrieve Entity from DB to confirm it's the returned value?
        });
        describe('findOrCreateCredential() tests', () => {
            // TODO maybe... retrieve Credential from DB to confirm it's the returned value?
        });
    });
    describe('getInstance() tests', () => {
        it('can create an instance of Module Manger', async () => {
            expect(manager).toBeDefined();
        });
        it('Retrieves valid information and tests true', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            const authRes = await newManager.testAuth();
            expect(authRes).toEqual(true);
        });
    });
    describe('receiveNotification() tests', () => {
        it('Fresh maanager instance should testAuth correctly', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            const authRes = await newManager.testAuth();
            expect(authRes).toEqual(true);
        });
    });
    describe('testAuth() tests', () => {
        it('Response with true if authenticated', async () => {
            const response = await manager.testAuth();
            expect(response).toEqual(true);
        });
        it('Responds with false if not authenticated', async () => {
            manager.api.backOff = [1];
            manager.api.appDeveloperApi.access_token = 'borked';
            const response = await manager.testAuth();
            expect(response).toEqual(false);
        });
    });
});
