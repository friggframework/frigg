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
const { CredentialRepositoryDocumentDB } = require('../credential-repository-documentdb');
const { DocumentDBEncryptionService } = require('../../../database/documentdb-encryption-service');

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
        DocumentDBEncryptionService.mockImplementation(() => mockEncryptionService);

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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
                details: { id_token: plainIdToken },
            });

            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: { id_token: plainIdToken },
                })
            );
        });

        it('encrypts domain before insert', async () => {
            const plainDomain = 'https://example.com';
            const encryptedDomain = 'keyId:iv:cipher:encKey';

            mockEncryptionService.encryptFields.mockResolvedValue({
                data: { domain: encryptedDomain },
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
                                    data: { domain: encryptedDomain },
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
                data: { domain: plainDomain },
            });

            await repository.upsertCredential({
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
                details: { domain: plainDomain },
            });

            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'Credential',
                expect.objectContaining({
                    data: { domain: plainDomain },
                })
            );
        });

        it('encrypts multiple tokens before insert', async () => {
            const plainData = {
                access_token: 'access_secret',
                refresh_token: 'refresh_secret',
                id_token: 'id_secret',
                domain: 'https://example.com',
            };

            const encryptedData = {
                access_token: 'keyId1:iv1:cipher1:encKey1',
                refresh_token: 'keyId2:iv2:cipher2:encKey2',
                id_token: 'keyId3:iv3:cipher3:encKey3',
                domain: 'keyId4:iv4:cipher4:encKey4',
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
                details: { access_token: 'new_token' },
            });

            // Verify authIsValid and externalId preserved in update
            const updateCall = prisma.$runCommandRaw.mock.calls.find(
                (call) => call[0].update
            );
            expect(updateCall).toBeDefined();
            expect(updateCall[0].updates[0].u.$set.authIsValid).toBe(true);
            expect(updateCall[0].updates[0].u.$set.externalId).toBe(testExternalId);
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

            const result = await repository.findCredentialById(fromObjectId(credentialId));

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

            const result = await repository.updateCredential(fromObjectId(credentialId), {
                access_token: 'new_token',
            });

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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                    return Promise.resolve({ insertedId: credentialId, n: 1, ok: 1 });
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
                .mockResolvedValueOnce({ data: { access_token: encryptedOriginal } })
                .mockResolvedValueOnce({ data: { access_token: encryptedUpdated } });

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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
                details: { access_token: originalToken },
            });
            expect(inserted.access_token).toBe(originalToken);

            // Update
            const updated = await repository.upsertCredential({
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                    identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
                identifiers: { userId: fromObjectId(testUserId), externalId: testExternalId },
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
            const encryptedToken = 'aes-key-1:1234567890abcdef:a1b2c3d4e5f6:9876543210fedcba';
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
            expect(storedDocument.data.access_token).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+/);

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
});
