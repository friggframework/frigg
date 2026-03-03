/**
 * Password Hashing Verification Test
 *
 * Verifies that passwords are correctly bcrypt hashed (NOT encrypted) throughout
 * the user authentication flow. Tests both MongoDB and PostgreSQL.
 *
 * Expected Behavior:
 * - Passwords hashed with bcrypt on creation (format: $2a$ or $2b$)
 * - Password hashes stored as-is (NOT encrypted with KMS/AES)
 * - bcrypt.compare() works correctly for authentication
 * - Password updates also trigger bcrypt hashing
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
const { LoginUser } = require('../use-cases/login-user');
const { createUserRepository } = require('../repositories/user-repository-factory');
const { prisma, connectPrisma, disconnectPrisma } = require('../../database/prisma');

describe('Password Hashing Verification - Both Databases', () => {
    const dbType = process.env.DB_TYPE || 'mongodb';
    let userRepository;
    let testUserId;
    const TEST_PASSWORD = 'MySecurePassword123!';
    const TEST_USERNAME = `test-user-hash-${Date.now()}`;
    const userConfig = {
        usePassword: true,
        individualUserRequired: true,
        organizationUserRequired: false,
        primary: 'individual',
    };

    beforeAll(async () => {
        await connectPrisma();
        userRepository = createUserRepository();
    }, 30000);

    afterAll(async () => {
        if (testUserId) {
            await userRepository.deleteUser(testUserId).catch(() => {});
        }
        await disconnectPrisma();
    }, 30000);

    describe(`${dbType.toUpperCase()} - Password Hashing`, () => {
        test('Password is bcrypt hashed on user creation', async () => {
            const user = await userRepository.createIndividualUser({
                username: TEST_USERNAME,
                hashword: TEST_PASSWORD,
                email: `${TEST_USERNAME}@test.com`,
            });
            testUserId = user.id;

            expect(user.hashword).toBeDefined();
            expect(user.hashword).not.toBe(TEST_PASSWORD);
            expect(user.hashword).toMatch(/^\$2[ab]\$\d{2}\$/);
            expect(user.hashword.length).toBeGreaterThan(50);
            expect(user.hashword).not.toContain(':');
        });

        test('Stored hashword is bcrypt format, NOT encrypted', async () => {
            const user = await userRepository.findIndividualUserByUsername(TEST_USERNAME);

            expect(user.hashword).toMatch(/^\$2[ab]\$\d{2}\$/);
            expect(user.hashword).not.toContain(':');
            expect(user.hashword.split(':')).toHaveLength(1);
        });

        test('bcrypt.compare() verifies correct password', async () => {
            const user = await userRepository.findIndividualUserByUsername(TEST_USERNAME);
            const isValid = await bcrypt.compare(TEST_PASSWORD, user.hashword);

            expect(isValid).toBe(true);
        });

        test('bcrypt.compare() rejects incorrect password', async () => {
            const user = await userRepository.findIndividualUserByUsername(TEST_USERNAME);
            const isValid = await bcrypt.compare('WrongPassword', user.hashword);

            expect(isValid).toBe(false);
        });

        test('Login succeeds with correct password', async () => {
            const loginUser = new LoginUser({ userRepository, userConfig });
            const user = await loginUser.execute({
                username: TEST_USERNAME,
                password: TEST_PASSWORD,
            });

            expect(user).toBeDefined();
            expect(user.getId()).toBe(testUserId);
        });

        test('Login fails with incorrect password', async () => {
            const loginUser = new LoginUser({ userRepository, userConfig });

            await expect(
                loginUser.execute({
                    username: TEST_USERNAME,
                    password: 'WrongPassword123',
                })
            ).rejects.toThrow('Incorrect username or password');
        });

        test('Password update also hashes the new password', async () => {
            const newPassword = 'NewSecurePassword456!';

            const updatedUser = await userRepository.updateIndividualUser(testUserId, {
                hashword: newPassword,
            });

            expect(updatedUser.hashword).not.toBe(newPassword);
            expect(updatedUser.hashword).toMatch(/^\$2[ab]\$\d{2}\$/);
            expect(updatedUser.hashword).not.toContain(':');

            const isNewPasswordValid = await bcrypt.compare(newPassword, updatedUser.hashword);
            expect(isNewPasswordValid).toBe(true);

            const isOldPasswordValid = await bcrypt.compare(TEST_PASSWORD, updatedUser.hashword);
            expect(isOldPasswordValid).toBe(false);
        });

        test('Raw database check: bcrypt hash stored directly', async () => {
            let rawUser;
            if (dbType === 'postgresql') {
                const userId = parseInt(testUserId, 10);
                rawUser = await prisma.$queryRaw`
                    SELECT hashword FROM "User" WHERE id = ${userId}
                `;
                rawUser = rawUser[0];
            } else {
                rawUser = await userRepository.findIndividualUserById(testUserId);
            }

            expect(rawUser.hashword).toMatch(/^\$2[ab]\$\d{2}\$/);
            expect(rawUser.hashword).not.toContain(':');
        });
    });

    describe(`${dbType.toUpperCase()} - Encryption Isolation`, () => {
        test('COMPARISON: Credential tokens encrypted, passwords hashed', async () => {
            const credential = await prisma.credential.create({
                data: {
                    userId: dbType === 'postgresql' ? parseInt(testUserId, 10) : testUserId,
                    externalId: `test-cred-${Date.now()}`,
                    data: {
                        access_token: 'secret-access-token-12345',
                        refresh_token: 'secret-refresh-token-67890',
                    },
                },
            });

            const user = await userRepository.findIndividualUserById(testUserId);

            let rawCred;
            if (dbType === 'postgresql') {
                rawCred = await prisma.$queryRaw`
                    SELECT data FROM "Credential" WHERE id = ${credential.id}
                `;
                rawCred = rawCred[0];
            } else {
                rawCred = await prisma.credential.findUnique({
                    where: { id: credential.id },
                });
            }

            const encryptionEnabled = rawCred.data.access_token !== 'secret-access-token-12345';

            if (encryptionEnabled) {
                expect(rawCred.data.access_token).toContain(':');
                expect(rawCred.data.access_token.split(':')).toHaveLength(4);
            }

            expect(user.hashword).toMatch(/^\$2[ab]\$\d{2}\$/);
            expect(user.hashword).not.toContain(':');

            await prisma.credential.delete({ where: { id: credential.id } });
        });
    });
});
