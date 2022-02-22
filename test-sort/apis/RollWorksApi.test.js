/**
 * @group interactive
 */

const Authenticator = require('../utils/Authenticator');
const RollWorksApiClass = require('../../src/modules/RollWorks/Api');

describe.skip('RollWorks API 2', () => {
    const rollworksApi = new RollWorksApiClass();
    beforeAll(async () => {
        const url = rollworksApi.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await rollworksApi.getTokenFromCode(response.data.code);

        // const userDetails = await rollworksApi.getUserDetails();
        // const setOrg = await rollworksApi.setOrganizationId(userDetails.authorizations[0].organization.uuid);

        // let user_id = this.userManager.getUserId();
        // xbeamManager = await RollWorksManager.getInstance({ entityId: res.body._id, userId: user_id });
    });

    // after(async() => {
    //     await disconnectFromDatabase();
    // });

    describe('Get Organization', () => {
        it('should return organization details', async () => {
            const response = await rollworksApi.getOrganization();
            expect(response).toHaveProperty('results');
            expect(response.results).toHaveProperty('name');
            expect(response.results).toHaveProperty('created_date');
            expect(response.results).toHaveProperty('eid');
            return response;
        });
    });

    describe('Get Target Account Lists', () => {
        it('should return target account lists', async () => {
            rollworksApi.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            const createResponse = await rollworksApi.createTargetAccount({
                name: 'Report Name',
                domains: ['test.com'],
            });
            const response = await rollworksApi.getTargetAccounts();
            // TODO Move to after
            const deleteResponse = await rollworksApi.deleteTargetAccount(
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
                rollworksApi.setAdvertisableEid(null);
                await rollworksApi.getTargetAccounts();
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'RollWorksAPI -- Parameters Error: advertisable_eid is a required parameter'
                );
            }
        });
    });

    describe('Get Target Account List', () => {
        it('should return single target account list details', async () => {
            rollworksApi.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            const createResponse = await rollworksApi.createTargetAccount({
                name: 'Report Name',
                domains: ['test.com'],
            });
            const response = await rollworksApi.getTargetAccount({
                targetAccountId: createResponse.eid,
            });
            const deleteResponse = await rollworksApi.deleteTargetAccount(
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
                rollworksApi.setAdvertisableEid(null);
                await rollworksApi.getTargetAccount({
                    targetAccountId: 'test',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'RollWorksAPI -- Parameters Error: advertisable_eid is a required parameter'
                );
            }
        });
        it('requires targetAccountId', async () => {
            try {
                rollworksApi.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
                await rollworksApi.getTargetAccount({});
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'RollWorksAPI -- Parameters Error: targetAccountId is a required parameter'
                );
            }
        });
    });

    describe('Create Target Account List', () => {
        it('should return target account list details', async () => {
            rollworksApi.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            const response = await rollworksApi.createTargetAccount({
                name: 'Report Name',
                domains: ['test.com'],
            });
            // TODO Move to after
            const deleteResponse = await rollworksApi.deleteTargetAccount(
                response.eid
            );
            expect(deleteResponse).toHaveProperty('status', 204);
            expect(response).toHaveProperty('name');
            expect(response).toHaveProperty('items_count');
            expect(response).toHaveProperty('tiers');
            expect(response).toHaveProperty('eid');
            return response;
        });
        it('requires a report name', async () => {
            rollworksApi.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            try {
                await rollworksApi.createTargetAccount({
                    domains: ['test.com'],
                    advertisable_eid: '123',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'RollWorksAPI -- Parameters Error: name is a required parameter'
                );
            }
        });
        it('requires advertisable_eid', async () => {
            try {
                rollworksApi.setAdvertisableEid(null);
                await rollworksApi.createTargetAccount({
                    domains: ['test.com'],
                    name: '123',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'RollWorksAPI -- Parameters Error: advertisable_eid is a required parameter'
                );
            }
        });
        it('requires domains param', async () => {
            rollworksApi.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            try {
                await rollworksApi.createTargetAccount({
                    name: 'Report Name',
                    advertisable_eid: '123',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'RollWorksAPI -- Parameters Error: domains is a required parameter'
                );
            }
        });
        it('requires domains in array', async () => {
            rollworksApi.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            try {
                await rollworksApi.createTargetAccount({
                    name: 'Report Name',
                    domains: 'test.com',
                    advertisable_eid: '123',
                });
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'RollWorksAPI -- Error: domains is not of type array'
                );
            }
        });
    });

    describe('Add domains to account', () => {
        it('should return existing vs different', async () => {
            rollworksApi.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            const AccountResponse = await rollworksApi.createTargetAccount({
                name: 'Report Name',
                domains: ['test.com'],
            });
            const { eid } = AccountResponse;
            const response = await rollworksApi.populateTargetAccount(eid, {
                domains: ['test.com', 'new.com', 'third.com'],
            });
            const deleteResponse = await rollworksApi.deleteTargetAccount(
                AccountResponse.eid
            );
            expect(deleteResponse).toHaveProperty('status', 204);
            expect(response).toHaveProperty('existing_domains');
            expect(response).toHaveProperty('new_domains');
            return response;
        });
        it('requires domains param', async () => {
            rollworksApi.setAdvertisableEid('267UUCEJFNDBXGGISDRVXV');
            try {
                const response = await rollworksApi.populateTargetAccount(
                    '123',
                    { advertisable_eid: '123' }
                );
                return response;
            } catch (e) {
                expect(e.message).toBe(
                    'RollWorksAPI -- Parameters Error: domains is a required parameter'
                );
            }
        });
        it('requires advertisable_eid param', async () => {
            try {
                rollworksApi.setAdvertisableEid(null);
                const response = await rollworksApi.populateTargetAccount(
                    '123',
                    { domains: ['test.com'] }
                );
                return response;
            } catch (e) {
                expect(e.message).toBe(
                    'RollWorksAPI -- Parameters Error: advertisable_eid is a required parameter'
                );
            }
        });
    });

    describe('Refresh Oauth Tokens', () => {
        it('should refresh Oauth token', async () => {
            rollworksApi.access_token = 'noLongerValid';
            const response = await rollworksApi.getOrganization();
            expect(rollworksApi.access_token).not.toBe('noLongerValid');
        });
    });
});
