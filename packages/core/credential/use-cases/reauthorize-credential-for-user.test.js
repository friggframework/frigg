const {
    GetCredentialReauthorization,
    ReauthorizeCredentialForUser,
} = require('./reauthorize-credential-for-user');
const { User } = require('../../user/user');

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

describe('re-authorizing an organization credential needs an admin', () => {
    const getCredentialForUser = { execute: jest.fn(async (id) => ({ id, type: 'acme', userId: '17' })) };
    const callerIn = (source, role) => {
        const caller = new User({ id: '7', type: 'INDIVIDUAL' }, { id: '17' }, false, 'organization', true, true);
        caller.setAuthSource(source);
        if (role) caller.setOrgRole(role);
        return caller;
    };

    it('403s a member and a token with no role before any step is submitted', async () => {
        const submitAuthorizationStep = { execute: jest.fn() };
        const useCase = new ReauthorizeCredentialForUser({ getCredentialForUser, submitAuthorizationStep });
        for (const caller of [callerIn('adopter-jwt', 'MEMBER'), callerIn('adopter-jwt')]) {
            await expect(useCase.execute('c17', caller, { data: {} })).rejects.toMatchObject({
                output: { statusCode: 403 },
                data: { code: 'ORG_ADMIN_REQUIRED' },
            });
        }
        expect(submitAuthorizationStep.execute).not.toHaveBeenCalled();
    });

    it('lets an admin token through, binding the step to the credential', async () => {
        const submitAuthorizationStep = { execute: jest.fn().mockResolvedValue({ status: 'complete' }) };
        const caller = callerIn('adopter-jwt', 'ADMIN');
        await new ReauthorizeCredentialForUser({ getCredentialForUser, submitAuthorizationStep }).execute('c17', caller, {
            data: {},
        });
        expect(submitAuthorizationStep.execute).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: 'acme', credentialId: 'c17' })
        );
        expect(submitAuthorizationStep.execute.mock.calls[0][0]).not.toHaveProperty('ownerId');
    });

    it('the step it starts is bound to the credential only: the owner is for the gate, not for the flow', async () => {
        const getAuthorizationStep = { execute: jest.fn().mockResolvedValue({ step: 1 }) };
        await new GetCredentialReauthorization({ getCredentialForUser, getAuthorizationStep }).execute('c17', callerIn('adopter-jwt', 'MEMBER'));
        expect(Object.keys(getAuthorizationStep.execute.mock.calls[0][0]).sort()).toEqual(
            ['credentialId', 'entityType', 'sessionId', 'state', 'step', 'user']
        );
    });
});
