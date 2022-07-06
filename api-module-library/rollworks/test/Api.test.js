/**
 * @group interactive
 */

const Authenticator = require('../../../../test/utils/Authenticator');
const { Api } = require('../api.js');
const TestUtils = require('../../../../test/utils/TestUtils');

describe.skip('RollWorks API', () => {
    const api = new Api();
    beforeAll(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);

        // const userDetails = await api.getUserDetails();
        // const setOrg = await api.setOrganizationId(userDetails.authorizations[0].organization.uuid);

        // let user_id = this.userManager.getUserId();
        // xbeamManager = await RollWorksManager.getInstance({ entityId: res.body._id, userId: user_id });
    });

    describe('Get Organization', () => {
        it('should return organization details', async () => {
            const response = await api.getOrganization();
            expect(response).toHaveProperty('results');
            expect(response.results).toHaveProperty('name');
            expect(response.results).toHaveProperty('created_date');
            expect(response.results).toHaveProperty('eid');
            return response;
        });
    });

    describe('Get Target Account Lists', () => {
        it('should return target account lists', async () => {
            api.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            const createResponse = await api.createTargetAccount({
                name: 'Report Name',
                domains: ['test.com'],
            });
            const response = await api.getTargetAccounts();
            // TODO Move to after
            const deleteResponse = await api.deleteTargetAccount(
                createResponse.eid
            );
            expect(deleteResponse).toHaveProperty('status', 204);
            expect(response).toHaveProperty('results');
            expect(response.results[0]).toHaveProperty('name');
            expect(response.results[0]).toHaveProperty('items_count');
            expect(response.results[0]).toHaveProperty('tiers');
            expect(response.results[0]).toHaveProperty('eid');
            return response;
        });

        it('requires advertisable_eid', async () => {
            try {
                api.setAdvertisableEid(null);
                await api.getTargetAccounts();
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Parameters Error: advertisable_eid is a required parameter'
                );
            }
        });
    });

    describe('Get Target Account List', () => {
        it('should return single target account list details', async () => {
            api.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            const createResponse = await api.createTargetAccount({
                name: 'Report Name',
                domains: ['test.com'],
            });
            const response = await api.getTargetAccount({
                targetAccountId: createResponse.eid,
            });
            const deleteResponse = await api.deleteTargetAccount(
                createResponse.eid
            );
            expect(deleteResponse).toHaveProperty('status', 204);
            expect(response).toHaveProperty('name');
            expect(response).toHaveProperty('items_count');
            expect(response).toHaveProperty('tiers');
            expect(response).toHaveProperty('eid');
            return response;
        });

        it('requires advertisable_eid', async () => {
            try {
                api.setAdvertisableEid(null);
                await api.getTargetAccount({
                    targetAccountId: 'test',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Parameters Error: advertisable_eid is a required parameter'
                );
            }
        });

        it('requires targetAccountId', async () => {
            try {
                api.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
                await api.getTargetAccount({});
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Parameters Error: targetAccountId is a required parameter'
                );
            }
        });
    });

    describe('Create Target Account List', () => {
        it('should return target account list details', async () => {
            api.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            const response = await api.createTargetAccount({
                name: 'Report Name',
                domains: ['test.com'],
            });
            // TODO Move to after
            const deleteResponse = await api.deleteTargetAccount(response.eid);
            expect(deleteResponse).toHaveProperty('status', 204);
            expect(response).toHaveProperty('name');
            expect(response).toHaveProperty('items_count');
            expect(response).toHaveProperty('tiers');
            expect(response).toHaveProperty('eid');
            return response;
        });

        it('requires a report name', async () => {
            api.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            try {
                await api.createTargetAccount({
                    domains: ['test.com'],
                    advertisable_eid: '123',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Parameters Error: name is a required parameter'
                );
            }
        });

        it('requires advertisable_eid', async () => {
            try {
                api.setAdvertisableEid(null);
                await api.createTargetAccount({
                    domains: ['test.com'],
                    name: '123',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Parameters Error: advertisable_eid is a required parameter'
                );
            }
        });

        it('requires domains param', async () => {
            api.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            try {
                await api.createTargetAccount({
                    name: 'Report Name',
                    advertisable_eid: '123',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Parameters Error: domains is a required parameter'
                );
            }
        });

        it('requires domains in array', async () => {
            api.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            try {
                await api.createTargetAccount({
                    name: 'Report Name',
                    domains: 'test.com',
                    advertisable_eid: '123',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Error: domains is not of type array'
                );
            }
        });
    });

    describe('Add domains to account', () => {
        it('should return existing vs different', async () => {
            api.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            const AccountResponse = await api.createTargetAccount({
                name: 'Report Name',
                domains: ['test.com'],
            });
            const { eid } = AccountResponse;
            const response = await api.populateTargetAccount(eid, {
                domains: ['test.com', 'new.com', 'third.com'],
            });
            const deleteResponse = await api.deleteTargetAccount(
                AccountResponse.eid
            );
            expect(deleteResponse).toHaveProperty('status', 204);
            expect(response).toHaveProperty('existing_domains');
            expect(response).toHaveProperty('new_domains');
            return response;
        });
        it('requires domains param', async () => {
            api.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            try {
                const response = await api.populateTargetAccount('123', {
                    advertisable_eid: '123',
                });
                return response;
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Parameters Error: domains is a required parameter'
                );
            }
        });
        it('requires advertisable_eid param', async () => {
            try {
                api.setAdvertisableEid(null);
                const response = await api.populateTargetAccount('123', {
                    domains: ['test.com'],
                });
                return response;
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Parameters Error: advertisable_eid is a required parameter'
                );
            }
        });
    });

    describe('Bad Auth', () => {
        it('should refresh Oauth token', async () => {
            api.access_token = 'noLongerValid';
            await api.getOrganization();
            expect(api.access_token).not.toBe('noLongerValid');
        });

        it('should throw error with invalid refresh token', async () => {
            try {
                api.access_token = 'nolongervalid';
                api.refresh_token = 'nolongervalid';
                await api.getOrganization();
                throw new Error('Did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Error: Error Refreshing Credential'
                );
            }
        });
    });
});
