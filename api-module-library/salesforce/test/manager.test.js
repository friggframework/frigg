require('dotenv').config();
const Manager = require('../manager');
const mongoose = require('mongoose');
const config = require('../defaultConfig.json');
const { expect } = require('chai');
const Authenticator = require('@friggframework/test-environment/Authenticator');

describe(`Should fully test the ${config.label} Manager`, () => {
    let manager, userManager;

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

    it('getAuthorizationRequirements() should return auth requirements', async () => {
        const requirements = await manager.getAuthorizationRequirements();
        expect(requirements).exists;
        expect(requirements.type).to.equal('oauth2');
        authUrl = requirements.url;
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
            expect(authRes).to.exist;
            expect(authRes).to.have.property('entity_id');
            expect(authRes).to.have.property('credential_id');
            expect(authRes).to.have.property('type');
        });
        it('should refresh token', async () => {
            manager.api.conn.accessToken = 'nope';
            await manager.testAuth();
            expect(manager.api.conn.accessToken).to.not.equal('nope');
            expect(manager.api.conn.accessToken).to.exist;
        });
        it('should refresh token after a fresh database retrieval', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            newManager.api.conn.accessToken = 'nope';
            await newManager.testAuth();
            expect(newManager.api.conn.accessToken).to.not.equal('nope');
            expect(newManager.api.conn.accessToken).to.exist;
        });
        it('should error if incorrect auth data', async () => {
            try {
                const authRes = await manager.processAuthorizationCallback({
                    data: {
                        code: 'bad',
                    },
                });
                expect(authRes).to.not.exist;
            } catch (e) {
                expect(e.message).to.contain('Error Authing with Code');
            }
        });
    });
});
