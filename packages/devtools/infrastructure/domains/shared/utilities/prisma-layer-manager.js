/**
 * Prisma Lambda Layer Manager
 * 
 * Utility Layer - Hexagonal Architecture
 * 
 * Manages Prisma Lambda Layer for serverless deployments.
 * Ensures the layer exists and is built before deployment.
 */

const path = require('path');
const fs = require('fs');
const { buildPrismaLayer } = require('../../../scripts/build-prisma-layer');

/**
 * Ensure Prisma Lambda Layer exists
 *
 * Automatically builds the layer if it doesn't exist.
 * The layer contains ONLY the Prisma runtime client (minimal, ~10-15MB).
 * Prisma CLI is bundled separately in the dbMigrate function.
 *
 * Domain Concept: Build Completion State
 * - Uses .build-complete marker file to track successful builds
 * - Prevents race conditions during concurrent infrastructure composition
 * - Cleans incomplete builds before retry
 *
 * @param {Object} databaseConfig - Database configuration from app definition
 * @returns {Promise<void>}
 * @throws {Error} If layer build fails
 */
async function ensurePrismaLayerExists(databaseConfig = {}) {
    const projectRoot = process.cwd();
    const layerPath = path.join(projectRoot, 'layers/prisma');
    const completionMarkerPath = path.join(layerPath, '.build-complete');

    // Check if build is complete (marker exists)
    if (fs.existsSync(completionMarkerPath)) {
        console.log('✓ Prisma Lambda Layer already exists at', layerPath);
        return;
    }

    // Check if incomplete build exists (directory without marker)
    if (fs.existsSync(layerPath)) {
        console.log('⚠ Incomplete Prisma layer detected');

        // Wait briefly to see if another process completes the build
        console.log('⏳ Checking if concurrent build is in progress...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if concurrent build completed while we waited
        if (fs.existsSync(completionMarkerPath)) {
            console.log('✓ Concurrent build completed');
            return;
        }

        // Incomplete build still exists - will be cleaned by buildPrismaLayer()
        console.log('⚠ Proceeding with rebuild (buildPrismaLayer will clean incomplete build)');
    }

    // Build layer
    console.log('📦 Prisma Lambda Layer not found - building automatically...');
    console.log('   Building MINIMAL layer (runtime only, NO CLI)');
    console.log('   CLI is packaged separately in dbMigrate function');
    console.log('   This may take a minute on first deployment.\n');

    try {
        // Build layer WITHOUT CLI (runtime only for minimal size)
        await buildPrismaLayer(databaseConfig);

        // Create completion marker
        fs.writeFileSync(
            completionMarkerPath,
            `Build completed: ${new Date().toISOString()}\nNode: ${process.version}\nPlatform: ${process.platform}\n`
        );

        console.log('✓ Prisma Lambda Layer built successfully (~10-15MB)\n');
    } catch (error) {
        // Clean up partial build on failure
        if (fs.existsSync(layerPath)) {
            try {
                fs.rmSync(layerPath, { recursive: true, force: true });
            } catch (cleanupError) {
                console.warn('⚠ Could not clean failed build:', cleanupError.message);
            }
        }

        console.error('✗ Failed to build Prisma Lambda Layer:', error.message);
        console.error('  You may need to run: npm install @friggframework/core\n');
        throw error;
    }
}

module.exports = {
    ensurePrismaLayerExists,
};

