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
        it('should add readPreference=primary when not present', () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/test';
            delete process.env.MONGO_URI;

            ensureMongoDbUrl();

            expect(process.env.DATABASE_URL).toBe('mongodb://localhost:27017/test?readPreference=primary');
        });

        it('should add readPreference=primary to existing query params', () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/test?replicaSet=rs0';
            delete process.env.MONGO_URI;

            ensureMongoDbUrl();

            expect(process.env.DATABASE_URL).toBe('mongodb://localhost:27017/test?replicaSet=rs0&readPreference=primary');
        });

        it('should override readPreference=secondaryPreferred to primary', () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/test?readPreference=secondaryPreferred&replicaSet=rs0';
            delete process.env.MONGO_URI;

            ensureMongoDbUrl();

            expect(process.env.DATABASE_URL).toBe('mongodb://localhost:27017/test?readPreference=primary&replicaSet=rs0');
        });

        it('should override readPreference=secondary to primary', () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/test?readPreference=secondary';
            delete process.env.MONGO_URI;

            ensureMongoDbUrl();

            expect(process.env.DATABASE_URL).toBe('mongodb://localhost:27017/test?readPreference=primary');
        });

        it('should keep readPreference=primary unchanged', () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/test?readPreference=primary';
            delete process.env.MONGO_URI;

            ensureMongoDbUrl();

            expect(process.env.DATABASE_URL).toBe('mongodb://localhost:27017/test?readPreference=primary');
        });

        it('should set DATABASE_URL from MONGO_URI and add readPreference', () => {
            delete process.env.DATABASE_URL;
            process.env.MONGO_URI = 'mongodb://localhost:27017/from-mongo-uri';

            ensureMongoDbUrl();

            expect(process.env.DATABASE_URL).toBe('mongodb://localhost:27017/from-mongo-uri?readPreference=primary');
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
