/**
 * Tests for Prisma MongoDB adapter initialization
 * Validates DATABASE_URL configuration with MONGO_URI fallback
 */

const { ensureMongoDbUrl } = require('./prisma');

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

            expect(process.env.DATABASE_URL).toBe(
                'mongodb://localhost:27017/primary'
            );
        });

        it('should set DATABASE_URL from MONGO_URI when DATABASE_URL is not set', () => {
            delete process.env.DATABASE_URL;
            process.env.MONGO_URI = 'mongodb://localhost:27017/from-mongo-uri';

            ensureMongoDbUrl();

            expect(process.env.DATABASE_URL).toBe(
                'mongodb://localhost:27017/from-mongo-uri'
            );
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
