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

    describe('generateDataKey()', () => {
        it('raises error on missing environment', () => {
            const cryptor = new Cryptor({ fields: ['a.b.c.d', 'e'] });
            
            // save the env variables for later
            const AES_KEY = process.env.AES_KEY
            const AES_KEY_ID = process.env.AES_KEY_ID
            
            // Fake out the situation where the keys are undefined
            process.env.AES_KEY = undefined
            process.env.AES_KEY_ID = undefined
            expect(cryptor.generateDataKey).toThrow(
                'Environment variables not set for AES_KEY or AES_KEY_ID'
            );

            // reset those env variables
            process.env.AES_KEY = AES_KEY
            process.env.AES_KEY_ID = AES_KEY_ID
        });
    });
});
