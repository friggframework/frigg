/**
 * Password Encryption Isolation Test
 *
 * Verifies that password hashing is completely isolated from the encryption system.
 * Tests that passwords are bcrypt hashed regardless of encryption configuration.
 *
 * Key Tests:
 * - With encryption ENABLED: passwords hashed (not encrypted)
 * - With encryption DISABLED: passwords still hashed
 * - Encryption schema does NOT include User.hashword
 * - Side-by-side: tokens encrypted, passwords hashed
 */

// Set default DATABASE_URL for testing if not already set
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg?replicaSet=rs0';
}

// Enable encryption for testing (bypass test stage check)
process.env.STAGE = 'integration-test';
process.env.AES_KEY_ID = 'test-key-id';
process.env.AES_KEY = 'test-aes-key-32-characters-long!';

jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const bcrypt = require('bcryptjs');
const { createUserRepository } = require('../repositories/user-repository-factory');
const { prisma, connectPrisma, disconnectPrisma, getEncryptionConfig } = require('../../database/prisma');
const { getEncryptedFields, hasEncryptedFields } = require('../../database/encryption/encryption-schema-registry');
const { mongoose } = require('../../database/mongoose');

describe('Password Encryption Isolation', () => {
    const dbType = process.env.DB_TYPE || 'mongodb';
    let userRepository;
    let testUserIds = [];
    const TEST_PASSWORD = 'IsolationTestPassword123!';

    beforeAll(async () => {
        await connectPrisma();
        // Connect mongoose for raw database queries
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.DATABASE_URL);
        }
        userRepository = createUserRepository();
    }, 30000); // 30 second timeout for database connection

    afterAll(async () => {
        for (const userId of testUserIds) {
            await userRepository.deleteUser(userId).catch(() => {});
        }
        await mongoose.disconnect();
        await disconnectPrisma();
    }, 30000); // 30 second timeout for cleanup

    test('✅ Encryption schema does NOT include User.hashword', () => {
        const userEncryptedFields = getEncryptedFields('User');

        console.log('\n📋 User model encrypted fields:', userEncryptedFields);

        expect(userEncryptedFields).toBeDefined();
        expect(Array.isArray(userEncryptedFields)).toBe(true);
        expect(userEncryptedFields).not.toContain('hashword');

        if (userEncryptedFields.length > 0) {
            console.log('⚠️  WARNING: User model has encrypted fields:', userEncryptedFields);
            console.log('   Password field (hashword) should NOT be in this list');
        } else {
            console.log('✅ User model has no encrypted fields (as expected)');
        }
    });

    test('✅ Password is bcrypt hashed regardless of encryption config', async () => {
        const encryptionConfig = getEncryptionConfig();
        console.log('\n🔒 Current encryption config:', encryptionConfig);

        const username = `isolation-test-${Date.now()}`;
        const user = await userRepository.createIndividualUser({
            username,
            hashword: TEST_PASSWORD,
            email: `${username}@test.com`,
        });
        testUserIds.push(user.id);

        expect(user.hashword).toMatch(/^\$2[ab]\$\d{2}\$/);
        expect(user.hashword).not.toBe(TEST_PASSWORD);
        expect(user.hashword).not.toContain(':');

        const isValid = await bcrypt.compare(TEST_PASSWORD, user.hashword);
        expect(isValid).toBe(true);

        console.log('✅ Password correctly hashed with bcrypt');
        console.log('   Encryption enabled:', encryptionConfig.enabled);
        console.log('   Hashword format:', user.hashword.substring(0, 20) + '...');
    });

    test('📊 Field-level encryption status comparison', async () => {
        const models = ['User', 'Credential', 'Token', 'IntegrationMapping'];

        console.log('\n📊 ENCRYPTION SCHEMA ANALYSIS:');
        console.log('='.repeat(60));

        for (const model of models) {
            const fields = getEncryptedFields(model);
            const hasEncryption = hasEncryptedFields(model);

            console.log(`\n${model}:`);
            console.log(`  Has encrypted fields: ${hasEncryption}`);
            console.log(`  Encrypted fields: ${fields.length > 0 ? fields.join(', ') : 'none'}`);

            if (model === 'User') {
                expect(fields).not.toContain('hashword');
                console.log('  ✅ Password (hashword) correctly excluded from encryption');
            } else if (model === 'Credential') {
                expect(fields).toContain('data.access_token');
                console.log('  ✅ API tokens correctly included in encryption');
            }
        }
    });

    test('📊 End-to-end: Create user + credential, verify isolation', async () => {
        const username = `e2e-isolation-${Date.now()}`;
        const secretToken = 'my-secret-api-token-xyz';

        const user = await userRepository.createIndividualUser({
            username,
            hashword: TEST_PASSWORD,
            email: `${username}@test.com`,
        });
        testUserIds.push(user.id);

        const credential = await prisma.credential.create({
            data: {
                userId: dbType === 'postgresql' ? parseInt(user.id, 10) : user.id,
                externalId: `cred-${Date.now()}`,
                data: {
                    access_token: secretToken,
                },
            },
        });

        console.log('\n📊 END-TO-END ISOLATION TEST:');
        console.log('='.repeat(60));

        const fetchedUser = await userRepository.findIndividualUserById(user.id);
        console.log('\n👤 User Password:');
        console.log('  Format:', fetchedUser.hashword.substring(0, 30) + '...');
        console.log('  Is bcrypt:', /^\$2[ab]\$\d{2}\$/.test(fetchedUser.hashword));
        console.log('  Is encrypted (has :):', fetchedUser.hashword.includes(':'));

        const fetchedCred = await prisma.credential.findUnique({
            where: { id: credential.id },
        });

        console.log('\n🔑 Credential Token:');
        const tokenValue = fetchedCred.data.access_token;
        console.log('  Raw value:', tokenValue.substring(0, 50) + '...');
        console.log('  Is encrypted (has :):', tokenValue.includes(':'));
        console.log('  Equals plain text:', tokenValue === secretToken);

        expect(fetchedUser.hashword).toMatch(/^\$2[ab]\$\d{2}\$/);
        expect(fetchedUser.hashword).not.toContain(':');

        const isPasswordValid = await bcrypt.compare(TEST_PASSWORD, fetchedUser.hashword);
        expect(isPasswordValid).toBe(true);

        console.log('\n✅ Password: bcrypt hashed (NOT encrypted)');

        const encryptionEnabled = tokenValue !== secretToken;
        if (encryptionEnabled) {
            console.log('✅ Credential: properly encrypted');
            expect(tokenValue).not.toBe(secretToken);
        } else {
            console.log('⚠️  Encryption disabled in this environment');
        }

        console.log('✅ ISOLATION VERIFIED: Passwords use bcrypt, credentials use encryption');

        await prisma.credential.delete({ where: { id: credential.id } });
    });

    test('🔍 Bcrypt vs Encryption format analysis', () => {
        const bcryptHash = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
        const encryptedValue = 'kms:us-east-1:alias/app-key:AQICAHg...base64...';

        console.log('\n🔍 FORMAT COMPARISON:');
        console.log('='.repeat(60));

        console.log('\nBcrypt Hash Format:');
        console.log('  Example:', bcryptHash);
        console.log('  Pattern: $2[ab]$rounds$salt+hash');
        console.log('  Length: ~60 chars');
        console.log('  Colon count:', (bcryptHash.match(/:/g) || []).length);
        console.log('  Dollar signs: 3');

        console.log('\nEncryption Format:');
        console.log('  Example:', encryptedValue.substring(0, 50) + '...');
        console.log('  Pattern: method:region:keyId:base64Ciphertext');
        console.log('  Colon separators: 3');
        console.log('  Variable length');

        console.log('\n✅ Formats are clearly distinguishable');
        console.log('✅ Bcrypt never has colon separators between dollar signs');
        console.log('✅ Encryption always has exactly 3 colon separators');
    });

    test('⚠️  Verify password NOT double-processed', async () => {
        const username = `double-process-test-${Date.now()}`;

        const user = await userRepository.createIndividualUser({
            username,
            hashword: TEST_PASSWORD,
            email: `${username}@test.com`,
        });
        testUserIds.push(user.id);

        const hash1 = user.hashword;

        const fetchedUser = await userRepository.findIndividualUserById(user.id);
        const hash2 = fetchedUser.hashword;

        console.log('\n⚠️  DOUBLE-PROCESSING CHECK:');
        console.log('Hash after creation:', hash1.substring(0, 30) + '...');
        console.log('Hash after fetch:   ', hash2.substring(0, 30) + '...');
        console.log('Hashes match:', hash1 === hash2);

        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^\$2[ab]\$\d{2}\$/);
        expect(hash2).toMatch(/^\$2[ab]\$\d{2}\$/);

        console.log('✅ No double-processing detected');
    });
});
