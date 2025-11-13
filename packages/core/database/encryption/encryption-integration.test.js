/**
 * Integration tests for field-level encryption
 * Tests transparent encryption/decryption with Prisma for MongoDB and PostgreSQL
 *
 * These tests verify:
 * - Create operations encrypt fields
 * - Read operations decrypt fields
 * - Update operations handle encryption
 * - Upsert operations work correctly
 * - FindMany operations decrypt arrays
 * - Null/undefined/empty values are handled
 * - Database stores encrypted data
 *
 * Database-Agnostic Design:
 * - Uses repository pattern for raw database access (getRawCredentialById)
 * - MongoDB: Uses Mongoose for raw collection access
 * - PostgreSQL: Uses Prisma $queryRaw for raw SQL queries
 * - Field names match Prisma schema (userId, externalId, not user_id/entity_id)
 * - Uses externalId (string) for test data instead of userId (ObjectId reference)
 *
 * Prerequisites:
 * - Database must be running and accessible
 * - For MongoDB: Replica set recommended (for transactions)
 * - For PostgreSQL: Database must exist
 * - Database type configured in backend/index.js app definition
 *
 * Note: Test explicitly passes 'mongodb' to repository factory for testing purposes
 */

// Set default DATABASE_URL for testing if not already set
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg?replicaSet=rs0';
}

// Enable encryption for testing (bypass test stage check)
process.env.STAGE = 'integration-test';
process.env.AES_KEY_ID = 'test-key-id';
process.env.AES_KEY = 'test-aes-key-32-characters-long!';

jest.mock('../config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { prisma, connectPrisma, disconnectPrisma } = require('../prisma');
const { createHealthCheckRepository } = require('../repositories/health-check-repository-factory');
const { mongoose } = require('../mongoose');

/**
 * @group integration
 * @group infrastructure
 */
describe('Field-Level Encryption Integration Tests', () => {
    const testExternalId = 'test-encryption-integration-id';
    let repository;

    describe('Factory Dependency Injection', () => {
        it('should require explicit prismaClient parameter', () => {
            expect(() => {
                createHealthCheckRepository();
            }).toThrow('prismaClient is required');
        });

        it('should reject null prismaClient', () => {
            expect(() => {
                createHealthCheckRepository({ prismaClient: null });
            }).toThrow('prismaClient is required');
        });

        it('should accept explicit prismaClient', () => {
            const repo = createHealthCheckRepository({ prismaClient: prisma });
            expect(repo).toBeDefined();
            expect(repo.prisma).toBe(prisma);
        });
    });

    beforeAll(async () => {
        await connectPrisma();
        // Connect mongoose for raw database queries
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.DATABASE_URL);
        }
        repository = createHealthCheckRepository({ prismaClient: prisma });
    });

    afterAll(async () => {
        // Clean up test data - delete all test credentials by externalId
        await prisma.credential.deleteMany({
            where: { externalId: { startsWith: 'test-encryption-' } },
        });
        await mongoose.disconnect();
        await disconnectPrisma();
    });

    afterEach(async () => {
        // Clean up after each test
        await prisma.credential.deleteMany({
            where: { externalId: { startsWith: 'test-encryption-' } },
        });
    });

    describe('Create Operations', () => {
        it('should encrypt sensitive fields on create', async () => {
            const credential = await prisma.credential.create({
                data: {
                    externalId: testExternalId,
                    data: {
                        access_token: 'secret-token-123',
                        refresh_token: 'refresh-token-456',
                        domain: 'example.com',
                    },
                },
            });

            // Verify decrypted values returned to application
            expect(credential.data.access_token).toBe('secret-token-123');
            expect(credential.data.refresh_token).toBe('refresh-token-456');
            expect(credential.data.domain).toBe('example.com');

            // Verify raw database has encrypted values
            const rawDoc = await repository.getRawCredentialById(credential.id);

            expect(rawDoc.data.access_token).not.toBe('secret-token-123');
            expect(rawDoc.data.access_token).toContain(':');
            expect(rawDoc.data.refresh_token).not.toBe('refresh-token-456');
            expect(rawDoc.data.refresh_token).toContain(':');
            // domain should NOT be encrypted (not in schema registry)
            expect(rawDoc.data.domain).toBe('example.com');
        });

        it('should handle null and undefined values', async () => {
            const credential = await prisma.credential.create({
                data: {
                    externalId: testExternalId,
                    data: {
                        access_token: null,
                        domain: 'example.com',
                    },
                },
            });

            expect(credential.data.access_token).toBeNull();
            expect(credential.data.domain).toBe('example.com');
        });

        it('should handle empty strings', async () => {
            const credential = await prisma.credential.create({
                data: {
                    externalId: testExternalId,
                    data: {
                        access_token: '',
                        domain: 'example.com',
                    },
                },
            });

            // Empty strings should not be encrypted
            expect(credential.data.access_token).toBe('');
            expect(credential.data.domain).toBe('example.com');
        });
    });

    describe('Read Operations', () => {
        it('should decrypt fields on findUnique', async () => {
            // Create with encrypted data
            const created = await prisma.credential.create({
                data: {
                    externalId: testExternalId,
                    data: {
                        access_token: 'secret-find-unique',
                        domain: 'findunique.com',
                    },
                },
            });

            // Read back
            const found = await prisma.credential.findUnique({
                where: { id: created.id },
            });

            expect(found.data.access_token).toBe('secret-find-unique');
            expect(found.data.domain).toBe('findunique.com');
        });

        it('should decrypt fields on findFirst', async () => {
            await prisma.credential.create({
                data: {
                    externalId: testExternalId,
                    data: {
                        access_token: 'secret-find-first',
                        domain: 'findfirst.com',
                    },
                },
            });

            const found = await prisma.credential.findFirst({
                where: { externalId: { startsWith: 'test-encryption-' } },
            });

            expect(found.data.access_token).toBe('secret-find-first');
            expect(found.data.domain).toBe('findfirst.com');
        });

        it('should decrypt array of results on findMany', async () => {
            // Create multiple credentials
            await prisma.credential.createMany({
                data: [
                    {
                        externalId: 'test-encryption-entity-1',
                        data: {
                            access_token: 'secret-1',
                            domain: 'domain1.com',
                        },
                    },
                    {
                        externalId: 'test-encryption-entity-2',
                        data: {
                            access_token: 'secret-2',
                            domain: 'domain2.com',
                        },
                    },
                    {
                        externalId: 'test-encryption-entity-3',
                        data: {
                            access_token: 'secret-3',
                            domain: 'domain3.com',
                        },
                    },
                ],
            });

            const credentials = await prisma.credential.findMany({
                where: { externalId: { startsWith: 'test-encryption-' } },
            });

            expect(credentials).toHaveLength(3);
            expect(credentials[0].data.access_token).toBe('secret-1');
            expect(credentials[1].data.access_token).toBe('secret-2');
            expect(credentials[2].data.access_token).toBe('secret-3');
        });

        it('should return null for non-existent records', async () => {
            // Use a valid ObjectId format that doesn't exist in database
            const { ObjectId } = require('mongodb');
            const nonExistentId = new ObjectId().toString();

            const found = await prisma.credential.findUnique({
                where: { id: nonExistentId },
            });

            expect(found).toBeNull();
        });

        it('should return empty array for no matches', async () => {
            const credentials = await prisma.credential.findMany({
                where: { externalId: 'non-existent-external-id' },
            });

            expect(credentials).toEqual([]);
        });
    });

    describe('Update Operations', () => {
        it('should encrypt new values on update', async () => {
            // Create
            const created = await prisma.credential.create({
                data: {
                    externalId: testExternalId,
                    data: {
                        access_token: 'old-token',
                        domain: 'old.com',
                    },
                },
            });

            // Update
            const updated = await prisma.credential.update({
                where: { id: created.id },
                data: {
                    data: {
                        access_token: 'new-token',
                        domain: 'new.com',
                    },
                },
            });

            // Verify decrypted values
            expect(updated.data.access_token).toBe('new-token');
            expect(updated.data.domain).toBe('new.com');

            // Verify raw database has new encrypted value
            const rawDoc = await repository.getRawCredentialById(created.id);

            expect(rawDoc.data.access_token).not.toBe('new-token');
            expect(rawDoc.data.access_token).toContain(':');
        });

        it('should handle partial updates', async () => {
            const created = await prisma.credential.create({
                data: {
                    externalId: testExternalId,
                    data: {
                        access_token: 'original-token',
                        refresh_token: 'original-refresh',
                        domain: 'original.com',
                    },
                },
            });

            // Update only access_token
            const updated = await prisma.credential.update({
                where: { id: created.id },
                data: {
                    data: {
                        ...created.data,
                        access_token: 'updated-token',
                    },
                },
            });

            expect(updated.data.access_token).toBe('updated-token');
            expect(updated.data.refresh_token).toBe('original-refresh');
            expect(updated.data.domain).toBe('original.com');
        });
    });

    describe('Upsert Operations', () => {
        it('should encrypt on insert path', async () => {
            // Use a valid ObjectId format that doesn't exist in database
            const { ObjectId } = require('mongodb');
            const nonExistentId = new ObjectId().toString();

            const upserted = await prisma.credential.upsert({
                where: {
                    id: nonExistentId,
                },
                create: {
                    id: nonExistentId,
                    externalId: 'test-encryption-upsert-entity',
                    data: {
                        access_token: 'upsert-create-token',
                        domain: 'upsert-create.com',
                    },
                },
                update: {
                    data: {
                        access_token: 'upsert-update-token',
                        domain: 'upsert-update.com',
                    },
                },
            });

            expect(upserted.data.access_token).toBe('upsert-create-token');

            // Verify encryption in database
            const rawDoc = await repository.getRawCredentialById(upserted.id);

            expect(rawDoc.data.access_token).not.toBe('upsert-create-token');
            expect(rawDoc.data.access_token).toContain(':');
        });

        it('should encrypt on update path', async () => {
            // Create first
            const created = await prisma.credential.create({
                data: {
                    externalId: 'test-encryption-upsert-update-entity',
                    data: {
                        access_token: 'original-token',
                        domain: 'original.com',
                    },
                },
            });

            // Upsert (should hit update path)
            const upserted = await prisma.credential.upsert({
                where: {
                    id: created.id,
                },
                create: {
                    externalId: 'test-encryption-upsert-update-entity',
                    data: {
                        access_token: 'create-path-token',
                        domain: 'create.com',
                    },
                },
                update: {
                    data: {
                        access_token: 'update-path-token',
                        domain: 'update.com',
                    },
                },
            });

            expect(upserted.data.access_token).toBe('update-path-token');

            // Verify encryption in database
            const rawDoc = await repository.getRawCredentialById(upserted.id);

            expect(rawDoc.data.access_token).not.toBe('update-path-token');
            expect(rawDoc.data.access_token).toContain(':');
        });
    });

    describe('Delete Operations', () => {
        it('should decrypt deleted record', async () => {
            const created = await prisma.credential.create({
                data: {
                    externalId: testExternalId,
                    data: {
                        access_token: 'to-be-deleted',
                        domain: 'delete.com',
                    },
                },
            });

            const deleted = await prisma.credential.delete({
                where: { id: created.id },
            });

            expect(deleted.data.access_token).toBe('to-be-deleted');
            expect(deleted.data.domain).toBe('delete.com');
        });
    });

    describe('CreateMany Operations', () => {
        it('should encrypt fields in bulk create', async () => {
            const result = await prisma.credential.createMany({
                data: [
                    {
                        externalId: 'test-encryption-bulk-1',
                        data: {
                            access_token: 'bulk-secret-1',
                            domain: 'bulk1.com',
                        },
                    },
                    {
                        externalId: 'test-encryption-bulk-2',
                        data: {
                            access_token: 'bulk-secret-2',
                            domain: 'bulk2.com',
                        },
                    },
                ],
            });

            expect(result.count).toBe(2);

            // Verify encryption in database by reading back with Prisma and checking one record's raw form
            const credentials = await prisma.credential.findMany({
                where: { externalId: { startsWith: 'test-encryption-' } },
            });

            // Check raw database for first credential
            const rawDoc = await repository.getRawCredentialById(credentials[0].id);
            expect(rawDoc.data.access_token).toContain(':');
            expect(rawDoc.data.access_token).not.toMatch(/bulk-secret-/);

            // Verify decryption when reading
            const tokens = credentials.map((c) => c.data.access_token);
            expect(tokens).toContain('bulk-secret-1');
            expect(tokens).toContain('bulk-secret-2');
        });
    });

    describe('Non-Encrypted Fields', () => {
        it('should not encrypt fields not in schema registry', async () => {
            const credential = await prisma.credential.create({
                data: {
                    externalId: testExternalId,
                    data: {
                        access_token: 'secret-token',
                        domain: 'example.com',
                        custom_field: 'should-not-encrypt',
                    },
                },
            });

            // Verify domain is not encrypted (not in schema)
            const rawDoc = await repository.getRawCredentialById(credential.id);

            expect(rawDoc.data.domain).toBe('example.com');
            expect(rawDoc.data.custom_field).toBe('should-not-encrypt');

            // access_token should be encrypted (in schema)
            expect(rawDoc.data.access_token).not.toBe('secret-token');
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed encrypted data gracefully', async () => {
            let created;
            try {
                // Create a credential first to get a valid ID
                created = await prisma.credential.create({
                    data: {
                        externalId: 'test-encryption-malformed-entity',
                        data: {
                            access_token: 'valid-token',
                            domain: 'malformed.com',
                        },
                    },
                });

                // Manually corrupt the encrypted data in the database
                // Use realistic corrupted format: 4 colon-separated parts (passes _isEncrypted check)
                // but contains invalid base64 that will fail during decryption
                const { ObjectId } = require('mongodb');
                const dbType = 'mongodb';
                if (dbType === 'mongodb') {
                    const { mongoose } = require('../mongoose');
                    // Ensure mongoose is connected
                    if (mongoose.connection.readyState !== 1) {
                        await mongoose.connect(process.env.DATABASE_URL);
                    }
                    await mongoose.connection.db.collection('Credential').updateOne(
                        { _id: new ObjectId(created.id) },
                        { $set: { 'data.access_token': 'CORRUPT:INVALID:DATA:FAKE=' } }
                    );
                } else {
                    // PostgreSQL - use raw query to corrupt data
                    await prisma.$executeRaw`
                        UPDATE "Credential"
                        SET data = jsonb_set(data, '{access_token}', '"CORRUPT:INVALID:DATA:FAKE="')
                        WHERE id = ${created.id}
                    `;
                }

                // Attempt to read should fail with decryption error
                // Fix: Remove async wrapper - expect needs the promise directly for .rejects to work
                await expect(
                    prisma.credential.findUnique({
                        where: { id: created.id },
                    })
                ).rejects.toThrow();
            } finally {
                // Cleanup - ensure it runs even if test throws
                // Use raw database delete to bypass Prisma encryption extension
                // (the encrypted data is corrupted so Prisma delete would fail)
                if (created) {
                    const { ObjectId } = require('mongodb');
                    const { mongoose } = require('../mongoose');
                    await mongoose.connection.db.collection('Credential').deleteOne(
                        { _id: new ObjectId(created.id) }
                    );
                }
            }
        });
    });

    describe('Count and Aggregate Operations', () => {
        it('should not interfere with count operations', async () => {
            await prisma.credential.createMany({
                data: [
                    {
                        externalId: 'test-encryption-count-1',
                        data: { access_token: 'token1', domain: 'count1.com' },
                    },
                    {
                        externalId: 'test-encryption-count-2',
                        data: { access_token: 'token2', domain: 'count2.com' },
                    },
                ],
            });

            const count = await prisma.credential.count({
                where: { externalId: { startsWith: 'test-encryption-' } },
            });

            expect(count).toBe(2);
        });
    });
});
