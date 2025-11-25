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
const { IntegrationMappingRepositoryDocumentDB } = require('../integration-mapping-repository-documentdb');
const { DocumentDBEncryptionService } = require('../../../database/documentdb-encryption-service');

describe('IntegrationMappingRepositoryDocumentDB - Encryption Integration', () => {
    let repository;
    let mockEncryptionService;
    let testIntegrationId;
    let testSourceId;

    beforeEach(() => {
        // Create mock encryption service
        mockEncryptionService = {
            encryptFields: jest.fn(),
            decryptFields: jest.fn(),
        };

        // Mock the constructor to return our mock
        DocumentDBEncryptionService.mockImplementation(() => mockEncryptionService);

        // Create repository instance
        repository = new IntegrationMappingRepositoryDocumentDB();

        // Test data
        testIntegrationId = new ObjectId().toHexString();
        testSourceId = 'asana-task-123';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Encryption on Upsert (INSERT)', () => {
        it('encrypts mapping before insert', async () => {
            const plainMapping = {
                fieldMappings: {
                    taskTitle: 'frontify_asset_name',
                    description: 'frontify_description',
                },
                apiKey: 'sk_live_secret_key',
            };
            const encryptedMapping = 'keyId:iv:cipher:encKey';

            // Mock encryption
            mockEncryptionService.encryptFields.mockResolvedValue({
                mapping: encryptedMapping,
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
                                    integrationId: testIntegrationId,
                                    sourceId: testSourceId,
                                    mapping: encryptedMapping,
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
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: plainMapping,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Execute upsert (insert path - no existing)
            const result = await repository.upsertMapping(
                testIntegrationId,
                testSourceId,
                plainMapping
            );

            // Verify encryption was called
            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: plainMapping,
                })
            );

            // Verify decryption was called
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: encryptedMapping,
                })
            );

            // Verify result is decrypted
            expect(result.mapping).toEqual(plainMapping);
        });

        it('stores encrypted mapping in database', async () => {
            const plainMapping = { secret: 'sensitive-data' };
            const encryptedMapping = 'keyId:iv:cipher:encKey';

            mockEncryptionService.encryptFields.mockResolvedValue({
                mapping: encryptedMapping,
            });

            const insertedId = new ObjectId();
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    // Verify encrypted data goes to database
                    expect(command.documents[0].mapping).toBe(encryptedMapping);
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    integrationId: testIntegrationId,
                                    sourceId: testSourceId,
                                    mapping: encryptedMapping,
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
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: plainMapping,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await repository.upsertMapping(
                testIntegrationId,
                testSourceId,
                plainMapping
            );

            // Insert command was called with encrypted data
            const insertCalls = prisma.$runCommandRaw.mock.calls.filter(
                call => call[0].insert
            );
            expect(insertCalls.length).toBeGreaterThan(0);
        });
    });

    describe('Encryption on Upsert (UPDATE)', () => {
        it('decrypts existing, then encrypts before update', async () => {
            const existingMapping = { old: 'data' };
            const newMapping = { new: 'secret-data' };
            const encryptedOld = 'keyId1:iv1:cipher1:encKey1';
            const encryptedNew = 'keyId2:iv2:cipher2:encKey2';

            const existing = {
                _id: new ObjectId(),
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: encryptedOld,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // First find returns existing
            // Update succeeds
            // Second find returns updated
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find) {
                    const isFirstFind = !command.filter || command.filter.integrationId;
                    if (isFirstFind) {
                        return Promise.resolve({
                            cursor: { firstBatch: [existing] },
                            ok: 1,
                        });
                    } else {
                        // Second find after update
                        return Promise.resolve({
                            cursor: {
                                firstBatch: [
                                    {
                                        ...existing,
                                        mapping: encryptedNew,
                                        updatedAt: new Date(),
                                    },
                                ],
                            },
                            ok: 1,
                        });
                    }
                }
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
            });

            // Mock decryption of existing
            mockEncryptionService.decryptFields.mockResolvedValueOnce({
                ...existing,
                mapping: existingMapping,
            });

            // Mock encryption of new
            mockEncryptionService.encryptFields.mockResolvedValue({
                mapping: encryptedNew,
            });

            // Mock decryption of updated
            mockEncryptionService.decryptFields.mockResolvedValueOnce({
                ...existing,
                mapping: newMapping,
                updatedAt: new Date(),
            });

            // Execute upsert (update path - existing found)
            const result = await repository.upsertMapping(
                testIntegrationId,
                testSourceId,
                newMapping
            );

            // Verify decrypt existing was called
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: encryptedOld,
                })
            );

            // Verify encrypt new was called
            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: newMapping,
                })
            );

            // Verify result is decrypted
            expect(result.mapping).toEqual(newMapping);
        });

        it('preserves other fields during update', async () => {
            const existing = {
                _id: new ObjectId(),
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: 'keyId:iv:cipher:encKey',
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            };

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [existing] },
                        ok: 1,
                    });
                }
                if (command.update) {
                    // Verify createdAt is NOT in update
                    expect(command.update.$set.createdAt).toBeUndefined();
                    // Verify updatedAt IS in update
                    expect(command.update.$set.updatedAt).toBeDefined();
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                ...existing,
                mapping: { old: 'data' },
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                mapping: 'keyId:iv:cipher:encKey',
            });

            await repository.upsertMapping(
                testIntegrationId,
                testSourceId,
                { new: 'data' }
            );

            // Verify update was called
            const updateCalls = prisma.$runCommandRaw.mock.calls.filter(
                call => call[0].update
            );
            expect(updateCalls.length).toBeGreaterThan(0);
        });
    });

    describe('Decryption on Read', () => {
        it('findMappingBy returns decrypted mapping', async () => {
            const encryptedMapping = 'keyId:iv:cipher:encKey';
            const decryptedMapping = { secret: 'sensitive-data' };

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: new ObjectId(),
                            integrationId: testIntegrationId,
                            sourceId: testSourceId,
                            mapping: encryptedMapping,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: new ObjectId(),
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: decryptedMapping,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await repository.findMappingBy(
                testIntegrationId,
                testSourceId
            );

            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: encryptedMapping,
                })
            );

            expect(result.mapping).toEqual(decryptedMapping);
        });

        it('findMappingById returns decrypted mapping', async () => {
            const mappingId = new ObjectId();
            const encryptedMapping = 'keyId:iv:cipher:encKey';
            const decryptedMapping = { apiKey: 'secret' };

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: mappingId,
                            integrationId: testIntegrationId,
                            sourceId: testSourceId,
                            mapping: encryptedMapping,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: mappingId,
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: decryptedMapping,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await repository.findMappingById(fromObjectId(mappingId));

            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: encryptedMapping,
                })
            );

            expect(result.mapping).toEqual(decryptedMapping);
        });

        it('findMappingsByIntegration returns array of decrypted mappings', async () => {
            const mapping1 = { _id: new ObjectId(), mapping: 'encrypted1' };
            const mapping2 = { _id: new ObjectId(), mapping: 'encrypted2' };

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            ...mapping1,
                            integrationId: testIntegrationId,
                            sourceId: 'source-1',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                        {
                            ...mapping2,
                            integrationId: testIntegrationId,
                            sourceId: 'source-2',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields
                .mockResolvedValueOnce({
                    ...mapping1,
                    integrationId: testIntegrationId,
                    sourceId: 'source-1',
                    mapping: { decrypted: 'data1' },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .mockResolvedValueOnce({
                    ...mapping2,
                    integrationId: testIntegrationId,
                    sourceId: 'source-2',
                    mapping: { decrypted: 'data2' },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

            const results = await repository.findMappingsByIntegration(
                testIntegrationId
            );

            expect(mockEncryptionService.decryptFields).toHaveBeenCalledTimes(2);
            expect(results).toHaveLength(2);
            expect(results[0].mapping).toEqual({ decrypted: 'data1' });
            expect(results[1].mapping).toEqual({ decrypted: 'data2' });
        });
    });

    describe('Encryption on updateMapping', () => {
        it('decrypts existing, encrypts new, and decrypts result', async () => {
            const mappingId = new ObjectId();
            const existingMapping = { old: 'data' };
            const newMapping = { new: 'secret-data' };
            const encryptedOld = 'keyId1:iv1:cipher1:encKey1';
            const encryptedNew = 'keyId2:iv2:cipher2:encKey2';

            const existing = {
                _id: mappingId,
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: encryptedOld,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            let findCallCount = 0;
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find) {
                    findCallCount++;
                    if (findCallCount === 1) {
                        // First find returns existing
                        return Promise.resolve({
                            cursor: { firstBatch: [existing] },
                            ok: 1,
                        });
                    } else {
                        // Second find returns updated
                        return Promise.resolve({
                            cursor: {
                                firstBatch: [
                                    {
                                        ...existing,
                                        mapping: encryptedNew,
                                        updatedAt: new Date(),
                                    },
                                ],
                            },
                            ok: 1,
                        });
                    }
                }
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
            });

            // Mock decryption of existing
            mockEncryptionService.decryptFields.mockResolvedValueOnce({
                ...existing,
                mapping: existingMapping,
            });

            // Mock encryption of new
            mockEncryptionService.encryptFields.mockResolvedValue({
                mapping: encryptedNew,
            });

            // Mock decryption of updated
            mockEncryptionService.decryptFields.mockResolvedValueOnce({
                ...existing,
                mapping: newMapping,
                updatedAt: new Date(),
            });

            const result = await repository.updateMapping(fromObjectId(mappingId), {
                mapping: newMapping,
            });

            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: encryptedOld,
                })
            );

            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: newMapping,
                })
            );

            expect(result.mapping).toEqual(newMapping);
        });

        it('uses existing mapping if not provided in updates', async () => {
            const mappingId = new ObjectId();
            const existingMapping = { existing: 'secret-data' };
            const encryptedMapping = 'keyId:iv:cipher:encKey';

            const existing = {
                _id: mappingId,
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: encryptedMapping,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [existing] },
                        ok: 1,
                    });
                }
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                ...existing,
                mapping: existingMapping,
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                mapping: encryptedMapping,
            });

            await repository.updateMapping(fromObjectId(mappingId), {
                someOtherField: 'value',
            });

            // Verify encrypt was called with existing mapping
            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: existingMapping,
                })
            );
        });
    });

    describe('Data Format', () => {
        it('returns all expected fields including timestamps', async () => {
            const mappingId = new ObjectId();
            const createdAt = new Date('2024-01-01');
            const updatedAt = new Date('2024-01-02');

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: mappingId,
                            integrationId: testIntegrationId,
                            sourceId: testSourceId,
                            mapping: 'encrypted',
                            createdAt,
                            updatedAt,
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: mappingId,
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: { data: 'value' },
                createdAt,
                updatedAt,
            });

            const result = await repository.findMappingById(fromObjectId(mappingId));

            expect(result).toEqual({
                id: fromObjectId(mappingId),
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: { data: 'value' },
                createdAt,
                updatedAt,
            });
        });

        it('handles null sourceId correctly', async () => {
            const mappingId = new ObjectId();

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: mappingId,
                            integrationId: testIntegrationId,
                            sourceId: null,
                            mapping: 'encrypted',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: mappingId,
                integrationId: testIntegrationId,
                sourceId: null,
                mapping: { data: 'value' },
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await repository.findMappingById(fromObjectId(mappingId));

            expect(result.sourceId).toBeNull();
        });
    });
});

// ==========================================
// REAL ENCRYPTION INTEGRATION TESTS
// ==========================================

describe('IntegrationMappingRepositoryDocumentDB - Real Encryption Integration', () => {
    let repositoryWithRealEncryption;
    let realEncryptionService;
    let realCryptor;
    let testIntegrationId;
    let testSourceId;

    beforeEach(() => {
        // Unmock encryption service for real tests
        jest.unmock('../../../database/documentdb-encryption-service');
        const { Cryptor } = require('../../../encrypt/Cryptor');
        const { DocumentDBEncryptionService } = jest.requireActual('../../../database/documentdb-encryption-service');

        // Setup real encryption with test keys
        process.env.AES_KEY_ID = 'test-key-id-for-unit-tests';
        process.env.AES_KEY = '12345678901234567890123456789012'; // 32 bytes

        realCryptor = new Cryptor({ shouldUseAws: false });
        realEncryptionService = new DocumentDBEncryptionService({ cryptor: realCryptor });

        repositoryWithRealEncryption = new IntegrationMappingRepositoryDocumentDB();
        repositoryWithRealEncryption.encryptionService = realEncryptionService;
        repositoryWithRealEncryption.prisma = prisma;

        testIntegrationId = new ObjectId();
        testSourceId = 'asana-task-123';
    });

    afterEach(() => {
        delete process.env.AES_KEY_ID;
        delete process.env.AES_KEY;
        jest.doMock('../../../database/documentdb-encryption-service');
    });

    it('encrypts mapping with real AES encryption', async () => {
        const plainMapping = { apiKey: 'sk_live_secret_key', secret: 'sensitive-data' };

        const encrypted = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: plainMapping,
        });

        // Verify encrypted format
        expect(encrypted.mapping).not.toBe(JSON.stringify(plainMapping));
        expect(typeof encrypted.mapping).toBe('string');
        expect(encrypted.mapping.split(':').length).toBe(4); // keyId:iv:cipher:encKey
    });

    it('decrypts mapping with real AES decryption', async () => {
        const plainMapping = { secret: 'test-secret-12345' };

        const encrypted = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: plainMapping,
        });

        const decrypted = await realEncryptionService.decryptFields('IntegrationMapping', {
            mapping: encrypted.mapping,
        });

        expect(decrypted.mapping).toEqual(plainMapping);
    });

    it('uses different IV for each encryption (proves randomness)', async () => {
        const plainMapping = { same: 'mapping-data' };

        const encrypted1 = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: plainMapping,
        });

        const encrypted2 = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: plainMapping,
        });

        // Same plaintext produces different ciphertext (due to random IV)
        expect(encrypted1.mapping).not.toBe(encrypted2.mapping);

        // Both decrypt to same plaintext
        const decrypted1 = await realEncryptionService.decryptFields('IntegrationMapping', {
            mapping: encrypted1.mapping,
        });
        const decrypted2 = await realEncryptionService.decryptFields('IntegrationMapping', {
            mapping: encrypted2.mapping,
        });

        expect(decrypted1.mapping).toEqual(plainMapping);
        expect(decrypted2.mapping).toEqual(plainMapping);
    });

    it('roundtrip: encrypt then decrypt returns original data', async () => {
        const originalMapping = {
            fieldMappings: {
                taskTitle: 'frontify_asset_name',
                description: 'frontify_description',
                attachmentUrl: 'https://secret-presigned-url.example.com',
            },
            apiKey: 'sk_live_very_secret_key_12345',
            webhookSecret: 'whsec_secret_webhook_key',
        };

        // Encrypt
        const encrypted = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: originalMapping,
        });

        // Verify it's encrypted
        expect(encrypted.mapping).not.toEqual(originalMapping);
        expect(typeof encrypted.mapping).toBe('string');

        // Decrypt
        const decrypted = await realEncryptionService.decryptFields('IntegrationMapping', {
            mapping: encrypted.mapping,
        });

        // Verify round-trip success
        expect(decrypted.mapping).toEqual(originalMapping);
    });

    it('throws error when trying to decrypt corrupted ciphertext', async () => {
        const corruptedCiphertext = 'keyId:invalid-iv:corrupted-cipher:bad-encKey';

        await expect(
            realEncryptionService.decryptFields('IntegrationMapping', {
                mapping: corruptedCiphertext,
            })
        ).rejects.toThrow();
    });

    it('encrypts nested JSON objects in mapping field', async () => {
        const complexMapping = {
            level1: {
                level2: {
                    level3: {
                        secret: 'deeply-nested-secret',
                    },
                },
            },
            array: [1, 2, 3, { nested: 'value' }],
        };

        const encrypted = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: complexMapping,
        });

        expect(typeof encrypted.mapping).toBe('string');
        expect(encrypted.mapping).not.toEqual(complexMapping);

        const decrypted = await realEncryptionService.decryptFields('IntegrationMapping', {
            mapping: encrypted.mapping,
        });

        expect(decrypted.mapping).toEqual(complexMapping);
    });

    it('encrypts empty mapping object', async () => {
        const emptyMapping = {};

        const encrypted = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: emptyMapping,
        });

        const decrypted = await realEncryptionService.decryptFields('IntegrationMapping', {
            mapping: encrypted.mapping,
        });

        expect(decrypted.mapping).toEqual(emptyMapping);
    });

    it('handles large mapping objects', async () => {
        const largeMapping = {
            data: Array.from({ length: 100 }, (_, i) => ({
                key: `key-${i}`,
                value: `secret-value-${i}`,
                nested: {
                    field: `nested-${i}`,
                },
            })),
        };

        const encrypted = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: largeMapping,
        });

        const decrypted = await realEncryptionService.decryptFields('IntegrationMapping', {
            mapping: encrypted.mapping,
        });

        expect(decrypted.mapping).toEqual(largeMapping);
    });

    it('handles special characters in mapping', async () => {
        const specialCharMapping = {
            symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
            unicode: '你好世界 🎉 emoji test',
            quotes: "It's a 'test' with \"quotes\"",
        };

        const encrypted = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: specialCharMapping,
        });

        const decrypted = await realEncryptionService.decryptFields('IntegrationMapping', {
            mapping: encrypted.mapping,
        });

        expect(decrypted.mapping).toEqual(specialCharMapping);
    });
});

// ==========================================
// DEFENSIVE CHECKS TESTS
// ==========================================

describe('IntegrationMappingRepositoryDocumentDB - Defensive Checks', () => {
    let repository;
    let mockEncryptionService;
    let testIntegrationId;
    let testSourceId;

    beforeEach(() => {
        mockEncryptionService = {
            encryptFields: jest.fn(),
            decryptFields: jest.fn(),
        };

        DocumentDBEncryptionService.mockImplementation(() => mockEncryptionService);

        repository = new IntegrationMappingRepositoryDocumentDB();

        testIntegrationId = new ObjectId();
        testSourceId = 'asana-task-123';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('throws when mapping not found after insert', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const insertedId = new ObjectId();

        mockEncryptionService.encryptFields.mockResolvedValue({
            mapping: 'encrypted',
        });

        // Mock insert succeeds but read-back fails
        prisma.$runCommandRaw.mockImplementation((command) => {
            if (command.insert) {
                return Promise.resolve({ insertedId, n: 1, ok: 1 });
            }
            if (command.find) {
                // Simulate document not found
                return Promise.resolve({
                    cursor: { firstBatch: [] },
                    ok: 1,
                });
            }
        });

        await expect(
            repository.upsertMapping(
                testIntegrationId,
                testSourceId,
                { data: 'value' }
            )
        ).rejects.toThrow(/Failed to create mapping: Document not found after insert/);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[IntegrationMappingRepositoryDocumentDB] Mapping not found after insert',
            expect.objectContaining({
                insertedId: expect.any(String),
                integrationId: testIntegrationId,
                sourceId: testSourceId,
            })
        );

        consoleErrorSpy.mockRestore();
    });

    it('throws when mapping not found after update (upsertMapping)', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const existing = {
            _id: new ObjectId(),
            integrationId: testIntegrationId,
            sourceId: testSourceId,
            mapping: 'old-encrypted',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        let findCallCount = 0;
        prisma.$runCommandRaw.mockImplementation((command) => {
            if (command.find) {
                findCallCount++;
                if (findCallCount === 1) {
                    // First find returns existing
                    return Promise.resolve({
                        cursor: { firstBatch: [existing] },
                        ok: 1,
                    });
                } else {
                    // Second find after update returns nothing
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

        mockEncryptionService.decryptFields.mockResolvedValue({
            ...existing,
            mapping: { old: 'data' },
        });

        mockEncryptionService.encryptFields.mockResolvedValue({
            mapping: 'new-encrypted',
        });

        await expect(
            repository.upsertMapping(
                testIntegrationId,
                testSourceId,
                { new: 'data' }
            )
        ).rejects.toThrow(/Failed to update mapping: Document not found after update/);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[IntegrationMappingRepositoryDocumentDB] Mapping not found after update',
            expect.objectContaining({
                mappingId: fromObjectId(existing._id),
                integrationId: testIntegrationId,
                sourceId: testSourceId,
            })
        );

        consoleErrorSpy.mockRestore();
    });

    it('throws when mapping not found after update (updateMapping)', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const mappingId = new ObjectId();
        const existing = {
            _id: mappingId,
            integrationId: testIntegrationId,
            sourceId: testSourceId,
            mapping: 'encrypted',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        let findCallCount = 0;
        prisma.$runCommandRaw.mockImplementation((command) => {
            if (command.find) {
                findCallCount++;
                if (findCallCount === 1) {
                    // First find returns existing
                    return Promise.resolve({
                        cursor: { firstBatch: [existing] },
                        ok: 1,
                    });
                } else {
                    // Second find after update returns nothing
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

        mockEncryptionService.decryptFields.mockResolvedValue({
            ...existing,
            mapping: { data: 'value' },
        });

        mockEncryptionService.encryptFields.mockResolvedValue({
            mapping: 'new-encrypted',
        });

        await expect(
            repository.updateMapping(fromObjectId(mappingId), { mapping: { new: 'data' } })
        ).rejects.toThrow(/Failed to update mapping: Document not found after update/);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[IntegrationMappingRepositoryDocumentDB] Mapping not found after update',
            expect.objectContaining({
                mappingId: fromObjectId(mappingId),
            })
        );

        consoleErrorSpy.mockRestore();
    });
});
