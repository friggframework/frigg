jest.mock('../database/prisma', () => ({ prisma: {} }));

const { MappingAlreadyExistsError } = require('./mapping-already-exists-error');
const { BaseError } = require('./base-error');
const errors = require('./index');

describe('MappingAlreadyExistsError', () => {
    it('extends BaseError and carries the conflicting key', () => {
        const error = new MappingAlreadyExistsError('int-1', 'claim:hs:42');

        expect(error).toBeInstanceOf(BaseError);
        expect(error.name).toBe('MappingAlreadyExistsError');
        expect(error.integrationId).toBe('int-1');
        expect(error.sourceId).toBe('claim:hs:42');
        expect(error.message).toContain('claim:hs:42');
    });

    it('is exported from the errors index and the package index', () => {
        expect(errors.MappingAlreadyExistsError).toBe(MappingAlreadyExistsError);
        expect(require('../index').MappingAlreadyExistsError).toBe(
            MappingAlreadyExistsError
        );
    });
});
