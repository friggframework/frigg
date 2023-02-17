const Manager = require('../manager');
const mongoose = require('mongoose');
const config = require('../defaultConfig.json');
const { expect } = require('chai');
const Authenticator = require('@friggframework/test-environment/Authenticator');
require('dotenv').config();
const nock = require('nock');

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
            manager.api.access_token = 'nope';
            await manager.testAuth();
            expect(manager.api.access_token).to.not.equal('nope');
            expect(manager.api.access_token).to.exist;
        });
        it('should refresh token after a fresh database retrieval', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            newManager.api.access_token = 'nope';
            await newManager.testAuth();
            expect(newManager.api.access_token).to.not.equal('nope');
            expect(newManager.api.access_token).to.exist;
        });

        it('should refresh token after it expires', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            const oldToken = `${newManager.api.access_token}`;
            const testAuthNock = nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            })
                .post(newManager.api.URLs.authTest)
                .reply(200, {
                    ok: false,
                    error: 'token_expired',
                });
            await newManager.testAuth();
            expect(testAuthNock.isDone());
            expect(newManager.api.access_token).to.not.equal(oldToken);
            expect(newManager.api.access_token).to.exist;
        });
        it('auth refresh should fail if redirect URI changes', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            const testAuthNock = nock(manager.api.baseUrl, {
                allowUnmocked: true,
            })
                .post(manager.api.URLs.authTest)
                .reply(200, {
                    ok: false,
                    error: 'token_expired',
                });
            newManager.api.redirect_uri = 'https://bogus.com';

            try {
                const authRes = await newManager.testAuth();
                expect(testAuthNock.isDone());
                expect(authRes).to.equal(false);
            } catch (e) {}
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
                expect(e.message).to.contain('Auth Error');
            }
        });
    });
});
