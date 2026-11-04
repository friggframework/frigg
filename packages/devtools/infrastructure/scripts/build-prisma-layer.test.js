/**
 * Tests for Prisma Lambda Layer Builder
 * Validates database client selection logic
 */

const {
    getGeneratedClientPackages,
    getMigrationsPackages,
    getMigrationSourcePath,
    getMigrationDestinationPath,
    engineFilesToRemove,
    verifyTargetBinaries,
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
    // getMigrationSourcePath() returns the first search path whose
    // prisma-<dbType>/migrations directory exists on disk, so the test needs a
    // real directory rather than a made-up absolute path.
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    let tmpRoot;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-prisma-layer-'));
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('should return the migrations path of the first search path that has one', () => {
        const missing = path.join(tmpRoot, 'missing');
        const core = path.join(tmpRoot, 'packages', 'core');
        const expected = path.join(core, 'prisma-postgresql', 'migrations');
        fs.mkdirSync(expected, { recursive: true });

        const sourcePath = getMigrationSourcePath([missing, core], 'postgresql');
        expect(sourcePath).toBe(expected);
    });

    it('should return null when no search path has migrations for the database type', () => {
        const sourcePath = getMigrationSourcePath([tmpRoot], 'postgresql');
        expect(sourcePath).toBeNull();
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

describe('engineFilesToRemove()', () => {
    const files = [
        'libquery_engine-rhel-openssl-3.0.x.so.node',
        'libquery_engine-linux-arm64-openssl-3.0.x.so.node',
        'libquery_engine-debian-openssl-3.0.x.so.node',
        'schema-engine-rhel-openssl-3.0.x',
        'query-engine-linux-arm64-openssl-3.0.x',
        'query_engine_bg.wasm',
        'index.js',
    ];

    it('keeps the rhel engines and the non-engine files for an x86_64 target', () => {
        expect(engineFilesToRemove(files, 'rhel-openssl-3.0.x')).toEqual([
            'libquery_engine-linux-arm64-openssl-3.0.x.so.node',
            'libquery_engine-debian-openssl-3.0.x.so.node',
            'query-engine-linux-arm64-openssl-3.0.x',
        ]);
    });

    it('keeps the linux-arm64 engines and the non-engine files for an arm64 target', () => {
        expect(engineFilesToRemove(files, 'linux-arm64-openssl-3.0.x')).toEqual([
            'libquery_engine-rhel-openssl-3.0.x.so.node',
            'libquery_engine-debian-openssl-3.0.x.so.node',
            'schema-engine-rhel-openssl-3.0.x',
        ]);
    });
});

describe('verifyTargetBinaries()', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const clients = ['generated/prisma-postgresql', 'generated/prisma-mongodb'];
    let layerNodeModules;

    const writeEngine = (client, engine) => {
        const dir = path.join(layerNodeModules, client);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, engine), '');
    };

    beforeEach(() => {
        layerNodeModules = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-prisma-layer-'));
    });

    afterEach(() => {
        fs.rmSync(layerNodeModules, { recursive: true, force: true });
    });

    it.each([
        ['rhel-openssl-3.0.x'],
        ['linux-arm64-openssl-3.0.x'],
    ])('passes when every client holds only the %s engine', async (target) => {
        for (const client of clients) {
            writeEngine(client, `libquery_engine-${target}.so.node`);
        }

        await expect(
            verifyTargetBinaries(layerNodeModules, target, clients, '2.0.0-next.0')
        ).resolves.toBeUndefined();
    });

    it('fails naming the client, the target and the core version when one client lacks the engine', async () => {
        writeEngine('generated/prisma-postgresql', 'libquery_engine-linux-arm64-openssl-3.0.x.so.node');
        writeEngine('generated/prisma-mongodb', 'libquery_engine-rhel-openssl-3.0.x.so.node');

        await expect(
            verifyTargetBinaries(layerNodeModules, 'linux-arm64-openssl-3.0.x', clients, '2.0.0-next.105')
        ).rejects.toThrow(/prisma-mongodb.*linux-arm64-openssl-3\.0\.x[\s\S]*2\.0\.0-next\.105/);
    });

    it('fails when a client still holds an engine for another Linux target', async () => {
        writeEngine('generated/prisma-postgresql', 'libquery_engine-rhel-openssl-3.0.x.so.node');
        writeEngine('generated/prisma-postgresql', 'libquery_engine-linux-arm64-openssl-3.0.x.so.node');

        await expect(
            verifyTargetBinaries(layerNodeModules, 'rhel-openssl-3.0.x', ['generated/prisma-postgresql'], '2.0.0-next.0')
        ).rejects.toThrow(/libquery_engine-linux-arm64-openssl-3\.0\.x\.so\.node/);
    });
});
