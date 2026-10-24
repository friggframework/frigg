jest.mock('../../../database/prisma', () => ({
    prisma: { credential: {}, $runCommandRaw: jest.fn() },
}));
jest.mock('../../../database/documentdb-encryption-service');

const { ObjectId } = require('bson');
const { prisma } = require('../../../database/prisma');
const {
    DocumentDBEncryptionService,
} = require('../../../database/documentdb-encryption-service');
const { CredentialRepositoryPostgres } = require('../credential-repository-postgres');
const { CredentialRepositoryMongo } = require('../credential-repository-mongo');
const { CredentialRepositoryDocumentDB } = require('../credential-repository-documentdb');
const { CredentialRepositoryInterface } = require('../credential-repository-interface');

const created = new Date('2026-10-01T00:00:00Z');
const updated = new Date('2026-10-02T00:00:00Z');

describe('findCredentialsByUserId', () => {
    beforeEach(() => jest.clearAllMocks());

    it('is part of the repository interface', async () => {
        await expect(
            new CredentialRepositoryInterface().findCredentialsByUserId('1')
        ).rejects.toThrow('must be implemented');
    });

    describe('PostgreSQL', () => {
        it('converts the user id and returns string ids, newest first', async () => {
            const repo = new CredentialRepositoryPostgres();
            repo.prisma = {
                credential: {
                    findMany: jest.fn().mockResolvedValue([
                        { id: 7, userId: 3, externalId: 'ext', authIsValid: true, data: { access_token: 'a' }, createdAt: created, updatedAt: updated },
                    ]),
                },
            };
            const result = await repo.findCredentialsByUserId('3');
            expect(repo.prisma.credential.findMany).toHaveBeenCalledWith({
                where: { userId: 3 },
                orderBy: { createdAt: 'desc' },
            });
            expect(result).toEqual([
                { id: '7', userId: '3', externalId: 'ext', authIsValid: true, access_token: 'a', createdAt: created, updatedAt: updated },
            ]);
        });

        it('returns nothing for a user id that is not an integer', async () => {
            const repo = new CredentialRepositoryPostgres();
            repo.prisma = { credential: { findMany: jest.fn() } };
            expect(await repo.findCredentialsByUserId('abc')).toEqual([]);
            expect(repo.prisma.credential.findMany).not.toHaveBeenCalled();
        });

        it('cannot be overridden by a data field named id or userId', async () => {
            const repo = new CredentialRepositoryPostgres();
            repo.prisma = {
                credential: {
                    findMany: jest.fn().mockResolvedValue([
                        { id: 7, userId: 3, data: { id: 'spoof', userId: 'spoof' }, createdAt: created, updatedAt: updated },
                    ]),
                },
            };
            const [credential] = await repo.findCredentialsByUserId('3');
            expect(credential.id).toBe('7');
            expect(credential.userId).toBe('3');
        });
    });

    describe('MongoDB', () => {
        it('queries by user id', async () => {
            const repo = new CredentialRepositoryMongo();
            repo.prisma = {
                credential: {
                    findMany: jest.fn().mockResolvedValue([
                        { id: 'c1', userId: 'u1', externalId: 'ext', authIsValid: false, data: { api_key: 'k' }, createdAt: created, updatedAt: updated },
                    ]),
                },
            };
            const result = await repo.findCredentialsByUserId('u1');
            expect(repo.prisma.credential.findMany).toHaveBeenCalledWith({
                where: { userId: 'u1' },
                orderBy: { createdAt: 'desc' },
            });
            expect(result[0]).toMatchObject({ id: 'c1', userId: 'u1', api_key: 'k', authIsValid: false });
        });
    });

    describe('DocumentDB', () => {
        it('queries by ObjectId user id and decrypts each document', async () => {
            const encryptionService = {
                decryptFields: jest.fn(async (_model, doc) => ({
                    ...doc,
                    data: { access_token: 'plain' },
                })),
            };
            DocumentDBEncryptionService.mockImplementation(() => encryptionService);
            const repo = new CredentialRepositoryDocumentDB();
            const userId = new ObjectId();
            const credentialId = new ObjectId();
            prisma.$runCommandRaw.mockResolvedValueOnce({
                cursor: {
                    id: 0,
                    firstBatch: [
                        { _id: credentialId, userId, externalId: 'ext', authIsValid: true, data: { access_token: 'cipher' }, createdAt: created, updatedAt: updated },
                    ],
                },
            });

            const result = await repo.findCredentialsByUserId(userId.toHexString());

            const command = prisma.$runCommandRaw.mock.calls[0][0];
            expect(command.find).toBe('Credential');
            expect(String(command.filter.userId)).toBe(userId.toHexString());
            expect(command.sort).toEqual({ createdAt: -1 });
            expect(result).toEqual([
                {
                    id: credentialId.toHexString(),
                    userId: userId.toHexString(),
                    externalId: 'ext',
                    authIsValid: true,
                    access_token: 'plain',
                    createdAt: created,
                    updatedAt: updated,
                },
            ]);
        });

        it('returns nothing for a malformed user id', async () => {
            DocumentDBEncryptionService.mockImplementation(() => ({}));
            const repo = new CredentialRepositoryDocumentDB();
            expect(await repo.findCredentialsByUserId('nope')).toEqual([]);
            expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
        });
    });
});
