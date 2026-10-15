/* eslint-disable camelcase -- Prisma names a compound unique key `<a>_<b>` */
jest.mock('../../../database/prisma', () => ({
    prisma: {
        organizationMembership: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
        },
        user: { findFirst: jest.fn() },
    },
}));
jest.mock('../../../database/config', () => ({ DB_TYPE: 'postgresql' }));
jest.mock('../../../database/documentdb-utils', () => ({
    ...jest.requireActual('../../../database/documentdb-utils'),
    findOne: jest.fn(),
    findMany: jest.fn(),
    updateOne: jest.fn(),
}));

const { ObjectId } = require('bson');
const { prisma } = require('../../../database/prisma');
const config = require('../../../database/config');
const documentdbUtils = require('../../../database/documentdb-utils');
const {
    createOrganizationMembershipRepository,
    OrganizationMembershipRepositoryPrisma,
    OrganizationMembershipRepositoryMongo,
    OrganizationMembershipRepositoryPostgres,
    OrganizationMembershipRepositoryDocumentDB,
} = require('../organization-membership-repository-factory');
const {
    OrganizationMembershipRepositoryInterface,
} = require('../organization-membership-repository-interface');

const pair = (i, o) => ({
    individualUserId_organizationUserId: {
        individualUserId: i,
        organizationUserId: o,
    },
});
const created = new Date('2026-10-01T00:00:00Z');
const fs = require('fs');
const path = require('path');

afterEach(() => {
    jest.resetAllMocks();
});

describe('OrganizationMembershipRepositoryInterface', () => {
    it.each([
        'findMembership',
        'addMembership',
        'listMembershipsForOrganization',
    ])('%s must be implemented by a subclass', async (method) => {
        await expect(
            new OrganizationMembershipRepositoryInterface()[method]('1', '2')
        ).rejects.toThrow('must be implemented');
    });
});

describe('createOrganizationMembershipRepository', () => {
    it.each([
        ['postgresql', OrganizationMembershipRepositoryPostgres],
        ['mongodb', OrganizationMembershipRepositoryMongo],
        ['documentdb', OrganizationMembershipRepositoryDocumentDB],
    ])('returns the %s adapter', (dbType, Adapter) => {
        config.DB_TYPE = dbType;
        const repository = createOrganizationMembershipRepository();
        expect(repository.constructor).toBe(Adapter);
        config.DB_TYPE = 'postgresql';
    });

    it('refuses an unsupported database', () => {
        config.DB_TYPE = 'sqlite';
        expect(() => createOrganizationMembershipRepository()).toThrow(
            /Unsupported DB_TYPE: sqlite/
        );
        config.DB_TYPE = 'postgresql';
    });

    it('Mongo and Postgres share one Prisma base class', () => {
        expect(
            OrganizationMembershipRepositoryMongo.prototype instanceof
                OrganizationMembershipRepositoryPrisma
        ).toBe(true);
        expect(
            OrganizationMembershipRepositoryPostgres.prototype instanceof
                OrganizationMembershipRepositoryPrisma
        ).toBe(true);
        expect(() =>
            new OrganizationMembershipRepositoryPrisma()._toDbId('1')
        ).toThrow('must be implemented');
    });
});

// The repository names Prisma's compound-unique key by hand. Derive the name
// Prisma would generate from each schema, so a renamed or reordered
// @@unique fails here instead of at the first real query.
describe('the schemas the repository queries', () => {
    const modelOf = (db) => {
        const schema = fs.readFileSync(
            path.join(__dirname, `../../../prisma-${db}/schema.prisma`),
            'utf8'
        );
        const start = schema.indexOf('model OrganizationMembership {');
        expect(start).toBeGreaterThan(-1);
        return schema.slice(start, schema.indexOf('\n}', start));
    };

    it.each(['mongodb', 'postgresql'])(
        '%s: unique on the pair the repository keys by, with an orgRole defaulting to MEMBER',
        (db) => {
            const model = modelOf(db);
            const unique = model.match(/@@unique\(\[([^\]]+)\]\)/)[1];
            const fields = unique.split(',').map((f) => f.trim());
            expect(fields.join('_')).toBe('individualUserId_organizationUserId');
            expect(model).toMatch(/orgRole\s+String\s+@default\("MEMBER"\)/);
        }
    );

    it('queries by that compound key', async () => {
        const repository = new OrganizationMembershipRepositoryMongo();
        prisma.organizationMembership.findUnique.mockResolvedValue(null);
        await repository.findMembership('a', 'b');
        const { where } = prisma.organizationMembership.findUnique.mock.calls[0][0];
        expect(Object.keys(where)).toEqual(['individualUserId_organizationUserId']);
    });
});

describe.each([
    ['PostgreSQL', OrganizationMembershipRepositoryPostgres, 2018, 2019, '2018', '2019'],
    ['MongoDB', OrganizationMembershipRepositoryMongo, 'a1', 'b2', 'a1', 'b2'],
])('%s membership adapter', (_name, Adapter, dbI, dbO, appI, appO) => {
    let repository;
    beforeEach(() => {
        repository = new Adapter();
    });
    const row = (extra = {}) => ({
        id: dbI === 2018 ? 7 : 'm1',
        individualUserId: dbI,
        organizationUserId: dbO,
        orgRole: 'ADMIN',
        createdAt: created,
        ...extra,
    });

    describe('findMembership', () => {
        it('looks the pair up by its unique key, and returns string ids', async () => {
            prisma.organizationMembership.findUnique.mockResolvedValue(row());

            const result = await repository.findMembership(appI, appO);

            expect(prisma.organizationMembership.findUnique).toHaveBeenCalledWith({
                where: pair(dbI, dbO),
            });
            expect(result).toEqual({
                id: dbI === 2018 ? '7' : 'm1',
                individualUserId: appI,
                organizationUserId: appO,
                orgRole: 'ADMIN',
                createdAt: created,
                implicit: false,
            });
        });

        it('is atomic: no row means null, and the user table is never read', async () => {
            prisma.organizationMembership.findUnique.mockResolvedValue(null);

            expect(await repository.findMembership(appI, appO)).toBeNull();
            expect(prisma.user.findFirst).not.toHaveBeenCalled();
        });
    });

    describe('addMembership', () => {
        it('upserts on the unique pair and never updates an existing row', async () => {
            prisma.organizationMembership.upsert.mockResolvedValue(row());

            const result = await repository.addMembership(appI, appO, {
                orgRole: 'ADMIN',
            });

            expect(prisma.organizationMembership.upsert).toHaveBeenCalledWith({
                where: pair(dbI, dbO),
                create: {
                    individualUserId: dbI,
                    organizationUserId: dbO,
                    orgRole: 'ADMIN',
                },
                update: {},
            });
            expect(result.individualUserId).toBe(appI);
            expect(result.implicit).toBe(false);
        });

        it.each([[undefined], [{ orgRole: null }]])(
            'leaves the role to the column default (MEMBER) when none is given (%p)',
            async (options) => {
                prisma.organizationMembership.upsert.mockResolvedValue(
                    row({ orgRole: 'MEMBER' })
                );

                await repository.addMembership(appI, appO, options);

                expect(
                    prisma.organizationMembership.upsert.mock.calls[0][0].create
                        .orgRole
                ).toBeUndefined();
            }
        );

        it('resolves to the winner’s row when a concurrent create hits the unique pair', async () => {
            prisma.organizationMembership.upsert.mockRejectedValue(
                Object.assign(new Error('Unique constraint failed'), {
                    code: 'P2002',
                })
            );
            prisma.organizationMembership.findUnique.mockResolvedValue(row());

            const result = await repository.addMembership(appI, appO);

            expect(prisma.organizationMembership.findUnique).toHaveBeenCalledWith({
                where: pair(dbI, dbO),
            });
            expect(result.organizationUserId).toBe(appO);
        });

        it('rethrows a unique violation when the row cannot be found afterwards', async () => {
            prisma.organizationMembership.upsert.mockRejectedValue(
                Object.assign(new Error('Unique constraint failed'), {
                    code: 'P2002',
                })
            );
            prisma.organizationMembership.findUnique.mockResolvedValue(null);

            await expect(
                repository.addMembership(appI, appO)
            ).rejects.toThrow('Unique constraint failed');
        });

        it('rethrows any other failure without looking again', async () => {
            prisma.organizationMembership.upsert.mockRejectedValue(
                Object.assign(new Error('connection lost'), { code: 'P1001' })
            );

            await expect(
                repository.addMembership(appI, appO)
            ).rejects.toThrow('connection lost');
            expect(prisma.organizationMembership.findUnique).not.toHaveBeenCalled();
        });
    });

    describe('listMembershipsForOrganization', () => {
        it('lists the organization’s rows oldest first, rows only', async () => {
            prisma.organizationMembership.findMany.mockResolvedValue([row()]);

            const result = await repository.listMembershipsForOrganization(appO);

            expect(prisma.organizationMembership.findMany).toHaveBeenCalledWith({
                where: { organizationUserId: dbO },
                orderBy: { createdAt: 'asc' },
            });
            expect(result.map((m) => m.individualUserId)).toEqual([appI]);
            expect(prisma.user.findFirst).not.toHaveBeenCalled();
        });
    });
});

describe('PostgreSQL id conversion', () => {
    let repository;
    beforeEach(() => {
        repository = new OrganizationMembershipRepositoryPostgres();
    });

    it.each(['12abc', '1.5', '-3', ' 4', '', 'abc', null, undefined, {}, 1.5, -1])(
        'refuses %p rather than parsing a prefix of it',
        async (bad) => {
            await expect(repository.findMembership(bad, '2')).rejects.toThrow(
                'cannot be converted to integer'
            );
            await expect(repository.findMembership('2', bad)).rejects.toThrow(
                'cannot be converted to integer'
            );
            expect(prisma.organizationMembership.findUnique).not.toHaveBeenCalled();
        }
    );

    it('refuses an integer too large to be exact', async () => {
        await expect(
            repository.findMembership('9007199254740993', '2')
        ).rejects.toThrow('cannot be converted to integer');
    });

    it('accepts digit strings and integer numbers', async () => {
        prisma.organizationMembership.findUnique.mockResolvedValue(null);
        await repository.findMembership('12', 34);
        expect(prisma.organizationMembership.findUnique).toHaveBeenCalledWith({
            where: pair(12, 34),
        });
    });
});

describe('OrganizationMembershipRepositoryDocumentDB', () => {
    const iOid = new ObjectId();
    const oOid = new ObjectId();
    const iHex = iOid.toHexString();
    const oHex = oOid.toHexString();
    let repository;
    beforeEach(() => {
        repository = new OrganizationMembershipRepositoryDocumentDB();
    });
    const doc = (extra = {}) => ({
        _id: new ObjectId(),
        individualUserId: iOid,
        organizationUserId: oOid,
        orgRole: 'ADMIN',
        createdAt: { $date: created.toISOString() },
        ...extra,
    });

    it('finds the pair by ObjectId and returns string ids with a parsed date', async () => {
        documentdbUtils.findOne.mockResolvedValue(doc());

        const result = await repository.findMembership(iHex, oHex);

        expect(documentdbUtils.findOne).toHaveBeenCalledWith(
            prisma,
            'OrganizationMembership',
            { individualUserId: iOid, organizationUserId: oOid }
        );
        expect(result).toMatchObject({
            individualUserId: iHex,
            organizationUserId: oHex,
            orgRole: 'ADMIN',
            createdAt: created,
            implicit: false,
        });
    });

    it('is atomic: no document means null, and the User collection is never read', async () => {
        documentdbUtils.findOne.mockResolvedValue(null);

        expect(await repository.findMembership(iHex, oHex)).toBeNull();
        expect(documentdbUtils.findOne).toHaveBeenCalledTimes(1);
    });

    it('reads a document without orgRole as MEMBER', async () => {
        documentdbUtils.findOne.mockResolvedValue(doc({ orgRole: undefined }));

        expect((await repository.findMembership(iHex, oHex)).orgRole).toBe(
            'MEMBER'
        );
    });

    it('adds with an upsert that only sets fields on insert', async () => {
        documentdbUtils.updateOne.mockResolvedValue({ ok: 1, n: 1 });
        documentdbUtils.findOne.mockResolvedValue(doc());

        const result = await repository.addMembership(iHex, oHex, {
            orgRole: 'ADMIN',
        });

        const [client, collection, filter, update, options] =
            documentdbUtils.updateOne.mock.calls[0];
        expect(client).toBe(prisma);
        expect(collection).toBe('OrganizationMembership');
        expect(filter).toEqual({
            individualUserId: iOid,
            organizationUserId: oOid,
        });
        expect(Object.keys(update)).toEqual(['$setOnInsert']);
        expect(update.$setOnInsert.orgRole).toBe('ADMIN');
        expect(update.$setOnInsert.createdAt).toBeInstanceOf(Date);
        expect(options).toEqual({ upsert: true });
        expect(result.organizationUserId).toBe(oHex);
    });

    it('defaults the role to MEMBER', async () => {
        documentdbUtils.updateOne.mockResolvedValue({ ok: 1 });
        documentdbUtils.findOne.mockResolvedValue(doc());

        await repository.addMembership(iHex, oHex);

        expect(
            documentdbUtils.updateOne.mock.calls[0][3].$setOnInsert.orgRole
        ).toBe('MEMBER');
    });

    it('treats a duplicate-key write error as the loser of a race and reads the winner', async () => {
        documentdbUtils.updateOne.mockResolvedValue({
            ok: 1,
            writeErrors: [{ code: 11000, errmsg: 'E11000 duplicate key' }],
        });
        documentdbUtils.findOne.mockResolvedValue(doc());

        await expect(
            repository.addMembership(iHex, oHex)
        ).resolves.toMatchObject({ organizationUserId: oHex });
    });

    it('throws on any other write error', async () => {
        documentdbUtils.updateOne.mockResolvedValue({
            ok: 1,
            writeErrors: [{ code: 121, errmsg: 'validation failed' }],
        });

        await expect(repository.addMembership(iHex, oHex)).rejects.toThrow(
            /validation failed \(code: 121\)/
        );
        expect(documentdbUtils.findOne).not.toHaveBeenCalled();
    });

    it('throws when the membership is not there afterwards', async () => {
        documentdbUtils.updateOne.mockResolvedValue({ ok: 1 });
        documentdbUtils.findOne.mockResolvedValue(null);

        await expect(repository.addMembership(iHex, oHex)).rejects.toThrow(
            'was not stored'
        );
    });

    it('lists the organization’s documents oldest first, rows only', async () => {
        documentdbUtils.findMany.mockResolvedValue([doc()]);

        const result = await repository.listMembershipsForOrganization(oHex);

        expect(documentdbUtils.findMany).toHaveBeenCalledWith(
            prisma,
            'OrganizationMembership',
            { organizationUserId: oOid },
            { sort: { createdAt: 1 } }
        );
        expect(result).toHaveLength(1);
        expect(result[0].individualUserId).toBe(iHex);
        expect(documentdbUtils.findOne).not.toHaveBeenCalled();
    });
});
