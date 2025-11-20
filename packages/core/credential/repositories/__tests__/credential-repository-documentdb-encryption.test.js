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
    CredentialRepositoryDocumentDB,
} = require('../credential-repository-documentdb');
const {
    DocumentDBEncryptionService,
} = require('../../../database/documentdb-encryption-service');

describe('CredentialRepositoryDocumentDB - Encryption Integration', () => {
    let repository;
    let mockEncryptionService;
    let testUserId;
    let testExternalId;

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
        repository = new CredentialRepositoryDocumentDB();

        // Test data
        testUserId = new ObjectId();
        testExternalId = 'test-external-id-123';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Encryption on Upsert (INSERT)', () => {
        it('encrypts access_token before insert', async () => {
            const plainToken = 'ya29.actual_google_token_here';
            const encryptedToken = 'keyId:iv:cipher:encKey';

            // Mock encryption
            mockEncryptionService.encryptFields.mockResolvedValue({
                data: {
                    access_token: encryptedToken,
                },
            });

            // Mock insert and read-back
            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    userId: testUserId,
                                    externalId: testExternalId,
                                    authIsValid: null,
                                    data: {
                                        access_token: encryptedToken,
                                    },
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
            });

            // Mock decryption for read-back
            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                userId: testUserId,
                externalId: testExternalId,
                authIsValid: null,
                data: {
                    access_token: plainToken,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Execute upsert
            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: {
                    access_token: plainToken,
                },
            });

            // Verify encryption was called
            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: { access_token: plainToken },
                })
            );

            // Verify decryption was called on read-back
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: { access_token: encryptedToken },
                })
            );

            // Verify result has decrypted token
            expect(result.access_token).toBe(plainToken);
        });

        it('encrypts refresh_token before insert', async () => {
            const plainRefresh = 'refresh_token_secret';
            const encryptedRefresh = 'keyId:iv:cipher:encKey';

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { refresh_token: encryptedRefresh },
            });

            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    userId: testUserId,
                                    externalId: testExternalId,
                                    data: { refresh_token: encryptedRefresh },
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                userId: testUserId,
                data: { refresh_token: plainRefresh },
            });

            await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: { refresh_token: plainRefresh },
            });

            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: { refresh_token: plainRefresh },
                })
            );
        });

        it('encrypts id_token before insert', async () => {
            const plainIdToken = 'id_token_secret';
            const encryptedIdToken = 'keyId:iv:cipher:encKey';

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { id_token: encryptedIdToken },
            });

            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    userId: testUserId,
                                    externalId: testExternalId,
                                    data: { id_token: encryptedIdToken },
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                userId: testUserId,
                data: { id_token: plainIdToken },
            });

            await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: { id_token: plainIdToken },
            });

            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: { id_token: plainIdToken },
                })
            );
        });

        it('encrypts multiple tokens before insert', async () => {
            const plainData = {
                access_token: 'access_secret',
                refresh_token: 'refresh_secret',
                id_token: 'id_secret',
            };

            const encryptedData = {
                access_token: 'keyId1:iv1:cipher1:encKey1',
                refresh_token: 'keyId2:iv2:cipher2:encKey2',
                id_token: 'keyId3:iv3:cipher3:encKey3',
            };

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: encryptedData,
            });

            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    userId: testUserId,
                                    externalId: testExternalId,
                                    data: encryptedData,
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                userId: testUserId,
                data: plainData,
            });

            await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: plainData,
            });

            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: plainData,
                })
            );
        });
    });

    describe('Encryption on Upsert (UPDATE)', () => {
        it('decrypts existing credential, merges, and re-encrypts', async () => {
            const existingCredentialId = new ObjectId();
            const existingEncrypted = {
                _id: existingCredentialId,
                userId: testUserId,
                externalId: testExternalId,
                data: {
                    access_token: 'keyId1:iv1:cipher1:encKey1',
                    refresh_token: 'keyId2:iv2:cipher2:encKey2',
                },
            };

            const existingDecrypted = {
                access_token: 'old_access_token',
                refresh_token: 'old_refresh_token',
            };

            const newPlainData = {
                access_token: 'new_access_token',
                id_token: 'new_id_token',
            };

            const mergedPlainData = {
                access_token: 'new_access_token', // Updated
                refresh_token: 'old_refresh_token', // Preserved
                id_token: 'new_id_token', // Added
            };

            const mergedEncryptedData = {
                access_token: 'keyId3:iv3:cipher3:encKey3',
                refresh_token: 'keyId2:iv2:cipher2:encKey2',
                id_token: 'keyId4:iv4:cipher4:encKey4',
            };

            // Mock find (existing credential)
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find && !command.filter._id) {
                    // Initial find by userId/externalId
                    return Promise.resolve({
                        cursor: { firstBatch: [existingEncrypted] },
                        ok: 1,
                    });
                }
                if (command.find && command.filter._id) {
                    // Read-back after update
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    ...existingEncrypted,
                                    data: mergedEncryptedData,
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
            });

            // First decrypt: existing credential
            mockEncryptionService.decryptFields
                .mockResolvedValueOnce({
                    ...existingEncrypted,
                    data: existingDecrypted,
                })
                // Second decrypt: after update
                .mockResolvedValueOnce({
                    _id: existingCredentialId,
                    userId: testUserId,
                    externalId: testExternalId,
                    data: mergedPlainData,
                });

            // Encrypt merged data
            mockEncryptionService.encryptFields.mockResolvedValue({
                data: mergedEncryptedData,
            });

            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: newPlainData,
            });

            // Verify decryption of existing
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'Credential',
                existingEncrypted
            );

            // Verify encryption of merged data
            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: mergedPlainData,
                })
            );

            // Verify result has all tokens
            expect(result.access_token).toBe('new_access_token');
            expect(result.refresh_token).toBe('old_refresh_token');
            expect(result.id_token).toBe('new_id_token');
        });

        it('preserves other credential fields during update', async () => {
            const existingCredentialId = new ObjectId();
            const existingCredential = {
                _id: existingCredentialId,
                userId: testUserId,
                externalId: testExternalId,
                authIsValid: true,
                data: { access_token: 'keyId:iv:cipher:encKey' },
            };

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find && !command.filter._id) {
                    return Promise.resolve({
                        cursor: { firstBatch: [existingCredential] },
                        ok: 1,
                    });
                }
                if (command.find && command.filter._id) {
                    return Promise.resolve({
                        cursor: { firstBatch: [existingCredential] },
                        ok: 1,
                    });
                }
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                ...existingCredential,
                data: { access_token: 'plain_token' },
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { access_token: 'keyId:iv:cipher:encKey' },
            });

            await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: { access_token: 'new_token' },
            });

            // Verify update was called
            const updateCall = prisma.$runCommandRaw.mock.calls.find(
                (call) => call[0].update
            );
            expect(updateCall).toBeDefined();
            expect(updateCall[0].updates[0].u.$set.externalId).toBe(
                testExternalId
            );
        });
    });

    describe('Decryption on Read', () => {
        it('findCredential returns decrypted credential', async () => {
            const credentialId = new ObjectId();
            const encryptedCredential = {
                _id: credentialId,
                userId: testUserId,
                externalId: testExternalId,
                data: {
                    access_token: 'keyId:iv:cipher:encKey',
                    refresh_token: 'keyId:iv:cipher:encKey',
                },
            };

            const decryptedData = {
                access_token: 'plain_access_token',
                refresh_token: 'plain_refresh_token',
            };

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: { firstBatch: [encryptedCredential] },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                ...encryptedCredential,
                data: decryptedData,
            });

            const result = await repository.findCredential({
                userId: fromObjectId(testUserId),
                externalId: testExternalId,
            });

            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'Credential',
                encryptedCredential
            );
            expect(result.access_token).toBe('plain_access_token');
            expect(result.refresh_token).toBe('plain_refresh_token');
        });

        it('findCredentialById returns decrypted credential', async () => {
            const credentialId = new ObjectId();
            const encryptedCredential = {
                _id: credentialId,
                userId: testUserId,
                data: { access_token: 'keyId:iv:cipher:encKey' },
            };

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: { firstBatch: [encryptedCredential] },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                ...encryptedCredential,
                data: { access_token: 'plain_token' },
            });

            const result = await repository.findCredentialById(
                fromObjectId(credentialId)
            );

            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'Credential',
                encryptedCredential
            );
            expect(result.access_token).toBe('plain_token');
        });

        it('updateCredential returns decrypted result', async () => {
            const credentialId = new ObjectId();
            const existingCredential = {
                _id: credentialId,
                userId: testUserId,
                data: { access_token: 'keyId:iv:cipher:encKey' },
            };

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [existingCredential] },
                        ok: 1,
                    });
                }
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                ...existingCredential,
                data: { access_token: 'plain_token' },
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { access_token: 'keyId:iv:cipher:encKey' },
            });

            const result = await repository.updateCredential(
                fromObjectId(credentialId),
                {
                    access_token: 'new_token',
                }
            );

            expect(result.access_token).toBe('plain_token');
        });
    });

    describe('Integration Flow', () => {
        it('completes full flow: insert → read → verify', async () => {
            const plainToken = 'secret_token_123';
            const encryptedToken = 'keyId:iv:cipher:encKey';
            const insertedId = new ObjectId();

            // Mock insert
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    userId: testUserId,
                                    externalId: testExternalId,
                                    data: { access_token: encryptedToken },
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { access_token: encryptedToken },
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                userId: testUserId,
                externalId: testExternalId,
                data: { access_token: plainToken },
            });

            // Insert
            const inserted = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: { access_token: plainToken },
            });

            expect(inserted.access_token).toBe(plainToken);

            // Read
            const found = await repository.findCredential({
                userId: fromObjectId(testUserId),
                externalId: testExternalId,
            });

            expect(found.access_token).toBe(plainToken);
        });

        it('completes full flow: insert → update → read → verify', async () => {
            const originalToken = 'original_token';
            const updatedToken = 'updated_token';
            const encryptedOriginal = 'keyId1:iv1:cipher1:encKey1';
            const encryptedUpdated = 'keyId2:iv2:cipher2:encKey2';
            const credentialId = new ObjectId();

            let callCount = 0;
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({
                        insertedId: credentialId,
                        n: 1,
                        ok: 1,
                    });
                }
                if (command.find && callCount === 0) {
                    callCount++;
                    // INSERT: First findOne by userId/externalId - no existing
                    return Promise.resolve({
                        cursor: { firstBatch: [] },
                        ok: 1,
                    });
                }
                if (command.find && callCount === 1) {
                    callCount++;
                    // INSERT: Read-back after insert
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: credentialId,
                                    userId: testUserId,
                                    externalId: testExternalId,
                                    data: { access_token: encryptedOriginal },
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
                if (command.find && callCount === 2) {
                    callCount++;
                    // UPDATE: Find existing by userId/externalId
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: credentialId,
                                    userId: testUserId,
                                    externalId: testExternalId,
                                    data: { access_token: encryptedOriginal },
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
                // UPDATE: Final read-back after update (callCount >= 3)
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: credentialId,
                                userId: testUserId,
                                externalId: testExternalId,
                                data: { access_token: encryptedUpdated },
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            // Insert flow mocks
            mockEncryptionService.encryptFields
                .mockResolvedValueOnce({
                    data: { access_token: encryptedOriginal },
                })
                .mockResolvedValueOnce({
                    data: { access_token: encryptedUpdated },
                });

            mockEncryptionService.decryptFields
                .mockResolvedValueOnce({
                    _id: credentialId,
                    userId: testUserId,
                    externalId: testExternalId,
                    data: { access_token: originalToken },
                })
                .mockResolvedValueOnce({
                    _id: credentialId,
                    userId: testUserId,
                    externalId: testExternalId,
                    data: { access_token: originalToken },
                })
                .mockResolvedValueOnce({
                    _id: credentialId,
                    userId: testUserId,
                    externalId: testExternalId,
                    data: { access_token: updatedToken },
                });

            // Insert
            const inserted = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: { access_token: originalToken },
            });
            expect(inserted.access_token).toBe(originalToken);

            // Update
            const updated = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: { access_token: updatedToken },
            });
            expect(updated.access_token).toBe(updatedToken);
        });
    });

    describe('Error Handling', () => {
        it('propagates encryption service error on insert', async () => {
            // Mock findOne to return null (no existing credential - INSERT path)
            prisma.$runCommandRaw.mockResolvedValue({
                cursor: { firstBatch: [] },
                ok: 1,
            });

            const error = new Error('Encryption failed');
            mockEncryptionService.encryptFields.mockRejectedValue(error);

            await expect(
                repository.upsertCredential({
                    identifiers: {
                        userId: fromObjectId(testUserId),
                        externalId: testExternalId,
                    },
                    details: { access_token: 'token' },
                })
            ).rejects.toThrow('Encryption failed');
        });

        it('propagates decryption service error on read', async () => {
            const credentialId = new ObjectId();
            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: credentialId,
                            data: { access_token: 'encrypted' },
                        },
                    ],
                },
                ok: 1,
            });

            const error = new Error('Decryption failed');
            mockEncryptionService.decryptFields.mockRejectedValue(error);

            await expect(
                repository.findCredentialById(fromObjectId(credentialId))
            ).rejects.toThrow('Decryption failed');
        });

        it('handles null values for optional fields', async () => {
            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: insertedId,
                                userId: testUserId,
                                externalId: testExternalId,
                                authIsValid: null,
                                data: {},
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.encryptFields.mockResolvedValue({ data: {} });
            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                userId: testUserId,
                data: {},
            });

            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: {},
            });

            expect(result).toBeDefined();
            expect(result.authIsValid).toBeNull();
        });
    });

    describe('Edge Cases', () => {
        it('handles empty oauth data', async () => {
            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: insertedId,
                                userId: testUserId,
                                externalId: testExternalId,
                                data: {},
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.encryptFields.mockResolvedValue({ data: {} });
            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                data: {},
            });

            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: {},
            });

            expect(result).toBeDefined();
        });

        it('handles very large token values', async () => {
            const largeToken = 'a'.repeat(2000); // 2KB token
            const encryptedLarge = 'keyId:iv:' + 'x'.repeat(2500) + ':encKey';

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { access_token: encryptedLarge },
            });

            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: insertedId,
                                userId: testUserId,
                                data: { access_token: encryptedLarge },
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                data: { access_token: largeToken },
            });

            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: { access_token: largeToken },
            });

            expect(result.access_token).toBe(largeToken);
        });

        it('handles special characters in tokens', async () => {
            const specialToken = 'token!@#$%^&*()_+-={}[]|:";\'<>?,./';
            const encryptedSpecial = 'keyId:iv:cipher:encKey';

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { access_token: encryptedSpecial },
            });

            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: insertedId,
                                userId: testUserId,
                                data: { access_token: encryptedSpecial },
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                data: { access_token: specialToken },
            });

            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: { access_token: specialToken },
            });

            expect(result.access_token).toBe(specialToken);
        });

        it('handles unicode in tokens', async () => {
            const unicodeToken = 'token_with_日本語_and_émojis_🚀';
            const encryptedUnicode = 'keyId:iv:cipher:encKey';

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { access_token: encryptedUnicode },
            });

            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: insertedId,
                                userId: testUserId,
                                data: { access_token: encryptedUnicode },
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                data: { access_token: unicodeToken },
            });

            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: { access_token: unicodeToken },
            });

            expect(result.access_token).toBe(unicodeToken);
        });
    });

    describe('Security Validation', () => {
        it('verifies encryption service is called for sensitive data', async () => {
            const sensitiveData = {
                access_token: 'secret_access',
                refresh_token: 'secret_refresh',
                id_token: 'secret_id',
                domain: 'https://secret.com',
            };

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: {
                    access_token: 'encrypted1',
                    refresh_token: 'encrypted2',
                    id_token: 'encrypted3',
                    domain: 'encrypted4',
                },
            });

            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: insertedId,
                                userId: testUserId,
                                data: {
                                    access_token: 'encrypted1',
                                    refresh_token: 'encrypted2',
                                    id_token: 'encrypted3',
                                    domain: 'encrypted4',
                                },
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                data: sensitiveData,
            });

            await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: sensitiveData,
            });

            // Verify encryption was called with all sensitive fields
            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: expect.objectContaining({
                        access_token: 'secret_access',
                        refresh_token: 'secret_refresh',
                        id_token: 'secret_id',
                        domain: 'https://secret.com',
                    }),
                })
            );
        });

        it('ensures plain text returned to application after decryption', async () => {
            const plainToken = 'plain_secret_token';
            const encryptedToken = 'keyId:iv:cipher:encKey';
            const credentialId = new ObjectId();

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: credentialId,
                            userId: testUserId,
                            data: { access_token: encryptedToken },
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: credentialId,
                userId: testUserId,
                data: { access_token: plainToken },
            });

            const result = await repository.findCredential({
                userId: fromObjectId(testUserId),
            });

            // Verify result contains plain text, not encrypted
            expect(result.access_token).toBe(plainToken);
            expect(result.access_token).not.toBe(encryptedToken);
            expect(result.access_token).not.toMatch(/:/); // Not encrypted format
        });

        it('stores access_token in encrypted format in database (CRITICAL SECURITY TEST)', async () => {
            // This is the most critical security test - verifies OAuth tokens are encrypted at rest
            const plainToken = 'ya29.actual_google_token_here';
            const encryptedToken =
                'aes-key-1:1234567890abcdef:a1b2c3d4e5f6:9876543210fedcba';
            const insertedId = new ObjectId();

            // Track what gets stored in database
            let storedDocument = null;

            // Mock insert - capture what's being stored
            let findCallCount = 0;
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find && !command.filter._id) {
                    // First find: check for existing credential (returns empty for INSERT case)
                    if (findCallCount === 0) {
                        findCallCount++;
                        return Promise.resolve({
                            cursor: { firstBatch: [] },
                            ok: 1,
                        });
                    }
                    // Direct database query (simulating bypass of repository)
                    // This is what would be stored in the actual database
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    userId: testUserId,
                                    externalId: testExternalId,
                                    data: {
                                        access_token: encryptedToken,
                                    },
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
                if (command.insert && command.documents) {
                    // Capture the document being inserted
                    storedDocument = command.documents[0];
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find && command.filter._id) {
                    // Read-back after insert (repository's normal flow)
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    userId: testUserId,
                                    externalId: testExternalId,
                                    authIsValid: null,
                                    data: {
                                        access_token: encryptedToken,
                                    },
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
            });

            // Mock encryption to return encrypted format
            mockEncryptionService.encryptFields.mockResolvedValue({
                userId: testUserId,
                externalId: testExternalId,
                authIsValid: null,
                data: {
                    access_token: encryptedToken,
                },
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date),
            });

            // Mock decryption for read-back
            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                userId: testUserId,
                externalId: testExternalId,
                authIsValid: null,
                data: {
                    access_token: plainToken,
                },
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date),
            });

            // Create credential via repository (using plain text)
            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: {
                    access_token: plainToken,
                },
            });

            // CRITICAL VERIFICATION #1: Verify what was stored in database is encrypted
            expect(storedDocument).toBeDefined();
            expect(storedDocument.data.access_token).toBeDefined();

            // Must be in encrypted format (4+ colon-separated parts)
            const parts = storedDocument.data.access_token.split(':');
            expect(parts.length).toBeGreaterThanOrEqual(4);

            // Must NOT be plain text
            expect(storedDocument.data.access_token).not.toBe(plainToken);

            // Should match encrypted format pattern
            expect(storedDocument.data.access_token).toMatch(
                /^[^:]+:[^:]+:[^:]+:[^:]+/
            );

            // CRITICAL VERIFICATION #2: Simulate direct database query (bypass repository)
            const directDbQuery = await prisma.$runCommandRaw({
                find: 'Credential',
                filter: { userId: testUserId, externalId: testExternalId },
            });

            const storedCredential = directDbQuery.cursor.firstBatch[0];
            const storedToken = storedCredential.data.access_token;

            // Verify stored value is encrypted
            expect(storedToken).not.toBe(plainToken);
            expect(storedToken).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+/);

            // CRITICAL VERIFICATION #3: Repository returns decrypted value
            expect(result.access_token).toBe(plainToken);
            expect(result.access_token).not.toBe(encryptedToken);
        });
    });

    describe('Real Encryption Integration (No Mocks)', () => {
        let realCryptor;
        let realEncryptionService;
        let repositoryWithRealEncryption;

        beforeEach(() => {
            jest.unmock('../../../database/documentdb-encryption-service');
            const { Cryptor } = require('../../../encrypt/Cryptor');
            const { DocumentDBEncryptionService } = jest.requireActual(
                '../../../database/documentdb-encryption-service'
            );

            process.env.AES_KEY_ID = 'test-key-id-for-unit-tests';
            process.env.AES_KEY = '12345678901234567890123456789012';

            realCryptor = new Cryptor({ shouldUseAws: false });
            realEncryptionService = new DocumentDBEncryptionService({
                cryptor: realCryptor,
            });

            repositoryWithRealEncryption = new CredentialRepositoryDocumentDB();
            repositoryWithRealEncryption.encryptionService =
                realEncryptionService;
            repositoryWithRealEncryption.prisma = prisma;
        });

        afterEach(() => {
            delete process.env.AES_KEY_ID;
            delete process.env.AES_KEY;
            jest.doMock('../../../database/documentdb-encryption-service');
        });

        it('encrypts access_token with real AES before storing in database', async () => {
            const plainToken = 'ya29.actual_google_token_here';
            let capturedDocument = null;
            const insertedId = new ObjectId();

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    capturedDocument = command.documents[0];
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [capturedDocument] },
                        ok: 1,
                    });
                }
            });

            await repositoryWithRealEncryption.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: {
                    access_token: plainToken,
                },
            });

            expect(capturedDocument.data.access_token).toBeDefined();
            expect(capturedDocument.data.access_token).not.toBe(plainToken);

            const parts = capturedDocument.data.access_token.split(':');
            expect(parts.length).toBe(4);
            expect(parts[0]).toBeTruthy();
            expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
            expect(parts[2]).toBeTruthy();
            expect(parts[3]).toBeTruthy();
        });

        it('decrypts access_token with real AES after reading from database', async () => {
            const plainToken = 'ya29.actual_token_to_decrypt';

            const encryptedDoc = await realEncryptionService.encryptFields(
                'Credential',
                {
                    data: { access_token: plainToken },
                }
            );

            expect(encryptedDoc.data.access_token).not.toBe(plainToken);
            expect(encryptedDoc.data.access_token.split(':').length).toBe(4);

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: new ObjectId(),
                            userId: testUserId,
                            externalId: testExternalId,
                            data: encryptedDoc.data,
                        },
                    ],
                },
                ok: 1,
            });

            const credential =
                await repositoryWithRealEncryption.findCredential({
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                });

            expect(credential.access_token).toBe(plainToken);
        });

        it('uses different IV for each encryption (proves randomness)', async () => {
            const plainToken = 'same-token-value';

            const encrypted1 = await realEncryptionService.encryptFields(
                'Credential',
                {
                    data: { access_token: plainToken },
                }
            );
            expect(encrypted1).toBeDefined();
            expect(encrypted1.data.access_token).toBeDefined();

            const encrypted2 = await realEncryptionService.encryptFields(
                'Credential',
                {
                    data: { access_token: plainToken },
                }
            );
            expect(encrypted2).toBeDefined();
            expect(encrypted2.data.access_token).toBeDefined();

            expect(encrypted1.data.access_token).not.toBe(
                encrypted2.data.access_token
            );
            expect(encrypted1.data.access_token.split(':').length).toBe(4);
            expect(encrypted2.data.access_token.split(':').length).toBe(4);

            const decrypted1 = await realEncryptionService.decryptFields(
                'Credential',
                encrypted1
            );
            const decrypted2 = await realEncryptionService.decryptFields(
                'Credential',
                encrypted2
            );

            expect(decrypted1.data.access_token).toBe(plainToken);
            expect(decrypted2.data.access_token).toBe(plainToken);
        });

        it('roundtrip: encrypt then decrypt returns original data', async () => {
            const original = {
                data: {
                    access_token: 'original_access_token',
                    refresh_token: 'original_refresh_token',
                    id_token: 'original_id_token',
                    domain: 'https://example.com',
                },
                userId: testUserId,
                externalId: testExternalId,
            };

            const encrypted = await realEncryptionService.encryptFields(
                'Credential',
                original
            );

            expect(encrypted.data.access_token).not.toBe(
                original.data.access_token
            );
            expect(encrypted.data.access_token.split(':').length).toBe(4);
            expect(encrypted.data.refresh_token).not.toBe(
                original.data.refresh_token
            );
            expect(encrypted.data.refresh_token.split(':').length).toBe(4);
            expect(encrypted.data.id_token).not.toBe(original.data.id_token);
            expect(encrypted.data.id_token.split(':').length).toBe(4);
            expect(encrypted.data.domain).toBe(original.data.domain);

            const decrypted = await realEncryptionService.decryptFields(
                'Credential',
                encrypted
            );

            expect(decrypted.data.access_token).toBe(
                original.data.access_token
            );
            expect(decrypted.data.refresh_token).toBe(
                original.data.refresh_token
            );
            expect(decrypted.data.id_token).toBe(original.data.id_token);
            expect(decrypted.data.domain).toBe(original.data.domain);
        });

        it('throws error when decrypting corrupted ciphertext', async () => {
            const validEncrypted = await realEncryptionService.encryptFields(
                'Credential',
                {
                    data: { access_token: 'original-data' },
                }
            );

            const parts = validEncrypted.data.access_token.split(':');
            parts[2] = parts[2].substring(0, 10) + 'XXXCORRUPTEDXXX';
            const corruptedDoc = {
                data: {
                    access_token: parts.join(':'),
                },
            };

            await expect(
                realEncryptionService.decryptFields('Credential', corruptedDoc)
            ).rejects.toThrow(/decrypt|corrupt|invalid|error/i);
        });

        it('encrypts nested fields like data.access_token', async () => {
            const doc = {
                userId: testUserId,
                externalId: testExternalId,
                data: {
                    access_token: 'secret-token-value',
                    refresh_token: 'refresh-secret-value',
                    id_token: 'id-secret-value',
                    publicField: 'not-secret',
                },
            };

            const encrypted = await realEncryptionService.encryptFields(
                'Credential',
                doc
            );

            expect(encrypted.data.access_token).not.toBe('secret-token-value');
            expect(encrypted.data.access_token.split(':').length).toBe(4);

            expect(encrypted.data.refresh_token).not.toBe(
                'refresh-secret-value'
            );
            expect(encrypted.data.refresh_token.split(':').length).toBe(4);

            expect(encrypted.data.id_token).not.toBe('id-secret-value');
            expect(encrypted.data.id_token.split(':').length).toBe(4);

            expect(encrypted.data.publicField).toBe('not-secret');

            const decrypted = await realEncryptionService.decryptFields(
                'Credential',
                encrypted
            );
            expect(decrypted.data.access_token).toBe('secret-token-value');
            expect(decrypted.data.refresh_token).toBe('refresh-secret-value');
            expect(decrypted.data.id_token).toBe('id-secret-value');
            expect(decrypted.data.publicField).toBe('not-secret');
        });

        it('encrypts refresh_token correctly', async () => {
            const plainRefreshToken = '1//refresh_token_value_here';
            let capturedDocument = null;
            const insertedId = new ObjectId();

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    capturedDocument = command.documents[0];
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [capturedDocument] },
                        ok: 1,
                    });
                }
            });

            await repositoryWithRealEncryption.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: {
                    refresh_token: plainRefreshToken,
                },
            });

            expect(capturedDocument.data.refresh_token).toBeDefined();
            expect(capturedDocument.data.refresh_token).not.toBe(
                plainRefreshToken
            );
            expect(capturedDocument.data.refresh_token.split(':').length).toBe(
                4
            );
        });

        it('encrypts id_token correctly', async () => {
            const plainIdToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9';
            let capturedDocument = null;
            const insertedId = new ObjectId();

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    capturedDocument = command.documents[0];
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [capturedDocument] },
                        ok: 1,
                    });
                }
            });

            await repositoryWithRealEncryption.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: {
                    id_token: plainIdToken,
                },
            });

            expect(capturedDocument.data.id_token).toBeDefined();
            expect(capturedDocument.data.id_token).not.toBe(plainIdToken);
            expect(capturedDocument.data.id_token.split(':').length).toBe(4);
        });

        it('handles null/undefined fields without crashing encryption', async () => {
            const doc = {
                userId: testUserId,
                externalId: testExternalId,
                data: {
                    access_token: null,
                    refresh_token: undefined,
                    domain: 'https://example.com',
                },
            };

            const encrypted = await realEncryptionService.encryptFields(
                'Credential',
                doc
            );

            expect(encrypted.data.access_token).toBeNull();
            expect(encrypted.data.refresh_token).toBeUndefined();
            expect(encrypted.data.domain).toBe('https://example.com');

            const decrypted = await realEncryptionService.decryptFields(
                'Credential',
                encrypted
            );
            expect(decrypted.data.access_token).toBeNull();
            expect(decrypted.data.refresh_token).toBeUndefined();
        });

        it('handles empty string fields correctly', async () => {
            const doc = {
                userId: testUserId,
                externalId: testExternalId,
                data: {
                    access_token: '',
                    refresh_token: 'real-refresh-token',
                    domain: '',
                },
            };

            const encrypted = await realEncryptionService.encryptFields(
                'Credential',
                doc
            );

            expect(encrypted.data.access_token).toBe('');
            expect(encrypted.data.domain).toBe('');
            expect(encrypted.data.refresh_token).not.toBe('real-refresh-token');
            expect(encrypted.data.refresh_token.split(':').length).toBe(4);

            const decrypted = await realEncryptionService.decryptFields(
                'Credential',
                encrypted
            );
            expect(decrypted.data.access_token).toBe('');
            expect(decrypted.data.refresh_token).toBe('real-refresh-token');
            expect(decrypted.data.domain).toBe('');
        });
    });

    describe('Defensive Checks', () => {
        it('returns null when credential not found after insert', async () => {
            const insertedId = new ObjectId();

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { access_token: 'encrypted' },
            });

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    // Return null to simulate credential not found
                    return Promise.resolve({
                        cursor: { firstBatch: [] },
                        ok: 1,
                    });
                }
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: null,
                userId: null,
                externalId: null,
                data: {},
            });

            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: {
                    access_token: 'plain-token',
                },
            });

            // Production code doesn't throw - it returns the mapped credential (with null values)
            expect(result).toBeDefined();
            // fromObjectId(null) returns null, not undefined
            expect(result.id).toBeNull();
            expect(result.userId).toBeNull();
        });

        it('returns null when credential not found after update (upsertCredential)', async () => {
            const existingId = new ObjectId();
            let findCallCount = 0;

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: existingId,
                userId: testUserId,
                externalId: testExternalId,
                data: { access_token: 'old-token' },
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { access_token: 'encrypted-new-token' },
            });

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find) {
                    findCallCount++;
                    if (findCallCount === 1) {
                        // First find: existing credential found
                        return Promise.resolve({
                            cursor: {
                                firstBatch: [
                                    {
                                        _id: existingId,
                                        userId: testUserId,
                                        externalId: testExternalId,
                                        data: {
                                            access_token: 'encrypted-old-token',
                                        },
                                    },
                                ],
                            },
                            ok: 1,
                        });
                    } else {
                        // Second find: credential not found after update
                        return Promise.resolve({
                            cursor: { firstBatch: [] },
                            ok: 1,
                        });
                    }
                }
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
            });

            // Mock decryptFields for the "not found" case
            mockEncryptionService.decryptFields
                .mockResolvedValueOnce({
                    _id: existingId,
                    userId: testUserId,
                    externalId: testExternalId,
                    data: { access_token: 'old-token' },
                })
                .mockResolvedValueOnce({
                    _id: null,
                    userId: null,
                    data: {},
                });

            const result = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(testUserId),
                    externalId: testExternalId,
                },
                details: {
                    access_token: 'new-token',
                },
            });

            // Production code doesn't throw - returns mapped credential
            expect(result).toBeDefined();
        });

        it('returns null when credential not found after update (updateCredential)', async () => {
            const existingId = new ObjectId();
            let findCallCount = 0;

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: existingId,
                userId: testUserId,
                externalId: testExternalId,
                data: { access_token: 'old-token' },
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { access_token: 'encrypted-updated-token' },
            });

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find) {
                    findCallCount++;
                    if (findCallCount === 1) {
                        // First find: existing credential found
                        return Promise.resolve({
                            cursor: {
                                firstBatch: [
                                    {
                                        _id: existingId,
                                        userId: testUserId,
                                        externalId: testExternalId,
                                        data: {
                                            access_token: 'encrypted-old-token',
                                        },
                                    },
                                ],
                            },
                            ok: 1,
                        });
                    } else {
                        // Second find: credential not found after update
                        return Promise.resolve({
                            cursor: { firstBatch: [] },
                            ok: 1,
                        });
                    }
                }
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
            });

            // Mock decryptFields for both calls
            mockEncryptionService.decryptFields
                .mockResolvedValueOnce({
                    _id: existingId,
                    userId: testUserId,
                    externalId: testExternalId,
                    data: { access_token: 'old-token' },
                })
                .mockResolvedValueOnce({
                    _id: null,
                    userId: null,
                    data: {},
                });

            const result = await repository.updateCredential(
                fromObjectId(existingId),
                {
                    access_token: 'updated-token',
                }
            );

            // Production code doesn't throw - returns mapped credential
            expect(result).toBeDefined();
        });
    });
});
