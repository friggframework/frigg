/**
 * @group interactive
 */

const chai = require('chai');

const { expect } = chai;
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);
const _ = require('lodash');

const Authenticator = require('@friggframework/test-environment/Authenticator');
const CrossbeamManager = require('../manager.js');
const mongoose = require("mongoose");

const testSecretAndId = {
    client_id: process.env.CROSSBEAM_TEST_CLIENT_ID,
    client_secret: process.env.CROSSBEAM_TEST_CLIENT_SECRET,
};

const testType = 'local-dev';

describe('Crossbeam Entity Manager', () => {
    let testContext, userId;

    beforeAll(() => {
        testContext = {};
    });

    let xbeamManager;
    beforeAll(async () => {
        userId = new mongoose.Types.ObjectId();
        xbeamManager = await CrossbeamManager.getInstance({
            userId,
        });
        const res = await xbeamManager.getAuthorizationRequirements();

        chai.assert.hasAnyKeys(res, ['url', 'type']);
        const { url } = res;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const ids = await xbeamManager.processAuthorizationCallback({
            userId: 0,
            data: response.data,
        });
        chai.assert.hasAnyKeys(ids, ['credential', 'entity', 'type']);

        const options = await xbeamManager.getEntityOptions();

        const entity = await xbeamManager.findOrCreateEntity({
            credential_id: ids.credential_id,
            [options[0].key]: options[0].options[0],
            // organization_id: ""
        });

        xbeamManager = await CrossbeamManager.getInstance({
            entityId: entity._id,
            userId,
        });
    });

    it('should go through Oauth flow', async () => {
        xbeamManager.should.have.property('userId');
        xbeamManager.should.have.property('entity');
    });

    it('should reinstantiate with an entity ID', async () => {
        let newManager = await CrossbeamManager.getInstance({
            userId,
            subType: testType,
            entityId: xbeamManager.entity._id,
        });
        newManager.api.access_token.should.equal(xbeamManager.api.access_token);
        // newManager.api.refresh_token.should.equal(xbeamManager.api.refresh_token);
        // newManager.api.organization_id.should.equal(xbeamManager.api.organization_id);
        newManager.entity._id
            .toString()
            .should.equal(xbeamManager.entity._id.toString());
        newManager.credential._id
            .toString()
            .should.equal(xbeamManager.credential._id.toString());
    });

    it('should reinstantiate with a credential ID', async () => {
        let newManager = await CrossbeamManager.getInstance({
            userId,
            subType: testType,
            credentialId: xbeamManager.credential._id,
        });
        newManager.api.access_token.should.equal(xbeamManager.api.access_token);
        // newManager.api.refresh_token.should.equal(xbeamManager.api.refresh_token);
        newManager.credential._id
            .toString()
            .should.equal(xbeamManager.credential._id.toString());
    });

    it('should get all partner populations', async () => {
        let res = await xbeamManager.listAllPartnerPopulations({
            page: 1,
            limit: 2,
        });
        res.length.should.be.greaterThan(4);
        // Uh... This doesn't actually seem like it paginates... just returns all 5.
        // Will need to check back in on that
    });

    it('should get all partner records', async () => {
        let res = await xbeamManager.listAllPartnerRecords({
            page: 1,
            limit: 100,
        });
        res.length.should.be.greaterThan(100);
    });

    it('should get all report data for a report ID', async () => {
        //get report id of first report
        const reports = await xbeamManager.api.getReports();
        const first_report_id = reports.items[0].id;

        let res = await xbeamManager.listAllReportData(first_report_id, {
            page: 1,
            limit: 10,
        });
        res.length.should.be.greaterThan(10);
    });

    it('should refresh and update invalid token', async () => {
        xbeamManager.api.access_token = 'nolongervalid';
        const response = await xbeamManager.api.getUserDetails();
        // response.should.have.key('items');
        response.should.have.keys(
            'authorizations',
            'is_user_linkable',
            'pending_invitations',
            'user'
        );
        // response.items.should.be.an('array');
        const credential = await xbeamManager.credentialMO.get(
            xbeamManager.entity.credential
        );
        credential.access_token.should.equal(xbeamManager.api.access_token);
    });

    it('should fail to refresh token and mark auth as invalid', async () => {
        try {
            xbeamManager.api.access_token = 'nolongervalid';
            xbeamManager.api.refresh_token = 'nolongervalideither';
            await xbeamManager.testAuth();
            throw new Error('Why is this not hitting an auth error?');
        } catch (e) {
            e.message.should.equal('Api -- Error: Error Refreshing Credential');
            // e.message.should.equal('Api -- Error: Authentication is no longer valid');
            const credential = await xbeamManager.credentialMO.get(
                xbeamManager.entity.credential
            );
            credential.auth_is_valid.should.equal(false);
        }
    });
});
