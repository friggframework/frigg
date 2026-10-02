/**
 * SQL-generation tests for ProcessRepositoryPostgres.applyProcessUpdate.
 *
 * Postgres's atomicity for `UPDATE "Process" SET ... WHERE id = ...
 * RETURNING *` is a documented server-level guarantee — not something
 * we need to re-prove per test run. What we DO need to guarantee is
 * that the SQL we emit is well-formed under every combination of op
 * kinds, that `jsonb_set` intermediate-path synthesis is in place for
 * deep paths, and that `jsonb_agg` uses an explicit `ORDER BY idx` so
 * `pushSlice` preserves insertion order reliably across Postgres
 * versions.
 *
 * These tests stub `prisma.$queryRawUnsafe` to capture the SQL string
 * and bound parameters, then assert on the captured output.
 */

const {
    ProcessRepositoryPostgres,
} = require('./process-repository-postgres');

function makeRepo() {
    const repo = new ProcessRepositoryPostgres();
    const captured = [];
    repo.prisma = {
        $queryRawUnsafe: jest.fn(async (sql, ...params) => {
            captured.push({ sql, params });
            return [
                {
                    id: 1,
                    userId: 1,
                    integrationId: 1,
                    name: 'p',
                    type: 'T',
                    state: 'X',
                    context: {},
                    results: {},
                    childProcesses: [],
                    parentProcessId: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];
        }),
    };
    return { repo, captured };
}

describe('ProcessRepositoryPostgres.applyProcessUpdate SQL generation', () => {
    it('emits UPDATE ... SET state = $n when only newState is provided', async () => {
        const { repo, captured } = makeRepo();
        await repo.applyProcessUpdate('7', { newState: 'COMPLETED' });

        expect(captured).toHaveLength(1);
        const { sql, params } = captured[0];
        expect(sql).toMatch(/UPDATE "Process"/);
        expect(sql).toMatch(/"state" = \$1/);
        expect(sql).toMatch(/"updatedAt" = NOW\(\)/);
        expect(sql).toMatch(/WHERE "id" = \$2/);
        expect(sql).toMatch(/RETURNING \*/);
        expect(params).toEqual(['COMPLETED', 7]);
    });

    it('emits a single jsonb_set wrap for a depth-1 increment', async () => {
        const { repo, captured } = makeRepo();
        await repo.applyProcessUpdate('1', {
            increment: { 'context.processedRecords': 1 },
        });

        const { sql } = captured[0];
        expect(sql).toMatch(/"context" = jsonb_set\(/);
        // Depth-1 doesn't need intermediate-path synthesis — only ONE
        // jsonb_set call wraps the column seed.
        const setCount = (sql.match(/jsonb_set\(/g) || []).length;
        expect(setCount).toBe(1);
    });

    it('synthesizes a missing intermediate for a 2-segment set', async () => {
        const { repo, captured } = makeRepo();
        await repo.applyProcessUpdate('1', {
            set: { 'context.pagination.cursor': 'abc' },
        });

        const { sql } = captured[0];
        // ensureParents chains 1 wrap for {pagination} + 1 wrap for the
        // {pagination,cursor} leaf = 2 jsonb_set calls total.
        const setCount = (sql.match(/jsonb_set\(/g) || []).length;
        expect(setCount).toBe(2);
        // The intermediate carries COALESCE(... #> '{pagination}', '{}'::jsonb)
        // so an existing pagination object is preserved.
        expect(sql).toMatch(/COALESCE\(.*#>\s*'\{pagination\}',\s*'\{\}'::jsonb\)/);
    });

    it('synthesizes all intermediates for a 3-segment set', async () => {
        const { repo, captured } = makeRepo();
        await repo.applyProcessUpdate('1', {
            set: { 'context.a.b.c': 1 },
        });

        const { sql } = captured[0];
        // ensureParents string-substitution: i=1 yields 1 jsonb_set;
        // i=2 references the i=1 `cur` twice (once for target, once
        // inside COALESCE for the read) + 1 new wrap = 3; wrapSet adds
        // 1 more outer wrap = 4 jsonb_set calls. This is a string-
        // duplication artifact, not a runtime duplication — Postgres
        // still executes the whole expression as one UPDATE under a
        // single row lock. If paths go deeper than ~5 segments the
        // generated SQL size becomes impractical; validateOps should
        // cap it in that case (currently no cap; none of our callers
        // go beyond depth 3).
        const setCount = (sql.match(/jsonb_set\(/g) || []).length;
        expect(setCount).toBe(4);
        expect(sql).toMatch(/'\{a\}'/);
        expect(sql).toMatch(/'\{a,b\}'/);
        expect(sql).toMatch(/'\{a,b,c\}'/);
    });

    it('pushSlice uses explicit ORDER BY idx inside jsonb_agg so insertion order is deterministic', async () => {
        const { repo, captured } = makeRepo();
        await repo.applyProcessUpdate('1', {
            pushSlice: {
                'results.aggregateData.errors': {
                    values: [{ e: 1 }, { e: 2 }],
                    keepLast: 100,
                },
            },
        });

        const { sql } = captured[0];
        expect(sql).toMatch(/jsonb_agg\(elem\s+ORDER BY idx\)/);
        // The CTE binds the new-array expression once (vs. three times
        // if inlined), so we should see exactly one `|| $n::jsonb` concat.
        const concatCount = (sql.match(/\|\|\s*\$\d+::jsonb/g) || []).length;
        expect(concatCount).toBe(1);
    });

    it('binds parameters in stable left-to-right order', async () => {
        const { repo, captured } = makeRepo();
        await repo.applyProcessUpdate('42', {
            increment: {
                'context.processedRecords': 3,
                'results.aggregateData.totalSynced': 5,
            },
            set: { 'context.fetchDone': true },
            newState: 'PROCESSING_BATCHES',
        });

        const { params } = captured[0];
        // Params emitted in this order: increments (context then results),
        // then set, then newState, then id.
        expect(params).toEqual([3, 5, 'true', 'PROCESSING_BATCHES', 42]);
    });

    it('combines increment, set, and pushSlice on both columns in one UPDATE', async () => {
        const { repo, captured } = makeRepo();
        await repo.applyProcessUpdate('1', {
            increment: {
                'context.processedRecords': 1,
                'results.aggregateData.totalSynced': 1,
            },
            set: { 'context.fetchDone': true },
            pushSlice: {
                'results.aggregateData.errors': {
                    values: [{ e: 'x' }],
                    keepLast: 10,
                },
            },
            newState: 'PROCESSING_BATCHES',
        });

        const { sql } = captured[0];
        // Exactly one UPDATE statement, one SET clause per touched column,
        // one for state, one for updatedAt.
        expect((sql.match(/UPDATE "Process"/g) || []).length).toBe(1);
        expect(sql).toMatch(/"context" =/);
        expect(sql).toMatch(/"results" =/);
        expect(sql).toMatch(/"state" =/);
        expect(sql).toMatch(/"updatedAt" = NOW\(\)/);
    });

    it('returns null when UPDATE returns no rows (process does not exist)', async () => {
        const repo = new ProcessRepositoryPostgres();
        repo.prisma = { $queryRawUnsafe: jest.fn(async () => []) };

        const result = await repo.applyProcessUpdate('999', {
            newState: 'COMPLETED',
        });
        expect(result).toBeNull();
    });

    it('rejects invalid paths before hitting the DB', async () => {
        const { repo, captured } = makeRepo();
        await expect(
            repo.applyProcessUpdate('1', {
                set: { 'bad.root.path': 'x' },
            })
        ).rejects.toThrow('invalid path');
        expect(captured).toHaveLength(0);
    });

    it('does NOT synthesize intermediates for a depth-1 path (no wasted jsonb_set)', async () => {
        const { repo, captured } = makeRepo();
        await repo.applyProcessUpdate('1', {
            set: { 'context.fetchDone': true },
        });

        const { sql } = captured[0];
        const setCount = (sql.match(/jsonb_set\(/g) || []).length;
        expect(setCount).toBe(1);
    });
});
