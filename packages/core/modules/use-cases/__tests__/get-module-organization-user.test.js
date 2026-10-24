/**
 * Test suite for User.ownsUserId validation with organization-primary users
 *
 * This test demonstrates that entities owned by individual users
 * can be accessed when the primary user type is 'organization' and
 * the individual user is linked to the organization.
 */

const { User } = require('../../../user/user');

describe('User.ownsUserId - Organization Primary User Validation', () => {
    describe('when primary is organization and individual user is linked', () => {
        it('should allow organization user to own both organization and linked individual user IDs', () => {
            // Setup: Simulate the database state from the bug report
            // - Individual user ID: 4 (owns Entity 6)
            // - Organization user ID: 13 (owns Integration 27)
            // - Individual user is linked to organization via organizationId

            const individualUserId = 4;
            const organizationUserId = 13;

            const individualUserData = {
                id: individualUserId,
                type: 'INDIVIDUAL',
                appUserId: 'USxshK2J95',
                organizationId: organizationUserId, // Linked to org
            };

            const organizationUserData = {
                id: organizationUserId,
                type: 'ORGANIZATION',
                appOrgId: 'ORbFicuCA1',
            };

            const user = new User(
                individualUserData,
                organizationUserData,
                false, // usePassword
                'organization', // primary = 'organization'
                true, // individualUserRequired
                true  // organizationUserRequired
            );

            // Verify user.getId() returns organization ID
            expect(user.getId()).toBe(organizationUserId);

            // ✓ Organization user should own both IDs
            expect(user.ownsUserId(organizationUserId)).toBe(true);
            expect(user.ownsUserId(individualUserId)).toBe(true);

            // ✓ Should not own random IDs
            expect(user.ownsUserId(999)).toBe(false);
        });

        it('should handle string and number ID comparisons', () => {
            const individualUserId = 4;
            const organizationUserId = 13;

            const individualUserData = {
                id: individualUserId,
                type: 'INDIVIDUAL',
                appUserId: 'USxshK2J95',
                organizationId: organizationUserId,
            };

            const organizationUserData = {
                id: organizationUserId,
                type: 'ORGANIZATION',
                appOrgId: 'ORbFicuCA1',
            };

            const user = new User(
                individualUserData,
                organizationUserData,
                false,
                'organization',
                true,
                true
            );

            // Should work with both string and number types
            expect(user.ownsUserId(4)).toBe(true);
            expect(user.ownsUserId('4')).toBe(true);
            expect(user.ownsUserId(13)).toBe(true);
            expect(user.ownsUserId('13')).toBe(true);
        });
    });

    describe('when primary is individual', () => {
        it('should allow individual user to own their own entities', () => {
            const individualUserId = 4;

            const individualUserData = {
                id: individualUserId,
                type: 'INDIVIDUAL',
                appUserId: 'USxshK2J95',
            };

            const user = new User(
                individualUserData,
                null,
                false,
                'individual',
                true,
                false
            );

            // Individual user should own their own ID
            expect(user.ownsUserId(individualUserId)).toBe(true);

            // Should not own other IDs
            expect(user.ownsUserId(999)).toBe(false);
        });

        it('should allow individual user with linked org to own org ID when org is required', () => {
            const individualUserId = 4;
            const organizationUserId = 13;

            const individualUserData = {
                id: individualUserId,
                type: 'INDIVIDUAL',
                appUserId: 'USxshK2J95',
                organizationId: organizationUserId,
            };

            const organizationUserData = {
                id: organizationUserId,
                type: 'ORGANIZATION',
                appOrgId: 'ORbFicuCA1',
            };

            const user = new User(
                individualUserData,
                organizationUserData,
                false,
                'individual', // primary = 'individual'
                true,
                true // organizationUserRequired = true
            );

            // Individual user should own both IDs when org is required
            expect(user.ownsUserId(individualUserId)).toBe(true);
            expect(user.ownsUserId(organizationUserId)).toBe(true);
        });
    });

    describe('security validation', () => {
        it('should not allow ownership of unlinked user IDs', () => {
            const individualUserId = 4;
            const organizationUserId = 13;
            const differentUserId = 99;

            const individualUserData = {
                id: individualUserId,
                type: 'INDIVIDUAL',
                appUserId: 'USxshK2J95',
                organizationId: organizationUserId,
            };

            const organizationUserData = {
                id: organizationUserId,
                type: 'ORGANIZATION',
                appOrgId: 'ORbFicuCA1',
            };

            const user = new User(
                individualUserData,
                organizationUserData,
                false,
                'organization',
                true,
                true
            );

            // Should not own unlinked user IDs
            expect(user.ownsUserId(differentUserId)).toBe(false);
        });

        it('should not allow ownership when organization is not linked', () => {
            const individualUserId = 4;
            const unlinkedOrgId = 99;

            const individualUserData = {
                id: individualUserId,
                type: 'INDIVIDUAL',
                appUserId: 'USxshK2J95',
                organizationId: null, // NOT linked to any org
            };

            const user = new User(
                individualUserData,
                null,
                false,
                'individual',
                true,
                false
            );

            // Should not own unlinked organization ID
            expect(user.ownsUserId(unlinkedOrgId)).toBe(false);
        });
    });
});
