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
            repo.patchIntegrationConfig('7', { 'bad.key': 'x' })
        ).rejects.toThrow("cannot contain '.' or start with '$'");
        expect(calls).toHaveLength(0);
    });

    it('binds a null value as JSON null (clears the field)', async () => {
        const { repo, calls } = makeRepo();

        await repo.patchIntegrationConfig('7', { lastBillingErrorAt: null });

        const { params } = calls[0];
        expect(params).toEqual([
            JSON.stringify({ lastBillingErrorAt: null }),
            7,
        ]);
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

const copy = (value) => JSON.parse(JSON.stringify(value));

function makeMessagesRepo(stored = {}) {
    const row = {
        id: 7,
        errors: [],
        warnings: [],
        info: [],
        logs: [],
        ...stored,
    };
    const repo = new IntegrationRepositoryPostgres();
    repo.prisma = {
        integration: {
            findUnique: jest.fn(async () => copy(row)),
            update: jest.fn(async ({ data }) => {
                Object.assign(row, copy(data));
                return copy(row);
            }),
        },
    };
    return { repo, row };
}

describe('IntegrationRepositoryPostgres.updateIntegrationMessages', () => {
    it('appends, so two calls leave two items', async () => {
        const { repo, row } = makeMessagesRepo();

        await repo.updateIntegrationMessages(
            '7',
            'warnings',
            'First',
            'one',
            1000
        );
        await repo.updateIntegrationMessages(
            '7',
            'warnings',
            'Second',
            'two',
            2000
        );

        expect(row.warnings).toEqual([
            { title: 'First', message: 'one', timestamp: 1000 },
            { title: 'Second', message: 'two', timestamp: 2000 },
        ]);
    });

    it('keeps the items that were stored before', async () => {
        const stored = { title: 'Old', message: 'stored', timestamp: 1 };
        const { repo, row } = makeMessagesRepo({ warnings: [stored] });

        await repo.updateIntegrationMessages(
            '7',
            'warnings',
            'New',
            'added',
            2
        );

        expect(row.warnings).toEqual([
            stored,
            { title: 'New', message: 'added', timestamp: 2 },
        ]);
    });

    it('writes only the column of its type', async () => {
        const error = { title: 'Kept', message: 'error', timestamp: 1 };
        const { repo, row } = makeMessagesRepo({ errors: [error] });

        await repo.updateIntegrationMessages(
            '7',
            'warnings',
            'Title',
            'body',
            2
        );

        expect(repo.prisma.integration.update).toHaveBeenCalledWith({
            where: { id: 7 },
            data: {
                warnings: [{ title: 'Title', message: 'body', timestamp: 2 }],
            },
        });
        expect(row.errors).toEqual([error]);
    });

    it('throws when the integration does not exist', async () => {
        const { repo } = makeMessagesRepo();
        repo.prisma.integration.findUnique.mockResolvedValue(null);

        await expect(
            repo.updateIntegrationMessages('7', 'warnings', 'Title', 'body', 2)
        ).rejects.toThrow('Integration 7 not found');
        expect(repo.prisma.integration.update).not.toHaveBeenCalled();
    });

    it('stores an item object with its extra keys', async () => {
        const { repo, row } = makeMessagesRepo();
        const item = {
            title: 'Rate limit reached',
            message: 'It resets at noon.',
            timestamp: 1000,
            code: 'RATE_LIMITED',
            actions: [{ type: 'RETRY_WHEN_READY' }],
        };

        await repo.updateIntegrationMessages('7', 'warnings', item);

        expect(row.warnings).toEqual([item]);
    });

    it('appends an item object after a positional message', async () => {
        const { repo, row } = makeMessagesRepo();
        const item = {
            title: 'Item',
            message: 'object',
            timestamp: 2,
            code: 'X',
        };

        await repo.updateIntegrationMessages(
            '7',
            'warnings',
            'First',
            'one',
            1
        );
        await repo.updateIntegrationMessages('7', 'warnings', item);

        expect(row.warnings).toEqual([
            { title: 'First', message: 'one', timestamp: 1 },
            item,
        ]);
    });
});

describe('IntegrationRepositoryPostgres.findIntegrationMessages', () => {
    const stored = { title: 'Stored', message: 'warning', timestamp: 1 };

    it('returns the stored items of the type', async () => {
        const { repo } = makeMessagesRepo({ warnings: [stored] });

        await expect(
            repo.findIntegrationMessages('7', 'warnings')
        ).resolves.toEqual([stored]);
    });

    it('reads only the column of the type', async () => {
        const { repo } = makeMessagesRepo();

        await repo.findIntegrationMessages('7', 'warnings');

        expect(repo.prisma.integration.findUnique).toHaveBeenCalledWith({
            where: { id: 7 },
            select: { warnings: true },
        });
    });

    it('returns an empty list when the column holds no items', async () => {
        const { repo } = makeMessagesRepo({ warnings: null });

        await expect(
            repo.findIntegrationMessages('7', 'warnings')
        ).resolves.toEqual([]);
    });

    it('throws when the integration does not exist', async () => {
        const { repo } = makeMessagesRepo();
        repo.prisma.integration.findUnique.mockResolvedValue(null);

        await expect(
            repo.findIntegrationMessages('7', 'warnings')
        ).rejects.toThrow('Integration 7 not found');
    });
});
