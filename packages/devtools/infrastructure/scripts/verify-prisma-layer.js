#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const LAYER_PATH = path.join(PROJECT_ROOT, 'layers/prisma/nodejs/node_modules');

async function verifyLayerStructure() {
    console.log('Verifying Prisma layer structure...\n');

    const checks = [
        {
            name: 'PostgreSQL schema',
            path: 'generated/prisma-postgresql/schema.prisma'
        },
        {
            name: 'PostgreSQL migrations directory',
            path: 'generated/prisma-postgresql/migrations'
        },
        {
            name: 'PostgreSQL migration_lock.toml',
            path: 'generated/prisma-postgresql/migrations/migration_lock.toml'
        },
        {
            name: '@prisma/client runtime',
            path: '@prisma/client/runtime'
        }
    ];

    let allPassed = true;

    for (const check of checks) {
        const fullPath = path.join(LAYER_PATH, check.path);
        const exists = await fs.pathExists(fullPath);
        
        if (exists) {
            console.log(`✓ ${check.name}`);
        } else {
            console.log(`✗ ${check.name} (missing)`);
            allPassed = false;
        }
    }

    console.log('\n');

    if (allPassed) {
        console.log('✓ All checks passed!');
        const migrationsPath = path.join(LAYER_PATH, 'generated/prisma-postgresql/migrations');
        const migrationFiles = await fs.readdir(migrationsPath);
        console.log(`\nFound ${migrationFiles.length} items in migrations directory:`);
        migrationFiles.forEach(file => {
            console.log(`  - ${file}`);
        });
        return 0;
    } else {
        console.log('✗ Some checks failed!');
        return 1;
    }
}

if (require.main === module) {
    verifyLayerStructure()
        .then(code => process.exit(code))
        .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}

module.exports = { verifyLayerStructure };

