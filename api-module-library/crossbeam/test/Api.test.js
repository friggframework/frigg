/**
 * @group interactive
 */

const TestUtils = require('../../../../test/utils/TestUtils');

const Authenticator = require('@friggframework/test-environment/Authenticator');
const CrossbeamApiClass = require('../api.js');
const open = require('open');

describe.skip('Crossbeam API', () => {
    const xbeamApi = new CrossbeamApiClass({ backOff: [1, 3, 10] });
    beforeAll(async () => {
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

    describe('Get User Info', () => {
        it('should get user info', async () => {
            const response = await xbeamApi.getUserDetails();
            expect(response).toHaveProperty('user');
            expect(response).toHaveProperty('authorizations');
            expect(response).toHaveProperty('is_user_linkable');
            expect(response).toHaveProperty('pending_invitations');
            return response;
        });
    });

    describe('Partners', () => {
        it('should get partners', async () => {
            const response = await xbeamApi.getPartners();
            expect(response).toHaveProperty('partner_orgs');
            expect(response).toHaveProperty('proposals');
            expect(response).toHaveProperty('proposals_received');
            return response;
        });

        it('should get partner populations', async () => {
            const response = await xbeamApi.getPartnerPopulations();
            expect(response).toHaveProperty('items');
            if (response.items.length > 0) {
                expect(response.items[0]).toHaveProperty('id');
                expect(response.items[0]).toHaveProperty('name');
                expect(response.items[0]).toHaveProperty('organization_id');
                expect(response.items[0]).toHaveProperty('population_type');
                expect(response.items[0]).toHaveProperty('standard_type');
            }
            return response;
        });

        it('should get partner records', async () => {
            const response = await xbeamApi.getPartnerRecords();
            expect(response).toHaveProperty('items');
            if (response.items.length > 0) {
                expect(response.items[0]).toHaveProperty('partner_name');
                expect(response.items[0]).toHaveProperty('partner_logo_url');
                expect(response.items[0]).toHaveProperty('populations');
                expect(response.items[0]).toHaveProperty('partner_populations');
                expect(response.items[0]).toHaveProperty('crossbeam_id');
                expect(response.items[0]).toHaveProperty('partner_master');
                expect(response.items[0]).toHaveProperty('record_id');
                expect(response.items[0]).toHaveProperty(
                    'partner_organization_id'
                );
                expect(response.items[0]).toHaveProperty('source_id');
                expect(response.items[0]).toHaveProperty('overlap_time');
                expect(response.items[0]).toHaveProperty(
                    'partner_crossbeam_id'
                );
            }
            if (response.pagination) {
                expect(response.pagination).toHaveProperty('limit');
                expect(response.pagination).toHaveProperty('page');
                expect(response.pagination).toHaveProperty('next_href');
            }
            return response;
        });

        it('should get populations', async () => {
            const response = await xbeamApi.getPopulations();
            expect(response).toHaveProperty('items');
            if (response.items.length > 0) {
                expect(response.items[0]).toHaveProperty('base_schema');
                expect(response.items[0]).toHaveProperty('name');
                expect(response.items[0]).toHaveProperty('base_table');
                expect(response.items[0]).toHaveProperty('population_type');
                expect(response.items[0]).toHaveProperty('filter_expression');
                expect(response.items[0]).toHaveProperty('current_version');
                expect(response.items[0]).toHaveProperty('id');
                expect(response.items[0]).toHaveProperty('standard_type');
                expect(response.items[0]).toHaveProperty('filter_parts');
                expect(response.items[0]).toHaveProperty('source_id');
            }
            return response;
        });
    });

    describe('Reports', () => {
        let reports;
        let first_report;
        beforeAll(async () => {
            reports = await xbeamApi.getReports();
            first_report = reports.items[0];
        });

        it('should get reports', async () => {
            expect(reports).toHaveProperty('items');
            if (reports.items.length > 0) {
                expect(reports.items[0]).toHaveProperty('organization_id');
                expect(reports.items[0]).toHaveProperty('filters');
                expect(reports.items[0]).toHaveProperty('columns');
                expect(reports.items[0]).toHaveProperty('name');
                expect(reports.items[0]).toHaveProperty('notification_configs');
                expect(reports.items[0]).toHaveProperty('our_population_ids');
                expect(reports.items[0]).toHaveProperty('updated_at');
                expect(reports.items[0]).toHaveProperty('id');
                expect(reports.items[0]).toHaveProperty('created_by_user_id');
                expect(reports.items[0]).toHaveProperty(
                    'partner_population_ids'
                );
                expect(reports.items[0]).toHaveProperty('updated_by_user_id');
                expect(reports.items[0]).toHaveProperty('created_at');
            }
            return reports;
        });

        it('should get report data', async () => {
            const report_id = first_report.id;
            const response = await xbeamApi.getReportData(report_id);
            expect(response).toHaveProperty('items');
            if (response.items.length > 0) {
                expect(response.items[0]).toHaveProperty('master_id');
                expect(response.items[0]).toHaveProperty('partner_org_ids');
                expect(response.items[0]).toHaveProperty('record_name');
                expect(response.items[0]).toHaveProperty(
                    'partner_population_ids'
                );
                expect(response.items[0]).toHaveProperty('source_id');
                expect(response.items[0]).toHaveProperty('overlap_time');
                expect(response.items[0]).toHaveProperty('population_ids');
                expect(response.items[0]).toHaveProperty('data');
            }
            return response;
        });
    });

    describe('General Search', () => {
        it('should seach', async () => {
            const response = await xbeamApi.search('crossbeam');
            expect(response).toHaveProperty('populations');
            expect(response).toHaveProperty('partner_orgs');
            expect(response).toHaveProperty('people');
            expect(response).toHaveProperty('companies');
            return response;
        });
    });

    describe('Threads', () => {
        let first_thread;
        let results;
        beforeAll(async () => {
            results = await xbeamApi.getThreads();

            if (results.items.length > 0) {
                first_thread = results.items[0];
            }
        });

        it('should get threads', async () => {
            expect(results).toHaveProperty('items');
            if (results.items.length > 0) {
                expect(results.items[0]).toHaveProperty('owner_id');
                expect(results.items[0]).toHaveProperty('author_id');
                expect(results.items[0]).toHaveProperty('organization_id');
                expect(results.items[0]).toHaveProperty('total_messages');
                expect(results.items[0]).toHaveProperty('company_domain');
                expect(results.items[0]).toHaveProperty('company_name');
                expect(results.items[0]).toHaveProperty('title');
                expect(results.items[0]).toHaveProperty('updated_at');
                expect(results.items[0]).toHaveProperty('person_email');
                expect(results.items[0]).toHaveProperty('id');
                expect(results.items[0]).toHaveProperty('directionality');
                expect(results.items[0]).toHaveProperty('last_viewed_at');
                expect(results.items[0]).toHaveProperty('is_open');
                expect(results.items[0]).toHaveProperty('last_comment_at');
                expect(results.items[0]).toHaveProperty('record_id');
                expect(results.items[0]).toHaveProperty(
                    'partner_organization_id'
                );
                expect(results.items[0]).toHaveProperty('source_id');
                expect(results.items[0]).toHaveProperty('is_unread');
                expect(results.items[0]).toHaveProperty('partner_owner_id');
                expect(results.items[0]).toHaveProperty('created_at');
            }
            return results;
        });

        it('should get get thread timelines', async () => {
            const thread_id = first_thread.id;
            const response = await xbeamApi.getThreadTimelines(thread_id);
            expect(response).toHaveProperty('items');
            if (response.items.length > 0) {
                expect(response.items[0]).toHaveProperty('id');
                expect(response.items[0]).toHaveProperty('event_type');
                expect(response.items[0]).toHaveProperty('event_data');
                expect(response.items[0]).toHaveProperty('is_private');
                expect(response.items[0]).toHaveProperty(
                    'acting_organization_id'
                );
                expect(response.items[0]).toHaveProperty('created_at');
                expect(response.items[0]).toHaveProperty('message');
            }
            return response;
        });
    });

    describe('Bad Auth', () => {
        it('should refresh bad auth token', async () => {
            xbeamApi.access_token = 'nolongervalid';
            const response = await xbeamApi.getUserDetails();
            expect(response).toHaveProperty('user');
            expect(response).toHaveProperty('authorizations');
            expect(response).toHaveProperty('is_user_linkable');
            expect(response).toHaveProperty('pending_invitations');
        });

        it('should throw error with invalid refresh token', async () => {
            try {
                xbeamApi.access_token = 'nolongervalid';
                xbeamApi.refresh_token = 'nolongervalid';
                await xbeamApi.getUserDetails();
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toContain('Api -- 401 Auth Error:');
            }
        });
    });
});
