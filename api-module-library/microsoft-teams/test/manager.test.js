const Manager = require('../manager');
const mongoose = require('mongoose');
const config = require('../defaultConfig.json');
const Authenticator = require('@friggframework/test-environment/Authenticator');

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
            authUrl = requirements.url;
        });
    });

    describe('processAuthorizationCallback() test', () => {
        it('should return an entity_id, credential_id, and type for successful auth', async () => {

            const response = await Authenticator.oauth2(authUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;

            const res = await manager.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(res).toBeDefined();
            expect(res.entity_id).toBeDefined();
            expect(res.credential_id).toBeDefined();
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
    });
    describe('receiveNotification() tests', () => {});
    describe('testAuth() tests', () => {
        it('Response with true if authenticated', async () => {
            const response = await manager.testAuth();
            expect(response).toEqual(true);
        });
        it('Responds with false if not authenticated', async () => {
            manager.api.graphApi.access_token = 'borked';
            manager.api.graphApi.refresh_token = 'barked';
            const response = await manager.testAuth();
            expect(response).toEqual(false);
        });
    });

    describe('Test switch to application authentication', () => {
        it('Response with true if authenticated', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            const response = await newManager.processAuthorizationCallback();
            expect(response).toBeDefined();
            expect(response.entity_id).toBeDefined();
            expect(response.credential_id).toBeDefined();
        });
    });
});
