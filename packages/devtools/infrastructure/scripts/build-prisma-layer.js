#!/usr/bin/env node

/**
 * Build Prisma Lambda Layer
 *
 * Creates a Lambda Layer containing all Prisma packages and rhel-openssl-3.0.x binaries.
 * This reduces individual Lambda function sizes by ~60% (120MB → 45MB).
 *
 * Usage:
 *   node scripts/build-prisma-layer.js
 *   npm run build:prisma-layer
 *
 * Output:
 *   layers/prisma/nodejs/node_modules/
 *   ├── @prisma/client
 *   ├── @prisma-mongodb/client
 *   ├── @prisma-postgresql/client
 *   └── prisma (CLI for migrations)
 *
 * See: LAMBDA-LAYER-PRISMA.md for complete documentation
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
// Script runs from integration project root (e.g., backend/)
// and reads Prisma packages from @friggframework/core
const PROJECT_ROOT = process.cwd();
const CORE_PACKAGE_PATH = path.join(PROJECT_ROOT, 'node_modules/@friggframework/core');
const LAYER_OUTPUT_PATH = path.join(PROJECT_ROOT, 'layers/prisma');
const LAYER_NODE_MODULES = path.join(LAYER_OUTPUT_PATH, 'nodejs/node_modules');

// Packages to include in the layer
const PRISMA_PACKAGES = [
    '@prisma/client',
    '@prisma-mongodb/client',
    '@prisma-postgresql/client',
    'prisma',  // CLI for migrations
];

// Binary patterns to remove (non-rhel)
const BINARY_PATTERNS_TO_REMOVE = [
    '*darwin*',
    '*debian*',
    '*linux-arm*',
    '*linux-musl*',
    '*windows*',
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
 * Copy Prisma packages from core to layer
 */
async function copyPrismaPackages() {
    logStep(3, 'Copying Prisma packages from @friggframework/core');

    // Prisma packages can be in:
    // 1. node_modules/@friggframework/core/node_modules/ (if core has its own)
    // 2. node_modules/ (if hoisted by npm/yarn to project root)
    const coreNodeModules = path.join(CORE_PACKAGE_PATH, 'node_modules');
    const projectNodeModules = path.join(PROJECT_ROOT, 'node_modules');

    const nodeModulesPaths = [coreNodeModules, projectNodeModules];

    let copiedCount = 0;
    let missingPackages = [];

    for (const pkg of PRISMA_PACKAGES) {
        let sourcePath = null;

        // Try to find package in core or root node_modules
        for (const nodeModulesPath of nodeModulesPaths) {
            const candidatePath = path.join(nodeModulesPath, pkg);
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
            const fromLocation = sourcePath.includes('@friggframework/core/node_modules')
                ? 'core package'
                : 'project root';
            logSuccess(`Copied ${pkg} (from ${fromLocation})`);
            copiedCount++;
        } else {
            missingPackages.push(pkg);
            logWarning(`Package not found: ${pkg}`);
        }
    }

    if (missingPackages.length > 0) {
        throw new Error(
            `Missing Prisma packages: ${missingPackages.join(', ')}.\n` +
            'Ensure @friggframework/core is installed with "npm install" and Prisma clients are generated.'
        );
    }

    log(`\nCopied ${copiedCount}/${PRISMA_PACKAGES.length} packages`);
}

/**
 * Remove non-rhel engine binaries to reduce layer size
 */
async function removeNonRhelBinaries() {
    logStep(4, 'Removing non-rhel engine binaries');

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
 */
async function verifyRhelBinaries() {
    logStep(5, 'Verifying rhel-openssl-3.0.x binaries are present');

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

        logSuccess(`Found ${rhelFiles.length} rhel-openssl-3.0.x binaries`);

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
 */
async function verifyLayerStructure() {
    logStep(6, 'Verifying layer structure');

    const requiredPaths = [
        '@prisma/client/runtime',
        '@prisma/client/index.d.ts',
        '@prisma-mongodb/client/schema.prisma',
        '@prisma-postgresql/client/schema.prisma',
        'prisma/build',
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

    logSuccess('All required files present');
}

/**
 * Calculate and display final layer size
 */
async function displayLayerSummary() {
    logStep(7, 'Layer build summary');

    const layerSizeMB = getDirectorySize(LAYER_OUTPUT_PATH);

    log('\n' + '='.repeat(60), 'bright');
    log('  Prisma Lambda Layer Built Successfully!', 'bright');
    log('='.repeat(60), 'bright');

    log(`\nLayer location: ${LAYER_OUTPUT_PATH}`, 'blue');
    log(`Layer size: ~${layerSizeMB} MB`, 'green');

    log('\nPackages included:', 'bright');
    PRISMA_PACKAGES.forEach(pkg => {
        log(`  - ${pkg}`, 'reset');
    });

    log('\nNext steps:', 'bright');
    log('  1. Verify layer structure: ls -lah layers/prisma/nodejs/node_modules/', 'reset');
    log('  2. Deploy to AWS: frigg deploy --stage dev', 'reset');
    log('  3. Check function sizes in Lambda console (should be ~45-55MB)', 'reset');

    log('\nSee LAMBDA-LAYER-PRISMA.md for complete documentation.', 'yellow');
    log('='.repeat(60) + '\n', 'bright');
}

/**
 * Main build function
 */
async function buildPrismaLayer() {
    const startTime = Date.now();

    log('\n' + '='.repeat(60), 'bright');
    log('  Building Prisma Lambda Layer', 'bright');
    log('='.repeat(60) + '\n', 'bright');

    // Log paths
    log(`Project root: ${PROJECT_ROOT}`, 'reset');
    log(`Core package: ${CORE_PACKAGE_PATH}`, 'reset');
    log(`Layer output: ${LAYER_OUTPUT_PATH}\n`, 'reset');

    try {
        await cleanLayerDirectory();
        await createLayerStructure();
        await copyPrismaPackages();
        await removeNonRhelBinaries();
        await verifyRhelBinaries();
        await verifyLayerStructure();
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

module.exports = { buildPrismaLayer };
