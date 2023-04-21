const Manager = require('../manager');
const mongoose = require('mongoose');
const config = require('../defaultConfig.json');
const { expect } = require('chai');
const Authenticator = require('@friggframework/test-environment/Authenticator');
require('dotenv').config();
const nock = require('nock');

describe(`Should fully test the ${config.label} Manager`, () => {
    let manager, authUrl, userId;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        userId = new mongoose.Types.ObjectId();
        manager = await Manager.getInstance({
            userId,
        });
        const entity =  (await Manager.Entity.create({
            user: userId,
        }))._doc;
        manager.entity = entity;
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

            nock(manager.api.baseUrl, {
                allowUnmocked: true,
            })
                .post(manager.api.URLs.authTest)
                .reply(400, {
                    ok: false,
                    error: 'invalid_auth',
                });

            nock(manager.api.baseUrl, {
                allowUnmocked: true,
            }).post(manager.api.URLs.redirect_uri)
                .reply(200,{
                    ok: true,
                    access_token: 'newAccessToken'
                });

            nock(manager.api.baseUrl, {
                allowUnmocked: true,
            }).post(manager.api.URLs.access_token)
                .reply(200,{
                    ok: true,
                    access_token: 'newAccessToken'
                });

            nock(manager.api.baseUrl, {
                allowUnmocked: true,
            })
                .post(manager.api.URLs.authTest)
                .reply(200, {
                    "ok": true,
                    "url": "https://test.slack.com/",
                    "team": "Test Workspace",
                    "user": "grace",
                    "team_id": "T12345678",
                    "user_id": "W12345678"
                });

            const validated = await manager.testAuth();
            expect(manager.api.access_token).to.not.equal('nope');
            expect(manager.api.access_token).to.exist;
            expect(validated).to.be.true;
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
                .reply(400, {
                    ok: false,
                    error: 'token_expired',
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            }).post(newManager.api.URLs.redirect_uri)
                .reply(200,{
                    ok: true,
                    access_token: 'newAccessToken'
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            }).post(newManager.api.URLs.access_token)
                .reply(200,{
                    ok: true,
                    access_token: 'newAccessToken'
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            })
                .post(newManager.api.URLs.authTest)
                .reply(200, {
                    "ok": true,
                    "url": "https://test.slack.com/",
                    "team": "Test Workspace",
                    "user": "grace",
                    "team_id": "T12345678",
                    "user_id": "W12345678"
                });

            const validated = await newManager.testAuth();
            expect(testAuthNock.isDone());
            expect(newManager.api.access_token).to.not.equal(oldToken);
            expect(newManager.api.access_token).to.exist;
            expect(validated).to.be.true;
        });

        it('should refresh token after it expires a second time', async () => {
            const newManager = await Manager.getInstance({
                userId: manager.userId,
                entityId: manager.entity.id,
            });
            const oldToken = `${newManager.api.access_token}`;
            const testAuthNock = nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            })
                .post(newManager.api.URLs.authTest)
                .reply(400, {
                    ok: false,
                    error: 'token_expired',
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            }).post(newManager.api.URLs.redirect_uri)
                .reply(200,{
                    ok: true,
                    access_token: 'newAccessToken'
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            }).post(newManager.api.URLs.access_token)
                .reply(200,{
                    ok: true,
                    access_token: 'newAccessToken'
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            })
                .post(newManager.api.URLs.authTest)
                .reply(200, {
                    "ok": true,
                    "url": "https://test.slack.com/",
                    "team": "Test Workspace",
                    "user": "grace",
                    "team_id": "T12345678",
                    "user_id": "W12345678"
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            })
                .post(newManager.api.URLs.authTest)
                .reply(400, {
                    ok: false,
                    error: 'token_expired',
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            }).post(newManager.api.URLs.redirect_uri)
                .reply(200,{
                    ok: true,
                    access_token: 'newAccessToken'
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            }).post(newManager.api.URLs.access_token)
                .reply(200,{
                    ok: true,
                    access_token: 'newAccessToken'
                });

            nock(newManager.api.baseUrl, {
                allowUnmocked: true,
            })
                .post(newManager.api.URLs.authTest)
                .reply(200, {
                    "ok": true,
                    "url": "https://test.slack.com/",
                    "team": "Test Workspace",
                    "user": "grace",
                    "team_id": "T12345678",
                    "user_id": "W12345678"
                });

            let validated = await newManager.testAuth();
            expect(testAuthNock.isDone());
            expect(newManager.api.access_token).to.not.equal(oldToken);
            expect(newManager.api.access_token).to.exist;
            expect(validated).to.be.true;

            validated = await newManager.testAuth();
            // expect(testAuthNock.isDone());
            expect(newManager.api.access_token).to.not.equal(oldToken);
            expect(newManager.api.access_token).to.exist;
            expect(validated).to.be.true;
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
