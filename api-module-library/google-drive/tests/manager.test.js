require('dotenv').config();
const Manager = require('../manager');
const mongoose = require('mongoose');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('Google Drive Manager Tests', () => {
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
            const requirements = manager.getAuthorizationRequirements();
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

        it('Test credential retrieval and manager instantiation', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            expect(newManager).toBeDefined();
            expect(newManager.entity).toBeDefined();
            expect(newManager.credential).toBeDefined();
        });
    });
});
