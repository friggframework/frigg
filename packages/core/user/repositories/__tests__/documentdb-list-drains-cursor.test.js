// Uses the REAL documentdb-utils over a fake $runCommandRaw that serves more
// than one cursor batch, so a read that stops at the first batch fails here.
jest.mock('../../../database/prisma', () => ({
    prisma: { $runCommandRaw: jest.fn() },
}));
jest.mock('../../../token/repositories/token-repository-factory', () => ({
    createTokenRepository: jest.fn(() => ({})),
}));
jest.mock('../../../database/documentdb-encryption-service', () => ({
    DocumentDBEncryptionService: class {
        async decryptFields(_model, doc) {
            return doc;
        }

        async encryptFields(_model, doc) {
            return doc;
        }
    },
}));

const { ObjectId } = require('bson');
const { prisma } = require('../../../database/prisma');
const {
    OrganizationMembershipRepositoryDocumentDB,
} = require('../organization-membership-repository-documentdb');
const { UserRepositoryDocumentDB } = require('../user-repository-documentdb');

const TOTAL = 2500; // three batches at the drain batch size of 1000

/** A server holding `docs`: a find returns 101 documents (as MongoDB does), then getMore pages. */
function serveCursor(docs) {
    let position = 0;
    prisma.$runCommandRaw.mockImplementation(async (command) => {
        if (command.find) {
            const size = command.batchSize ? Math.min(command.batchSize, docs.length) : 101;
            position = size;
            return { ok: 1, cursor: { id: 77, firstBatch: docs.slice(0, size) } };
        }
        if (command.getMore) {
            const batch = docs.slice(position, position + command.batchSize);
            position += batch.length;
            return {
                ok: 1,
                cursor: {
                    id: position >= docs.length ? 0 : 77,
                    nextBatch: batch,
                },
            };
        }
        throw new Error(`unexpected command ${JSON.stringify(command)}`);
    });
}

beforeEach(() => jest.clearAllMocks());

describe('DocumentDB list reads by organization follow the cursor', () => {
    const orgOid = new ObjectId();
    const orgHex = orgOid.toHexString();

    it('listMembershipsForOrganization returns every membership, not the first batch', async () => {
        const docs = Array.from({ length: TOTAL }, () => ({
            _id: new ObjectId(),
            individualUserId: new ObjectId(),
            organizationUserId: orgOid,
            orgRole: 'MEMBER',
            createdAt: new Date(),
        }));
        serveCursor(docs);

        const result =
            await new OrganizationMembershipRepositoryDocumentDB().listMembershipsForOrganization(
                orgHex
            );

        expect(result).toHaveLength(TOTAL);
        expect(new Set(result.map((m) => m.individualUserId)).size).toBe(TOTAL);
        expect(
            prisma.$runCommandRaw.mock.calls.filter(([c]) => c.getMore).length
        ).toBeGreaterThan(0);
    });

    it('findIndividualUsersByOrganizationId returns every person, not the first batch', async () => {
        const docs = Array.from({ length: TOTAL }, (_, i) => ({
            _id: new ObjectId(),
            type: 'INDIVIDUAL',
            appUserId: `u${i}`,
            organizationId: orgOid,
        }));
        serveCursor(docs);

        const result =
            await new UserRepositoryDocumentDB().findIndividualUsersByOrganizationId(
                orgHex
            );

        expect(result).toHaveLength(TOTAL);
        expect(result[TOTAL - 1].appUserId).toBe(`u${TOTAL - 1}`);
    });
});
