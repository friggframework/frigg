require('../utils/TestUtils');
const chai = require('chai');

const should = chai.should();

const Authenticator = require('../utils/Authenticator');
const CrossbeamApiClass = require('../../src/modules/Crossbeam/Api.js');

describe.skip('Crossbeam API 2', async () => {
    const xbeamApi = new CrossbeamApiClass({ backOff: [1, 3, 10] });
    before(async () => {
        const url = xbeamApi.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await xbeamApi.getTokenFromCode(response.data.code);

        const userDetails = await xbeamApi.getUserDetails();
        const setOrg = await xbeamApi.setOrganizationId(
            userDetails.authorizations[0].organization.uuid
        );

        // let user_id = this.userManager.getUserId();
        // xbeamManager = await CrossbeamManager.getInstance({ entityId: res.body._id, userId: user_id });
    });

    // after(async() => {
    //     await disconnectFromDatabase();
    // });

    describe('Get User Info', async () => {
        it('should get user info', async () => {
            const response = await xbeamApi.getUserDetails();
            response.should.have.property('user');
            response.should.have.property('authorizations');
            response.should.have.property('is_user_linkable');
            response.should.have.property('pending_invitations');
            return response;
        });
    });

    describe('Partners', async () => {
        it('should get partners', async () => {
            const response = await xbeamApi.getPartners();
            response.should.have.property('partner_orgs');
            response.should.have.property('proposals');
            response.should.have.property('proposals_received');
            return response;
        });

        it('should get partner populations', async () => {
            const response = await xbeamApi.getPartnerPopulations();
            response.should.have.property('items');
            if (response.items.length > 0) {
                response.items[0].should.have.property('id');
                response.items[0].should.have.property('name');
                response.items[0].should.have.property('organization_id');
                response.items[0].should.have.property('population_type');
                response.items[0].should.have.property('standard_type');
            }
            return response;
        });

        it('should get partner records', async () => {
            const response = await xbeamApi.getPartnerRecords();
            response.should.have.property('items');
            if (response.items.length > 0) {
                response.items[0].should.have.property('partner_name');
                response.items[0].should.have.property('partner_logo_url');
                response.items[0].should.have.property('populations');
                response.items[0].should.have.property('partner_populations');
                response.items[0].should.have.property('crossbeam_id');
                response.items[0].should.have.property('partner_master');
                response.items[0].should.have.property('record_id');
                response.items[0].should.have.property(
                    'partner_organization_id'
                );
                response.items[0].should.have.property('source_id');
                response.items[0].should.have.property('overlap_time');
                response.items[0].should.have.property('partner_crossbeam_id');
            }
            if (response.pagination) {
                response.pagination.should.have.property('limit');
                response.pagination.should.have.property('page');
                response.pagination.should.have.property('next_href');
            }
            return response;
        });

        it('should get populations', async () => {
            const response = await xbeamApi.getPopulations();
            response.should.have.property('items');
            if (response.items.length > 0) {
                response.items[0].should.have.property('base_schema');
                response.items[0].should.have.property('name');
                response.items[0].should.have.property('base_table');
                response.items[0].should.have.property('population_type');
                response.items[0].should.have.property('filter_expression');
                response.items[0].should.have.property('current_version');
                response.items[0].should.have.property('id');
                response.items[0].should.have.property('standard_type');
                response.items[0].should.have.property('filter_parts');
                response.items[0].should.have.property('source_id');
            }
            return response;
        });
    });

    describe('Reports', async () => {
        let reports;
        let first_report;
        before(async () => {
            reports = await xbeamApi.getReports();
            first_report = reports.items[0];
        });

        it('should get reports', async () => {
            reports.should.have.property('items');
            if (reports.items.length > 0) {
                reports.items[0].should.have.property('organization_id');
                reports.items[0].should.have.property('filters');
                reports.items[0].should.have.property('columns');
                reports.items[0].should.have.property('name');
                reports.items[0].should.have.property('notification_configs');
                reports.items[0].should.have.property('our_population_ids');
                reports.items[0].should.have.property('updated_at');
                reports.items[0].should.have.property('id');
                reports.items[0].should.have.property('created_by_user_id');
                reports.items[0].should.have.property('partner_population_ids');
                reports.items[0].should.have.property('updated_by_user_id');
                reports.items[0].should.have.property('created_at');
            }
            return reports;
        });

        it('should get report data', async () => {
            const report_id = first_report.id;
            const response = await xbeamApi.getReportData(report_id);
            response.should.have.property('items');
            if (response.items.length > 0) {
                response.items[0].should.have.property('master_id');
                response.items[0].should.have.property('partner_org_ids');
                response.items[0].should.have.property('record_name');
                response.items[0].should.have.property(
                    'partner_population_ids'
                );
                response.items[0].should.have.property('source_id');
                response.items[0].should.have.property('overlap_time');
                response.items[0].should.have.property('population_ids');
                response.items[0].should.have.property('data');
            }
            return response;
        });
    });

    describe('General Search', async () => {
        it('should seach', async () => {
            const response = await xbeamApi.search('crossbeam');
            response.should.have.property('populations');
            response.should.have.property('partner_orgs');
            response.should.have.property('people');
            response.should.have.property('companies');
            return response;
        });
    });

    describe('Threads', async () => {
        let first_thread;
        let results;
        before(async () => {
            results = await xbeamApi.getThreads();

            if (results.items.length > 0) {
                first_thread = results.items[0];
            }
        });

        it('should get threads', async () => {
            results.should.have.property('items');
            if (results.items.length > 0) {
                results.items[0].should.have.property('owner_id');
                results.items[0].should.have.property('author_id');
                results.items[0].should.have.property('organization_id');
                results.items[0].should.have.property('total_messages');
                results.items[0].should.have.property('company_domain');
                results.items[0].should.have.property('company_name');
                results.items[0].should.have.property('title');
                results.items[0].should.have.property('updated_at');
                results.items[0].should.have.property('person_email');
                results.items[0].should.have.property('id');
                results.items[0].should.have.property('directionality');
                results.items[0].should.have.property('last_viewed_at');
                results.items[0].should.have.property('is_open');
                results.items[0].should.have.property('last_comment_at');
                results.items[0].should.have.property('record_id');
                results.items[0].should.have.property(
                    'partner_organization_id'
                );
                results.items[0].should.have.property('source_id');
                results.items[0].should.have.property('is_unread');
                results.items[0].should.have.property('partner_owner_id');
                results.items[0].should.have.property('created_at');
            }
            return results;
        });

        it('should get get thread timelines', async () => {
            const thread_id = first_thread.id;
            const response = await xbeamApi.getThreadTimelines(thread_id);
            response.should.have.property('items');
            if (response.items.length > 0) {
                response.items[0].should.have.property('id');
                response.items[0].should.have.property('event_type');
                response.items[0].should.have.property('event_data');
                response.items[0].should.have.property('is_private');
                response.items[0].should.have.property(
                    'acting_organization_id'
                );
                response.items[0].should.have.property('created_at');
                response.items[0].should.have.property('message');
            }
            return response;
        });
    });

    describe('Bad Auth', async () => {
        it('should refresh bad auth token', async () => {
            xbeamApi.access_token = 'nolongervalid';
            const response = await xbeamApi.getUserDetails();
            response.should.have.property('user');
            response.should.have.property('authorizations');
            response.should.have.property('is_user_linkable');
            response.should.have.property('pending_invitations');
            return response;
        });

        it('should throw error with invalid refresh token', async () => {
            try {
                xbeamApi.access_token = 'nolongervalid';
                xbeamApi.refresh_token = 'nolongervalid';
                const response = await xbeamApi.getUserDetails();
                return response;
            } catch (e) {
                e.message.should.equal(
                    'CrossbeamAPI -- Error: Error Refreshing Credentials'
                );
            }
        });
    });
});
