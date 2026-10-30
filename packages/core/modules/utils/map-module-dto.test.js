const { mapModuleClassToModuleDTO } = require('./map-module-dto');

function moduleInstance(credential) {
    return {
        entity: { id: '100' },
        name: 'Entity One',
        userId: '7',
        credential,
        getName: () => 'some-module',
    };
}

describe('mapModuleClassToModuleDTO credentialId', () => {
    it('returns the id of the decrypted credential', () => {
        const dto = mapModuleClassToModuleDTO(
            moduleInstance({ id: '42', data: { access_token: 'secret' } })
        );

        expect(dto.credentialId).toBe('42');
    });

    it('returns a numeric credential id as a string', () => {
        const dto = mapModuleClassToModuleDTO(moduleInstance({ id: 42 }));

        expect(dto.credentialId).toBe('42');
    });

    it('returns null when the module has no credential', () => {
        const dto = mapModuleClassToModuleDTO(moduleInstance(null));

        expect(dto.credentialId).toBeNull();
    });
});
