// Mock dependencies BEFORE importing
jest.mock('../../../database/prisma', () => ({
    prisma: {
        $runCommandRaw: jest.fn(),
    },
}));
jest.mock('../../../database/documentdb-encryption-service');

import { ObjectId } from 'bson';
import { prisma } from '../../../database/prisma';
import {
    toObjectId,
    fromObjectId,
} from '../../../database/documentdb-utils';
import { IntegrationMappingRepositoryDocumentDB } from '../integration-mapping-repository-documentdb';
import { DocumentDBEncryptionService } from '../../../database/documentdb-encryption-service';

const MockedDocumentDBEncryptionService = DocumentDBEncryptionService as jest.MockedClass<typeof DocumentDBEncryptionService>;
const mockedPrisma = prisma as any;

describe('IntegrationMappingRepositoryDocumentDB - Encryption Integration', () => {
    let repository: any;
    let mockEncryptionService: any;
    let testIntegrationId: string;
    let testSourceId: string;

    beforeEach(() => {
        mockEncryptionService = {
            encryptFields: jest.fn(),
            decryptFields: jest.fn(),
        };

        MockedDocumentDBEncryptionService.mockImplementation(() => mockEncryptionService);

        repository = new IntegrationMappingRepositoryDocumentDB();

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

            mockEncryptionService.encryptFields.mockResolvedValue({
                mapping: encryptedMapping,
            });

            const insertedId = new ObjectId();
            mockedPrisma.$runCommandRaw.mockImplementation((command: any) => {
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

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: plainMapping,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await repository.upsertMapping(
                testIntegrationId,
                testSourceId,
                plainMapping
            );

            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: plainMapping,
                })
            );

            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'IntegrationMapping',
                expect.objectContaining({
                    mapping: encryptedMapping,
                })
            );

            expect(result.mapping).toEqual(plainMapping);
        });

        it('stores encrypted mapping in database', async () => {
            const plainMapping = { secret: 'sensitive-data' };
            const encryptedMapping = 'keyId:iv:cipher:encKey';

            mockEncryptionService.encryptFields.mockResolvedValue({
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: encryptedMapping,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date),
            });

            const insertedId = new ObjectId();
            let findCallCount = 0;
            mockedPrisma.$runCommandRaw.mockImplementation((command: any) => {
                if (command.insert) {
                    expect(command.documents[0].mapping).toBe(encryptedMapping);
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    findCallCount++;
                    if (findCallCount === 1) {
                        return Promise.resolve({
                            cursor: { firstBatch: [] },
                            ok: 1,
                        });
                    }
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

            const insertCalls = mockedPrisma.$runCommandRaw.mock.calls.filter(
                (call: any[]) => call[0].insert
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

            mockedPrisma.$runCommandRaw.mockImplementation((command: any) => {
                if (command.find) {
                    const isFirstFind = !command.filter || command.filter.integrationId;
                    if (isFirstFind) {
                        return Promise.resolve({
                            cursor: { firstBatch: [existing] },
                            ok: 1,
                        });
                    } else {
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

            mockEncryptionService.decryptFields.mockResolvedValueOnce({
                ...existing,
                mapping: existingMapping,
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                mapping: encryptedNew,
            });

            mockEncryptionService.decryptFields.mockResolvedValueOnce({
                ...existing,
                mapping: newMapping,
                updatedAt: new Date(),
            });

            const result = await repository.upsertMapping(
                testIntegrationId,
                testSourceId,
                newMapping
            );

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

        it('preserves other fields during update', async () => {
            const existing = {
                _id: new ObjectId(),
                integrationId: testIntegrationId,
                sourceId: testSourceId,
                mapping: 'keyId:iv:cipher:encKey',
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            };

            mockedPrisma.$runCommandRaw.mockImplementation((command: any) => {
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [existing] },
                        ok: 1,
                    });
                }
                if (command.update) {
                    const setFields = command.updates[0].u.$set;
                    expect(setFields.createdAt).toBeUndefined();
                    expect(setFields.updatedAt).toBeDefined();
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

            const updateCalls = mockedPrisma.$runCommandRaw.mock.calls.filter(
                (call: any[]) => call[0].update
            );
            expect(updateCalls.length).toBeGreaterThan(0);
        });
    });

    describe('Decryption on Read', () => {
        it('findMappingBy returns decrypted mapping', async () => {
            const encryptedMapping = 'keyId:iv:cipher:encKey';
            const decryptedMapping = { secret: 'sensitive-data' };

            mockedPrisma.$runCommandRaw.mockResolvedValue({
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

            mockedPrisma.$runCommandRaw.mockResolvedValue({
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

            mockedPrisma.$runCommandRaw.mockResolvedValue({
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
            mockedPrisma.$runCommandRaw.mockImplementation((command: any) => {
                if (command.find) {
                    findCallCount++;
                    if (findCallCount === 1) {
                        return Promise.resolve({
                            cursor: { firstBatch: [existing] },
                            ok: 1,
                        });
                    } else {
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

            mockEncryptionService.decryptFields.mockResolvedValueOnce({
                ...existing,
                mapping: existingMapping,
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                mapping: encryptedNew,
            });

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

            mockedPrisma.$runCommandRaw.mockImplementation((command: any) => {
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

            mockedPrisma.$runCommandRaw.mockResolvedValue({
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

            mockedPrisma.$runCommandRaw.mockResolvedValue({
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
    let repositoryWithRealEncryption: any;
    let realEncryptionService: any;
    let realCryptor: any;
    let testIntegrationId: any;
    let testSourceId: string;

    beforeEach(() => {
        jest.unmock('../../../database/documentdb-encryption-service');
        const { Cryptor } = require('../../../encrypt/Cryptor');
        const { DocumentDBEncryptionService } = jest.requireActual('../../../database/documentdb-encryption-service');

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

        expect(encrypted1.mapping).not.toBe(encrypted2.mapping);

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

        const encrypted = await realEncryptionService.encryptFields('IntegrationMapping', {
            mapping: originalMapping,
        });

        expect(encrypted.mapping).not.toEqual(originalMapping);
        expect(typeof encrypted.mapping).toBe('string');

        const decrypted = await realEncryptionService.decryptFields('IntegrationMapping', {
            mapping: encrypted.mapping,
        });

        expect(decrypted.mapping).toEqual(originalMapping);
    });

    it('throws error when trying to decrypt corrupted ciphertext', async () => {
        const corruptedCiphertext = 'QUFBQUFBQUFBQUFB:QUJDREVGR0hJSktM:QUFBQUFBQUFBQUFBQUFBQUFBQQ==:QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQ==';

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
            unicode: '\u4f60\u597d\u4e16\u754c \ud83c\udf89 emoji test',
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
    let repository: any;
    let mockEncryptionService: any;
    let testIntegrationId: any;
    let testSourceId: string;

    beforeEach(() => {
        mockEncryptionService = {
            encryptFields: jest.fn(),
            decryptFields: jest.fn(),
        };

        (DocumentDBEncryptionService as jest.MockedClass<typeof DocumentDBEncryptionService>).mockImplementation(() => mockEncryptionService);

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

        mockedPrisma.$runCommandRaw.mockImplementation((command: any) => {
            if (command.insert) {
                return Promise.resolve({ insertedId, n: 1, ok: 1 });
            }
            if (command.find) {
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
        mockedPrisma.$runCommandRaw.mockImplementation((command: any) => {
            if (command.find) {
                findCallCount++;
                if (findCallCount === 1) {
                    return Promise.resolve({
                        cursor: { firstBatch: [existing] },
                        ok: 1,
                    });
                } else {
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
        mockedPrisma.$runCommandRaw.mockImplementation((command: any) => {
            if (command.find) {
                findCallCount++;
                if (findCallCount === 1) {
                    return Promise.resolve({
                        cursor: { firstBatch: [existing] },
                        ok: 1,
                    });
                } else {
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
