const chai = require('chai');
const { expect } = chai;
const should = chai.should();
const { Api } = require('../api');

const { mockApi } = require('@friggframework/test-environment/mock-api');

const MockedApi = mockApi(Api, {
    authenticationMode: 'browser',
    filteringScope: (url) => {
        return /^https:[/][/].+[.]pipedrive[.]com/.test(url);
    },
});

describe.skip('Pipedrive API class', () => {
    let api;
    beforeAll(async function () {
        await MockedApi.initialize();
        api = await MockedApi.mock();
    });

    afterAll(async function () {
        await MockedApi.clean();
    });

    describe('User', () => {
        it('should list user profile', async () => {
            const response = await api.getUser();
            chai.assert.hasAllKeys(response.data, [
                'id',
                'name',
                'company_country',
                'company_domain',
                'company_id',
                'company_name',
                'default_currency',
                'locale',
                'lang',
                'last_login',
                'language',
                'email',
                'phone',
                'created',
                'modified',
                'signup_flow_variation',
                'has_created_company',
                'is_admin',
                'active_flag',
                'timezone_name',
                'timezone_offset',
                'role_id',
                'icon_url',
                'is_you',
            ]);
        });
    });

    describe('Deals', () => {
        it('should list deals', async () => {
            const response = await api.listDeals();
            response.data.length.should.above(0);
            response.data[0].should.have.property('id');
            return response;
        });
    });

    describe('Activities', () => {
        const mockActivity = {};
        it('should list all Activity Fields', async () => {
            const response = await api.listActivityFields();
            const isRequired = response.data.filter(
                (field) => field.mandatory_flag
            );

            for (const field of isRequired) {
                mockActivity[field.key] = 'blah';
            }
        });
        it('should create an email activity', async () => {
            const activity = {
                subject: 'Example Activtiy from the local grave',
                type: 'email',
                due_date: new Date('2021-12-03T15:06:38.700Z'),
                user_id: '1811658',
            };
            const response = await api.createActivity(activity);
            response.success.should.equal(true);
        });
        it('should get activities', async () => {
            const response = await api.listActivities({
                query: {
                    user_id: 0, // Gets activities for all users, instead of just the auth'ed user
                },
            });
            response.data[0].should.have.property('id');
            response.data.length.should.above(0);
            return response;
        });
    });

    describe('Users', () => {
        it('should get users', async () => {
            const response = await api.listUsers();
            response.data.should.be.an('array').of.length.greaterThan(0);
            response.data[0].should.have.keys(
                'active_flag',
                'created',
                'default_currency',
                'email',
                'has_created_company',
                'icon_url',
                'id',
                'is_admin',
                'is_you',
                'lang',
                'last_login',
                'locale',
                'modified',
                'name',
                'phone',
                'role_id',
                'signup_flow_variation',
                'timezone_name',
                'timezone_offset'
            );
            return response;
        });
    });

    describe('Bad Auth', () => {
        it('should refresh bad auth token', async () => {
            // Needed to paste a valid JWT, otherwise it's testing the wrong error.
            // TODO expand on other error types.
            const badAccessToken =
                'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWFuLm1hdHRoZXdzQGxlZnRob29rLmNvbSIsImlhdCI6MTYzNTUzMDk3OCwiZXhwIjoxNjM1NTM4MTc4LCJiZW50byI6ImFwcDFlIiwiYWN0Ijp7InN1YiI6IlZob0NzMFNRZ25Fa2RDanRkaFZLemV5bXBjNW9valZoRXB2am03Rjh1UVEiLCJuYW1lIjoiTGVmdCBIb29rIiwiaXNzIjoiZmxhZ3NoaXAiLCJ0eXBlIjoiYXBwIn0sIm9yZ191c2VyX2lkIjoxLCJhdWQiOiJMZWZ0IEhvb2siLCJzY29wZXMiOiJBSkFBOEFIUUFCQUJRQT09Iiwib3JnX2d1aWQiOiJmNzY3MDEzZC1mNTBiLTRlY2QtYjM1My0zNWU0MWQ5Y2RjNGIiLCJvcmdfc2hvcnRuYW1lIjoibGVmdGhvb2tzYW5kYm94In0.XFmIai0GpAePsYeA4MjRntZS3iW6effmKmIhT7SBzTQ';
            api.access_token = badAccessToken;

            await api.listDeals();
            api.access_token.should.not.equal(badAccessToken);
        });

        it('should throw error with invalid refresh token', async () => {
            try {
                api.access_token =
                    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWFuLm1hdHRoZXdzQGxlZnRob29rLmNvbSIsImlhdCI6MTYzNTUzMDk3OCwiZXhwIjoxNjM1NTM4MTc4LCJiZW50byI6ImFwcDFlIiwiYWN0Ijp7InN1YiI6IlZob0NzMFNRZ25Fa2RDanRkaFZLemV5bXBjNW9valZoRXB2am03Rjh1UVEiLCJuYW1lIjoiTGVmdCBIb29rIiwiaXNzIjoiZmxhZ3NoaXAiLCJ0eXBlIjoiYXBwIn0sIm9yZ191c2VyX2lkIjoxLCJhdWQiOiJMZWZ0IEhvb2siLCJzY29wZXMiOiJBSkFBOEFIUUFCQUJRQT09Iiwib3JnX2d1aWQiOiJmNzY3MDEzZC1mNTBiLTRlY2QtYjM1My0zNWU0MWQ5Y2RjNGIiLCJvcmdfc2hvcnRuYW1lIjoibGVmdGhvb2tzYW5kYm94In0.XFmIai0GpAePsYeA4MjRntZS3iW6effmKmIhT7SBzTQ';
                api.refresh_token = 'nolongervalid';
                await api.listDeals();
                throw new Error('Expected error not thrown');
            } catch (e) {
                e.message.should.contain(
                    '-----------------------------------------------------\n' +
                        'An error ocurred while fetching an external resource.\n' +
                        '-----------------------------------------------------'
                );
            }
        });
    });
});
