const {
    EnsureOrganizationMembership,
} = require('../../use-cases/ensure-organization-membership');
const {
    createUserRepositoryDouble,
    createMembershipRepositoryDouble,
} = require('../doubles/adopter-jwt-fixtures');

describe('EnsureOrganizationMembership (ADR-056 §3.6)', () => {
    let users;
    let memberships;
    let ensure;

    const seed = (options) => {
        users = createUserRepositoryDouble(options);
        memberships = createMembershipRepositoryDouble(users);
        ensure = new EnsureOrganizationMembership({
            userRepository: users,
            organizationMembershipRepository: memberships,
        });
    };
    const person = (extra = {}) => ({
        id: 'ind-1',
        appUserId: 'u1',
        ...extra,
    });
    const orgB = { id: 'org-b', appOrgId: 'oB' };

    beforeEach(() => {
        seed({ individuals: [person()], organizations: [orgB] });
    });

    it.each([
        ['no individual', { individual: null, organization: orgB }],
        ['no organization', { individual: person(), organization: null }],
    ])('does nothing with %s', async (_label, args) => {
        const result = await ensure.execute(args);

        expect(result).toEqual({
            individual: args.individual,
            membership: null,
            added: false,
        });
        expect(memberships.findMembership).not.toHaveBeenCalled();
        expect(memberships.addMembership).not.toHaveBeenCalled();
    });

    it('adds a membership with the role and sets the legacy pointer on a first link', async () => {
        const result = await ensure.execute({
            individual: person(),
            organization: orgB,
            role: 'admin',
        });

        expect(memberships.addMembership).toHaveBeenCalledWith(
            'ind-1',
            'org-b',
            { role: 'admin' }
        );
        expect(users.linkIndividualToOrganization).toHaveBeenCalledWith(
            'ind-1',
            'org-b'
        );
        expect(result.added).toBe(true);
        expect(result.membership).toMatchObject({ role: 'admin' });
        expect(result.individual.organizationId).toBe('org-b');
    });

    it('never overwrites an existing legacy pointer', async () => {
        seed({
            individuals: [person({ organizationId: 'org-a' })],
            organizations: [orgB, { id: 'org-a', appOrgId: 'oA' }],
        });

        const result = await ensure.execute({
            individual: person({ organizationId: 'org-a' }),
            organization: orgB,
        });

        expect(result.added).toBe(true);
        expect(users.linkIndividualToOrganization).not.toHaveBeenCalled();
        expect(result.individual.organizationId).toBe('org-a');
        expect(users.state.individualUsers.get('u1').organizationId).toBe(
            'org-a'
        );
    });

    it('writes nothing for an existing membership row, and keeps its role', async () => {
        await memberships.addMembership('ind-1', 'org-b', { role: 'owner' });
        jest.clearAllMocks();

        const result = await ensure.execute({
            individual: person(),
            organization: orgB,
            role: 'member',
        });

        expect(result.added).toBe(false);
        expect(result.membership.role).toBe('owner');
        expect(memberships.addMembership).not.toHaveBeenCalled();
        expect(users.linkIndividualToOrganization).not.toHaveBeenCalled();
    });

    it('counts the legacy pointer as a membership and writes nothing', async () => {
        seed({
            individuals: [person({ organizationId: 'org-b' })],
            organizations: [orgB],
        });

        const result = await ensure.execute({
            individual: person({ organizationId: 'org-b' }),
            organization: orgB,
        });

        expect(result.added).toBe(false);
        expect(result.membership).toMatchObject({ implicit: true });
        expect(memberships.addMembership).not.toHaveBeenCalled();
        expect(memberships.rows.size).toBe(0);
    });

    it('with requireExisting, refuses to add and reports no membership', async () => {
        const result = await ensure.execute({
            individual: person(),
            organization: orgB,
            requireExisting: true,
        });

        expect(result.membership).toBeNull();
        expect(result.added).toBe(false);
        expect(memberships.addMembership).not.toHaveBeenCalled();
        expect(users.linkIndividualToOrganization).not.toHaveBeenCalled();
    });

    it('with requireExisting, still accepts an existing membership', async () => {
        await memberships.addMembership('ind-1', 'org-b');

        const result = await ensure.execute({
            individual: person(),
            organization: orgB,
            requireExisting: true,
        });

        expect(result.membership).not.toBeNull();
    });

    it('is idempotent across repeated calls', async () => {
        for (let i = 0; i < 3; i += 1) {
            await ensure.execute({ individual: person(), organization: orgB });
        }

        expect(memberships.rows.size).toBe(1);
        expect(users.linkIndividualToOrganization).toHaveBeenCalledTimes(1);
    });
});
