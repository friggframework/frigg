const { maskCredential, maskValue, toEntityDto } = require('./dto');

describe('v2 DTOs', () => {
    it('masks every provider field of a credential', () => {
        const dto = maskCredential({
            id: 12,
            userId: 3,
            externalId: 'acct-1',
            authIsValid: true,
            type: 'acme',
            entityIds: ['4'],
            createdAt: new Date('2026-10-01T00:00:00Z'),
            updatedAt: '2026-10-02T00:00:00.000Z',
            access_token: 'ya29.a0AfH6SMBx-very-long-token-value-WXYZ',
            refresh_token: 'short',
            api_key: 'sk_live_0123456789abcdef',
            nested: { secret: 'x' },
            expires_at: 1790000000,
        });
        expect(dto).toEqual({
            id: '12',
            type: 'acme',
            externalId: 'acct-1',
            userId: '3',
            authIsValid: true,
            entityIds: ['4'],
            entityCount: 1,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-02T00:00:00.000Z',
            data: {
                access_token: '****WXYZ',
                refresh_token: '****',
                api_key: '****cdef',
                nested: '****',
                expires_at: 1790000000,
            },
        });
        const json = JSON.stringify(dto);
        expect(json).not.toContain('ya29');
        expect(json).not.toContain('sk_live');
        expect(json).not.toContain('short');
    });

    it('masks values whatever their type', () => {
        expect(maskValue(['a'])).toBe('****');
        expect(maskValue(false)).toBe(false);
        expect(maskValue(null)).toBeNull();
    });

    it('never puts credential fields on an entity', () => {
        const dto = toEntityDto({
            id: 1,
            userId: 2,
            moduleName: 'acme',
            credential: { id: 5, access_token: 'secret-token', authIsValid: false },
        });
        expect(dto).toEqual({
            id: '1',
            type: 'acme',
            name: null,
            externalId: null,
            credentialId: '5',
            userId: '2',
            authIsValid: false,
        });
    });
});
