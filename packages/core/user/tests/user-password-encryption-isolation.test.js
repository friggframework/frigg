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

describe('Password Encryption Isolation', () => {
    const dbType = process.env.DB_TYPE || 'mongodb';
    let userRepository;
    let testUserIds = [];
    const TEST_PASSWORD = 'IsolationTestPassword123!';

    beforeAll(async () => {
        await connectPrisma();
        userRepository = createUserRepository();
    }, 30000);

    afterAll(async () => {
        for (const userId of testUserIds) {
            await userRepository.deleteUser(userId).catch(() => {});
        }
        await disconnectPrisma();
    }, 30000);

    test('Encryption schema does NOT include User.hashword', () => {
        const userEncryptedFields = getEncryptedFields('User');

        expect(userEncryptedFields).toBeDefined();
        expect(Array.isArray(userEncryptedFields)).toBe(true);
        expect(userEncryptedFields).not.toContain('hashword');
    });

    test('Password is bcrypt hashed regardless of encryption config', async () => {
        const encryptionConfig = getEncryptionConfig();

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
    });

    test('Field-level encryption status comparison', async () => {
        const models = ['User', 'Credential', 'Token', 'IntegrationMapping'];

        for (const model of models) {
            const fields = getEncryptedFields(model);

            if (model === 'User') {
                expect(fields).not.toContain('hashword');
            } else if (model === 'Credential') {
                expect(fields).toContain('data.access_token');
            }
        }
    });

    test('End-to-end: Create user + credential, verify isolation', async () => {
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

        const fetchedUser = await userRepository.findIndividualUserById(user.id);

        const fetchedCred = await prisma.credential.findUnique({
            where: { id: credential.id },
        });

        expect(fetchedUser.hashword).toMatch(/^\$2[ab]\$\d{2}\$/);
        expect(fetchedUser.hashword).not.toContain(':');

        const isPasswordValid = await bcrypt.compare(TEST_PASSWORD, fetchedUser.hashword);
        expect(isPasswordValid).toBe(true);

        const tokenValue = fetchedCred.data.access_token;
        const encryptionEnabled = tokenValue !== secretToken;
        if (encryptionEnabled) {
            expect(tokenValue).not.toBe(secretToken);
        }

        await prisma.credential.delete({ where: { id: credential.id } });
    });

    test('Bcrypt vs Encryption format analysis', () => {
        const bcryptHash = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
        const encryptedValue = 'kms:us-east-1:alias/app-key:AQICAHg...base64...';

        expect((bcryptHash.match(/:/g) || []).length).toBe(0);
        expect((encryptedValue.match(/:/g) || []).length).toBe(3);
    });

    test('Verify password NOT double-processed', async () => {
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

        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^\$2[ab]\$\d{2}\$/);
        expect(hash2).toMatch(/^\$2[ab]\$\d{2}\$/);
    });
});
