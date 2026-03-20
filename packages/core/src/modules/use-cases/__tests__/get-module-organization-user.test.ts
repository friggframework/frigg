import { User } from '../../../user/user';

describe('User.ownsUserId - Organization Primary User Validation', () => {
    describe('when primary is organization and individual user is linked', () => {
        it('should allow organization user to own both organization and linked individual user IDs', () => {
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
                individualUserData as any,
                organizationUserData as any,
                false,
                'organization',
                true,
                true
            );

            expect(user.getId()).toBe(organizationUserId);

            expect(user.ownsUserId(organizationUserId)).toBe(true);
            expect(user.ownsUserId(individualUserId)).toBe(true);

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
                individualUserData as any,
                organizationUserData as any,
                false,
                'organization',
                true,
                true
            );

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
                individualUserData as any,
                null,
                false,
                'individual',
                true,
                false
            );

            expect(user.ownsUserId(individualUserId)).toBe(true);

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
                individualUserData as any,
                organizationUserData as any,
                false,
                'individual',
                true,
                true
            );

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
                individualUserData as any,
                organizationUserData as any,
                false,
                'organization',
                true,
                true
            );

            expect(user.ownsUserId(differentUserId)).toBe(false);
        });

        it('should not allow ownership when organization is not linked', () => {
            const individualUserId = 4;
            const unlinkedOrgId = 99;

            const individualUserData = {
                id: individualUserId,
                type: 'INDIVIDUAL',
                appUserId: 'USxshK2J95',
                organizationId: null,
            };

            const user = new User(
                individualUserData as any,
                null,
                false,
                'individual',
                true,
                false
            );

            expect(user.ownsUserId(unlinkedOrgId)).toBe(false);
        });
    });
});
