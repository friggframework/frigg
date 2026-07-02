/**
 * SQL-generation tests for IntegrationRepositoryPostgres.patchIntegrationConfig.
 *
 * The write itself must be a single atomic UPDATE that merges the patch
 * into the existing jsonb config server-side (`config || $1::jsonb`) — no
 * JS-side read-modify-write. A follow-up read via findIntegrationById
 * shapes the return value (it needs the `entities` relation, which raw SQL
 * can't express), but that read must never happen BEFORE the write.
 */

const {
    IntegrationRepositoryPostgres,
} = require('./integration-repository-postgres');

function makeRepo({ affectedCount = 1 } = {}) {
    const repo = new IntegrationRepositoryPostgres();
    const calls = [];
    repo.prisma = {
        $executeRawUnsafe: jest.fn(async (sql, ...params) => {
            calls.push({ op: 'executeRaw', sql, params });
            return affectedCount;
        }),
        integration: {
            findUnique: jest.fn(async () => {
                calls.push({ op: 'findUnique' });
                return {
                    id: 7,
                    userId: 1,
                    config: { type: 'attio', attioWebhookId: 'wh_1' },
                    version: '0.0.0',
                    status: 'ENABLED',
                    messages: {},
                    entities: [{ id: 62 }],
                };
            }),
        },
    };
    return { repo, calls };
}

describe('IntegrationRepositoryPostgres.patchIntegrationConfig', () => {
    it('emits a single UPDATE that merges config via jsonb || with no read before the write', async () => {
        const { repo, calls } = makeRepo();

        await repo.patchIntegrationConfig('7', { attioWebhookId: 'wh_1' });

        const rawCalls = calls.filter((c) => c.op === 'executeRaw');
        expect(rawCalls).toHaveLength(1);
        const opOrder = calls.map((c) => c.op);
        expect(opOrder).toEqual(['executeRaw', 'findUnique']);
    });

    it('SQL merges config via jsonb concatenation and stamps updatedAt', async () => {
        const { repo, calls } = makeRepo();

        await repo.patchIntegrationConfig('7', { attioWebhookId: 'wh_1' });

        const { sql } = calls[0];
        expect(sql).toMatch(/UPDATE "Integration"/);
        expect(sql).toMatch(
            /"config" = COALESCE\("config", '\{\}'::jsonb\) \|\| \$1::jsonb/
        );
        expect(sql).toMatch(/"updatedAt" = NOW\(\)/);
        expect(sql).toMatch(/WHERE "id" = \$2/);
    });

    it('binds the patch as a JSON string with the integer id', async () => {
        const { repo, calls } = makeRepo();

        await repo.patchIntegrationConfig('7', { attioWebhookId: 'wh_1' });

        const { params } = calls[0];
        expect(params).toEqual([JSON.stringify({ attioWebhookId: 'wh_1' }), 7]);
    });

    it('throws before emitting SQL when the patch is invalid', async () => {
        const { repo, calls } = makeRepo();

        await expect(
            repo.patchIntegrationConfig('7', { attioWebhookId: null })
        ).rejects.toThrow('cannot be null or undefined');
        expect(calls).toHaveLength(0);
    });

    it('throws when no row was updated and does not attempt a follow-up read', async () => {
        const { repo, calls } = makeRepo({ affectedCount: 0 });

        await expect(
            repo.patchIntegrationConfig('7', { attioWebhookId: 'wh_1' })
        ).rejects.toThrow('Integration with id 7 not found');
        expect(calls.map((c) => c.op)).toEqual(['executeRaw']);
    });

    it('returns the standard mapped integration shape after the write', async () => {
        const { repo } = makeRepo();

        const result = await repo.patchIntegrationConfig('7', {
            attioWebhookId: 'wh_1',
        });

        expect(result).toEqual({
            id: '7',
            entitiesIds: ['62'],
            userId: '1',
            config: { type: 'attio', attioWebhookId: 'wh_1' },
            version: '0.0.0',
            status: 'ENABLED',
            messages: {},
        });
    });
});
