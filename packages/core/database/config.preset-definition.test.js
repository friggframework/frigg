/**
 * getDatabaseType() with a definition preset by setAppDefinition() — the
 * provider-netlify function preamble. On Netlify process.cwd() is the
 * function root, so discovery must not be needed.
 */
jest.mock('../utils', () => ({
    findNearestBackendPackageJson: jest.fn(() => null),
}));

const { findNearestBackendPackageJson } = require('../utils');
const { getDatabaseType } = require('./config');
const { setAppDefinition } = require('../handlers/app-definition-loader');

describe('getDatabaseType with a preset app definition', () => {
    const savedDbType = process.env.DB_TYPE;

    beforeEach(() => {
        delete process.env.DB_TYPE;
        findNearestBackendPackageJson.mockClear();
    });

    afterEach(() => {
        setAppDefinition(null);
        if (savedDbType === undefined) delete process.env.DB_TYPE;
        else process.env.DB_TYPE = savedDbType;
    });

    it.each([
        [{ postgres: { enable: true } }, 'postgresql'],
        [{ mongoDB: { enable: true } }, 'mongodb'],
        [{ documentDB: { enable: true } }, 'documentdb'],
    ])('reads %j from the preset definition without discovery', (database, expected) => {
        setAppDefinition({ integrations: [], database });

        expect(getDatabaseType()).toBe(expected);
        expect(findNearestBackendPackageJson).not.toHaveBeenCalled();
    });

    it('still lets DB_TYPE win over the preset', () => {
        process.env.DB_TYPE = 'mongodb';
        setAppDefinition({ integrations: [], database: { postgres: { enable: true } } });

        expect(getDatabaseType()).toBe('mongodb');
    });

    it('fails with the usual message when the preset has no database block', () => {
        setAppDefinition({ integrations: [] });

        expect(() => getDatabaseType()).toThrow(/missing database configuration/);
    });

    it('falls back to discovery without a preset', () => {
        expect(() => getDatabaseType()).toThrow(/Cannot find backend package.json/);
        expect(findNearestBackendPackageJson).toHaveBeenCalled();
    });
});
