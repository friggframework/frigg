const { User } = require('../user');

describe('User active organization (ADR-056 §3.6)', () => {
    // The person's legacy pointer says org-a; the request acts in org-b.
    const individual = { id: 'ind-1', appUserId: 'u1', organizationId: 'org-a' };
    const active = { id: 'org-b', appOrgId: 'oB' };
    const build = (primary, organization = active) =>
        new User(individual, organization, false, primary, true, true);

    it('reports the organization the request named, not the legacy pointer', () => {
        expect(build('organization').getActiveOrganizationId()).toBe('org-b');
        expect(build('individual').getActiveOrganizationId()).toBe('org-b');
    });

    it('stringifies numeric ids', () => {
        expect(
            build('organization', { id: 42 }).getActiveOrganizationId()
        ).toBe('42');
    });

    it.each([
        ['no organization', null],
        ['an organization with no id', { appOrgId: 'x' }],
        ['an empty id', { id: '' }],
    ])('is null with %s', (_label, organization) => {
        expect(build('organization', organization).getActiveOrganizationId()).toBeNull();
    });

    it('getId() is the active organization under primary: organization', () => {
        expect(build('organization').getId()).toBe('org-b');
    });

    it('getId() is the individual under primary: individual', () => {
        expect(build('individual').getId()).toBe('ind-1');
    });

    it('keeps getOrgRole() per request, null until set', () => {
        const user = build('organization');
        expect(user.getOrgRole()).toBeNull();
        user.setOrgRole('admin');
        expect(user.getOrgRole()).toBe('admin');
        user.setOrgRole(undefined);
        expect(user.getOrgRole()).toBeNull();
    });
});
