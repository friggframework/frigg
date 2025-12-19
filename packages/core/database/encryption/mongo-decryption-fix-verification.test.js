/**
 * Verification Test: Repository Fix for MongoDB Decryption Bug
 *
 * This test verifies that the fix in ModuleRepositoryMongo successfully
 * decrypts credentials when fetching entities (after removing `include`).
 *
 * Expected Behavior After Fix:
 * - All repository methods should return decrypted credentials
 * - No encrypted tokens should leak through to the application layer
 */

process.env.DB_TYPE = 'mongodb';
process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'mongodb://localhost:27017/frigg?replicaSet=rs0';
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
const {
    ModuleRepositoryMongo,
} = require('../../modules/repositories/module-repository-mongo');

describe('Repository Fix Verification - MongoDB Decryption', () => {
    let repository;
    let testCredentialId;
    let testEntityId;
    let testUserId;
    const TEST_TOKEN = 'my-secret-access-token-12345';
    const TEST_REFRESH_TOKEN = 'my-secret-refresh-token-67890';
    const TEST_DOMAIN = 'example-test.com';

    beforeAll(async () => {
        await connectPrisma();
        repository = new ModuleRepositoryMongo();
    });

    afterAll(async () => {
        if (testEntityId) {
            await prisma.entity
                .deleteMany({
                    where: { id: testEntityId },
                })
                .catch(() => {});
        }
        if (testCredentialId) {
            await prisma.credential
                .deleteMany({
                    where: { id: testCredentialId },
                })
                .catch(() => {});
        }
        if (testUserId) {
            await prisma.user
                .deleteMany({
                    where: { id: testUserId },
                })
                .catch(() => {});
        }

        await disconnectPrisma();
    });

    afterEach(async () => {
        if (testEntityId) {
            await prisma.entity
                .deleteMany({
                    where: { id: testEntityId },
                })
                .catch(() => {});
            testEntityId = null;
        }
        if (testCredentialId) {
            await prisma.credential
                .deleteMany({
                    where: { id: testCredentialId },
                })
                .catch(() => {});
            testCredentialId = null;
        }
        if (testUserId) {
            await prisma.user
                .deleteMany({
                    where: { id: testUserId },
                })
                .catch(() => {});
            testUserId = null;
        }
    });

    test('✅ FIX VERIFICATION: findEntityById returns decrypted credential', async () => {
        const user = await prisma.user.create({
            data: {
                type: 'INDIVIDUAL',
                hashword: 'test-hash',
            },
        });
        testUserId = user.id;

        const credential = await prisma.credential.create({
            data: {
                userId: testUserId,
                externalId: 'test-cred-findEntityById',
                data: {
                    access_token: TEST_TOKEN,
                    refresh_token: TEST_REFRESH_TOKEN,
                    domain: TEST_DOMAIN,
                },
            },
        });
        testCredentialId = credential.id;

        const entity = await prisma.entity.create({
            data: {
                userId: testUserId,
                credentialId: testCredentialId,
                moduleName: 'test-module',
                externalId: 'test-entity-findById',
            },
        });
        testEntityId = entity.id;

        const result = await repository.findEntityById(testEntityId);

        expect(result).toBeDefined();
        expect(result.credential).toBeDefined();
        expect(result.credential.data.access_token).toBe(TEST_TOKEN);
        expect(result.credential.data.refresh_token).toBe(TEST_REFRESH_TOKEN);
        expect(result.credential.data.domain).toBe(TEST_DOMAIN);

        expect(result.credential.data.access_token).not.toContain(':');

        console.log('✅ findEntityById: Credential successfully decrypted!');
    });

    test('✅ FIX VERIFICATION: findEntitiesByUserId returns decrypted credentials', async () => {
        const user = await prisma.user.create({
            data: {
                type: 'INDIVIDUAL',
                hashword: 'test-hash',
            },
        });
        testUserId = user.id;

        const credential = await prisma.credential.create({
            data: {
                userId: testUserId,
                externalId: 'test-cred-findByUserId',
                data: {
                    access_token: TEST_TOKEN,
                    domain: TEST_DOMAIN,
                },
            },
        });
        testCredentialId = credential.id;

        const entity = await prisma.entity.create({
            data: {
                userId: testUserId,
                credentialId: testCredentialId,
                moduleName: 'test-module',
                externalId: 'test-entity-findByUserId',
            },
        });
        testEntityId = entity.id;

        const results = await repository.findEntitiesByUserId(testUserId);

        expect(results).toBeDefined();
        expect(results.length).toBeGreaterThan(0);
        const firstEntity = results[0];
        expect(firstEntity.credential).toBeDefined();
        expect(firstEntity.credential.data.access_token).toBe(TEST_TOKEN);
        expect(firstEntity.credential.data.access_token).not.toContain(':');

        console.log(
            '✅ findEntitiesByUserId: Credentials successfully decrypted!'
        );
    });

    test('✅ FIX VERIFICATION: findEntitiesByIds returns decrypted credentials', async () => {
        const user = await prisma.user.create({
            data: {
                type: 'INDIVIDUAL',
                hashword: 'test-hash',
            },
        });
        testUserId = user.id;

        const credential = await prisma.credential.create({
            data: {
                userId: testUserId,
                externalId: 'test-cred-findByIds',
                data: {
                    access_token: TEST_TOKEN,
                    domain: TEST_DOMAIN,
                },
            },
        });
        testCredentialId = credential.id;

        const entity = await prisma.entity.create({
            data: {
                userId: testUserId,
                credentialId: testCredentialId,
                moduleName: 'test-module',
                externalId: 'test-entity-findByIds',
            },
        });
        testEntityId = entity.id;

        const results = await repository.findEntitiesByIds([testEntityId]);

        expect(results).toBeDefined();
        expect(results.length).toBe(1);
        expect(results[0].credential).toBeDefined();
        expect(results[0].credential.data.access_token).toBe(TEST_TOKEN);
        expect(results[0].credential.data.access_token).not.toContain(':');

        console.log(
            '✅ findEntitiesByIds: Credentials successfully decrypted!'
        );
    });

    test('✅ FIX VERIFICATION: createEntity returns decrypted credential', async () => {
        const user = await prisma.user.create({
            data: {
                type: 'INDIVIDUAL',
                hashword: 'test-hash',
            },
        });
        testUserId = user.id;

        const credential = await prisma.credential.create({
            data: {
                userId: testUserId,
                externalId: 'test-cred-create',
                data: {
                    access_token: TEST_TOKEN,
                    domain: TEST_DOMAIN,
                },
            },
        });
        testCredentialId = credential.id;

        const entity = await repository.createEntity({
            userId: testUserId,
            credentialId: testCredentialId,
            moduleName: 'test-module',
            externalId: 'test-entity-create',
        });

        testEntityId = entity.id;

        expect(entity).toBeDefined();
        expect(entity.credential).toBeDefined();
        expect(entity.credential.data.access_token).toBe(TEST_TOKEN);
        expect(entity.credential.data.access_token).not.toContain(':');

        console.log('✅ createEntity: Credential successfully decrypted!');
    });

    test('✅ FIX VERIFICATION: updateEntity returns decrypted credential', async () => {
        const user = await prisma.user.create({
            data: {
                type: 'INDIVIDUAL',
                hashword: 'test-hash',
            },
        });
        testUserId = user.id;

        const credential = await prisma.credential.create({
            data: {
                userId: testUserId,
                externalId: 'test-cred-update',
                data: {
                    access_token: TEST_TOKEN,
                    domain: TEST_DOMAIN,
                },
            },
        });
        testCredentialId = credential.id;

        const entity = await prisma.entity.create({
            data: {
                userId: testUserId,
                credentialId: testCredentialId,
                moduleName: 'test-module',
                externalId: 'test-entity-update',
            },
        });
        testEntityId = entity.id;

        const updated = await repository.updateEntity(testEntityId, {
            name: 'Updated Name',
        });

        expect(updated).toBeDefined();
        expect(updated.name).toBe('Updated Name');
        expect(updated.credential).toBeDefined();
        expect(updated.credential.data.access_token).toBe(TEST_TOKEN);
        expect(updated.credential.data.access_token).not.toContain(':');

        console.log('✅ updateEntity: Credential successfully decrypted!');
    });

    test('📊 COMPARISON: Verify tokens are encrypted in database but decrypted in repository', async () => {
        const user = await prisma.user.create({
            data: {
                type: 'INDIVIDUAL',
                hashword: 'test-hash',
            },
        });
        testUserId = user.id;

        const credential = await prisma.credential.create({
            data: {
                userId: testUserId,
                externalId: 'test-cred-comparison',
                data: {
                    access_token: TEST_TOKEN,
                    domain: TEST_DOMAIN,
                },
            },
        });
        testCredentialId = credential.id;

        const entity = await prisma.entity.create({
            data: {
                userId: testUserId,
                credentialId: testCredentialId,
                moduleName: 'test-module',
                externalId: 'test-entity-comparison',
            },
        });
        testEntityId = entity.id;

        const rawCred = await prisma.$runCommandRaw({
            find: 'Credential',
            filter: { _id: { $oid: testCredentialId } },
        });
        const rawDoc = rawCred.cursor.firstBatch[0];
        const rawToken = rawDoc.data.access_token;

        const repoEntity = await repository.findEntityById(testEntityId);
        const repoToken = repoEntity.credential.data.access_token;

        console.log('\n📊 COMPARISON RESULTS:');
        console.log(
            'Raw DB token (encrypted):',
            rawToken.substring(0, 50) + '...'
        );
        console.log('Repository token (decrypted):', repoToken);

        expect(rawToken).toContain(':');
        expect(rawToken.split(':')).toHaveLength(4);

        expect(repoToken).toBe(TEST_TOKEN);
        expect(repoToken).not.toContain(':');

        console.log(
            '✅ Database stores encrypted, repository returns decrypted - FIX WORKS!'
        );
    });
});
