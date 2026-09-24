/**
 * PostgreSQL Relation Decryption Bug Test
 *
 * This test proves that credentials fetched via Prisma `include` relations
 * are NOT being decrypted by the encryption extension, while credentials
 * fetched directly ARE being decrypted.
 *
 * Expected Behavior:
 * - Direct credential fetch: SHOULD decrypt ✅
 * - Credential via Entity include: SHOULD decrypt but DOESN'T ❌
 * - Raw database query: SHOULD be encrypted ✅
 */

// Set up test environment for PostgreSQL with encryption
process.env.DB_TYPE = 'postgresql';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/frigg?schema=public';
process.env.STAGE = 'integration-test';
process.env.AES_KEY_ID = 'test-key-id';
process.env.AES_KEY = 'test-aes-key-32-characters-long!';

// Mock config to return postgresql
jest.mock('../config', () => ({
    DB_TYPE: 'postgresql',
    getDatabaseType: jest.fn(() => 'postgresql'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { prisma, connectPrisma, disconnectPrisma } = require('../prisma');

describe('PostgreSQL Relation Decryption Bug', () => {
    let testCredentialId;
    let testEntityId;
    const TEST_TOKEN = 'secret-token-should-be-encrypted';
    const TEST_EXTERNAL_ID = 'test-relation-bug-credential';

    beforeAll(async () => {
        await connectPrisma();
    });

    afterAll(async () => {
        // Cleanup test data
        if (testEntityId) {
            await prisma.entity.deleteMany({
                where: { id: testEntityId }
            }).catch(() => {});
        }
        if (testCredentialId) {
            await prisma.credential.deleteMany({
                where: { id: testCredentialId }
            }).catch(() => {});
        }

        await disconnectPrisma();
    });

    afterEach(async () => {
        // Clean up after each test
        if (testEntityId) {
            await prisma.entity.deleteMany({
                where: { id: testEntityId }
            }).catch(() => {});
            testEntityId = null;
        }
        if (testCredentialId) {
            await prisma.credential.deleteMany({
                where: { id: testCredentialId }
            }).catch(() => {});
            testCredentialId = null;
        }
    });

    test('PROOF 1: Direct credential fetch DOES decrypt (extension works)', async () => {
        // 1. Create credential with sensitive data
        const created = await prisma.credential.create({
            data: {
                externalId: TEST_EXTERNAL_ID,
                data: {
                    access_token: TEST_TOKEN,
                    domain: 'example.com',
                },
            },
        });

        testCredentialId = created.id;

        // Verify creation returns decrypted data
        expect(created.data.access_token).toBe(TEST_TOKEN);

        // 2. Fetch directly via Credential model (simulating direct query)
        const directFetch = await prisma.credential.findUnique({
            where: { id: testCredentialId },
        });

        // ✅ EXPECT: Should be decrypted by extension
        expect(directFetch).toBeDefined();
        expect(directFetch.data.access_token).toBe(TEST_TOKEN);

        // Should NOT contain colon pattern (not encrypted format)
        expect(directFetch.data.access_token).not.toContain(':');
    });

    test('BUG PROOF: Credential via Entity include DOES NOT decrypt', async () => {
        // 1. Create credential first
        const credential = await prisma.credential.create({
            data: {
                externalId: TEST_EXTERNAL_ID,
                data: {
                    access_token: TEST_TOKEN,
                    domain: 'example.com',
                },
            },
        });

        testCredentialId = credential.id;

        // 2. Create entity that references the credential
        const entity = await prisma.entity.create({
            data: {
                moduleName: 'test-module',
                externalId: 'test-entity-for-bug-proof',
                credentialId: testCredentialId,
            },
        });

        testEntityId = entity.id;

        // 3. Fetch entity with credential included (like ModuleRepository does)
        const entityWithCredential = await prisma.entity.findUnique({
            where: { id: testEntityId },
            include: { credential: true },
        });

        // ❌ BUG: Credential data is STILL ENCRYPTED when fetched via include
        expect(entityWithCredential).toBeDefined();
        expect(entityWithCredential.credential).toBeDefined();

        console.log('\n🔍 DEBUG: Credential data from include:', entityWithCredential.credential.data);
        console.log('🔍 DEBUG: access_token value:', entityWithCredential.credential.data.access_token);

        // The bug: Token should be decrypted but it's still in encrypted format
        const tokenValue = entityWithCredential.credential.data.access_token;
        const hasColonPattern = tokenValue.includes(':');
        const isEncryptedFormat = tokenValue.split(':').length === 4;

        if (hasColonPattern && isEncryptedFormat) {
            console.log('❌ BUG CONFIRMED: Token is still encrypted!');
            console.log(`   Expected: "${TEST_TOKEN}"`);
            console.log(`   Got: "${tokenValue}"`);
        }

        // This assertion SHOULD fail if the bug exists
        // Comment it out initially to see the actual behavior
        // expect(tokenValue).toBe(TEST_TOKEN);

        // Instead, let's prove the bug by showing it's encrypted
        expect(tokenValue).toContain(':'); // Still has encrypted format
        expect(tokenValue).not.toBe(TEST_TOKEN); // Not the plain text
    });

    test('PROOF 2: Raw database has encrypted data (encryption works at storage)', async () => {
        // 1. Create credential
        const created = await prisma.credential.create({
            data: {
                externalId: TEST_EXTERNAL_ID,
                data: {
                    access_token: TEST_TOKEN,
                    domain: 'example.com',
                },
            },
        });

        testCredentialId = created.id;

        // 2. Query raw database to see actual stored value
        const raw = await prisma.$queryRaw`
            SELECT data FROM "Credential" WHERE id = ${testCredentialId}
        `;

        expect(raw).toBeDefined();
        expect(raw.length).toBe(1);

        const rawToken = raw[0].data.access_token;
        console.log('\n🔍 DEBUG: Raw database token:', rawToken);

        // ✅ VERIFY: Database stores encrypted data
        expect(rawToken).toContain(':'); // Has encrypted format

        const parts = rawToken.split(':');
        expect(parts.length).toBe(4); // keyId:iv:ciphertext:encryptedKey

        console.log('✅ CONFIRMED: Data is encrypted at rest in database');
    });

    test('COMPARISON: Direct fetch vs Include fetch behavior', async () => {
        // Create credential and entity
        const credential = await prisma.credential.create({
            data: {
                externalId: TEST_EXTERNAL_ID,
                data: {
                    access_token: TEST_TOKEN,
                    refresh_token: 'refresh-token-test',
                    domain: 'comparison.com',
                },
            },
        });

        testCredentialId = credential.id;

        const entity = await prisma.entity.create({
            data: {
                moduleName: 'comparison-module',
                externalId: 'comparison-entity',
                credentialId: testCredentialId,
            },
        });

        testEntityId = entity.id;

        // Fetch 1: Direct credential query
        const directCredential = await prisma.credential.findUnique({
            where: { id: testCredentialId },
        });

        // Fetch 2: Credential via entity include
        const entityWithCredential = await prisma.entity.findUnique({
            where: { id: testEntityId },
            include: { credential: true },
        });

        console.log('\n📊 COMPARISON RESULTS:');
        console.log('Direct fetch access_token:', directCredential.data.access_token);
        console.log('Include fetch access_token:', entityWithCredential.credential.data.access_token);

        const directIsDecrypted = directCredential.data.access_token === TEST_TOKEN;
        const includeIsDecrypted = entityWithCredential.credential.data.access_token === TEST_TOKEN;

        console.log(`\nDirect fetch decrypted: ${directIsDecrypted ? '✅ YES' : '❌ NO'}`);
        console.log(`Include fetch decrypted: ${includeIsDecrypted ? '✅ YES' : '❌ NO'}`);

        // Prove they're different
        expect(directIsDecrypted).toBe(true);
        expect(includeIsDecrypted).toBe(false); // BUG: This should be true but it's false
    });
});
