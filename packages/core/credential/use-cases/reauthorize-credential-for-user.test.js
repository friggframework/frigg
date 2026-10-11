const {
    GetCredentialReauthorization,
    ReauthorizeCredentialForUser,
} = require('./reauthorize-credential-for-user');

const user = { getId: () => 'u1' };

describe('credential re-authorization', () => {
    const getCredentialForUser = {
        execute: jest.fn(async (id) => ({ id, type: id === 'orphan' ? null : 'acme' })),
    };

    it('starts the flow for the credential type, bound to the credential', async () => {
        const getAuthorizationStep = { execute: jest.fn().mockResolvedValue({ step: 1 }) };
        await new GetCredentialReauthorization({ getCredentialForUser, getAuthorizationStep }).execute(
            'c1', user, { step: 1, state: 's' }
        );
        expect(getAuthorizationStep.execute).toHaveBeenCalledWith({
            user, entityType: 'acme', credentialId: 'c1', step: 1, sessionId: undefined, state: 's',
        });
    });

    it('submits a step for the credential type, bound to the credential', async () => {
        const submitAuthorizationStep = { execute: jest.fn().mockResolvedValue({ status: 'complete' }) };
        await new ReauthorizeCredentialForUser({ getCredentialForUser, submitAuthorizationStep }).execute(
            'c1', user, { data: { code: 'x' }, step: 1 }
        );
        expect(submitAuthorizationStep.execute).toHaveBeenCalledWith({
            user, entityType: 'acme', credentialId: 'c1', data: { code: 'x' }, step: 1, sessionId: undefined,
        });
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
