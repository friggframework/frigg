/**
 * Tests for Prisma MongoDB adapter initialization
 * Validates DATABASE_URL configuration with MONGO_URI fallback
 */

const { ensureMongoDbUrl, ensureSqliteDirectory } = require('./prisma');
const path = require('node:path');
const fs = require('node:fs');

describe('Prisma MongoDB Adapter', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('ensureMongoDbUrl() - MongoDB DATABASE_URL setup', () => {
        it('should use DATABASE_URL when already set', () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/primary';
            process.env.MONGO_URI = 'mongodb://localhost:27017/fallback';

            ensureMongoDbUrl();

            expect(process.env.DATABASE_URL).toBe('mongodb://localhost:27017/primary');
        });

        it('should set DATABASE_URL from MONGO_URI when DATABASE_URL is not set', () => {
            delete process.env.DATABASE_URL;
            process.env.MONGO_URI = 'mongodb://localhost:27017/from-mongo-uri';

            ensureMongoDbUrl();

            expect(process.env.DATABASE_URL).toBe('mongodb://localhost:27017/from-mongo-uri');
        });

        it('should throw error when neither DATABASE_URL nor MONGO_URI is set', () => {
            delete process.env.DATABASE_URL;
            delete process.env.MONGO_URI;

            expect(() => ensureMongoDbUrl()).toThrow(
                'DATABASE_URL or MONGO_URI environment variable must be set for MongoDB'
            );
        });

        it('should throw error when MONGO_URI is empty string', () => {
            delete process.env.DATABASE_URL;
            process.env.MONGO_URI = '';

            expect(() => ensureMongoDbUrl()).toThrow(
                'DATABASE_URL or MONGO_URI environment variable must be set for MongoDB'
            );
        });

        it('should throw error when MONGO_URI is whitespace', () => {
            delete process.env.DATABASE_URL;
            process.env.MONGO_URI = '   ';

            expect(() => ensureMongoDbUrl()).toThrow(
                'DATABASE_URL or MONGO_URI environment variable must be set for MongoDB'
            );
        });
    });
});

describe('Prisma SQLite Adapter', () => {
    const testDir = path.join(__dirname, 'test-sqlite-temp');

    beforeAll(() => {
        // Create test directory
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterAll(() => {
        // Clean up test directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('ensureSqliteDirectory()', () => {
        it('should create .frigg directory in working directory', () => {
            // Change to test directory
            const originalCwd = process.cwd();
            process.chdir(testDir);

            try {
                const friggDir = path.join(testDir, '.frigg');

                // Ensure directory doesn't exist
                if (fs.existsSync(friggDir)) {
                    fs.rmSync(friggDir, { recursive: true });
                }

                // Call ensureSqliteDirectory
                ensureSqliteDirectory();

                // Verify directory was created
                expect(fs.existsSync(friggDir)).toBe(true);
                expect(fs.statSync(friggDir).isDirectory()).toBe(true);
            } finally {
                // Restore original directory
                process.chdir(originalCwd);
            }
        });

        it('should not throw if directory already exists', () => {
            const originalCwd = process.cwd();
            process.chdir(testDir);

            try {
                const friggDir = path.join(testDir, '.frigg');

                // Ensure directory exists
                if (!fs.existsSync(friggDir)) {
                    fs.mkdirSync(friggDir);
                }

                // Should not throw
                expect(() => ensureSqliteDirectory()).not.toThrow();
            } finally {
                process.chdir(originalCwd);
            }
        });
    });
});
