// Mock dependencies BEFORE importing
jest.mock('../../../database/prisma', () => ({
    prisma: {
        $runCommandRaw: jest.fn(),
    },
}));
jest.mock('../../../database/documentdb-encryption-service');

const { ObjectId } = require('mongodb');
const { prisma } = require('../../../database/prisma');
const {
    toObjectId,
    fromObjectId,
} = require('../../../database/documentdb-utils');
const {
    ModuleRepositoryDocumentDB,
} = require('../module-repository-documentdb');
const {
    DocumentDBEncryptionService,
} = require('../../../database/documentdb-encryption-service');

describe('ModuleRepositoryDocumentDB - Encryption Integration', () => {
    let repository;
    let mockEncryptionService;
    let testUserId;
    let testEntityId;
    let testCredentialId;

    beforeEach(() => {
        // Create mock encryption service
        mockEncryptionService = {
            encryptFields: jest.fn(),
            decryptFields: jest.fn(),
        };

        // Mock the constructor to return our mock
        DocumentDBEncryptionService.mockImplementation(
            () => mockEncryptionService
        );

        // Create repository instance
        repository = new ModuleRepositoryDocumentDB();

        // Test data
        testUserId = new ObjectId();
        testEntityId = new ObjectId();
        testCredentialId = new ObjectId();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Credential Decryption', () => {
        it('_fetchCredential decrypts credential data', async () => {
            const encryptedData = {
                access_token: 'keyId:iv:cipher:encKey',
                refresh_token: 'keyId:iv:cipher:encKey',
            };

            const plainData = {
                access_token: 'plain_access_token',
                refresh_token: 'plain_refresh_token',
            };

            // Mock findOne for credential
            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: testCredentialId,
                            userId: testUserId,
                            externalId: 'test-external',
                            data: encryptedData,
                        },
                    ],
                },
                ok: 1,
            });

            // Mock decryption
            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testCredentialId,
                userId: testUserId,
                externalId: 'test-external',
                data: plainData,
            });

            const credential = await repository._fetchCredential(
                testCredentialId
            );

            // Verify decryption was called
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: encryptedData,
                })
            );

            // Verify result has plain data
            expect(credential.data.access_token).toBe('plain_access_token');
            expect(credential.data.refresh_token).toBe('plain_refresh_token');
        });

        it('verifies nested field decryption (data.access_token)', async () => {
            const encryptedNested = {
                access_token: 'keyId:iv:cipher:encKey',
            };

            const plainNested = {
                access_token: 'plain_token',
            };

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: testCredentialId,
                            data: encryptedNested,
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testCredentialId,
                data: plainNested,
            });

            const credential = await repository._fetchCredential(
                testCredentialId
            );

            expect(credential.data.access_token).toBe('plain_token');
        });

        it('verifies multiple field decryption (access_token, refresh_token, id_token)', async () => {
            const encryptedMultiple = {
                access_token: 'keyId1:iv1:cipher1:encKey1',
                refresh_token: 'keyId2:iv2:cipher2:encKey2',
                id_token: 'keyId3:iv3:cipher3:encKey3',
            };

            const plainMultiple = {
                access_token: 'plain_access',
                refresh_token: 'plain_refresh',
                id_token: 'plain_id',
            };

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: testCredentialId,
                            data: encryptedMultiple,
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testCredentialId,
                data: plainMultiple,
            });

            const credential = await repository._fetchCredential(
                testCredentialId
            );

            expect(credential.data.access_token).toBe('plain_access');
            expect(credential.data.refresh_token).toBe('plain_refresh');
            expect(credential.data.id_token).toBe('plain_id');
        });
    });

    describe('Bulk Credential Decryption', () => {
        it('_fetchCredentialsBulk decrypts multiple credentials', async () => {
            const credId1 = new ObjectId();
            const credId2 = new ObjectId();

            const encryptedCreds = [
                {
                    _id: credId1,
                    data: { access_token: 'keyId1:iv1:cipher1:encKey1' },
                },
                {
                    _id: credId2,
                    data: { access_token: 'keyId2:iv2:cipher2:encKey2' },
                },
            ];

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: { firstBatch: encryptedCreds },
                ok: 1,
            });

            // Mock decryption for each credential
            mockEncryptionService.decryptFields
                .mockResolvedValueOnce({
                    _id: credId1,
                    data: { access_token: 'plain_token_1' },
                })
                .mockResolvedValueOnce({
                    _id: credId2,
                    data: { access_token: 'plain_token_2' },
                });

            const credentialMap = await repository._fetchCredentialsBulk([
                credId1,
                credId2,
            ]);

            // Verify both credentials decrypted
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledTimes(
                2
            );
            expect(credentialMap.size).toBe(2);
            expect(
                credentialMap.get(fromObjectId(credId1)).data.access_token
            ).toBe('plain_token_1');
            expect(
                credentialMap.get(fromObjectId(credId2)).data.access_token
            ).toBe('plain_token_2');
        });

        it('performs parallel decryption (not sequential)', async () => {
            const credIds = [new ObjectId(), new ObjectId(), new ObjectId()];

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: credIds.map((id) => ({
                        _id: id,
                        data: { access_token: 'encrypted' },
                    })),
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockImplementation(
                async () => ({
                    _id: new ObjectId(),
                    data: { access_token: 'plain' },
                })
            );

            const startTime = Date.now();
            await repository._fetchCredentialsBulk(credIds);
            const duration = Date.now() - startTime;

            // Parallel execution should be fast (not 3x sequential)
            // This is a rough check - parallel should complete in < 100ms
            expect(duration).toBeLessThan(100);
        });
    });

    describe('Integration with Entities', () => {
        it('findEntityById returns entity with decrypted credential', async () => {
            const encryptedData = {
                access_token: 'keyId:iv:cipher:encKey',
            };

            const plainData = {
                access_token: 'plain_token',
            };

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find && command.filter._id) {
                    // Find entity
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: testEntityId,
                                    userId: testUserId,
                                    credentialId: testCredentialId,
                                    name: 'Test Entity',
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
                // Find credential
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: testCredentialId,
                                data: encryptedData,
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testCredentialId,
                data: plainData,
            });

            const entity = await repository.findEntityById(
                fromObjectId(testEntityId)
            );

            expect(entity.credential).toBeDefined();
            expect(entity.credential.data.access_token).toBe('plain_token');
        });

        it('findEntitiesByUserId returns entities with decrypted credentials', async () => {
            const entity1Id = new ObjectId();
            const entity2Id = new ObjectId();
            const cred1Id = new ObjectId();
            const cred2Id = new ObjectId();

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find && command.filter.userId) {
                    // Find entities
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: entity1Id,
                                    userId: testUserId,
                                    credentialId: cred1Id,
                                },
                                {
                                    _id: entity2Id,
                                    userId: testUserId,
                                    credentialId: cred2Id,
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
                // Find credentials bulk
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: cred1Id,
                                data: { access_token: 'encrypted1' },
                            },
                            {
                                _id: cred2Id,
                                data: { access_token: 'encrypted2' },
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields
                .mockResolvedValueOnce({
                    _id: cred1Id,
                    data: { access_token: 'plain1' },
                })
                .mockResolvedValueOnce({
                    _id: cred2Id,
                    data: { access_token: 'plain2' },
                });

            const entities = await repository.findEntitiesByUserId(
                fromObjectId(testUserId)
            );

            expect(entities).toHaveLength(2);
            expect(entities[0].credential.data.access_token).toBe('plain1');
            expect(entities[1].credential.data.access_token).toBe('plain2');
        });

        it('findEntitiesByUserIdAndModuleName decrypts credentials', async () => {
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (
                    command.find &&
                    command.filter.userId &&
                    command.filter.moduleName
                ) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: testEntityId,
                                    userId: testUserId,
                                    moduleName: 'test-module',
                                    credentialId: testCredentialId,
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: testCredentialId,
                                data: { access_token: 'encrypted' },
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testCredentialId,
                data: { access_token: 'plain' },
            });

            const entities = await repository.findEntitiesByUserIdAndModuleName(
                fromObjectId(testUserId),
                'test-module'
            );

            expect(entities).toHaveLength(1);
            expect(entities[0].credential.data.access_token).toBe('plain');
        });
    });

    describe('Error Handling', () => {
        it('handles corrupted encrypted data (decryption fails)', async () => {
            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: testCredentialId,
                            data: { access_token: 'corrupted_data' },
                        },
                    ],
                },
                ok: 1,
            });

            const error = new Error('Decryption failed: invalid format');
            mockEncryptionService.decryptFields.mockRejectedValue(error);

            const credential = await repository._fetchCredential(
                testCredentialId
            );

            // Should return null on error
            expect(credential).toBeNull();
        });

        it('handles missing credential (null credential)', async () => {
            prisma.$runCommandRaw.mockResolvedValue({
                cursor: { firstBatch: [] },
                ok: 1,
            });

            const credential = await repository._fetchCredential(
                testCredentialId
            );

            expect(credential).toBeNull();
        });

        it('gracefully handles bulk decryption failures', async () => {
            const credId1 = new ObjectId();
            const credId2 = new ObjectId();

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: credId1,
                            data: { access_token: 'encrypted1' },
                        },
                        {
                            _id: credId2,
                            data: { access_token: 'corrupted' },
                        },
                    ],
                },
                ok: 1,
            });

            // First succeeds, second fails
            mockEncryptionService.decryptFields
                .mockResolvedValueOnce({
                    _id: credId1,
                    data: { access_token: 'plain1' },
                })
                .mockRejectedValueOnce(new Error('Decryption failed'));

            const credentialMap = await repository._fetchCredentialsBulk([
                credId1,
                credId2,
            ]);

            // Should have only the successful one
            expect(credentialMap.size).toBe(1);
            expect(credentialMap.get(fromObjectId(credId1))).toBeDefined();
            expect(credentialMap.get(fromObjectId(credId2))).toBeUndefined();
        });
    });

    describe('Performance', () => {
        it('bulk decrypts 10 credentials efficiently', async () => {
            const credIds = Array.from({ length: 10 }, () => new ObjectId());

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: credIds.map((id) => ({
                        _id: id,
                        data: { access_token: 'encrypted' },
                    })),
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockImplementation(
                async (modelName, doc) => ({
                    ...doc,
                    data: { access_token: 'plain' },
                })
            );

            const startTime = Date.now();
            const credentialMap = await repository._fetchCredentialsBulk(
                credIds
            );
            const duration = Date.now() - startTime;

            expect(credentialMap.size).toBe(10);
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledTimes(
                10
            );

            // Should complete in reasonable time (parallel execution)
            expect(duration).toBeLessThan(200);
        });
    });
});
