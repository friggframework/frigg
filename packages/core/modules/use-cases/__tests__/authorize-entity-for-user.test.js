const { AuthorizeEntityForUser } = require('../authorize-entity-for-user');
const { createScopePolicy } = require('../../scope-policy');

const user = (orgId) => ({
    config: { primary: 'individual' },
    getId: () => '7',
    getIndividualUser: () => ({ id: '7', organizationId: '99' }),
    getActiveOrganizationId: () => orgId,
});

const build = (registry) => {
    const processAuthorizationCallback = {
        execute: jest.fn(async () => ({ credential_id: 'c', entity_id: 'e', type: 'acme' })),
    };
    const useCase = new AuthorizeEntityForUser({
        scopePolicy: createScopePolicy({ entityTypeRegistry: registry }),
        processAuthorizationCallback,
    });
    return { useCase, processAuthorizationCallback };
};

describe('AuthorizeEntityForUser', () => {
    it('runs the authorization as the owner the scope decides, with the tenancy the callback needs', async () => {
        const { useCase, processAuthorizationCallback } = build(
            new Map([['acme', { settings: { scope: 'organization' } }]])
        );
        const { result, ownership } = await useCase.execute({
            user: user('17'),
            entityType: 'acme',
            data: { key: 'k' },
        });
        expect(result).toEqual({ credential_id: 'c', entity_id: 'e', type: 'acme' });
        expect(ownership).toMatchObject({ scope: 'organization', ownerId: '17', organizationId: '17' });
        expect(processAuthorizationCallback.execute).toHaveBeenCalledWith('17', 'acme', { key: 'k' }, {
            scope: 'organization',
            organizationId: '17',
            legacyOrgId: '99',
        });
    });

    it('uses the ownership it is handed instead of resolving it again', async () => {
        const { useCase, processAuthorizationCallback } = build();
        const ownership = { scope: 'individual', ownerId: '7', organizationId: '17', legacyOrgId: null };
        const resolve = jest.spyOn(useCase, 'resolveOwnership');
        await useCase.execute({ user: user('17'), entityType: 'acme', data: {}, ownership });
        expect(resolve).not.toHaveBeenCalled();
        expect(processAuthorizationCallback.execute.mock.calls[0][0]).toBe('7');
    });

    it('does not call the module when the request cannot have an owner', async () => {
        const { useCase, processAuthorizationCallback } = build(
            new Map([['acme', { settings: { scope: 'organization' } }]])
        );
        await expect(
            useCase.execute({ user: user(null), entityType: 'acme', data: {} })
        ).rejects.toMatchObject({ output: { statusCode: 400 } });
        await expect(
            useCase.execute({ user: user('17'), entityType: 'acme', data: {}, scope: 'global' })
        ).rejects.toMatchObject({ output: { statusCode: 403 } });
        expect(processAuthorizationCallback.execute).not.toHaveBeenCalled();
    });
});
