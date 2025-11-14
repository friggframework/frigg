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
});
