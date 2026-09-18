jest.mock('../../database/prisma', () => ({
    prisma: { $runCommandRaw: jest.fn() },
}));
jest.mock('../../database/documentdb-encryption-service');

const { ObjectId } = require('bson');
const { prisma } = require('../../database/prisma');
const {
    DocumentDBEncryptionService,
} = require('../../database/documentdb-encryption-service');
const {
    CredentialRepositoryDocumentDB,
} = require('./credential-repository-documentdb');

describe('CredentialRepositoryDocumentDB.countActiveByType', () => {
    let repo;
    let encryptionService;

    beforeEach(() => {
        jest.clearAllMocks();
        encryptionService = {
            encryptFields: jest.fn(),
            decryptFields: jest.fn(),
        };
        DocumentDBEncryptionService.mockImplementation(() => encryptionService);
        repo = new CredentialRepositoryDocumentDB();
    });

    it('filters updatedAt >= since, projects away secrets, and groups by related Entity.moduleName', async () => {
        const credA = new ObjectId();
        const credB = new ObjectId();
        const credC = new ObjectId();
        const since = new Date('2026-06-01T00:00:00Z');

        prisma.$runCommandRaw
            // find active Credentials (projection excludes `data`)
            .mockResolvedValueOnce({
                cursor: {
                    firstBatch: [
                        { _id: credA },
                        { _id: credB },
                        { _id: credC },
                    ],
                },
            })
            // find Entities for those credential ids
            .mockResolvedValueOnce({
                cursor: {
                    firstBatch: [
                        { credentialId: credA, moduleName: 'hubspot' },
                        { credentialId: credB, moduleName: 'hubspot' },
                        // credC has no entity → bucketed as unknown
                    ],
                },
            });

        const result = await repo.countActiveByType({ since });

        const credCmd = prisma.$runCommandRaw.mock.calls[0][0];
        expect(credCmd.find).toBe('Credential');
        expect(credCmd.filter).toEqual({ updatedAt: { $gte: since } });
        expect(credCmd.projection).toEqual({ _id: 1 });

        const entityCmd = prisma.$runCommandRaw.mock.calls[1][0];
        expect(entityCmd.find).toBe('Entity');
        expect(entityCmd.filter.credentialId.$in).toHaveLength(3);
        expect(entityCmd.projection).toEqual({
            credentialId: 1,
            moduleName: 1,
        });

        // Neither read touched the encrypted `data`, so nothing is decrypted.
        expect(encryptionService.decryptFields).not.toHaveBeenCalled();

        expect(result).toEqual([
            { integrationType: 'hubspot', count: 2 },
            { integrationType: 'unknown', count: 1 },
        ]);
    });

    it('skips the entity query and returns [] when no credentials are active', async () => {
        prisma.$runCommandRaw.mockResolvedValueOnce({
            cursor: { firstBatch: [] },
        });

        const result = await repo.countActiveByType({
            since: new Date('2026-06-01T00:00:00Z'),
        });

        expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
        expect(encryptionService.decryptFields).not.toHaveBeenCalled();
        expect(result).toEqual([]);
    });

    it('omits the updatedAt filter when since is not provided (count-all)', async () => {
        prisma.$runCommandRaw.mockResolvedValueOnce({
            cursor: { firstBatch: [] },
        });

        await repo.countActiveByType();

        const credCmd = prisma.$runCommandRaw.mock.calls[0][0];
        expect(credCmd.filter).toEqual({});
    });
});
