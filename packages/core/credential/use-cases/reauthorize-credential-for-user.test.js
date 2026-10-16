const {
    GetCredentialReauthorization,
    ReauthorizeCredentialForUser,
} = require('./reauthorize-credential-for-user');

const user = { getId: () => 'u1' };
const tenancy = (scope, access) => ({ scope, owner: { type: scope, id: 'x' }, organizationId: null, access });

describe('credential re-authorization', () => {
    const getCredentialForUser = {
        execute: jest.fn(async (id) => ({
            id,
            type: id === 'orphan' ? null : 'acme',
            userId: 'u1',
            tenancy: tenancy(id === 'org' ? 'organization' : 'individual', id === 'readonly' ? 'use' : 'manage'),
        })),
    };

    it('starts the flow for the credential type, bound to the credential', async () => {
        const getAuthorizationStep = { execute: jest.fn().mockResolvedValue({ step: 1 }) };
        await new GetCredentialReauthorization({ getCredentialForUser, getAuthorizationStep }).execute(
            'c1', user, { step: 1, state: 's' }
        );
        expect(getAuthorizationStep.execute.mock.calls[0][0]).toStrictEqual({
            user, entityType: 'acme', credentialId: 'c1', step: 1, sessionId: undefined, state: 's',
        });
    });

    it('submits a step for the credential type, bound to the credential, keeping its scope', async () => {
        const submitAuthorizationStep = { execute: jest.fn().mockResolvedValue({ status: 'complete' }) };
        const useCase = new ReauthorizeCredentialForUser({ getCredentialForUser, submitAuthorizationStep });
        await useCase.execute('c1', user, { data: { code: 'x' }, step: 1 });
        await useCase.execute('org', user, { data: { code: 'x' }, step: 1 });
        // The scope is the one the connection already has, whatever the config says now.
        expect(submitAuthorizationStep.execute.mock.calls.map(([call]) => [call.credentialId, call.fixedScope])).toEqual([
            ['c1', 'individual'],
            ['org', 'organization'],
        ]);
        expect(submitAuthorizationStep.execute.mock.calls[0][0]).toMatchObject({
            user, entityType: 'acme', data: { code: 'x' }, step: 1,
        });
        // The access the use case checked is not part of what the flow is given.
        expect(submitAuthorizationStep.execute.mock.calls[0][0]).not.toHaveProperty('access');
    });

    it('refuses a credential the caller may only use, before any step is submitted (403)', async () => {
        const submitAuthorizationStep = { execute: jest.fn() };
        await expect(
            new ReauthorizeCredentialForUser({ getCredentialForUser, submitAuthorizationStep }).execute(
                'readonly', user, { data: {} }
            )
        ).rejects.toMatchObject({ output: { statusCode: 403 }, data: { code: 'ORG_ADMIN_REQUIRED' } });
        expect(submitAuthorizationStep.execute).not.toHaveBeenCalled();
    });

    it('refuses a credential no entity uses with 409', async () => {
        const submitAuthorizationStep = { execute: jest.fn() };
        await expect(
            new ReauthorizeCredentialForUser({ getCredentialForUser, submitAuthorizationStep }).execute(
                'orphan', user, { data: {} }
            )
        ).rejects.toMatchObject({ output: { statusCode: 409 }, data: { code: 'CREDENTIAL_TYPE_UNKNOWN' } });
    });
});
