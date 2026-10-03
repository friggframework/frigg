const {
    ListCredentialsForUser,
    GetCredentialForUserV2,
    DeleteCredentialForUser,
} = require('./credential-operations-for-user');

const user = { getId: () => 'u1' };
const credentials = [
    { id: 'c1', userId: 'u1', authIsValid: true, access_token: 'tok' },
    { id: 'c2', userId: 'u1', authIsValid: false },
];
const entities = [
    { id: 'e1', moduleName: 'acme', credential: { id: 'c1' } },
    { id: 'e2', moduleName: 'acme', credential: 'c1' },
    { id: 'e3', moduleName: 'other', credential: null },
];

function deps(found) {
    return {
        credentialRepository: {
            findCredentialsByUserId: jest.fn().mockResolvedValue(credentials),
            findCredentialById: jest.fn().mockResolvedValue(found),
            deleteCredentialById: jest.fn(),
        },
        moduleRepository: {
            findEntitiesByUserId: jest.fn().mockResolvedValue(entities),
            unsetCredential: jest.fn(),
        },
    };
}

describe('v2 credential operations', () => {
    it('lists credentials with their type and entity usage', async () => {
        const result = await new ListCredentialsForUser(deps()).execute(user);
        expect(result).toEqual([
            { ...credentials[0], type: 'acme', entityIds: ['e1', 'e2'] },
            { ...credentials[1], type: null, entityIds: [] },
        ]);
    });

    it('gets an owned credential and 404s a foreign or missing one', async () => {
        const own = new GetCredentialForUserV2(deps(credentials[0]));
        expect(await own.execute('c1', user)).toMatchObject({ id: 'c1', type: 'acme' });

        const foreign = new GetCredentialForUserV2(deps({ id: 'c9', userId: 'u2' }));
        await expect(foreign.execute('c9', user)).rejects.toMatchObject({
            output: { statusCode: 404 },
            data: { code: 'CREDENTIAL_NOT_FOUND' },
        });

        const missing = new GetCredentialForUserV2(deps(null));
        await expect(missing.execute('c0', user)).rejects.toMatchObject({
            output: { statusCode: 404 },
        });

        const malformed = deps(null);
        malformed.credentialRepository.findCredentialById.mockRejectedValue(
            new Error('Invalid ID: x cannot be converted to integer')
        );
        await expect(new GetCredentialForUserV2(malformed).execute('x', user)).rejects.toMatchObject({
            output: { statusCode: 404 },
        });
    });

    it('unsets the credential on its entities, then deletes it', async () => {
        const d = deps(credentials[0]);
        const getCredentialForUser = new GetCredentialForUserV2(d);
        const result = await new DeleteCredentialForUser({ ...d, getCredentialForUser }).execute('c1', user);
        expect(d.moduleRepository.unsetCredential.mock.calls).toEqual([['e1'], ['e2']]);
        expect(d.credentialRepository.deleteCredentialById).toHaveBeenCalledWith('c1');
        expect(result).toEqual({ id: 'c1', entityIds: ['e1', 'e2'] });
    });
});
