process.env.DB_TYPE = 'postgresql';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/frigg?schema=public';
process.env.STAGE = 'integration-test';
process.env.AES_KEY_ID = 'test-key-id';
process.env.AES_KEY = 'test-aes-key-32-characters-long!';

jest.mock('../config', () => ({
    DB_TYPE: 'postgresql',
    getDatabaseType: jest.fn(() => 'postgresql'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { prisma, connectPrisma, disconnectPrisma } = require('../prisma');

describe('PostgreSQL Relation Decryption Bug', () => {
    let testCredentialId: number | null;
    let testEntityId: number | null;
    const TEST_TOKEN = 'secret-token-should-be-encrypted';
    const TEST_EXTERNAL_ID = 'test-relation-bug-credential';

    beforeAll(async () => {
        await connectPrisma();
    });

    afterAll(async () => {
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

        expect(created.data.access_token).toBe(TEST_TOKEN);

        const directFetch = await prisma.credential.findUnique({
            where: { id: testCredentialId },
        });

        expect(directFetch).toBeDefined();
        expect(directFetch.data.access_token).toBe(TEST_TOKEN);
        expect(directFetch.data.access_token).not.toContain(':');
    });

    test('BUG PROOF: Credential via Entity include DOES NOT decrypt', async () => {
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

        const entity = await prisma.entity.create({
            data: {
                moduleName: 'test-module',
                externalId: 'test-entity-for-bug-proof',
                credentialId: testCredentialId,
            },
        });

        testEntityId = entity.id;

        const entityWithCredential = await prisma.entity.findUnique({
            where: { id: testEntityId },
            include: { credential: true },
        });

        expect(entityWithCredential).toBeDefined();
        expect(entityWithCredential.credential).toBeDefined();

        console.log('\nDEBUG: Credential data from include:', entityWithCredential.credential.data);
        console.log('DEBUG: access_token value:', entityWithCredential.credential.data.access_token);

        const tokenValue = entityWithCredential.credential.data.access_token;
        const hasColonPattern = tokenValue.includes(':');
        const isEncryptedFormat = tokenValue.split(':').length === 4;

        if (hasColonPattern && isEncryptedFormat) {
            console.log('BUG CONFIRMED: Token is still encrypted!');
            console.log(`   Expected: "${TEST_TOKEN}"`);
            console.log(`   Got: "${tokenValue}"`);
        }

        expect(tokenValue).toContain(':');
        expect(tokenValue).not.toBe(TEST_TOKEN);
    });

    test('PROOF 2: Raw database has encrypted data (encryption works at storage)', async () => {
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

        const raw = await prisma.$queryRaw`
            SELECT data FROM "Credential" WHERE id = ${testCredentialId}
        `;

        expect(raw).toBeDefined();
        expect(raw.length).toBe(1);

        const rawToken = raw[0].data.access_token;
        console.log('\nDEBUG: Raw database token:', rawToken);

        expect(rawToken).toContain(':');

        const parts = rawToken.split(':');
        expect(parts.length).toBe(4);

        console.log('CONFIRMED: Data is encrypted at rest in database');
    });

    test('COMPARISON: Direct fetch vs Include fetch behavior', async () => {
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

        const directCredential = await prisma.credential.findUnique({
            where: { id: testCredentialId },
        });

        const entityWithCredential = await prisma.entity.findUnique({
            where: { id: testEntityId },
            include: { credential: true },
        });

        console.log('\nCOMPARISON RESULTS:');
        console.log('Direct fetch access_token:', directCredential.data.access_token);
        console.log('Include fetch access_token:', entityWithCredential.credential.data.access_token);

        const directIsDecrypted = directCredential.data.access_token === TEST_TOKEN;
        const includeIsDecrypted = entityWithCredential.credential.data.access_token === TEST_TOKEN;

        console.log(`\nDirect fetch decrypted: ${directIsDecrypted ? 'YES' : 'NO'}`);
        console.log(`Include fetch decrypted: ${includeIsDecrypted ? 'YES' : 'NO'}`);

        expect(directIsDecrypted).toBe(true);
        expect(includeIsDecrypted).toBe(false);
    });
});
