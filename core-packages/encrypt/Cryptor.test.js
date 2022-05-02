const { Cryptor } = require('./Cryptor');

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

    describe('Keys', () => {
        it('raises error on missing environment', () => {
            const cryptor = new Cryptor({ fields: ['a.b.c.d', 'e'] });
            expect(cryptor.getKeyFromEnvironment).toThrow(
                'No encryption key found with ID "undefined"'
            );
        });
    });
});
