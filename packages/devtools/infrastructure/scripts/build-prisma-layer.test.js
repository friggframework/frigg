/**
 * Tests for Prisma Lambda Layer Builder
 * Validates database client selection logic
 */

const { getGeneratedClientPackages } = require('./build-prisma-layer');

// Mock the log function
jest.mock('./build-prisma-layer', () => {
    const actual = jest.requireActual('./build-prisma-layer');
    return {
        ...actual,
        getGeneratedClientPackages: actual.getGeneratedClientPackages,
    };
});

describe('getGeneratedClientPackages()', () => {
    it('should include MongoDB client when mongoDB.enable is true', () => {
        const databaseConfig = {
            mongoDB: { enable: true },
        };

        const packages = getGeneratedClientPackages(databaseConfig);

        expect(packages).toContain('generated/prisma-mongodb');
    });

    it('should include MongoDB client when documentDB.enable is true', () => {
        const databaseConfig = {
            documentDB: { enable: true },
        };

        const packages = getGeneratedClientPackages(databaseConfig);

        expect(packages).toContain('generated/prisma-mongodb');
    });

    it('should include PostgreSQL client when postgres.enable is true', () => {
        const databaseConfig = {
            postgres: { enable: true },
        };

        const packages = getGeneratedClientPackages(databaseConfig);

        expect(packages).toContain('generated/prisma-postgresql');
    });

    it('should include both clients when both databases are enabled', () => {
        const databaseConfig = {
            mongoDB: { enable: true },
            postgres: { enable: true },
        };

        const packages = getGeneratedClientPackages(databaseConfig);

        expect(packages).toContain('generated/prisma-mongodb');
        expect(packages).toContain('generated/prisma-postgresql');
        expect(packages).toHaveLength(2);
    });

    it('should include both clients when documentDB and postgres are enabled', () => {
        const databaseConfig = {
            documentDB: { enable: true },
            postgres: { enable: true },
        };

        const packages = getGeneratedClientPackages(databaseConfig);

        expect(packages).toContain('generated/prisma-mongodb');
        expect(packages).toContain('generated/prisma-postgresql');
        expect(packages).toHaveLength(2);
    });

    it('should default to PostgreSQL when no database config provided', () => {
        const packages = getGeneratedClientPackages({});

        expect(packages).toContain('generated/prisma-postgresql');
        expect(packages).toHaveLength(1);
    });

    it('should default to PostgreSQL when database config is null', () => {
        const packages = getGeneratedClientPackages(null);

        expect(packages).toContain('generated/prisma-postgresql');
        expect(packages).toHaveLength(1);
    });

    it('should only include MongoDB when postgres.enable is false and mongoDB is true', () => {
        const databaseConfig = {
            mongoDB: { enable: true },
            postgres: { enable: false },
        };

        const packages = getGeneratedClientPackages(databaseConfig);

        expect(packages).toContain('generated/prisma-mongodb');
        expect(packages).not.toContain('generated/prisma-postgresql');
        expect(packages).toHaveLength(1);
    });
});


