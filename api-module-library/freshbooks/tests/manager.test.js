const { Authenticator, connectToDatabase, disconnectFromDatabase, createObjectId } = require('@friggframework/core');
require('dotenv').config();
const Manager = require('../manager'); // Manager = require('../manager');
const config = require('../defaultConfig.json');

describe(`Should fully test the ${config.label} Manager`, () => {
    let manager, userManager;

    beforeAll(async () => {
        await connectToDatabase();
        manager = await Manager.getInstance({
            userId: createObjectId(),
        });
    });

    afterAll(async () => {
        await Manager.Credential.deleteMany();
        await Manager.Entity.deleteMany();
        await disconnectFromDatabase();
    });

    it('getAuthorizationRequirements() should return auth requirements', async () => {
        const requirements = await manager.getAuthorizationRequirements({redirect_uri : manager.api.redirect_uri});
        expect(requirements).exists;
        expect(requirements.type).toBe('oauth2');
        authUrl = encodeURI(requirements.url);
    });
    describe('processAuthorizationCallback()', () => {
        it('should return auth details', async () => {
            const response = await Authenticator.oauth2(authUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;

            const authRes = await manager.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(authRes).toBeDefined();
            expect(authRes).toHaveProperty('entity_id');
            expect(authRes).toHaveProperty('credential_id');
            expect(authRes).toHaveProperty('type');
        });
        it('should refresh token', async () => {
            manager.api.access_token = 'nope';
            await manager.testAuth();
            expect(manager.api.access_token).not.toEqual('nope');
            expect(manager.api.access_token).toBeDefined();
        });
        it('should refresh token after a fresh database retrieval', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            newManager.api.access_token = 'nope';
            await newManager.testAuth();
            expect(manager.api.access_token).not.toEqual('nope');
            expect(manager.api.access_token).toBeDefined();
        });
        it('should error if incorrect auth data', async () => {
            try {
                await manager.processAuthorizationCallback({
                    data: {
                        code: 'bad',
                    },
                });
            } catch (e) {
                expect(e.message).toContain('400 BAD REQUEST');
            }
        });
    });
});
