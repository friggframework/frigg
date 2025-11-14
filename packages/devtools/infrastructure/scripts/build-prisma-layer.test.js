/**
 * Tests for Prisma Lambda Layer Builder
 * Validates database client selection logic
 */

const {
    getGeneratedClientPackages,
    getMigrationsPackages,
    getMigrationSourcePath,
    getMigrationDestinationPath,
} = require('./build-prisma-layer');

// Mock the log function
jest.mock('./build-prisma-layer', () => {
    const actual = jest.requireActual('./build-prisma-layer');
    return {
        ...actual,
        getGeneratedClientPackages: actual.getGeneratedClientPackages,
        getMigrationsPackages: actual.getMigrationsPackages,
        getMigrationSourcePath: actual.getMigrationSourcePath,
        getMigrationDestinationPath: actual.getMigrationDestinationPath,
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

describe('getMigrationsPackages()', () => {
    it('should extract database types from client packages', () => {
        const clientPackages = [
            'generated/prisma-postgresql',
            'generated/prisma-mongodb',
        ];
        const migrations = getMigrationsPackages(clientPackages);

        expect(migrations).toEqual([
            {
                dbType: 'postgresql',
                clientPackage: 'generated/prisma-postgresql',
            },
            { dbType: 'mongodb', clientPackage: 'generated/prisma-mongodb' },
        ]);
    });

    it('should handle single client package', () => {
        const clientPackages = ['generated/prisma-postgresql'];
        const migrations = getMigrationsPackages(clientPackages);

        expect(migrations).toEqual([
            {
                dbType: 'postgresql',
                clientPackage: 'generated/prisma-postgresql',
            },
        ]);
    });

    it('should handle empty array', () => {
        const migrations = getMigrationsPackages([]);
        expect(migrations).toEqual([]);
    });
});

describe('getMigrationSourcePath()', () => {
    it('should return correct source path for database type', () => {
        const searchPaths = ['/workspace/packages/core'];
        const dbType = 'postgresql';

        const sourcePath = getMigrationSourcePath(searchPaths, dbType);
        expect(sourcePath).toBe(
            '/workspace/packages/core/prisma-postgresql/migrations'
        );
    });
});

describe('getMigrationDestinationPath()', () => {
    it('should return correct destination path for client package', () => {
        const layerNodeModules = '/layers/prisma/nodejs/node_modules';
        const clientPackage = 'generated/prisma-postgresql';

        const destPath = getMigrationDestinationPath(
            layerNodeModules,
            clientPackage
        );
        expect(destPath).toBe(
            '/layers/prisma/nodejs/node_modules/generated/prisma-postgresql/migrations'
        );
    });
});
