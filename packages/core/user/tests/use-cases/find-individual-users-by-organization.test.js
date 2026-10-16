const {
    FindIndividualUsersByOrganization,
} = require('../../use-cases/find-individual-users-by-organization');
const {
    createUserRepositoryDouble,
    createMembershipRepositoryDouble,
} = require('../doubles/adopter-jwt-fixtures');

describe('FindIndividualUsersByOrganization (ADR-056 §3.6)', () => {
    let users;
    let memberships;
    let find;

    // userRepository double: individuals by legacy pointer; findIndividual...
    // ByOrganizationId is the repository's legacy-pointer query.
    const seed = (individuals, organizations) => {
        users = createUserRepositoryDouble({ individuals, organizations });
        users.findIndividualUsersByOrganizationId = jest.fn(async (orgId) =>
            [...users.state.individualUsers.values()]
                .filter((u) => String(u.organizationId) === String(orgId))
                .map((u) => ({ ...u }))
        );
        memberships = createMembershipRepositoryDouble();
        find = new FindIndividualUsersByOrganization({
            userRepository: users,
            organizationMembershipRepository: memberships,
        });
    };
    const ids = (list) => list.map((u) => u.id).sort();

    it('lists a person who is in two organizations in both', async () => {
        seed(
            [{ id: 'ind-1', appUserId: 'u1', organizationId: 'org-a' }],
            [
                { id: 'org-a', appOrgId: 'oA' },
                { id: 'org-b', appOrgId: 'oB' },
            ]
        );
        await memberships.addMembership('ind-1', 'org-b');

        expect(ids(await find.execute('org-a'))).toEqual(['ind-1']);
        expect(ids(await find.execute('org-b'))).toEqual(['ind-1']);
    });

    it('lists legacy-pointer people and membership people together, each once', async () => {
        seed(
            [
                { id: 'ind-1', appUserId: 'u1', organizationId: 'org-a' },
                { id: 'ind-2', appUserId: 'u2', organizationId: 'org-x' },
                { id: 'ind-3', appUserId: 'u3' },
            ],
            [{ id: 'org-a', appOrgId: 'oA' }]
        );
        // ind-1 has both a pointer and a row for org-a; ind-2 and ind-3 only a row.
        await memberships.addMembership('ind-1', 'org-a');
        await memberships.addMembership('ind-2', 'org-a');
        await memberships.addMembership('ind-3', 'org-a');

        const result = await find.execute('org-a');

        expect(ids(result)).toEqual(['ind-1', 'ind-2', 'ind-3']);
        // The person already listed by the pointer is not fetched again.
        expect(users.findIndividualUserById).toHaveBeenCalledTimes(2);
    });

    it('is empty for an organization with neither', async () => {
        seed([{ id: 'ind-1', appUserId: 'u1', organizationId: 'org-a' }], []);

        expect(await find.execute('org-z')).toEqual([]);
    });

    it('skips a membership whose person no longer exists', async () => {
        seed([], []);
        await memberships.addMembership('gone', 'org-a');

        expect(await find.execute('org-a')).toEqual([]);
    });

    it('makes one call to each repository for the lists, and keeps them atomic', async () => {
        seed([{ id: 'ind-1', appUserId: 'u1', organizationId: 'org-a' }], []);

        await find.execute('org-a');

        expect(users.findIndividualUsersByOrganizationId).toHaveBeenCalledTimes(1);
        expect(users.findIndividualUsersByOrganizationId).toHaveBeenCalledWith('org-a');
        expect(memberships.listMembershipsForOrganization).toHaveBeenCalledTimes(1);
        expect(memberships.listMembershipsForOrganization).toHaveBeenCalledWith('org-a');
    });
});
