/**
 * @group interactive
 */

const chai = require('chai');

const OutreachManager = require('../manager');
const Authenticator = require('@friggframework/test-environment/Authenticator');
const mongoose = require("mongoose");

describe.skip('Outreach Manager', () => {
    let manager, userId;
    beforeAll(async () => {
        userId = new mongoose.Types.ObjectId();

        manager = await OutreachManager.getInstance({
            userId,
        });
        const res = await manager.getAuthorizationRequirements();

        chai.assert.hasAnyKeys(res, ['url', 'type']);
        const { url } = res;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const ids = await manager.processAuthorizationCallback({
            userId: 0,
            data: response.data,
        });
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
    });

    describe('getInstance tests', () => {
        let testContext;

        beforeEach(() => {
            testContext = {};
        });

        it('should return a manager instance without credential or entity data', async () => {
            const userId = testContext.userManager.getUserId();
            const freshManager = await OutreachManager.getInstance({
                userId,
            });
            expect(freshManager).to.haveOwnProperty('api');
            expect(freshManager).to.haveOwnProperty('userId');
            expect(freshManager.userId).toBe(userId);
            expect(freshManager.entity).toBeUndefined();
            expect(freshManager.credential).toBeUndefined();
        });

        it('should return a manager instance with a credential ID', async () => {
            const userId = testContext.userManager.getUserId();
            const freshManager = await OutreachManager.getInstance({
                userId,
                credentialId: manager.credential.id,
            });
            expect(freshManager).to.haveOwnProperty('api');
            expect(freshManager).to.haveOwnProperty('userId');
            expect(freshManager.userId).toBe(userId);
            expect(freshManager.entity).toBeUndefined();
            expect(freshManager.credential).toBeDefined();
        });

        it('should return a fresh manager instance with an entity ID', async () => {
            const userId = testContext.userManager.getUserId();
            const freshManager = await OutreachManager.getInstance({
                userId,
                entityId: manager.entity.id,
            });
            expect(freshManager).to.haveOwnProperty('api');
            expect(freshManager).to.haveOwnProperty('userId');
            expect(freshManager.userId).toBe(userId);
            expect(freshManager.entity).toBeDefined();
            expect(freshManager.credential).toBeDefined();
        });
    });

    describe('getAuthorizationRequirements tests', () => {
        it('should return authorization requirements of username and password', async () => {
            // Check authorization requirements
            const res = await manager.getAuthorizationRequirements();
            expect(res.type).toBe('oauth2');
            chai.assert.hasAllKeys(res, ['url', 'type']);
        });
    });

    describe('processAuthorizationCallback tests', () => {
        it('asserts that the original manager has a working credential', async () => {
            const res = await manager.testAuth();
            expect(res).toBe(true);
        });
    });

    describe('getEntityOptions tests', () => {
        // NA
    });

    describe('findOrCreateEntity tests', () => {
        it('should create a new entity for the selected profile and attach to manager', async () => {
            const userDetails = await manager.api.getUser();
            const entityRes = await manager.findOrCreateEntity({
                org_uuid: userDetails.org_uuid,
                org_name: userDetails.org_name,
            });

            expect(entityRes.entity_id).toBeDefined();
        });
    });
    describe('testAuth tests', () => {
        it('Should refresh token and update the credential with new token', async () => {
            const badAccessToken =
                'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWFuLm1hdHRoZXdzQGxlZnRob29rLmNvbSIsImlhdCI6MTYzNTUzMDk3OCwiZXhwIjoxNjM1NTM4MTc4LCJiZW50byI6ImFwcDFlIiwiYWN0Ijp7InN1YiI6IlZob0NzMFNRZ25Fa2RDanRkaFZLemV5bXBjNW9valZoRXB2am03Rjh1UVEiLCJuYW1lIjoiTGVmdCBIb29rIiwiaXNzIjoiZmxhZ3NoaXAiLCJ0eXBlIjoiYXBwIn0sIm9yZ191c2VyX2lkIjoxLCJhdWQiOiJMZWZ0IEhvb2siLCJzY29wZXMiOiJBSkFBOEFIUUFCQUJRQT09Iiwib3JnX2d1aWQiOiJmNzY3MDEzZC1mNTBiLTRlY2QtYjM1My0zNWU0MWQ5Y2RjNGIiLCJvcmdfc2hvcnRuYW1lIjoibGVmdGhvb2tzYW5kYm94In0.XFmIai0GpAePsYeA4MjRntZS3iW6effmKmIhT7SBzTQ';
            manager.api.access_token = badAccessToken;
            const oldRefresh = manager.api.refresh_token;
            await manager.testAuth();

            const posttoken = manager.api.access_token;
            expect(badAccessToken).not.toBe(posttoken);
            const credential = await manager.credentialMO.get(
                manager.entity.credential
            );
            expect(credential.accessToken).toBe(posttoken);
            expect(credential.refreshToken).not.toBe(oldRefresh);
        });
    });

    describe('receiveNotification tests', () => {
        it('should fail to refresh token and mark auth as invalid', async () => {
            // Need to use a valid but old refresh token,
            // so we need to refresh first
            const oldRefresh = manager.api.refresh_token;
            const badAccessToken =
                'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWFuLm1hdHRoZXdzQGxlZnRob29rLmNvbSIsImlhdCI6MTYzNTUzMDk3OCwiZXhwIjoxNjM1NTM4MTc4LCJiZW50byI6ImFwcDFlIiwiYWN0Ijp7InN1YiI6IlZob0NzMFNRZ25Fa2RDanRkaFZLemV5bXBjNW9valZoRXB2am03Rjh1UVEiLCJuYW1lIjoiTGVmdCBIb29rIiwiaXNzIjoiZmxhZ3NoaXAiLCJ0eXBlIjoiYXBwIn0sIm9yZ191c2VyX2lkIjoxLCJhdWQiOiJMZWZ0IEhvb2siLCJzY29wZXMiOiJBSkFBOEFIUUFCQUJRQT09Iiwib3JnX2d1aWQiOiJmNzY3MDEzZC1mNTBiLTRlY2QtYjM1My0zNWU0MWQ5Y2RjNGIiLCJvcmdfc2hvcnRuYW1lIjoibGVmdGhvb2tzYW5kYm94In0.XFmIai0GpAePsYeA4MjRntZS3iW6effmKmIhT7SBzTQ';
            manager.api.access_token = badAccessToken;
            await manager.testAuth();
            expect(manager.api.access_token).not.toBe(badAccessToken);
            manager.api.access_token = badAccessToken;
            manager.api.refresh_token = undefined;

            const authTest = await manager.testAuth();
            const credential = await manager.credentialMO.get(
                manager.entity.credential
            );
            expect(credential.auth_is_valid).toBe(false);
        });
    });
});
