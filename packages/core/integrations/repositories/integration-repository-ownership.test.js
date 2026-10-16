/**
 * Request-shape tests for the organization column (ADR-056 §3.6): what each
 * integration adapter asks its database for and what it writes.
 */
jest.mock('../../database/prisma', () => ({ prisma: { $runCommandRaw: jest.fn() } }));

const { IntegrationRepositoryPostgres } = require('./integration-repository-postgres');
const { IntegrationRepositoryMongo } = require('./integration-repository-mongo');
const { IntegrationRepositoryDocumentDB } = require('./integration-repository-documentdb');
const { ObjectId } = require('bson');

const clauses = [
    { userId: '7', organizationId: '17' },
    { userId: '17', organizationId: '17' },
    { userId: '7', organizationId: null },
];

describe('IntegrationRepositoryPostgres', () => {
    const make = (rows = []) => {
        const repo = new IntegrationRepositoryPostgres();
        repo.prisma = {
            integration: {
                findMany: jest.fn().mockResolvedValue(rows),
                create: jest.fn(async ({ data }) => ({
                    id: 3,
                    userId: 7,
                    organizationId: data.organizationId,
                    config: data.config,
                    entities: [],
                })),
            },
        };
        return repo;
    };

    it('findIntegrationsByOwnership is one query: an OR of owner/organization pairs', async () => {
        const repo = make([
            { id: 1, userId: 7, organizationId: 17, config: { type: 't' }, entities: [{ id: 5 }], status: 'ENABLED' },
        ]);
        const found = await repo.findIntegrationsByOwnership(clauses);
        expect(repo.prisma.integration.findMany).toHaveBeenCalledTimes(1);
        expect(repo.prisma.integration.findMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    { userId: 7, organizationId: 17 },
                    { userId: 17, organizationId: 17 },
                    { userId: 7, organizationId: null },
                ],
            },
            include: { entities: true },
        });
        expect(found[0]).toMatchObject({ id: '1', userId: '7', organizationId: '17', entitiesIds: ['5'] });
    });

    it('asks for nothing when there are no clauses', async () => {
        const repo = make();
        expect(await repo.findIntegrationsByOwnership([])).toEqual([]);
        expect(repo.prisma.integration.findMany).not.toHaveBeenCalled();
    });

    it('createIntegration stores the organization it is created in', async () => {
        const repo = make();
        const created = await repo.createIntegration(['5'], '7', { type: 't' }, { organizationId: '17' });
        expect(repo.prisma.integration.create.mock.calls[0][0].data.organizationId).toBe(17);
        expect(created.organizationId).toBe('17');
    });

    it('createIntegration with no tenancy stores no organization', async () => {
        const repo = make();
        await repo.createIntegration(['5'], '7', { type: 't' });
        expect(repo.prisma.integration.create.mock.calls[0][0].data.organizationId).toBeNull();
    });
});

describe('IntegrationRepositoryMongo', () => {
    const make = () => {
        const repo = new IntegrationRepositoryMongo();
        repo.prisma = {
            integration: {
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn(async ({ data }) => ({ id: 'i', ...data, entities: [] })),
            },
        };
        return repo;
    };

    it('matches a null organization as null OR unset: rows written before the column have no field', async () => {
        const repo = make();
        await repo.findIntegrationsByOwnership(clauses);
        expect(repo.prisma.integration.findMany).toHaveBeenCalledTimes(1);
        expect(repo.prisma.integration.findMany.mock.calls[0][0].where).toEqual({
            OR: [
                { userId: '7', organizationId: '17' },
                { userId: '17', organizationId: '17' },
                { userId: '7', OR: [{ organizationId: null }, { organizationId: { isSet: false } }] },
            ],
        });
    });

    it('createIntegration stores the organization it is created in', async () => {
        const repo = make();
        await repo.createIntegration(['e'], 'u', { type: 't' }, { organizationId: 'o1' });
        expect(repo.prisma.integration.create.mock.calls[0][0].data.organizationId).toBe('o1');
    });
});

describe('IntegrationRepositoryDocumentDB', () => {
    const make = () => {
        const repo = new IntegrationRepositoryDocumentDB();
        const $runCommandRaw = jest.fn(async (command) =>
            command.insert ? { ok: 1, n: 1 } : { cursor: { firstBatch: [] } }
        );
        repo.prisma = { $runCommandRaw };
        return { repo, $runCommandRaw };
    };
    const u7 = new ObjectId();
    const u17 = new ObjectId();

    it('findIntegrationsByOwnership is one raw find with $or; null matches null or missing', async () => {
        const { repo, $runCommandRaw } = make();
        await repo.findIntegrationsByOwnership([
            { userId: u7.toString(), organizationId: u17.toString() },
            { userId: u7.toString(), organizationId: null },
        ]);
        const finds = $runCommandRaw.mock.calls.map(([c]) => c).filter((c) => c.find === 'Integration');
        expect(finds).toHaveLength(1);
        const { $or } = finds[0].filter;
        expect($or[0].organizationId.toString()).toBe(u17.toString());
        expect($or[1].organizationId).toBeNull();
    });

    it('createIntegration stores the organization it is created in', async () => {
        const { repo, $runCommandRaw } = make();
        await repo.createIntegration([], u7.toString(), { type: 't' }, { organizationId: u17.toString() }).catch(() => {});
        const insert = $runCommandRaw.mock.calls.map(([c]) => c).find((c) => c.insert === 'Integration');
        expect(insert.documents[0].organizationId.toString()).toBe(u17.toString());
    });
});
