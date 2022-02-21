const chai = require('chai');
const Cryptor = require('../../src/utils/encryption/Cryptor');

const { expect } = chai;

describe('Cryptor', async () => {
    describe('Permutations', async () => {
        it('calculates permutations correctly', async () => {
            // Given a nested field, we want all possible paths that could access it.
            const cryptor = new Cryptor({ fields: ['a.b.c.d', 'e'] });
            expect(cryptor.permutationsByField).to.deep.equal({
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
