/**
 * Request-shape tests for the organization column (ADR-056 §3.6): what each
 * adapter asks its database for. A mocked return value cannot tell a query
 * that filters by organization from one that does not, so these assert on the
 * query the adapter sends.
 */
jest.mock('../../../database/prisma', () => ({ prisma: { $runCommandRaw: jest.fn() } }));
jest.mock('../../../database/documentdb-encryption-service');

const { ModuleRepositoryPostgres } = require('../module-repository-postgres');
const { ModuleRepositoryMongo } = require('../module-repository-mongo');
const { ModuleRepositoryDocumentDB } = require('../module-repository-documentdb');
const { ObjectId } = require('bson');

const clauses = [
    { userId: '17', organizationId: '17' },
    { userId: '17', organizationId: null },
    { userId: '7', organizationId: '17' },
];

const prismaFor = (rows = []) => ({
    entity: {
        findMany: jest.fn().mockResolvedValue(rows),
        create: jest.fn(async ({ data }) => ({ id: 1, ...data })),
        findFirst: jest.fn().mockResolvedValue(null),
    },
    credential: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
});

describe('ModuleRepositoryPostgres', () => {
    const make = (rows) => {
        const repo = new ModuleRepositoryPostgres();
        repo.prisma = prismaFor(rows);
        return repo;
    };

    it('findEntitiesByOwnership is one query: an OR of owner/organization pairs, null as null', async () => {
        const repo = make([{ id: 5, userId: 7, organizationId: 17, name: 'n', moduleName: 'm', data: {} }]);
        const found = await repo.findEntitiesByOwnership(clauses);
        expect(repo.prisma.entity.findMany).toHaveBeenCalledTimes(1);
        expect(repo.prisma.entity.findMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    { userId: 17, organizationId: 17 },
                    { userId: 17, organizationId: null },
                    { userId: 7, organizationId: 17 },
                ],
            },
        });
        expect(found[0]).toMatchObject({ id: '5', userId: '7', organizationId: '17' });
    });

    it('asks for nothing when there are no clauses', async () => {
        const repo = make();
        expect(await repo.findEntitiesByOwnership([])).toEqual([]);
        expect(repo.prisma.entity.findMany).not.toHaveBeenCalled();
    });

    it('createEntity stores the organization from the tenancy argument, never from entity data', async () => {
        const repo = make();
        await repo.createEntity(
            { user: '7', name: 'n', moduleName: 'm', externalId: 'x', organizationId: 'provider-org-9' },
            { organizationId: '17' }
        );
        const { data } = repo.prisma.entity.create.mock.calls[0][0];
        expect(data.organizationId).toBe(17);
        // A provider field with the same name stays provider data.
        expect(data.data).toEqual({ organizationId: 'provider-org-9' });
    });

    it('createEntity with no tenancy stores no organization', async () => {
        const repo = make();
        await repo.createEntity({ user: '7', moduleName: 'm' });
        expect(repo.prisma.entity.create.mock.calls[0][0].data.organizationId).toBeNull();
    });

    it('returns the framework organizationId even when provider data carries one', async () => {
        const repo = make([
            { id: 5, userId: 7, organizationId: 17, moduleName: 'm', data: { organizationId: 'provider-org-9' } },
        ]);
        const [entity] = await repo.findEntitiesByOwnership(clauses);
        expect(entity.organizationId).toBe('17');
    });

    it('filters findEntities by organization; null means none, absent means any', async () => {
        const repo = make();
        await repo.findEntities({ user: '7', organizationId: null });
        expect(repo.prisma.entity.findMany).toHaveBeenLastCalledWith({
            where: { userId: 7, organizationId: null },
        });
        await repo.findEntities({ user: '7', organizationId: '17' });
        expect(repo.prisma.entity.findMany).toHaveBeenLastCalledWith({
            where: { userId: 7, organizationId: 17 },
        });
        await repo.findEntities({ user: '7' });
        expect(repo.prisma.entity.findMany).toHaveBeenLastCalledWith({ where: { userId: 7 } });
    });
});

describe('ModuleRepositoryMongo', () => {
    const make = (rows) => {
        const repo = new ModuleRepositoryMongo();
        repo.prisma = prismaFor(rows);
        return repo;
    };
    const unset = (userId) => ({
        userId,
        OR: [{ organizationId: null }, { organizationId: { isSet: false } }],
    });

    it('matches a null organization as null OR unset: rows written before the column have no field', async () => {
        const repo = make();
        await repo.findEntitiesByOwnership(clauses);
        expect(repo.prisma.entity.findMany).toHaveBeenCalledTimes(1);
        expect(repo.prisma.entity.findMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    { userId: '17', organizationId: '17' },
                    unset('17'),
                    { userId: '7', organizationId: '17' },
                ],
            },
        });
    });

    it('createEntity stores the organization from the tenancy argument only', async () => {
        const repo = make();
        await repo.createEntity({ user: 'u', moduleName: 'm', organizationId: 'provider' }, { organizationId: 'o1' });
        const { data } = repo.prisma.entity.create.mock.calls[0][0];
        expect(data.organizationId).toBe('o1');
        expect(data.data).toEqual({ organizationId: 'provider' });
    });

    it('filters findEntities for no organization as null OR unset', async () => {
        const repo = make();
        await repo.findEntities({ user: 'u', organizationId: null });
        expect(repo.prisma.entity.findMany).toHaveBeenCalledWith({
            where: { userId: 'u', OR: [{ organizationId: null }, { organizationId: { isSet: false } }] },
        });
    });
});

describe('ModuleRepositoryDocumentDB', () => {
    const ids = { u17: new ObjectId(), u7: new ObjectId() };
    const make = () => {
        const repo = new ModuleRepositoryDocumentDB();
        const $runCommandRaw = jest.fn(async (command) => {
            if (command.find) return { cursor: { firstBatch: [] } };
            if (command.insert) return { ok: 1, n: 1 };
            return { cursor: { firstBatch: [] } };
        });
        repo.prisma = { $runCommandRaw };
        return { repo, $runCommandRaw };
    };

    it('findEntitiesByOwnership is one raw find with $or of owner/organization pairs', async () => {
        const { repo, $runCommandRaw } = make();
        await repo.findEntitiesByOwnership([
            { userId: ids.u17.toString(), organizationId: ids.u17.toString() },
            { userId: ids.u17.toString(), organizationId: null },
            { userId: ids.u7.toString(), organizationId: ids.u17.toString() },
        ]);
        const finds = $runCommandRaw.mock.calls.map(([c]) => c).filter((c) => c.find === 'Entity');
        expect(finds).toHaveLength(1);
        const { $or } = finds[0].filter;
        expect($or).toHaveLength(3);
        expect($or[0].userId.toString()).toBe(ids.u17.toString());
        expect($or[0].organizationId.toString()).toBe(ids.u17.toString());
        // A raw `{ field: null }` matches a null value and a missing field.
        expect($or[1].organizationId).toBeNull();
        expect($or[2].userId.toString()).toBe(ids.u7.toString());
    });

    it('stores the organization on insert from the tenancy argument only', async () => {
        const { repo, $runCommandRaw } = make();
        await repo.createEntity({ user: ids.u7.toString(), moduleName: 'm', organizationId: 'provider' }, {
            organizationId: ids.u17.toString(),
        });
        const insert = $runCommandRaw.mock.calls.map(([c]) => c).find((c) => c.insert === 'Entity');
        const [doc] = insert.documents;
        expect(doc.organizationId.toString()).toBe(ids.u17.toString());
        expect(doc.data).toEqual({ organizationId: 'provider' });
    });
});
