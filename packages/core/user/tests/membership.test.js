const {
    DEFAULT_ORG_ROLE,
    isPresent,
    idString,
    sameId,
    implicitMembership,
} = require('../membership');

describe('membership domain rules (ADR-056 §3.6)', () => {
    const created = new Date('2026-01-01T00:00:00Z');

    describe('implicitMembership', () => {
        const person = {
            id: 'ind-1',
            organizationId: 'org-a',
            createdAt: created,
        };

        it('is the legacy pointer read as a MEMBER membership in that organization', () => {
            expect(implicitMembership(person, 'org-a')).toEqual({
                id: null,
                individualUserId: 'ind-1',
                organizationUserId: 'org-a',
                orgRole: DEFAULT_ORG_ROLE,
                createdAt: created,
                implicit: true,
            });
            expect(DEFAULT_ORG_ROLE).toBe('MEMBER');
        });

        it('is null for a different organization', () => {
            expect(implicitMembership(person, 'org-b')).toBeNull();
        });

        it.each([null, undefined, ''])(
            'is null when the person has no pointer (%p)',
            (pointer) => {
                expect(
                    implicitMembership({ ...person, organizationId: pointer }, 'org-a')
                ).toBeNull();
            }
        );

        it('is null for no person, and never matches an absent organization id', () => {
            expect(implicitMembership(null, 'org-a')).toBeNull();
            expect(implicitMembership(undefined, 'org-a')).toBeNull();
            expect(implicitMembership(person, undefined)).toBeNull();
            expect(
                implicitMembership({ ...person, organizationId: undefined }, undefined)
            ).toBeNull();
        });

        it('compares ids as strings, numbers included', () => {
            expect(
                implicitMembership({ id: 5, organizationId: 7 }, '7')
            ).toMatchObject({
                individualUserId: '5',
                organizationUserId: '7',
            });
            expect(
                implicitMembership({ id: 5, organizationId: '7' }, 7)
            ).not.toBeNull();
            expect(implicitMembership({ id: 5, organizationId: 7 }, 8)).toBeNull();
        });
    });

    describe('id helpers', () => {
        it('isPresent rejects only undefined, null and the empty string', () => {
            expect([undefined, null, ''].some(isPresent)).toBe(false);
            expect([0, '0', false].every(isPresent)).toBe(true);
        });

        it('idString stringifies, and gives null for an absent id', () => {
            expect(idString(12)).toBe('12');
            expect(idString(null)).toBeNull();
            expect(idString('')).toBeNull();
        });

        it('sameId is false when either side is absent', () => {
            expect(sameId(1, '1')).toBe(true);
            expect(sameId(undefined, undefined)).toBe(false);
            expect(sameId('', '')).toBe(false);
        });
    });
});
