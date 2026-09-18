const {
    tallyActiveCredentialsByType,
    UNKNOWN_TYPE,
} = require('./credential-active-type');

describe('tallyActiveCredentialsByType', () => {
    it('counts credentials grouped by their related Entity.moduleName', () => {
        const result = tallyActiveCredentialsByType([
            { entities: [{ moduleName: 'hubspot' }] },
            { entities: [{ moduleName: 'hubspot' }] },
            { entities: [{ moduleName: 'salesforce' }] },
        ]);

        expect(result).toEqual([
            { integrationType: 'hubspot', count: 2 },
            { integrationType: 'salesforce', count: 1 },
        ]);
    });

    it('counts a credential once per DISTINCT module (no double-count within a module)', () => {
        const result = tallyActiveCredentialsByType([
            {
                entities: [
                    { moduleName: 'hubspot' },
                    { moduleName: 'hubspot' },
                    { moduleName: 'slack' },
                ],
            },
        ]);

        expect(result).toEqual([
            { integrationType: 'hubspot', count: 1 },
            { integrationType: 'slack', count: 1 },
        ]);
    });

    it('buckets credentials with no linked module under UNKNOWN_TYPE', () => {
        const result = tallyActiveCredentialsByType([
            { entities: [] },
            { entities: [{ moduleName: null }] },
            {},
        ]);

        expect(result).toEqual([{ integrationType: UNKNOWN_TYPE, count: 3 }]);
    });

    it('returns an empty array for no credentials', () => {
        expect(tallyActiveCredentialsByType([])).toEqual([]);
        expect(tallyActiveCredentialsByType()).toEqual([]);
    });
});
