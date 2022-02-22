const { Cryptor } = require('./cryptor');

describe('Cryptor', () => {
    describe('Permutations', () => {
        it('calculates permutations correctly', async () => {
            // Given a nested field, we want all possible paths that could access it.
            const cryptor = new Cryptor({ fields: ['a.b.c.d', 'e'] });
            expect(cryptor.permutationsByField).toEqual({
                'a.b.c.d': [
                    ['a', 'b', 'c', 'd'],
                    ['a', 'b', 'c.d'],
                    ['a', 'b.c', 'd'],
                    ['a', 'b.c.d'],
                    ['a.b', 'c', 'd'],
                    ['a.b', 'c.d'],
                    ['a.b.c', 'd'],
                    ['a.b.c.d'],
                ],
                e: [['e']],
            });
        });
    });
});
