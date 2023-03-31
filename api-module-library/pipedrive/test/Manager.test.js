const chai = require('chai');
const { expect } = chai;
const PipedriveManager = require('../manager');
const Authenticator = require('@friggframework/test-environment/Authenticator');
const TestUtils = require('../../../../test/utils/TestUtils');

// eslint-disable-next-line no-only-tests/no-only-tests
describe('Pipedrive Manager', async () => {
    let manager;
    before(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();

        manager = await PipedriveManager.getInstance({
            userId: this.userManager.getUserId(),
        });
        const res = await manager.getAuthorizationRequirements();

        chai.assert.hasAnyKeys(res, ['url', 'type']);
        const { url } = res;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const ids = await manager.processAuthorizationCallback({
            userId: this.userManager.getUserId(),
            data: response.data,
        });
        chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
    });

    describe('getInstance tests', async () => {
        it('should return a manager instance without credential or entity data', async () => {
            const userId = this.userManager.getUserId();
            const freshManager = await PipedriveManager.getInstance({
                userId,
            });
            expect(freshManager).to.haveOwnProperty('api');
            expect(freshManager).to.haveOwnProperty('userId');
            expect(freshManager.userId).to.equal(userId);
            expect(freshManager.entity).to.be.undefined;
            expect(freshManager.credential).to.be.undefined;
        });

        it('should return a manager instance with a credential ID', async () => {
            const userId = this.userManager.getUserId();
            const freshManager = await PipedriveManager.getInstance({
                userId,
                credentialId: manager.credential.id,
            });
            expect(freshManager).to.haveOwnProperty('api');
            expect(freshManager).to.haveOwnProperty('userId');
            expect(freshManager.userId).to.equal(userId);
            expect(freshManager.entity).to.be.undefined;
            expect(freshManager.credential).to.exist;
        });

        it('should return a fresh manager instance with an entity ID', async () => {
            const userId = this.userManager.getUserId();
            const freshManager = await PipedriveManager.getInstance({
                userId,
                entityId: manager.entity.id,
            });
            expect(freshManager).to.haveOwnProperty('api');
            expect(freshManager).to.haveOwnProperty('userId');
            expect(freshManager.userId).to.equal(userId);
            expect(freshManager.entity).to.exist;
            expect(freshManager.credential).to.exist;
        });
    });

    describe('getAuthorizationRequirements tests', async () => {
        it('should return authorization requirements of username and password', async () => {
            // Check authorization requirements
            const res = await manager.getAuthorizationRequirements();
            expect(res.type).to.equal('oauth2');
            chai.assert.hasAllKeys(res, ['url', 'type']);
        });
    });

    describe('processAuthorizationCallback tests', async () => {
        it('asserts that the original manager has a working credential', async () => {
            const res = await manager.testAuth();
            expect(res).to.be.true;
        });
    });

    describe('getEntityOptions tests', async () => {
        // NA
    });

    describe('findOrCreateEntity tests', async () => {
        it('should create a new entity for the selected profile and attach to manager', async () => {
            const userDetails = await manager.api.getUser();
            const entityRes = await manager.findOrCreateEntity({
                companyId: userDetails.data.company_id,
                companyName: userDetails.data.company_name,
            });

            expect(entityRes.entity_id).to.exist;
        });
    });
    describe('testAuth tests', async () => {
        it('Should refresh token and update the credential with new token', async () => {
            const badAccessToken = 'smith';
            manager.api.access_token = badAccessToken;
            await manager.testAuth();

            const posttoken = manager.api.access_token;
            expect('smith').to.not.equal(posttoken);
            const credential = await manager.credentialMO.get(
                manager.entity.credential
            );
            expect(credential.accessToken).to.equal(posttoken);
        });
    });

    describe('receiveNotification tests', async () => {
        it('should fail to refresh token and mark auth as invalid', async () => {
            // Need to use a valid but old refresh token,
            // so we need to refresh first
            const oldRefresh = manager.api.refresh_token;
            const badAccessToken =
                'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWFuLm1hdHRoZXdzQGxlZnRob29rLmNvbSIsImlhdCI6MTYzNTUzMDk3OCwiZXhwIjoxNjM1NTM4MTc4LCJiZW50byI6ImFwcDFlIiwiYWN0Ijp7InN1YiI6IlZob0NzMFNRZ25Fa2RDanRkaFZLemV5bXBjNW9valZoRXB2am03Rjh1UVEiLCJuYW1lIjoiTGVmdCBIb29rIiwiaXNzIjoiZmxhZ3NoaXAiLCJ0eXBlIjoiYXBwIn0sIm9yZ191c2VyX2lkIjoxLCJhdWQiOiJMZWZ0IEhvb2siLCJzY29wZXMiOiJBSkFBOEFIUUFCQUJRQT09Iiwib3JnX2d1aWQiOiJmNzY3MDEzZC1mNTBiLTRlY2QtYjM1My0zNWU0MWQ5Y2RjNGIiLCJvcmdfc2hvcnRuYW1lIjoibGVmdGhvb2tzYW5kYm94In0.XFmIai0GpAePsYeA4MjRntZS3iW6effmKmIhT7SBzTQ';
            manager.api.access_token = badAccessToken;
            await manager.testAuth();
            expect(manager.api.access_token).to.not.equal(badAccessToken);
            manager.api.access_token = badAccessToken;
            manager.api.refresh_token = undefined;

            const authTest = await manager.testAuth();
            const credential = await manager.credentialMO.get(
                manager.entity.credential
            );
            credential.auth_is_valid.should.equal(false);
        });
    });
});
