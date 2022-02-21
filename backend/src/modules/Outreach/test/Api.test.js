/* eslint-disable no-only-tests/no-only-tests */
const chai = require('chai');

const should = chai.should();
const Authenticator = require('../../../../test/utils/Authenticator');
const OutreachAPI = require('../Api');

describe('Outreach API class', async () => {
    const api = new OutreachAPI();
    before(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);
    });

    describe('User', async () => {
        it('should list user profile', async () => {
            const response = await api.getUser();
            response.should.have.property('org_name');
            response.should.have.property('org_guid');
            return response;
        });
    });

    describe('Accounts', async () => {
        it('should make list accounts request', async () => {
            const response = await api.listAccounts();
            response.data.length.should.above(0);
            response.data[0].should.have.property('id');
            return response;
        });
        it('should paginate accounts', async () => {
            const response = await api.listAllAccounts({
                query: {
                    'page[size]': 1,
                },
            });
            response.length.should.above(1);
        });
    });

    describe('Tasks', async () => {
        it('should create a task', async () => {
            const task = {
                data: {
                    type: 'task',
                    attributes: {
                        action: 'email',
                    },
                    relationships: {
                        subject: {
                            data: {
                                type: 'account',
                                id: 1,
                            },
                        },
                        owner: {
                            data: {
                                type: 'user',
                                id: 1,
                            },
                        },
                    },
                },
            };
            const response = await api.createTask(task);
            response.data.should.have.property('id');
            this.task_id = response.data.id;
            return response;
        });

        it('should get tasks', async () => {
            const response = await api.getTasks();
            response.data[0].should.have.property('id');
            response.data.length.should.above(0);
            return response;
        });

        it('should update a task', async () => {
            const task = {
                data: {
                    type: 'task',
                    id: this.task_id,
                    attributes: {
                        action: 'email',
                    },
                    relationships: {
                        subject: {
                            data: {
                                type: 'account',
                                id: 3,
                            },
                        },
                        owner: {
                            data: {
                                type: 'user',
                                id: 1,
                            },
                        },
                    },
                },
            };
            const response = await api.updateTask(this.task_id, task);
            response.data.should.have.property('id');
            response.data.id.should.equal(this.task_id);
            return response;
        });

        it('should delete a task by id', async () => {
            const response = await api.deleteTask(this.task_id);
            return response;
        });
    });

    describe('UserDetails', async () => {
        it('should get User Details', async () => {
            const response = await api.getUser();
            response.should.have.keys(
                'sub',
                'bento',
                'user_id',
                'org_guid',
                'org_name',
                'org_shortname',
                'email',
                'given_name',
                'family_name',
                'pendo_user_id',
                'urls'
            );
            return response;
        });
    });

    describe('Bad Auth', async () => {
        it('should refresh bad auth token', async () => {
            // Needed to paste a valid JWT, otherwise it's testing the wrong error.
            // TODO expand on other error types.
            const badAccessToken =
                'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWFuLm1hdHRoZXdzQGxlZnRob29rLmNvbSIsImlhdCI6MTYzNTUzMDk3OCwiZXhwIjoxNjM1NTM4MTc4LCJiZW50byI6ImFwcDFlIiwiYWN0Ijp7InN1YiI6IlZob0NzMFNRZ25Fa2RDanRkaFZLemV5bXBjNW9valZoRXB2am03Rjh1UVEiLCJuYW1lIjoiTGVmdCBIb29rIiwiaXNzIjoiZmxhZ3NoaXAiLCJ0eXBlIjoiYXBwIn0sIm9yZ191c2VyX2lkIjoxLCJhdWQiOiJMZWZ0IEhvb2siLCJzY29wZXMiOiJBSkFBOEFIUUFCQUJRQT09Iiwib3JnX2d1aWQiOiJmNzY3MDEzZC1mNTBiLTRlY2QtYjM1My0zNWU0MWQ5Y2RjNGIiLCJvcmdfc2hvcnRuYW1lIjoibGVmdGhvb2tzYW5kYm94In0.XFmIai0GpAePsYeA4MjRntZS3iW6effmKmIhT7SBzTQ';
            api.access_token = badAccessToken;

            const response = await api.listAccounts();
            api.access_token.should.not.equal(badAccessToken);
            return response;
        });

        it('should refreshAuth', async () => {
            const oldToken = api.access_token.valueOf();
            await api.refreshAuth();
            api.access_token.should.not.equal(oldToken);
        });

        it('should throw error with invalid refresh token', async () => {
            try {
                api.access_token =
                    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWFuLm1hdHRoZXdzQGxlZnRob29rLmNvbSIsImlhdCI6MTYzNTUzMDk3OCwiZXhwIjoxNjM1NTM4MTc4LCJiZW50byI6ImFwcDFlIiwiYWN0Ijp7InN1YiI6IlZob0NzMFNRZ25Fa2RDanRkaFZLemV5bXBjNW9valZoRXB2am03Rjh1UVEiLCJuYW1lIjoiTGVmdCBIb29rIiwiaXNzIjoiZmxhZ3NoaXAiLCJ0eXBlIjoiYXBwIn0sIm9yZ191c2VyX2lkIjoxLCJhdWQiOiJMZWZ0IEhvb2siLCJzY29wZXMiOiJBSkFBOEFIUUFCQUJRQT09Iiwib3JnX2d1aWQiOiJmNzY3MDEzZC1mNTBiLTRlY2QtYjM1My0zNWU0MWQ5Y2RjNGIiLCJvcmdfc2hvcnRuYW1lIjoibGVmdGhvb2tzYW5kYm94In0.XFmIai0GpAePsYeA4MjRntZS3iW6effmKmIhT7SBzTQ';
                api.refresh_token = 'nolongervalid';
                const response = await api.listAccounts();
                return response;
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
