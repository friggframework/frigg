require('dotenv').config();
const Manager = require('../manager');
const mongoose = require('mongoose');
const Authenticator = require('@friggframework/test-environment/Authenticator');

describe('Google Drive Manager Tests', () => {
    let manager, authUrl, initialAccessToken;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        manager = await Manager.getInstance({
            userId: new mongoose.Types.ObjectId(),
        });
        initialAccessToken = `${manager.api.access_token}`;
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

    describe('Authorization requests', () => {
        let firstRes;
        it('processAuthorizationCallback()', async () => {
            const response = await Authenticator.oauth2(authUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;

            firstRes = await manager.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(firstRes).toBeDefined();
            expect(firstRes.entity_id).toBeDefined();
            expect(firstRes.credential_id).toBeDefined();
        });
        it.skip('retrieves existing entity on subsequent calls', async () => {
            const response = await Authenticator.oauth2(authUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;

            const res = await manager.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(res).toEqual(firstRes);
        });
        it('get new token via refresh', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            newManager.api.access_token = 'foobar';
            const response = await newManager.testAuth();
            expect(response).toBeTruthy();
            expect(newManager.api.access_token).not.toEqual('foobar');
            expect(newManager.api.access_token).not.toEqual(initialAccessToken);
        });
    });
    describe('Test credential retrieval and manager instantiation', () => {
        it('retrieve by entity id', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            expect(newManager).toBeDefined();
            expect(newManager.entity).toBeDefined();
            expect(newManager.credential).toBeDefined();
        });

        it('retrieve by credential id', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                credentialId: manager.credential.id,
            });
            expect(newManager).toBeDefined();
            expect(newManager.credential).toBeDefined();
            expect(newManager.credential.id).toBe(manager.credential.id);
            expect(newManager.credential).toHaveProperty('access_token');
            expect(newManager.api.access_token).toBeDefined();
            expect(newManager.api.refresh_token).not.toBe(null);
            expect(newManager.api).toHaveProperty('refresh_token');
            expect(newManager.api.access_token).not.toEqual(initialAccessToken);
        });
    });
});
