const { parseListFilters } = require('./request');

describe('parseListFilters (ADR-056 §3.4)', () => {
    it('parses ?scope and ?owner', () => {
        expect(parseListFilters({})).toEqual({ scope: undefined, owner: undefined });
        expect(parseListFilters({ scope: 'individual', owner: 'org' })).toEqual({
            scope: 'individual',
            owner: 'org',
        });
        expect(parseListFilters({ scope: '', owner: '' })).toEqual({ scope: undefined, owner: undefined });
    });

    it.each([[{ scope: 'global' }], [{ scope: 'team' }], [{ owner: 'everyone' }], [{ scope: ['a', 'b'] }], [{ owner: 'constructor' }]])(
        'rejects %j with 400',
        (query) => {
            expect.assertions(1);
            try {
                parseListFilters(query);
            } catch (error) {
                expect(error.output.statusCode).toBe(400);
            }
        }
    );
});
