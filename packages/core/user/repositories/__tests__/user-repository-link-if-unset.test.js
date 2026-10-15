jest.mock('../../../database/prisma', () => ({
    prisma: {
        user: { updateMany: jest.fn(), findFirst: jest.fn() },
        $runCommandRaw: jest.fn(),
    },
}));
jest.mock('../../../token/repositories/token-repository-factory', () => ({
    createTokenRepository: jest.fn(() => ({})),
}));
jest.mock('../../../database/documentdb-encryption-service', () => ({
    // A plain class: resetAllMocks would wipe a jest.fn implementation.
    DocumentDBEncryptionService: class {
        async decryptFields(_model, doc) {
            return doc;
        }

        async encryptFields(_model, doc) {
            return doc;
        }
    },
}));
jest.mock('../../../database/documentdb-utils', () => ({
    ...jest.requireActual('../../../database/documentdb-utils'),
    findOne: jest.fn(),
    updateOne: jest.fn(),
}));

const { ObjectId } = require('bson');
const { prisma } = require('../../../database/prisma');
const documentdbUtils = require('../../../database/documentdb-utils');
const { UserRepositoryMongo } = require('../user-repository-mongo');
const { UserRepositoryPostgres } = require('../user-repository-postgres');
const { UserRepositoryDocumentDB } = require('../user-repository-documentdb');

afterEach(() => jest.resetAllMocks());

// ADR-056 §3.6: the legacy pointer is set on a first link only, and the
// database decides "first" in the same statement.
describe('linkIndividualToOrganizationIfUnset', () => {
    it('Mongo: updates only an individual whose organizationId is null or unset (both forms)', async () => {
        prisma.user.updateMany.mockResolvedValue({ count: 1 });
        prisma.user.findFirst.mockResolvedValue({ id: 'i1', organizationId: 'o1' });

        const result = await new UserRepositoryMongo().linkIndividualToOrganizationIfUnset(
            'i1',
            'o1'
        );

        expect(prisma.user.updateMany).toHaveBeenCalledWith({
            where: {
                id: 'i1',
                type: 'INDIVIDUAL',
                OR: [
                    { organizationId: null },
                    { organizationId: { isSet: false } },
                ],
            },
            data: { organizationId: 'o1' },
        });
        expect(result).toEqual({ id: 'i1', organizationId: 'o1' });
    });

    it('Mongo: returns the stored person unchanged when the pointer was already set', async () => {
        prisma.user.updateMany.mockResolvedValue({ count: 0 });
        prisma.user.findFirst.mockResolvedValue({ id: 'i1', organizationId: 'oOld' });

        const result = await new UserRepositoryMongo().linkIndividualToOrganizationIfUnset(
            'i1',
            'oNew'
        );

        expect(result.organizationId).toBe('oOld');
    });

    it('Postgres: converts ids, conditions on a null pointer, and returns string ids', async () => {
        prisma.user.updateMany.mockResolvedValue({ count: 1 });
        prisma.user.findFirst.mockResolvedValue({ id: 5, organizationId: 7 });

        const result = await new UserRepositoryPostgres().linkIndividualToOrganizationIfUnset(
            '5',
            '7'
        );

        expect(prisma.user.updateMany).toHaveBeenCalledWith({
            where: { id: 5, type: 'INDIVIDUAL', organizationId: null },
            data: { organizationId: 7 },
        });
        expect(result).toMatchObject({ id: '5', organizationId: '7' });
    });

    it('DocumentDB: carries the null-pointer condition in the update filter', async () => {
        const iOid = new ObjectId();
        const oOid = new ObjectId();
        documentdbUtils.updateOne.mockResolvedValue({ ok: 1 });
        documentdbUtils.findOne.mockResolvedValue({
            _id: iOid,
            type: 'INDIVIDUAL',
            organizationId: oOid,
        });

        const result = await new UserRepositoryDocumentDB().linkIndividualToOrganizationIfUnset(
            iOid.toHexString(),
            oOid.toHexString()
        );

        const [client, collection, filter, update] =
            documentdbUtils.updateOne.mock.calls[0];
        expect(client).toBe(prisma);
        expect(collection).toBe('User');
        expect(filter).toEqual({
            _id: iOid,
            type: 'INDIVIDUAL',
            organizationId: null,
        });
        expect(update).toEqual({ $set: { organizationId: oOid } });
        expect(result.organizationId).toBe(oOid.toHexString());
    });
});
