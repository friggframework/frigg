#!/usr/bin/env node

/**
 * Build Prisma Lambda Layer
 *
 * Creates a MINIMAL Lambda Layer containing only Prisma runtime client and query engines.
 * This reduces individual Lambda function sizes by ~60% (120MB → 45MB).
 *
 * IMPORTANT: This layer does NOT include the Prisma CLI (saves ~82MB).
 * The CLI is only needed for migrations and is packaged separately with the dbMigrate function.
 *
 * The layer is configured based on AppDefinition database settings:
 * - PostgreSQL: Includes PostgreSQL client + query engine only
 * - MongoDB: Includes MongoDB client + query engine only (if needed)
 * - Defaults to PostgreSQL only if not specified
 *
 * Usage:
 *   node scripts/build-prisma-layer.js
 *   npm run build:prisma-layer
 *
 * Output:
 *   layers/prisma/nodejs/node_modules/
 *   ├── @prisma/client (runtime only, ~10-15MB)
 *   ├── generated/prisma-postgresql (if PostgreSQL enabled)
 *   └── generated/prisma-mongodb (if MongoDB enabled)
 *
 * See: LAMBDA-LAYER-PRISMA.md for complete documentation
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Find @friggframework/core package, handling workspace hoisting
 * Searches up the directory tree to find node_modules/@friggframework/core
 */
function findCorePackage(startDir) {
    let currentDir = startDir;
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
        const candidatePath = path.join(currentDir, 'node_modules/@friggframework/core');
        if (fs.existsSync(candidatePath)) {
            return candidatePath;
        }
        currentDir = path.dirname(currentDir);
    }

    throw new Error(
        '@friggframework/core not found in node_modules.\n' +
        'Run "npm install" to install dependencies.'
    );
}

/**
 * Determine which database clients to include based on configuration
 * @param {Object} databaseConfig - Database configuration from AppDefinition
 * @returns {Array} List of generated client packages to include
 */
function getGeneratedClientPackages(databaseConfig = {}) {
    const packages = [];

    // Check if MongoDB is enabled (via mongoDB or documentDB config)
    const mongoEnabled = databaseConfig?.mongoDB?.enable === true ||
        databaseConfig?.documentDB?.enable === true;
    if (mongoEnabled) {
        packages.push('generated/prisma-mongodb');
        log('Including MongoDB client (based on AppDefinition)', 'blue');
    }

    // Check if PostgreSQL is enabled (default to true if not specified)
    const postgresEnabled = databaseConfig?.postgres?.enable !== false;
    if (postgresEnabled) {
        packages.push('generated/prisma-postgresql');
        log('Including PostgreSQL client (based on AppDefinition)', 'blue');
    }

    // If neither specified, default to PostgreSQL only
    if (packages.length === 0) {
        packages.push('generated/prisma-postgresql');
        log('No database specified - defaulting to PostgreSQL', 'yellow');
    }

    return packages;
}

// Configuration
// Script runs from integration project root (e.g., backend/)
// and reads Prisma packages from @friggframework/core
const PROJECT_ROOT = process.cwd();
const CORE_PACKAGE_PATH = findCorePackage(PROJECT_ROOT);
const LAYER_OUTPUT_PATH = path.join(PROJECT_ROOT, 'layers/prisma');
const LAYER_NODE_MODULES = path.join(LAYER_OUTPUT_PATH, 'nodejs/node_modules');

// Binary patterns to remove (non-rhel)
const BINARY_PATTERNS_TO_REMOVE = [
    '*darwin*',
    '*debian*',
    '*linux-arm*',
    '*linux-musl*',
    '*windows*',
];

// Files to remove for size optimization
const FILES_TO_REMOVE = [
    '*.map',        // Source maps (37MB savings)
    '*.md',         // Markdown files  
    'LICENSE*',     // License files
    'CHANGELOG*',   // Changelog files
    '*.test.js',    // Test files
    '*.spec.js',    // Spec files
    '*mysql.wasm*',        // MySQL WASM files (not needed for PostgreSQL)
    '*cockroachdb.wasm*',  // CockroachDB WASM files
    '*sqlite.wasm*',       // SQLite WASM files
    '*sqlserver.wasm*',    // SQL Server WASM files
];

// ANSI color codes for output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n[${step}] ${message}`, 'blue');
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logWarning(message) {
    log(`⚠ ${message}`, 'yellow');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

/**
 * Get directory size in MB
 */
function getDirectorySize(dirPath) {
    try {
        const output = execSync(`du -sm "${dirPath}"`, { encoding: 'utf8' });
        const size = parseInt(output.split('\t')[0], 10);
        return size;
    } catch (error) {
        logWarning(`Could not calculate directory size: ${error.message}`);
        return 0;
    }
}

/**
 * Clean existing layer directory
 */
async function cleanLayerDirectory() {
    logStep(1, 'Cleaning existing layer directory');

    if (await fs.pathExists(LAYER_OUTPUT_PATH)) {
        await fs.remove(LAYER_OUTPUT_PATH);
        logSuccess(`Removed existing layer at ${LAYER_OUTPUT_PATH}`);
    } else {
        log('No existing layer to clean');
    }
}

/**
 * Create layer directory structure
 */
async function createLayerStructure() {
    logStep(2, 'Creating layer directory structure');

    await fs.ensureDir(LAYER_NODE_MODULES);
    logSuccess(`Created ${LAYER_NODE_MODULES}`);
}

/**
 * Install Prisma client directly into layer (RUNTIME ONLY - NO CLI)
 * 
 * The Prisma CLI is NOT included in this layer to keep it small.
 * For migrations, the dbMigrate function has its own separate packaging with CLI.
 */
async function installPrismaPackages() {
    logStep(3, 'Installing Prisma runtime client (CLI excluded)');

    // Create a minimal package.json with ONLY the runtime client
    const dependencies = {
        '@prisma/client': '^6.16.3',
    };

    log('  Runtime client only - CLI excluded (saves ~82MB)', 'green');

    const layerPackageJson = {
        name: 'prisma-lambda-layer',
        version: '1.0.0',
        private: true,
        dependencies,
    };

    const packageJsonPath = path.join(LAYER_OUTPUT_PATH, 'nodejs/package.json');
    await fs.writeJson(packageJsonPath, layerPackageJson, { spaces: 2 });
    logSuccess('Created layer package.json');

    // Install Prisma packages with Lambda binary target
    // Setting PRISMA_CLI_BINARY_TARGETS ensures only rhel-openssl-3.0.x binary is downloaded
    log('Installing @prisma/client for AWS Lambda (rhel-openssl-3.0.x)...');
    try {
        const env = {
            ...process.env,
            PRISMA_CLI_BINARY_TARGETS: 'rhel-openssl-3.0.x',
        };

        execSync('npm install --omit=dev --no-package-lock', {
            cwd: path.join(LAYER_OUTPUT_PATH, 'nodejs'),
            stdio: 'inherit',
            env,
        });
        logSuccess('Prisma packages installed with Lambda binary target');
    } catch (error) {
        throw new Error(`Failed to install Prisma packages: ${error.message}`);
    }
}

/**
 * Copy generated Prisma clients from @friggframework/core to layer
 * @param {Array} clientPackages - List of generated client packages to copy
 */
async function copyPrismaPackages(clientPackages) {
    logStep(4, 'Copying generated Prisma clients from @friggframework/core');

    // Copy the generated clients from core based on database config
    // Packages can be in:
    // 1. Core's own node_modules (if not hoisted)
    // 2. Project root node_modules (if hoisted from project)
    // 3. Workspace root node_modules (where core is located - handles hoisting)
    // 4. Core package itself (for generated/ directories)
    const workspaceNodeModules = path.join(path.dirname(CORE_PACKAGE_PATH), '..');
    const searchPaths = [
        path.join(CORE_PACKAGE_PATH, 'node_modules'),  // Core's own node_modules
        path.join(PROJECT_ROOT, 'node_modules'),        // Project node_modules
        workspaceNodeModules,                           // Workspace root node_modules
        CORE_PACKAGE_PATH,                              // Core package itself (for generated/)
    ];

    let copiedCount = 0;
    let missingPackages = [];

    for (const pkg of clientPackages) {
        let sourcePath = null;

        // Try to find package in search paths
        for (const searchPath of searchPaths) {
            const candidatePath = path.join(searchPath, pkg);
            if (await fs.pathExists(candidatePath)) {
                sourcePath = candidatePath;
                break;
            }
        }

        if (sourcePath) {
            const destPath = path.join(LAYER_NODE_MODULES, pkg);
            await fs.copy(sourcePath, destPath, {
                dereference: true,  // Follow symlinks
                filter: (src) => {
                    // Skip node_modules within Prisma packages
                    return !src.includes('/node_modules/node_modules/');
                }
            });
            const fromLocation = sourcePath.includes('@friggframework/core/generated')
                ? 'core package (generated)'
                : sourcePath.includes('@friggframework/core/node_modules')
                    ? 'core node_modules'
                    : 'workspace';
            logSuccess(`Copied ${pkg} (from ${fromLocation})`);
            copiedCount++;
        } else {
            missingPackages.push(pkg);
            logWarning(`Package not found: ${pkg}`);
        }
    }

    if (missingPackages.length > 0) {
        throw new Error(
            `Missing generated Prisma clients: ${missingPackages.join(', ')}.\n` +
            'Ensure @friggframework/core has generated Prisma clients (run "npm run prisma:generate" in core package).'
        );
    }

    logSuccess(`Copied ${copiedCount} generated client packages from @friggframework/core`);
}

/**
 * Remove unnecessary files to reduce layer size
 */
async function removeUnnecessaryFiles() {
    logStep(5, 'Removing unnecessary files (source maps, docs, tests)');

    let removedCount = 0;
    let totalSize = 0;

    for (const pattern of FILES_TO_REMOVE) {
        try {
            // Find files matching the pattern
            const findCmd = `find "${LAYER_NODE_MODULES}" -name "${pattern}" -type f 2>/dev/null || true`;
            const files = execSync(findCmd, { encoding: 'utf8' })
                .split('\n')
                .filter(f => f.trim());

            for (const file of files) {
                if (await fs.pathExists(file)) {
                    const stats = await fs.stat(file);
                    totalSize += stats.size;
                    await fs.remove(file);
                    removedCount++;
                }
            }
        } catch (error) {
            logWarning(`Error removing ${pattern}: ${error.message}`);
        }
    }

    if (removedCount > 0) {
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
        logSuccess(`Removed ${removedCount} unnecessary files (saved ${sizeMB} MB)`);
    } else {
        log('No unnecessary files found to remove');
    }
}

/**
 * Remove non-rhel engine binaries to reduce layer size
 */
async function removeNonRhelBinaries() {
    logStep(6, 'Removing non-rhel engine binaries');

    let removedCount = 0;
    let totalSize = 0;

    for (const pattern of BINARY_PATTERNS_TO_REMOVE) {
        try {
            // Find files matching the pattern
            const findCmd = `find "${LAYER_NODE_MODULES}" -name "${pattern}" 2>/dev/null || true`;
            const files = execSync(findCmd, { encoding: 'utf8' })
                .split('\n')
                .filter(f => f.trim());

            for (const file of files) {
                if (await fs.pathExists(file)) {
                    const stats = await fs.stat(file);
                    totalSize += stats.size;
                    await fs.remove(file);
                    removedCount++;
                }
            }
        } catch (error) {
            logWarning(`Error removing ${pattern}: ${error.message}`);
        }
    }

    if (removedCount > 0) {
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
        logSuccess(`Removed ${removedCount} non-rhel binaries (saved ${sizeMB} MB)`);
    } else {
        log('No non-rhel binaries found to remove');
    }
}

/**
 * Verify rhel binaries are present
 * @param {Array} expectedClients - List of client packages that should have binaries
 */
async function verifyRhelBinaries(expectedClients) {
    logStep(7, 'Verifying rhel-openssl-3.0.x binaries are present');

    try {
        const findCmd = `find "${LAYER_NODE_MODULES}" -name "*rhel-openssl-3.0.x*" 2>/dev/null || true`;
        const rhelFiles = execSync(findCmd, { encoding: 'utf8' })
            .split('\n')
            .filter(f => f.trim());

        if (rhelFiles.length === 0) {
            throw new Error(
                'No rhel-openssl-3.0.x binaries found!\n' +
                'Check that Prisma schemas have binaryTargets = ["native", "rhel-openssl-3.0.x"]'
            );
        }

        const expectedCount = expectedClients.length;
        logSuccess(`Found ${rhelFiles.length} rhel-openssl-3.0.x ${rhelFiles.length === 1 ? 'binary' : 'binaries'} (expected ${expectedCount})`);

        // Show the binaries found
        rhelFiles.forEach(file => {
            const relativePath = path.relative(LAYER_NODE_MODULES, file);
            log(`  - ${relativePath}`, 'reset');
        });
    } catch (error) {
        throw new Error(`Binary verification failed: ${error.message}`);
    }
}

/**
 * Verify required files exist
 * Runtime layer should NOT have CLI files
 * @param {Array} clientPackages - Generated client packages that were included
 */
async function verifyLayerStructure(clientPackages) {
    logStep(8, 'Verifying layer structure (runtime only)');

    const requiredPaths = [
        '@prisma/client/runtime',
        '@prisma/client/index.d.ts',
    ];

    // Add schema.prisma for each included client
    for (const pkg of clientPackages) {
        requiredPaths.push(`${pkg}/schema.prisma`);
    }

    // Verify CLI is NOT present (keeps layer small)
    const forbiddenPaths = [
        'prisma/build',
        '.bin/prisma',
    ];

    let allPresent = true;

    for (const requiredPath of requiredPaths) {
        const fullPath = path.join(LAYER_NODE_MODULES, requiredPath);
        if (await fs.pathExists(fullPath)) {
            log(`  ✓ ${requiredPath}`, 'green');
        } else {
            log(`  ✗ ${requiredPath} (missing)`, 'red');
            allPresent = false;
        }
    }

    if (!allPresent) {
        throw new Error('Layer structure verification failed - missing required files');
    }

    logSuccess('All required runtime files present');

    // Verify CLI is NOT present
    for (const forbiddenPath of forbiddenPaths) {
        const fullPath = path.join(LAYER_NODE_MODULES, forbiddenPath);
        if (await fs.pathExists(fullPath)) {
            logWarning(`  ⚠ ${forbiddenPath} found (should be excluded for minimal layer)`);
        }
    }
}

/**
 * Calculate and display final layer size
 */
async function displayLayerSummary() {
    logStep(9, 'Layer build summary');

    const layerSizeMB = getDirectorySize(LAYER_OUTPUT_PATH);

    log('\n' + '='.repeat(60), 'bright');
    log('  Prisma Lambda Layer Built Successfully!', 'bright');
    log('='.repeat(60), 'bright');

    log(`\nLayer location: ${LAYER_OUTPUT_PATH}`, 'blue');
    log(`Layer size: ~${layerSizeMB} MB`, 'green');

    log('\nPackages included:', 'bright');
    log('  - @prisma/client (runtime only - ~10-15MB)', 'reset');
    log('  - generated/prisma-postgresql (PostgreSQL client)', 'reset');
    log('\nPackages EXCLUDED for minimal size:', 'bright');
    log('  - prisma CLI (excluded - only in dbMigrate function)', 'yellow');
    log('  - @prisma/engines (minimal - only rhel binary)', 'yellow');

    log('\nNext steps:', 'bright');
    log('  1. Verify layer structure: ls -lah layers/prisma/nodejs/node_modules/', 'reset');
    log('  2. Deploy to AWS: frigg deploy --stage dev', 'reset');
    log('  3. Check function sizes in Lambda console (should be ~45-55MB)', 'reset');

    log('\nSee LAMBDA-LAYER-PRISMA.md for complete documentation.', 'yellow');
    log('='.repeat(60) + '\n', 'bright');
}

/**
 * Main build function
 * @param {Object} databaseConfig - Database configuration from AppDefinition.database
 */
async function buildPrismaLayer(databaseConfig = {}) {
    const startTime = Date.now();

    log('\n' + '='.repeat(60), 'bright');
    log('  Building Minimal Prisma Lambda Layer (Runtime Only)', 'bright');
    log('='.repeat(60) + '\n', 'bright');

    // Log paths
    log(`Project root: ${PROJECT_ROOT}`, 'reset');
    log(`Core package: ${CORE_PACKAGE_PATH}`, 'reset');
    log(`Layer output: ${LAYER_OUTPUT_PATH}\n`, 'reset');

    // Determine which database clients to include
    const clientPackages = getGeneratedClientPackages(databaseConfig);

    try {
        await cleanLayerDirectory();
        await createLayerStructure();
        await installPrismaPackages();              // Install runtime client only (NO CLI)
        await copyPrismaPackages(clientPackages);   // Copy generated clients from core
        await removeUnnecessaryFiles();             // Remove source maps, docs, tests (37MB+)
        await removeNonRhelBinaries();              // Remove non-Linux binaries
        await verifyRhelBinaries(clientPackages);   // Verify query engines present
        await verifyLayerStructure(clientPackages); // Verify minimal runtime structure
        await displayLayerSummary();

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        log(`Build completed in ${duration}s\n`, 'green');

        return { success: true, duration };
    } catch (error) {
        logError(`\nBuild failed: ${error.message}`);

        if (error.stack) {
            log('\nStack trace:', 'red');
            console.error(error.stack);
        }

        log('\nTroubleshooting:', 'yellow');
        log('  1. Ensure @friggframework/core has dependencies installed', 'reset');
        log('  2. Run "npm run prisma:generate" in core package', 'reset');
        log('  3. Check that Prisma schemas have correct binaryTargets', 'reset');
        log('  4. See LAMBDA-LAYER-PRISMA.md for details\n', 'reset');

        // Throw error instead of exit when used as module
        throw error;
    }
}

// Run the build when executed directly
if (require.main === module) {
    buildPrismaLayer()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { buildPrismaLayer, getGeneratedClientPackages };
