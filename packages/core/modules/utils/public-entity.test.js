const { toPublicEntity, toPublicEntities } = require('./public-entity');

const withCredential = {
    id: 'e1',
    userId: 'u1',
    organizationId: 'o1',
    moduleName: 'acme',
    name: 'Acme',
    externalId: 'x1',
    credential: {
        id: 'c1',
        authIsValid: false,
        access_token: 'AT',
        refresh_token: 'RT',
        api_key: 'KEY',
        data: { access_token: 'AT' },
    },
    someRepositoryField: 'not public',
};

describe('toPublicEntity', () => {
    it('keeps the credential id and authIsValid, never the credential', () => {
        expect(toPublicEntity(withCredential)).toEqual({
            id: 'e1',
            userId: 'u1',
            organizationId: 'o1',
            moduleName: 'acme',
            name: 'Acme',
            externalId: 'x1',
            credentialId: 'c1',
            authIsValid: false,
        });
    });

    it('accepts a bare credential id, the legacy user field and _id', () => {
        expect(toPublicEntity({ _id: 'e2', user: 'u2', credential: 'c2' })).toMatchObject({
            id: 'e2',
            userId: 'u2',
            credentialId: 'c2',
            authIsValid: null,
        });
        expect(toPublicEntity({ id: 'e3', credentialId: 'c3' }).credentialId).toBe('c3');
    });

    it('passes entity ids through and drops nothing from a list', () => {
        expect(toPublicEntity('e4')).toBe('e4');
        expect(toPublicEntity(null)).toBeNull();
        expect(toPublicEntities(['e5', withCredential])).toEqual(['e5', expect.objectContaining({ id: 'e1' })]);
        expect(toPublicEntities(undefined)).toEqual([]);
        expect(JSON.stringify(toPublicEntities([withCredential]))).not.toMatch(/AT|RT|KEY/);
    });
});
