/**
 * The paged read the trigger tick uses (ADR-055 §3: "This needs a paged repository read"):
 * findIntegrations({ type, status, limit, after }) against real databases, through every adapter, and a tick run
 * over it end to end.
 *
 * Skipped unless a database URL is set (the integration definitions persistence convention):
 * - INTEGRATION_DEFINITIONS_POSTGRES_URL  a PostgreSQL database migrated with prisma-postgresql/migrations
 * - INTEGRATION_DEFINITIONS_MONGO_URL     a MongoDB replica set with prisma-mongodb pushed (also runs the DocumentDB adapter)
 */
jest.mock('../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: () => 'mongodb', PRISMA_LOG_LEVEL: 'error,warn' }));

const { IntegrationRepositoryPostgres } = require('./integration-repository-postgres');
const { IntegrationRepositoryMongo } = require('./integration-repository-mongo');
const { IntegrationRepositoryDocumentDB } = require('./integration-repository-documentdb');
const { RunTriggerTick } = require('../use-cases/run-trigger-tick');

const LEGS = [
    ['postgresql', process.env.INTEGRATION_DEFINITIONS_POSTGRES_URL, () => require('../../generated/prisma-postgresql'), IntegrationRepositoryPostgres],
    ['mongodb', process.env.INTEGRATION_DEFINITIONS_MONGO_URL, () => require('../../generated/prisma-mongodb'), IntegrationRepositoryMongo],
    ['documentdb (on mongodb)', process.env.INTEGRATION_DEFINITIONS_MONGO_URL, () => require('../../generated/prisma-mongodb'), IntegrationRepositoryDocumentDB],
].filter(([, url]) => url);

const describeLegs = LEGS.length ? describe.each(LEGS) : describe.skip.each([['no database URL set', null]]);

describeLegs('findIntegrations paging on %s', (_, url, loadClient, Repo) => {
    // A type of its own: other suites share the database.
    const type = `paging-${process.pid}-${Date.now()}`;
    let client, repo, ids, created;

    beforeAll(async () => {
        const { PrismaClient } = loadClient();
        client = new PrismaClient({ datasourceUrl: url });
        repo = new Repo();
        repo.prisma = client;
        ids = [];
        created = [];
        for (let i = 0; i < 12; i += 1) {
            const row = await client.integration.create({ data: { config: { type, n: i }, status: i % 4 === 3 ? 'DISABLED' : 'ENABLED' } });
            created.push(row.id);
            if (i % 4 !== 3) ids.push(String(row.id));
        }
        // Rewrite the first row, so storage order (PostgreSQL appends the new tuple) is no longer id order.
        await client.integration.update({ where: { id: created[0] }, data: { config: { type, n: 0, touched: true } } });
    });
    afterAll(async () => {
        if (created?.length) await client.integration.deleteMany({ where: { id: { in: created } } });
        await client?.$disconnect();
    });

    it('returns every ENABLED row of the type exactly once, in id order, a page at a time', async () => {
        const seen = [];
        let after;
        const sizes = [];
        for (;;) {
            const page = await repo.findIntegrations({ type, status: 'ENABLED', limit: 4, after });
            sizes.push(page.length);
            seen.push(...page.map((r) => String(r.id)));
            if (page.length < 4) break;
            after = page[page.length - 1].id;
        }
        expect(sizes).toEqual([4, 4, 1]);
        expect(seen).toEqual(ids);
    });

    it('a page holds all of its rows, past the 101 a MongoDB first batch returns by default', async () => {
        const bulkType = `${type}-bulk`;
        await client.integration.createMany({ data: Array.from({ length: 110 }, (_, n) => ({ config: { type: bulkType, n }, status: 'ENABLED' })) });
        try {
            const first = await repo.findIntegrations({ type: bulkType, status: 'ENABLED', limit: 105 });
            expect(first).toHaveLength(105);
            const rest = await repo.findIntegrations({ type: bulkType, status: 'ENABLED', limit: 105, after: first[104].id });
            expect(rest).toHaveLength(5);
        } finally {
            const rows = await repo.findIntegrations({ type: bulkType });
            await client.integration.deleteMany({ where: { id: { in: rows.map((r) => (typeof created[0] === 'number' ? Number(r.id) : r.id)) } } });
        }
    });

    it('without limit it still returns everything (the existing callers)', async () => {
        expect((await repo.findIntegrations({ type, status: 'ENABLED' })).map((r) => String(r.id)).sort()).toEqual([...ids].sort());
    });

    it('a tick over the real read queues one run per ENABLED installation', async () => {
        class Poller { static Definition = { name: type, triggers: { poll: { every: '5m', handler: 'poll' } } }; static async triggersFor() { return [{ name: 'poll', ...Poller.Definition.triggers.poll }]; } }
        const sent = [];
        const queue = { batchSend: async (entries) => { sent.push(...entries); }, send: async () => {} };
        const out = await new RunTriggerTick({ integrationClass: Poller, integrationRepository: repo, queue, queueUrl: 'q', pageSize: 4 })
            .execute({ tick: '5m', time: '2026-10-19T12:00:00Z' });
        expect(out).toMatchObject({ installations: 9, pages: 3, failed: [] });
        expect(sent.map((m) => String(m.data.integrationId))).toEqual(ids);
    });
});

describe('findIntegrations paging: the query each Prisma adapter sends', () => {
    // Storage order usually equals id order in a test database, so ordering is pinned on the request itself.
    const capture = (Repo, extra = {}) => {
        const repo = new Repo();
        const calls = [];
        repo.prisma = { integration: { findMany: async (args) => { calls.push(args); return []; }, findRaw: async () => [{ _id: { $oid: '6ad687411d7fe3ac5a4702a8' } }], ...extra } };
        return { repo, calls };
    };

    it.each([['postgresql', IntegrationRepositoryPostgres, '7', 7], ['mongodb', IntegrationRepositoryMongo, '6ad687411d7fe3ac5a4702a7', '6ad687411d7fe3ac5a4702a7']])('%s: a limited read orders by id, takes the limit and starts after the cursor', async (_, Repo, after, expectedAfter) => {
        const { repo, calls } = capture(Repo);
        await repo.findIntegrations({ type: 't', status: 'ENABLED', limit: 500, after });
        expect(calls[0]).toMatchObject({ orderBy: { id: 'asc' }, take: 500 });
        if (Repo === IntegrationRepositoryPostgres) expect(calls[0].where.id).toEqual({ gt: expectedAfter });
        await repo.findIntegrations({ status: 'ENABLED' });
        expect(calls[1].orderBy).toBeUndefined();
        expect(calls[1].take).toBeUndefined();
    });
});
