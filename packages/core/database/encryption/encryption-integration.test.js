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
 * Run with:
 *   DB_TYPE=mongodb npm test -- encryption-integration.test.js
 *   DB_TYPE=postgresql npm test -- encryption-integration.test.js
 */

const { prisma, connectPrisma, disconnectPrisma } = require('../prisma');
const { mongoose } = require('../mongoose');

describe('Field-Level Encryption Integration Tests', () => {
    const testUserId = 'test-encryption-integration-user';
    const testEntityId = 'test-encryption-integration-entity';

    beforeAll(async () => {
        await connectPrisma();
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.credential.deleteMany({
            where: { user_id: testUserId },
        });
        await disconnectPrisma();
    });

    afterEach(async () => {
        // Clean up after each test
        await prisma.credential.deleteMany({
            where: { user_id: testUserId },
        });
    });

    describe('Create Operations', () => {
        it('should encrypt sensitive fields on create', async () => {
            const credential = await prisma.credential.create({
                data: {
                    user_id: testUserId,
                    entity_id: testEntityId,
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
            const rawDoc = await mongoose.connection.db
                .collection('credentials')
                .findOne({ _id: credential.id });

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
                    user_id: testUserId,
                    entity_id: testEntityId,
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
                    user_id: testUserId,
                    entity_id: testEntityId,
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
                    user_id: testUserId,
                    entity_id: testEntityId,
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
                    user_id: testUserId,
                    entity_id: testEntityId,
                    data: {
                        access_token: 'secret-find-first',
                        domain: 'findfirst.com',
                    },
                },
            });

            const found = await prisma.credential.findFirst({
                where: { user_id: testUserId },
            });

            expect(found.data.access_token).toBe('secret-find-first');
            expect(found.data.domain).toBe('findfirst.com');
        });

        it('should decrypt array of results on findMany', async () => {
            // Create multiple credentials
            await prisma.credential.createMany({
                data: [
                    {
                        user_id: testUserId,
                        entity_id: 'entity-1',
                        data: {
                            access_token: 'secret-1',
                            domain: 'domain1.com',
                        },
                    },
                    {
                        user_id: testUserId,
                        entity_id: 'entity-2',
                        data: {
                            access_token: 'secret-2',
                            domain: 'domain2.com',
                        },
                    },
                    {
                        user_id: testUserId,
                        entity_id: 'entity-3',
                        data: {
                            access_token: 'secret-3',
                            domain: 'domain3.com',
                        },
                    },
                ],
            });

            const credentials = await prisma.credential.findMany({
                where: { user_id: testUserId },
            });

            expect(credentials).toHaveLength(3);
            expect(credentials[0].data.access_token).toBe('secret-1');
            expect(credentials[1].data.access_token).toBe('secret-2');
            expect(credentials[2].data.access_token).toBe('secret-3');
        });

        it('should return null for non-existent records', async () => {
            const found = await prisma.credential.findUnique({
                where: { id: 'non-existent-id' },
            });

            expect(found).toBeNull();
        });

        it('should return empty array for no matches', async () => {
            const credentials = await prisma.credential.findMany({
                where: { user_id: 'non-existent-user' },
            });

            expect(credentials).toEqual([]);
        });
    });

    describe('Update Operations', () => {
        it('should encrypt new values on update', async () => {
            // Create
            const created = await prisma.credential.create({
                data: {
                    user_id: testUserId,
                    entity_id: testEntityId,
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
            const rawDoc = await mongoose.connection.db
                .collection('credentials')
                .findOne({ _id: created.id });

            expect(rawDoc.data.access_token).not.toBe('new-token');
            expect(rawDoc.data.access_token).toContain(':');
        });

        it('should handle partial updates', async () => {
            const created = await prisma.credential.create({
                data: {
                    user_id: testUserId,
                    entity_id: testEntityId,
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
            const upserted = await prisma.credential.upsert({
                where: {
                    user_id_entity_id: {
                        user_id: testUserId,
                        entity_id: 'upsert-entity',
                    },
                },
                create: {
                    user_id: testUserId,
                    entity_id: 'upsert-entity',
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
            const rawDoc = await mongoose.connection.db
                .collection('credentials')
                .findOne({ _id: upserted.id });

            expect(rawDoc.data.access_token).not.toBe('upsert-create-token');
            expect(rawDoc.data.access_token).toContain(':');
        });

        it('should encrypt on update path', async () => {
            // Create first
            await prisma.credential.create({
                data: {
                    user_id: testUserId,
                    entity_id: 'upsert-update-entity',
                    data: {
                        access_token: 'original-token',
                        domain: 'original.com',
                    },
                },
            });

            // Upsert (should hit update path)
            const upserted = await prisma.credential.upsert({
                where: {
                    user_id_entity_id: {
                        user_id: testUserId,
                        entity_id: 'upsert-update-entity',
                    },
                },
                create: {
                    user_id: testUserId,
                    entity_id: 'upsert-update-entity',
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
            const rawDoc = await mongoose.connection.db
                .collection('credentials')
                .findOne({ _id: upserted.id });

            expect(rawDoc.data.access_token).not.toBe('update-path-token');
            expect(rawDoc.data.access_token).toContain(':');
        });
    });

    describe('Delete Operations', () => {
        it('should decrypt deleted record', async () => {
            const created = await prisma.credential.create({
                data: {
                    user_id: testUserId,
                    entity_id: testEntityId,
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
                        user_id: testUserId,
                        entity_id: 'bulk-1',
                        data: {
                            access_token: 'bulk-secret-1',
                            domain: 'bulk1.com',
                        },
                    },
                    {
                        user_id: testUserId,
                        entity_id: 'bulk-2',
                        data: {
                            access_token: 'bulk-secret-2',
                            domain: 'bulk2.com',
                        },
                    },
                ],
            });

            expect(result.count).toBe(2);

            // Verify encryption in database
            const rawDocs = await mongoose.connection.db
                .collection('credentials')
                .find({ user_id: testUserId })
                .toArray();

            rawDocs.forEach((doc) => {
                expect(doc.data.access_token).toContain(':');
                expect(doc.data.access_token).not.toMatch(/bulk-secret-/);
            });

            // Verify decryption when reading
            const credentials = await prisma.credential.findMany({
                where: { user_id: testUserId },
            });

            const tokens = credentials.map((c) => c.data.access_token);
            expect(tokens).toContain('bulk-secret-1');
            expect(tokens).toContain('bulk-secret-2');
        });
    });

    describe('Non-Encrypted Fields', () => {
        it('should not encrypt fields not in schema registry', async () => {
            const credential = await prisma.credential.create({
                data: {
                    user_id: testUserId,
                    entity_id: testEntityId,
                    data: {
                        access_token: 'secret-token',
                        domain: 'example.com',
                        custom_field: 'should-not-encrypt',
                    },
                },
            });

            // Verify domain is not encrypted (not in schema)
            const rawDoc = await mongoose.connection.db
                .collection('credentials')
                .findOne({ _id: credential.id });

            expect(rawDoc.data.domain).toBe('example.com');
            expect(rawDoc.data.custom_field).toBe('should-not-encrypt');

            // access_token should be encrypted (in schema)
            expect(rawDoc.data.access_token).not.toBe('secret-token');
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed encrypted data gracefully', async () => {
            // Manually insert malformed data
            const insertedId = new mongoose.Types.ObjectId().toString();
            await mongoose.connection.db.collection('credentials').insertOne({
                _id: insertedId,
                user_id: testUserId,
                entity_id: 'malformed-entity',
                data: {
                    access_token: 'not-valid-encrypted-format',
                    domain: 'malformed.com',
                },
            });

            // Attempt to read should fail or return garbled data
            await expect(async () => {
                await prisma.credential.findUnique({
                    where: { id: insertedId },
                });
            }).rejects.toThrow();

            // Cleanup
            await mongoose.connection.db
                .collection('credentials')
                .deleteOne({ _id: insertedId });
        });
    });

    describe('Count and Aggregate Operations', () => {
        it('should not interfere with count operations', async () => {
            await prisma.credential.createMany({
                data: [
                    {
                        user_id: testUserId,
                        entity_id: 'count-1',
                        data: { access_token: 'token1', domain: 'count1.com' },
                    },
                    {
                        user_id: testUserId,
                        entity_id: 'count-2',
                        data: { access_token: 'token2', domain: 'count2.com' },
                    },
                ],
            });

            const count = await prisma.credential.count({
                where: { user_id: testUserId },
            });

            expect(count).toBe(2);
        });
    });
});
