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

afterEach(() => {
    jest.resetAllMocks();
});

describe('OrganizationMembershipRepositoryInterface', () => {
    it.each(['findMembership', 'addMembership', 'listMembershipsForIndividual'])(
        '%s must be implemented by a subclass',
        async (method) => {
            await expect(
                new OrganizationMembershipRepositoryInterface()[method]('1', '2')
            ).rejects.toThrow('must be implemented');
        }
    );
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
        role: 'admin',
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
                role: 'admin',
                createdAt: created,
                implicit: false,
            });
            expect(prisma.user.findFirst).not.toHaveBeenCalled();
        });

        it('answers from the legacy organizationId when there is no row', async () => {
            prisma.organizationMembership.findUnique.mockResolvedValue(null);
            prisma.user.findFirst.mockResolvedValue({
                id: dbI,
                organizationId: dbO,
                createdAt: created,
            });

            const result = await repository.findMembership(appI, appO);

            expect(prisma.user.findFirst).toHaveBeenCalledWith({
                where: { id: dbI, type: 'INDIVIDUAL' },
            });
            expect(result).toEqual({
                id: null,
                individualUserId: appI,
                organizationUserId: appO,
                role: null,
                createdAt: created,
                implicit: true,
            });
        });

        it('is null when the legacy pointer names a different organization', async () => {
            prisma.organizationMembership.findUnique.mockResolvedValue(null);
            prisma.user.findFirst.mockResolvedValue({
                id: dbI,
                organizationId: dbI === 2018 ? 9999 : 'zz',
            });

            expect(await repository.findMembership(appI, appO)).toBeNull();
        });

        it.each([null, undefined])(
            'is null when the person has no legacy pointer (%s) and no row',
            async (pointer) => {
                prisma.organizationMembership.findUnique.mockResolvedValue(null);
                prisma.user.findFirst.mockResolvedValue({
                    id: dbI,
                    organizationId: pointer,
                });

                expect(await repository.findMembership(appI, appO)).toBeNull();
            }
        );

        it('is null when the person does not exist', async () => {
            prisma.organizationMembership.findUnique.mockResolvedValue(null);
            prisma.user.findFirst.mockResolvedValue(null);

            expect(await repository.findMembership(appI, appO)).toBeNull();
        });
    });

    describe('addMembership', () => {
        it('upserts on the unique pair and never updates an existing row', async () => {
            prisma.organizationMembership.upsert.mockResolvedValue(row());

            const result = await repository.addMembership(appI, appO, {
                role: 'admin',
            });

            expect(prisma.organizationMembership.upsert).toHaveBeenCalledWith({
                where: pair(dbI, dbO),
                create: {
                    individualUserId: dbI,
                    organizationUserId: dbO,
                    role: 'admin',
                },
                update: {},
            });
            expect(result.individualUserId).toBe(appI);
            expect(result.implicit).toBe(false);
        });

        it('stores a null role when none is given', async () => {
            prisma.organizationMembership.upsert.mockResolvedValue(
                row({ role: null })
            );

            await repository.addMembership(appI, appO);

            expect(
                prisma.organizationMembership.upsert.mock.calls[0][0].create.role
            ).toBeNull();
        });

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

    describe('listMembershipsForIndividual', () => {
        it('lists rows oldest first', async () => {
            prisma.organizationMembership.findMany.mockResolvedValue([row()]);
            prisma.user.findFirst.mockResolvedValue({
                id: dbI,
                organizationId: null,
            });

            const result = await repository.listMembershipsForIndividual(appI);

            expect(prisma.organizationMembership.findMany).toHaveBeenCalledWith({
                where: { individualUserId: dbI },
                orderBy: { createdAt: 'asc' },
            });
            expect(result.map((m) => m.organizationUserId)).toEqual([appO]);
        });

        it('adds the legacy pointer’s organization first when no row names it', async () => {
            prisma.organizationMembership.findMany.mockResolvedValue([row()]);
            prisma.user.findFirst.mockResolvedValue({
                id: dbI,
                organizationId: dbI === 2018 ? 5 : 'legacy',
                createdAt: created,
            });

            const result = await repository.listMembershipsForIndividual(appI);

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                organizationUserId: dbI === 2018 ? '5' : 'legacy',
                implicit: true,
            });
            expect(result[1]).toMatchObject({
                organizationUserId: appO,
                implicit: false,
            });
        });

        it('does not repeat the legacy organization when a row already names it', async () => {
            prisma.organizationMembership.findMany.mockResolvedValue([row()]);
            prisma.user.findFirst.mockResolvedValue({
                id: dbI,
                organizationId: dbO,
            });

            const result = await repository.listMembershipsForIndividual(appI);

            expect(result).toHaveLength(1);
            expect(result[0].implicit).toBe(false);
        });

        it('lists only the legacy pointer for a person with no rows', async () => {
            prisma.organizationMembership.findMany.mockResolvedValue([]);
            prisma.user.findFirst.mockResolvedValue({
                id: dbI,
                organizationId: dbO,
            });

            const result = await repository.listMembershipsForIndividual(appI);

            expect(result).toEqual([
                expect.objectContaining({
                    organizationUserId: appO,
                    implicit: true,
                }),
            ]);
        });
    });
});

describe('PostgreSQL id conversion', () => {
    it('refuses an id that is not an integer', async () => {
        const repository = new OrganizationMembershipRepositoryPostgres();
        await expect(
            repository.findMembership('not-a-number', '2')
        ).rejects.toThrow('cannot be converted to integer');
        expect(prisma.organizationMembership.findUnique).not.toHaveBeenCalled();
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
        role: 'admin',
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
            role: 'admin',
            createdAt: created,
            implicit: false,
        });
    });

    it('answers from the legacy organizationId when there is no document', async () => {
        documentdbUtils.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                _id: iOid,
                organizationId: oOid,
                createdAt: created.toISOString(),
            });

        const result = await repository.findMembership(iHex, oHex);

        expect(documentdbUtils.findOne).toHaveBeenLastCalledWith(
            prisma,
            'User',
            { _id: iOid, type: 'INDIVIDUAL' }
        );
        expect(result).toMatchObject({
            individualUserId: iHex,
            organizationUserId: oHex,
            implicit: true,
        });
    });

    it('is null for a different legacy organization, or none', async () => {
        documentdbUtils.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ _id: iOid, organizationId: new ObjectId() });
        expect(await repository.findMembership(iHex, oHex)).toBeNull();

        documentdbUtils.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ _id: iOid });
        expect(await repository.findMembership(iHex, oHex)).toBeNull();
    });

    it('adds with an upsert that only sets fields on insert', async () => {
        documentdbUtils.updateOne.mockResolvedValue({ ok: 1, n: 1 });
        documentdbUtils.findOne.mockResolvedValue(doc());

        const result = await repository.addMembership(iHex, oHex, {
            role: 'admin',
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
        expect(update.$setOnInsert.role).toBe('admin');
        expect(update.$setOnInsert.createdAt).toBeInstanceOf(Date);
        expect(options).toEqual({ upsert: true });
        expect(result.organizationUserId).toBe(oHex);
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

    it('lists documents oldest first plus the legacy organization', async () => {
        documentdbUtils.findMany.mockResolvedValue([doc()]);
        documentdbUtils.findOne.mockResolvedValue({
            _id: iOid,
            organizationId: new ObjectId(),
        });

        const result = await repository.listMembershipsForIndividual(iHex);

        expect(documentdbUtils.findMany).toHaveBeenCalledWith(
            prisma,
            'OrganizationMembership',
            { individualUserId: iOid },
            { sort: { createdAt: 1 } }
        );
        expect(result).toHaveLength(2);
        expect(result[0].implicit).toBe(true);
        expect(result[1].organizationUserId).toBe(oHex);
    });
});
