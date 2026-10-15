const {
    isUniqueViolation,
    DUPLICATE_KEY_CODE,
    PRISMA_UNIQUE_CODE,
} = require('./unique-violation');

describe('isUniqueViolation', () => {
    it('recognises Prisma P2002 and a duplicate-key 11000', () => {
        expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
        expect(isUniqueViolation({ code: 11000 })).toBe(true);
        expect([PRISMA_UNIQUE_CODE, DUPLICATE_KEY_CODE]).toEqual(['P2002', 11000]);
    });

    it.each([
        [{ code: 'P2025' }],
        [{ code: 'P1001' }],
        [{ code: 11001 }],
        [{ code: '11000' }],
        [new Error('E11000 duplicate key error')],
        [new Error('Insert failed - Duplicate key violation')],
        [null],
        [undefined],
        ['P2002'],
    ])('does not match %p (code only, never message text)', (error) => {
        expect(isUniqueViolation(error)).toBe(false);
    });
});

describe('documentdb-utils insertOne duplicate key', () => {
    it('throws an error carrying code 11000, which isUniqueViolation recognises', async () => {
        const { insertOne } = require('./documentdb-utils');
        const client = {
            $runCommandRaw: jest.fn().mockResolvedValue({
                ok: 1,
                n: 0,
                writeErrors: [{ code: 11000, errmsg: 'E11000 dup' }],
            }),
        };

        const error = await insertOne(client, 'User', { a: 1 }).catch((e) => e);

        expect(error.code).toBe(11000);
        expect(error.message).toContain('Duplicate key violation');
        expect(isUniqueViolation(error)).toBe(true);
    });

    it('does not tag other write errors as duplicates', async () => {
        const { insertOne } = require('./documentdb-utils');
        const client = {
            $runCommandRaw: jest.fn().mockResolvedValue({
                ok: 1,
                n: 0,
                writeErrors: [{ code: 121, errmsg: 'validation' }],
            }),
        };

        const error = await insertOne(client, 'User', { a: 1 }).catch((e) => e);

        expect(isUniqueViolation(error)).toBe(false);
    });
});
