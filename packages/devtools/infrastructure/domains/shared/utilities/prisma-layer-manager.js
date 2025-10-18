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
 * @param {Object} databaseConfig - Database configuration from app definition
 * @returns {Promise<void>}
 * @throws {Error} If layer build fails
 */
async function ensurePrismaLayerExists(databaseConfig = {}) {
    const projectRoot = process.cwd();
    const layerPath = path.join(projectRoot, 'layers/prisma');

    // Check if layer already exists
    if (fs.existsSync(layerPath)) {
        console.log('✓ Prisma Lambda Layer already exists at', layerPath);
        return;
    }

    // Layer doesn't exist - build it automatically
    console.log('📦 Prisma Lambda Layer not found - building automatically...');
    console.log('   Building MINIMAL layer (runtime only, NO CLI)');
    console.log('   CLI is packaged separately in dbMigrate function');
    console.log('   This may take a minute on first deployment.\n');

    try {
        // Build layer WITHOUT CLI (runtime only for minimal size)
        await buildPrismaLayer(databaseConfig);
        console.log('✓ Prisma Lambda Layer built successfully (~10-15MB)\n');
    } catch (error) {
        console.error('✗ Failed to build Prisma Lambda Layer:', error.message);
        console.error('  You may need to run: npm install @friggframework/core\n');
        throw error;
    }
}

module.exports = {
    ensurePrismaLayerExists,
};

