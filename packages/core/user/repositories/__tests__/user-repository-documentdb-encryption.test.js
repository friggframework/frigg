// Mock dependencies BEFORE importing
jest.mock('../../../database/prisma', () => ({
    prisma: {
        $runCommandRaw: jest.fn(),
    },
}));
jest.mock('../../../database/documentdb-encryption-service');
jest.mock('../../../token/repositories/token-repository-factory', () => ({
    createTokenRepository: jest.fn(() => ({
        getJSONTokenFromBase64BufferToken: jest.fn(),
        validateAndGetToken: jest.fn(),
        createTokenWithExpire: jest.fn(),
        createBase64BufferToken: jest.fn(),
    })),
}));

const { ObjectId } = require('mongodb');
const { prisma } = require('../../../database/prisma');
const {
    toObjectId,
    fromObjectId,
} = require('../../../database/documentdb-utils');
const { UserRepositoryDocumentDB } = require('../user-repository-documentdb');
const { DocumentDBEncryptionService } = require('../../../database/documentdb-encryption-service');

describe('UserRepositoryDocumentDB - Encryption Integration', () => {
    let repository;
    let mockEncryptionService;
    let testUserId;

    beforeEach(() => {
        // Create mock encryption service
        mockEncryptionService = {
            encryptFields: jest.fn(),
            decryptFields: jest.fn(),
        };

        // Mock the constructor to return our mock
        DocumentDBEncryptionService.mockImplementation(() => mockEncryptionService);

        // Create repository instance
        repository = new UserRepositoryDocumentDB();

        // Test data
        testUserId = new ObjectId();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Encryption on Write', () => {
        it('encrypts hashword before insert (createIndividualUser)', async () => {
            const plainPassword = 'mySecretPassword123';
            const bcryptHash = '$2b$10$hashedPasswordHere';
            const encryptedHash = 'keyId:iv:cipher:encKey';

            // Mock bcrypt hash
            const bcrypt = require('bcryptjs');
            jest.spyOn(bcrypt, 'hash').mockResolvedValue(bcryptHash);

            // Mock encryption
            mockEncryptionService.encryptFields.mockResolvedValue({
                hashword: encryptedHash,
            });

            // Mock insert and read-back
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId: testUserId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: testUserId,
                                    type: 'INDIVIDUAL',
                                    email: 'test@example.com',
                                    username: 'testuser',
                                    hashword: encryptedHash,
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
                _id: testUserId,
                type: 'INDIVIDUAL',
                email: 'test@example.com',
                username: 'testuser',
                hashword: bcryptHash,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Create user
            await repository.createIndividualUser({
                email: 'test@example.com',
                username: 'testuser',
                hashword: plainPassword,
            });

            // Verify bcrypt was called
            expect(bcrypt.hash).toHaveBeenCalledWith(plainPassword, 10);

            // Verify encryption was called with bcrypt hash
            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'User',
                expect.objectContaining({
                    hashword: bcryptHash,
                })
            );

            // Verify decryption was called on read-back
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'User',
                expect.objectContaining({
                    hashword: encryptedHash,
                })
            );
        });

        it('encrypts hashword before update (updateIndividualUser)', async () => {
            const plainPassword = 'newPassword456';
            const bcryptHash = '$2b$10$newHashedPassword';
            const encryptedHash = 'keyId:iv:cipher:encKey';

            const bcrypt = require('bcryptjs');
            jest.spyOn(bcrypt, 'hash').mockResolvedValue(bcryptHash);

            mockEncryptionService.encryptFields.mockResolvedValue({
                hashword: encryptedHash,
            });

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: testUserId,
                                    type: 'INDIVIDUAL',
                                    hashword: encryptedHash,
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                hashword: bcryptHash,
            });

            await repository.updateIndividualUser(fromObjectId(testUserId), {
                hashword: plainPassword,
            });

            expect(bcrypt.hash).toHaveBeenCalledWith(plainPassword, 10);
            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'User',
                expect.objectContaining({
                    hashword: bcryptHash,
                })
            );
        });

        it('does not encrypt plain text password (only hashword)', async () => {
            const plainPassword = 'password123';
            const bcryptHash = '$2b$10$hashedVersion';
            const encryptedHash = 'keyId:iv:cipher:encKey';

            const bcrypt = require('bcryptjs');
            jest.spyOn(bcrypt, 'hash').mockResolvedValue(bcryptHash);

            mockEncryptionService.encryptFields.mockResolvedValue({
                hashword: encryptedHash,
            });

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId: testUserId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: testUserId,
                                type: 'INDIVIDUAL',
                                hashword: encryptedHash,
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                hashword: bcryptHash,
            });

            await repository.createIndividualUser({
                username: 'test',
                hashword: plainPassword,
            });

            // Verify plain password never passed to encryption
            expect(mockEncryptionService.encryptFields).not.toHaveBeenCalledWith(
                'User',
                expect.objectContaining({
                    hashword: plainPassword,
                })
            );

            // Verify hashed password passed to encryption
            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(
                'User',
                expect.objectContaining({
                    hashword: bcryptHash,
                })
            );
        });
    });

    describe('Decryption on Read', () => {
        it('decrypts hashword when reading (findIndividualUserById)', async () => {
            const bcryptHash = '$2b$10$hashedPassword';
            const encryptedHash = 'keyId:iv:cipher:encKey';

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: testUserId,
                            type: 'INDIVIDUAL',
                            username: 'testuser',
                            hashword: encryptedHash,
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                username: 'testuser',
                hashword: bcryptHash,
            });

            const user = await repository.findIndividualUserById(fromObjectId(testUserId));

            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(
                'User',
                expect.objectContaining({
                    hashword: encryptedHash,
                })
            );

            expect(user.hashword).toBe(bcryptHash);
        });

        it('decrypts hashword when finding by username', async () => {
            const bcryptHash = '$2b$10$hashedPassword';
            const encryptedHash = 'keyId:iv:cipher:encKey';

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: testUserId,
                            type: 'INDIVIDUAL',
                            username: 'testuser',
                            hashword: encryptedHash,
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                username: 'testuser',
                hashword: bcryptHash,
            });

            const user = await repository.findIndividualUserByUsername('testuser');

            expect(mockEncryptionService.decryptFields).toHaveBeenCalled();
            expect(user.hashword).toBe(bcryptHash);
        });

        it('decrypts hashword when finding by email', async () => {
            const bcryptHash = '$2b$10$hashedPassword';
            const encryptedHash = 'keyId:iv:cipher:encKey';

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: testUserId,
                            type: 'INDIVIDUAL',
                            email: 'test@example.com',
                            hashword: encryptedHash,
                        },
                    ],
                },
                ok: 1,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                email: 'test@example.com',
                hashword: bcryptHash,
            });

            const user = await repository.findIndividualUserByEmail('test@example.com');

            expect(mockEncryptionService.decryptFields).toHaveBeenCalled();
            expect(user.hashword).toBe(bcryptHash);
        });
    });

    describe('Stage-Based Bypass', () => {
        it('has encryption service configured', () => {
            // Repository delegates encryption to the service
            expect(repository.encryptionService).toBeDefined();
            expect(mockEncryptionService.encryptFields).toBeDefined();
            expect(mockEncryptionService.decryptFields).toBeDefined();
        });

        it('encryption service is called in production stage', async () => {
            const plainPassword = 'password123';
            const bcryptHash = '$2b$10$hashedPassword';
            const encryptedHash = 'keyId:iv:cipher:encKey';

            const bcrypt = require('bcryptjs');
            jest.spyOn(bcrypt, 'hash').mockResolvedValue(bcryptHash);

            // Mock encryption service as if in production (enabled)
            mockEncryptionService.encryptFields.mockResolvedValue({
                hashword: encryptedHash,
            });

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId: testUserId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: testUserId,
                                type: 'INDIVIDUAL',
                                hashword: encryptedHash,
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                hashword: bcryptHash,
            });

            await repository.createIndividualUser({
                username: 'testuser',
                hashword: plainPassword,
            });

            // Verify encryption service was called (production behavior)
            expect(mockEncryptionService.encryptFields).toHaveBeenCalled();
            expect(mockEncryptionService.decryptFields).toHaveBeenCalled();
        });

        it('encryption bypass works in dev stage', async () => {
            // Simulate dev stage bypass: encryption service returns unchanged data
            const plainPassword = 'password123';
            const bcryptHash = '$2b$10$hashedPassword';

            const bcrypt = require('bcryptjs');
            jest.spyOn(bcrypt, 'hash').mockResolvedValue(bcryptHash);

            // Mock encryption service as if in dev stage (bypass - returns unchanged)
            mockEncryptionService.encryptFields.mockResolvedValue({
                hashword: bcryptHash, // Returns plain bcrypt hash (not encrypted)
            });

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId: testUserId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: testUserId,
                                type: 'INDIVIDUAL',
                                hashword: bcryptHash, // Stored as plain bcrypt hash
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                hashword: bcryptHash, // Returns unchanged
            });

            const user = await repository.createIndividualUser({
                username: 'testuser',
                hashword: plainPassword,
            });

            // Verify hashword is bcrypt format (not encrypted)
            expect(user.hashword).toBe(bcryptHash);
            expect(user.hashword).toMatch(/^\$2b\$/); // Bcrypt format
        });
    });

    describe('Edge Cases', () => {
        it('handles null hashword (no password)', async () => {
            mockEncryptionService.encryptFields.mockResolvedValue({});

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId: testUserId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: testUserId,
                                type: 'INDIVIDUAL',
                                username: 'testuser',
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                username: 'testuser',
            });

            const user = await repository.createIndividualUser({
                username: 'testuser',
            });

            expect(user.hashword).toBeNull();
        });

        it('handles empty string hashword', async () => {
            mockEncryptionService.encryptFields.mockResolvedValue({});

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId: testUserId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: testUserId,
                                type: 'INDIVIDUAL',
                                username: 'testuser',
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                username: 'testuser',
            });

            const user = await repository.createIndividualUser({
                username: 'testuser',
                hashword: '',
            });

            expect(user).toBeDefined();
        });

        it('rejects already hashed passwords', async () => {
            await expect(
                repository.createIndividualUser({
                    username: 'test',
                    hashword: '$2b$10$alreadyHashed',
                })
            ).rejects.toThrow('Password appears to be already hashed');
        });
    });

    describe('Error Handling', () => {
        it('propagates encryption service error', async () => {
            const bcrypt = require('bcryptjs');
            jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2b$10$hash');

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId: testUserId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: { firstBatch: [] },
                    ok: 1,
                });
            });

            const error = new Error('Encryption failed');
            mockEncryptionService.encryptFields.mockRejectedValue(error);

            await expect(
                repository.createIndividualUser({
                    username: 'test',
                    hashword: 'password',
                })
            ).rejects.toThrow('Encryption failed');
        });

        it('propagates decryption service error', async () => {
            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: testUserId,
                            type: 'INDIVIDUAL',
                            hashword: 'encrypted',
                        },
                    ],
                },
                ok: 1,
            });

            const error = new Error('Decryption failed');
            mockEncryptionService.decryptFields.mockRejectedValue(error);

            await expect(
                repository.findIndividualUserById(fromObjectId(testUserId))
            ).rejects.toThrow('Decryption failed');
        });
    });

    describe('Security Validation', () => {
        it('stores hashword in encrypted format in database (CRITICAL SECURITY TEST)', async () => {
            // This critical test verifies password hashes are encrypted at rest
            const plainPassword = 'mySecurePassword123';
            const bcryptHash = '$2b$10$hashedPasswordValue';
            const encryptedHash = 'aes-key-1:1234567890abcdef:a1b2c3d4e5f6:9876543210fedcba';
            const insertedId = new ObjectId();

            // Track what gets stored in database
            let storedDocument = null;

            const bcrypt = require('bcryptjs');
            jest.spyOn(bcrypt, 'hash').mockResolvedValue(bcryptHash);

            // Mock database operations with tracking
            let insertCompleted = false;
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert && command.documents) {
                    // Capture the document being inserted
                    storedDocument = command.documents[0];
                    insertCompleted = true;
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find === 'User' && command.filter && command.filter._id) {
                    // Read-back after insert (repository's normal flow)
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    type: 'INDIVIDUAL',
                                    username: 'testuser',
                                    email: 'test@example.com',
                                    hashword: encryptedHash,
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
                if (command.find === 'User' && command.filter && !command.filter._id) {
                    // Non-_id queries
                    if (!insertCompleted) {
                        // Before insert: createIndividualUser checking if user exists
                        return Promise.resolve({
                            cursor: { firstBatch: [] },
                            ok: 1,
                        });
                    }
                    // After insert: Direct database query in test
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [
                                {
                                    _id: insertedId,
                                    type: 'INDIVIDUAL',
                                    username: 'testuser',
                                    hashword: encryptedHash,
                                },
                            ],
                        },
                        ok: 1,
                    });
                }
                // Default fallback
                return Promise.resolve({
                    cursor: { firstBatch: [] },
                    ok: 1,
                });
            });

            // Mock encryption to return encrypted format
            mockEncryptionService.encryptFields.mockResolvedValue({
                type: 'INDIVIDUAL',
                username: 'testuser',
                email: 'test@example.com',
                hashword: encryptedHash,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date),
            });

            // Mock decryption for read-back
            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: insertedId,
                type: 'INDIVIDUAL',
                username: 'testuser',
                email: 'test@example.com',
                hashword: bcryptHash,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date),
            });

            // Create user via repository (using plain password)
            const result = await repository.createIndividualUser({
                username: 'testuser',
                email: 'test@example.com',
                hashword: plainPassword,
            });

            // CRITICAL VERIFICATION #1: Verify what was stored in database is encrypted
            expect(storedDocument).toBeDefined();
            expect(storedDocument.hashword).toBeDefined();

            // Must be in encrypted format (4+ colon-separated parts)
            const parts = storedDocument.hashword.split(':');
            expect(parts.length).toBeGreaterThanOrEqual(4);

            // Must NOT be plain bcrypt hash
            expect(storedDocument.hashword).not.toBe(bcryptHash);

            // Should match encrypted format pattern
            expect(storedDocument.hashword).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+/);

            // CRITICAL VERIFICATION #2: Simulate direct database query (bypass repository)
            const directDbQuery = await prisma.$runCommandRaw({
                find: 'User',
                filter: { type: 'INDIVIDUAL', username: 'testuser' },
            });

            const storedUser = directDbQuery.cursor.firstBatch[0];
            expect(storedUser).toBeDefined();
            expect(storedUser.hashword).toBeDefined();

            const storedHashword = storedUser.hashword;

            // Verify stored value is encrypted
            expect(storedHashword).not.toBe(bcryptHash);
            expect(storedHashword).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+/);

            // CRITICAL VERIFICATION #3: Repository returns decrypted bcrypt hash
            expect(result.hashword).toBe(bcryptHash);
            expect(result.hashword).not.toBe(encryptedHash);
            expect(result.hashword).toMatch(/^\$2b\$/); // Bcrypt format
        });

        it('verifies encryption prevents password hash exposure', async () => {
            const plainPassword = 'password123';
            const bcryptHash = '$2b$10$hashedPassword';
            const encryptedHash = 'keyId:iv:cipher:encKey';

            const bcrypt = require('bcryptjs');
            jest.spyOn(bcrypt, 'hash').mockResolvedValue(bcryptHash);

            let storedDocument = null;

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert && command.documents) {
                    storedDocument = command.documents[0];
                    return Promise.resolve({ insertedId: testUserId, n: 1, ok: 1 });
                }
                return Promise.resolve({
                    cursor: {
                        firstBatch: [
                            {
                                _id: testUserId,
                                type: 'INDIVIDUAL',
                                hashword: encryptedHash,
                            },
                        ],
                    },
                    ok: 1,
                });
            });

            mockEncryptionService.encryptFields.mockResolvedValue({
                hashword: encryptedHash,
            });

            mockEncryptionService.decryptFields.mockResolvedValue({
                _id: testUserId,
                type: 'INDIVIDUAL',
                hashword: bcryptHash,
            });

            await repository.createIndividualUser({
                username: 'testuser',
                hashword: plainPassword,
            });

            // Verify: Even bcrypt hashes are encrypted at rest
            expect(storedDocument.hashword).toBe(encryptedHash);
            expect(storedDocument.hashword).not.toBe(bcryptHash);
            expect(storedDocument.hashword).not.toMatch(/^\$2b\$/);
        });
    });

    describe('Real Encryption Integration (No Mocks)', () => {
        let realCryptor;
        let realEncryptionService;
        let repositoryWithRealEncryption;

        beforeEach(() => {
            // Use real implementation instead of mock
            jest.unmock('../../../database/documentdb-encryption-service');
            const { Cryptor } = require('../../../encrypt/Cryptor');
            const { DocumentDBEncryptionService } = jest.requireActual('../../../database/documentdb-encryption-service');

            process.env.AES_KEY_ID = 'test-key-id-for-unit-tests';
            process.env.AES_KEY = '12345678901234567890123456789012';

            realCryptor = new Cryptor({ shouldUseAws: false });
            realEncryptionService = new DocumentDBEncryptionService({ cryptor: realCryptor });

            repositoryWithRealEncryption = new UserRepositoryDocumentDB();
            repositoryWithRealEncryption.encryptionService = realEncryptionService;
            repositoryWithRealEncryption.prisma = prisma;
        });

        afterEach(() => {
            delete process.env.AES_KEY_ID;
            delete process.env.AES_KEY;
            jest.doMock('../../../database/documentdb-encryption-service');
        });

        it('encrypts hashword with real AES before storing in database', async () => {
            const plainPassword = 'test-password-123';
            const bcryptHash = '$2b$10$N9qo8uLOickgx2ZMRZoMye';

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

            await repositoryWithRealEncryption.createIndividualUser({
                username: 'testuser',
                hashword: plainPassword,
            });

            expect(capturedDocument.hashword).toBeDefined();
            expect(capturedDocument.hashword).not.toBe(bcryptHash);
            expect(capturedDocument.hashword).not.toBe(plainPassword);
            expect(capturedDocument.hashword).not.toContain('$2b$');

            const parts = capturedDocument.hashword.split(':');
            expect(parts.length).toBe(4);
            expect(parts[0]).toBeTruthy();
            expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
            expect(parts[2]).toBeTruthy();
            expect(parts[3]).toBeTruthy();
        });

        it('decrypts hashword with real AES after reading from database', async () => {
            const bcryptHash = '$2b$10$exampleHashValue1234567890123456789012345678';

            const encryptedDoc = await realEncryptionService.encryptFields('User', {
                hashword: bcryptHash,
            });

            expect(encryptedDoc.hashword).not.toBe(bcryptHash);
            expect(encryptedDoc.hashword.split(':').length).toBe(4);

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: new ObjectId(),
                            type: 'INDIVIDUAL',
                            username: 'testuser',
                            hashword: encryptedDoc.hashword,
                        },
                    ],
                },
                ok: 1,
            });

            const user = await repositoryWithRealEncryption.findIndividualUserById('some-id');

            expect(user.hashword).toBe(bcryptHash);
        });

        it('uses different IV for each encryption (proves randomness)', async () => {
            const bcryptHash = '$2b$10$testHashValue1234567890';

            const encrypted1 = await realEncryptionService.encryptFields('User', {
                hashword: bcryptHash,
            });
            expect(encrypted1).toBeDefined();
            expect(encrypted1.hashword).toBeDefined();

            const encrypted2 = await realEncryptionService.encryptFields('User', {
                hashword: bcryptHash,
            });
            expect(encrypted2).toBeDefined();
            expect(encrypted2.hashword).toBeDefined();

            expect(encrypted1.hashword).not.toBe(encrypted2.hashword);
            expect(encrypted1.hashword.split(':').length).toBe(4);
            expect(encrypted2.hashword.split(':').length).toBe(4);

            const decrypted1 = await realEncryptionService.decryptFields('User', encrypted1);
            const decrypted2 = await realEncryptionService.decryptFields('User', encrypted2);

            expect(decrypted1.hashword).toBe(bcryptHash);
            expect(decrypted2.hashword).toBe(bcryptHash);
        });

        it('handles null/undefined fields without crashing encryption', async () => {
            const doc = {
                username: 'test',
                hashword: null,
                email: undefined,
            };

            const encrypted = await realEncryptionService.encryptFields('User', doc);

            expect(encrypted.username).toBe('test');
            expect(encrypted.hashword).toBeNull();
            expect(encrypted.email).toBeUndefined();

            const decrypted = await realEncryptionService.decryptFields('User', encrypted);
            expect(decrypted.hashword).toBeNull();
            expect(decrypted.email).toBeUndefined();
        });

        it('handles empty string fields correctly', async () => {
            const doc = {
                username: '',
                hashword: 'real-password',
                email: '',
            };

            const encrypted = await realEncryptionService.encryptFields('User', doc);

            expect(encrypted.username).toBe('');
            expect(encrypted.email).toBe('');
            expect(encrypted.hashword).not.toBe('real-password');
            expect(encrypted.hashword.split(':').length).toBe(4);

            const decrypted = await realEncryptionService.decryptFields('User', encrypted);
            expect(decrypted.username).toBe('');
            expect(decrypted.hashword).toBe('real-password');
            expect(decrypted.email).toBe('');
        });

        it('roundtrip: encrypt then decrypt returns original data', async () => {
            const original = {
                hashword: '$2b$10$originalBcryptHash12345',
                username: 'testuser',
                email: 'test@example.com',
            };

            const encrypted = await realEncryptionService.encryptFields('User', original);

            expect(encrypted.hashword).not.toBe(original.hashword);
            expect(encrypted.hashword.split(':').length).toBe(4);
            expect(encrypted.username).toBe(original.username);
            expect(encrypted.email).toBe(original.email);

            const decrypted = await realEncryptionService.decryptFields('User', encrypted);

            expect(decrypted.hashword).toBe(original.hashword);
            expect(decrypted.username).toBe(original.username);
            expect(decrypted.email).toBe(original.email);
        });

        it('throws error when decrypting corrupted ciphertext', async () => {
            const validEncrypted = await realEncryptionService.encryptFields('User', {
                hashword: 'original-data',
            });

            const parts = validEncrypted.hashword.split(':');
            parts[2] = parts[2].substring(0, 10) + 'XXXCORRUPTEDXXX';
            const corruptedDoc = {
                hashword: parts.join(':'),
            };

            await expect(realEncryptionService.decryptFields('User', corruptedDoc))
                .rejects
                .toThrow(/decrypt|corrupt|invalid|error/i);
        });

        it('encrypts nested fields like data.access_token', async () => {
            const doc = {
                userId: '123',
                data: {
                    access_token: 'secret-token-value',
                    refresh_token: 'refresh-secret-value',
                    publicField: 'not-secret',
                },
            };

            const encrypted = await realEncryptionService.encryptFields('Credential', doc);

            expect(encrypted.data.access_token).not.toBe('secret-token-value');
            expect(encrypted.data.access_token.split(':').length).toBe(4);

            expect(encrypted.data.refresh_token).not.toBe('refresh-secret-value');
            expect(encrypted.data.refresh_token.split(':').length).toBe(4);

            expect(encrypted.data.publicField).toBe('not-secret');

            const decrypted = await realEncryptionService.decryptFields('Credential', encrypted);
            expect(decrypted.data.access_token).toBe('secret-token-value');
            expect(decrypted.data.refresh_token).toBe('refresh-secret-value');
            expect(decrypted.data.publicField).toBe('not-secret');
        });
    });

    describe('Defensive Checks', () => {
        it('throws when individual user not found after insert', async () => {
            const bcrypt = require('bcryptjs');
            jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2b$10$hash');

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            const insertedId = new ObjectId();

            mockEncryptionService.encryptFields.mockResolvedValue({
                type: 'INDIVIDUAL',
                username: 'testuser',
                hashword: 'encrypted',
            });

            // Mock insert succeeds but findOne returns null
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [] },  // Document not found!
                        ok: 1,
                    });
                }
            });

            await expect(
                repository.createIndividualUser({
                    username: 'testuser',
                    hashword: 'password',
                })
            ).rejects.toThrow(/Failed to create individual user: Document not found after insert/);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[UserRepositoryDocumentDB] User not found after insert',
                expect.objectContaining({
                    insertedId: expect.any(String),
                    params: expect.objectContaining({
                        username: 'testuser'
                    })
                })
            );

            consoleErrorSpy.mockRestore();
        });

        it('throws when organization user not found after insert', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            const insertedId = new ObjectId();

            mockEncryptionService.encryptFields.mockResolvedValue({
                type: 'ORGANIZATION',
                appOrgId: 'org-123',
            });

            // Mock insert succeeds but findOne returns null
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [] },  // Document not found!
                        ok: 1,
                    });
                }
            });

            await expect(
                repository.createOrganizationUser({
                    appOrgId: 'org-123',
                })
            ).rejects.toThrow(/Failed to create organization user: Document not found after insert/);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[UserRepositoryDocumentDB] Organization user not found after insert',
                expect.objectContaining({
                    insertedId: expect.any(String),
                    params: expect.objectContaining({
                        appOrgId: 'org-123'
                    })
                })
            );

            consoleErrorSpy.mockRestore();
        });

        it('throws when individual user not found after update', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            mockEncryptionService.encryptFields.mockResolvedValue({
                name: 'Updated',
            });

            // Mock update succeeds but findOne returns null
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [] },  // Document not found!
                        ok: 1,
                    });
                }
            });

            await expect(
                repository.updateIndividualUser(fromObjectId(testUserId), {
                    email: 'new@example.com',
                })
            ).rejects.toThrow(/Failed to update individual user: Document not found after update/);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[UserRepositoryDocumentDB] Individual user not found after update',
                expect.objectContaining({
                    userId: expect.any(String),
                    updates: expect.objectContaining({
                        email: 'new@example.com'
                    })
                })
            );

            consoleErrorSpy.mockRestore();
        });

        it('throws when organization user not found after update', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            mockEncryptionService.encryptFields.mockResolvedValue({
                name: 'Updated',
            });

            // Mock update succeeds but findOne returns null
            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.update) {
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: { firstBatch: [] },  // Document not found!
                        ok: 1,
                    });
                }
            });

            await expect(
                repository.updateOrganizationUser(fromObjectId(testUserId), {
                    name: 'Updated Name',
                })
            ).rejects.toThrow(/Failed to update organization user: Document not found after update/);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[UserRepositoryDocumentDB] Organization user not found after update',
                expect.objectContaining({
                    userId: expect.any(String),
                    updates: expect.objectContaining({
                        name: 'Updated Name'
                    })
                })
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe('Date Handling', () => {
        it('sets valid createdAt and updatedAt timestamps on user creation', async () => {
            const insertedId = new ObjectId();
            const beforeCreate = Date.now();

            mockEncryptionService.encryptFields.mockImplementation(async (modelName, doc) => doc);
            mockEncryptionService.decryptFields.mockImplementation(async (modelName, doc) => doc);

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.insert) {
                    // Capture timestamps at insert time
                    const doc = command.documents[0];
                    expect(doc.createdAt).toBeInstanceOf(Date);
                    expect(doc.updatedAt).toBeInstanceOf(Date);
                    expect(doc.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate);
                    expect(doc.updatedAt.getTime()).toBe(doc.createdAt.getTime());

                    return Promise.resolve({ insertedId, n: 1, ok: 1 });
                }
                if (command.find) {
                    const now = new Date();
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [{
                                _id: insertedId,
                                type: 'INDIVIDUAL',
                                username: 'testuser',
                                createdAt: now,
                                updatedAt: now,
                            }],
                        },
                        ok: 1,
                    });
                }
            });

            const user = await repository.createIndividualUser({
                username: 'testuser',
                hashword: 'password',
            });

            expect(user.createdAt).toBeInstanceOf(Date);
            expect(user.updatedAt).toBeInstanceOf(Date);
            expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate);
        });

        it('updates updatedAt timestamp on user update', async () => {
            const initialDate = new Date('2024-01-01');
            const updateDate = new Date();

            mockEncryptionService.encryptFields.mockImplementation(async (modelName, payload) => payload);
            mockEncryptionService.decryptFields.mockImplementation(async (modelName, doc) => doc);

            let capturedUpdatePayload = null;

            prisma.$runCommandRaw.mockImplementation((command) => {
                if (command.update) {
                    capturedUpdatePayload = command.updates[0].u.$set;
                    expect(capturedUpdatePayload.updatedAt).toBeInstanceOf(Date);
                    expect(capturedUpdatePayload.updatedAt.getTime()).toBeGreaterThan(initialDate.getTime());
                    return Promise.resolve({ nModified: 1, n: 1, ok: 1 });
                }
                if (command.find) {
                    return Promise.resolve({
                        cursor: {
                            firstBatch: [{
                                _id: testUserId,
                                type: 'INDIVIDUAL',
                                username: 'testuser',
                                email: 'updated@example.com',
                                createdAt: initialDate,
                                updatedAt: updateDate,
                            }],
                        },
                        ok: 1,
                    });
                }
            });

            const user = await repository.updateIndividualUser(fromObjectId(testUserId), {
                email: 'updated@example.com',
            });

            expect(user.updatedAt).toBeInstanceOf(Date);
            expect(user.updatedAt.getTime()).toBeGreaterThan(initialDate.getTime());
        });

        it('returns undefined for invalid dates from database without crashing', async () => {
            mockEncryptionService.decryptFields.mockImplementation(async (modelName, doc) => doc);

            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [{
                        _id: testUserId,
                        type: 'INDIVIDUAL',
                        username: 'testuser',
                        createdAt: 'corrupted-date-value',
                        updatedAt: NaN,
                    }],
                },
                ok: 1,
            });

            const user = await repository.findIndividualUserById(fromObjectId(testUserId));

            // Should not crash and should return undefined for invalid dates
            expect(user).toBeDefined();
            expect(user.username).toBe('testuser');
            expect(user.createdAt).toBeUndefined(); // Not Invalid Date object
            expect(user.updatedAt).toBeUndefined(); // Not Invalid Date object

            // Verify it's not returning Invalid Date objects
            if (user.createdAt !== undefined) {
                expect(isNaN(user.createdAt.getTime())).toBe(false);
            }
            if (user.updatedAt !== undefined) {
                expect(isNaN(user.updatedAt.getTime())).toBe(false);
            }
        });

        it('handles various date formats when reading from database (public API)', async () => {
            mockEncryptionService.decryptFields.mockImplementation((modelName, doc) => doc);

            // Test with mix of valid and invalid dates from database
            const validDate = new Date('2024-01-15T10:30:00Z');
            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    firstBatch: [
                        {
                            _id: testUserId,
                            type: 'INDIVIDUAL',
                            username: 'testuser',
                            createdAt: validDate, // Valid Date object
                            updatedAt: 'invalid-date-string', // Invalid date string
                        },
                    ],
                },
                ok: 1,
            });

            // Use PUBLIC API (not private _mapUser method)
            const user = await repository.findIndividualUserById(fromObjectId(testUserId));

            // Valid date preserved
            expect(user.createdAt).toBeInstanceOf(Date);
            expect(user.createdAt.getTime()).toBe(validDate.getTime());

            // Invalid date handled gracefully (returns undefined, not Invalid Date)
            expect(user.updatedAt).toBeUndefined();

            // Other fields unaffected
            expect(user.username).toBe('testuser');
        });
    });
});
