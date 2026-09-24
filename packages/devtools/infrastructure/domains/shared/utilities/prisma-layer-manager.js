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
 * Check if a process is still running
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if process is running
 */
function isProcessRunning(pid) {
    try {
        // Signal 0 checks if process exists without killing it
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Ensure Prisma Lambda Layer exists
 *
 * Automatically builds the layer if it doesn't exist.
 * The layer contains ONLY the Prisma runtime client (minimal, ~10-15MB).
 * Prisma CLI is bundled separately in the dbMigrate function.
 *
 * Domain Concept: Build Completion State & Process Locking
 * - Uses .build-complete marker file to track successful builds
 * - Uses .build-lock PID file to prevent concurrent builds
 * - Waits for active builds to complete before starting new one
 * - Cleans stale locks and incomplete builds before retry
 *
 * @param {Object} databaseConfig - Database configuration from app definition
 * @returns {Promise<void>}
 * @throws {Error} If layer build fails
 */
async function ensurePrismaLayerExists(databaseConfig = {}) {
    const projectRoot = process.cwd();
    const layerPath = path.join(projectRoot, 'layers/prisma');
    const completionMarkerPath = path.join(layerPath, '.build-complete');
    const lockFilePath = path.join(layerPath, '.build-lock');

    // Check if build is complete (marker exists)
    if (fs.existsSync(completionMarkerPath)) {
        console.log('✓ Prisma Lambda Layer already exists at', layerPath);
        return;
    }

    // Check for active build process
    if (fs.existsSync(lockFilePath)) {
        const lockPid = parseInt(fs.readFileSync(lockFilePath, 'utf-8').trim(), 10);

        if (isProcessRunning(lockPid)) {
            console.log(`⏳ Another build process (PID ${lockPid}) is active - waiting...`);

            // Wait up to 60 seconds for the other process to complete
            for (let i = 0; i < 60; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Check if build completed
                if (fs.existsSync(completionMarkerPath)) {
                    console.log('✓ Concurrent build completed successfully');
                    return;
                }

                // Check if process died
                if (!isProcessRunning(lockPid)) {
                    console.log(`⚠ Build process ${lockPid} terminated - cleaning up stale lock`);
                    fs.rmSync(lockFilePath, { force: true });
                    break;
                }
            }

            // Timeout - check one final time
            if (fs.existsSync(completionMarkerPath)) {
                console.log('✓ Concurrent build completed');
                return;
            }

            // Still locked after 60s - remove stale lock
            console.log('⚠ Build timeout - removing stale lock and rebuilding');
            fs.rmSync(lockFilePath, { force: true });
        } else {
            // Stale lock file (process not running)
            console.log(`⚠ Stale lock file detected (PID ${lockPid} not running) - cleaning up`);
            fs.rmSync(lockFilePath, { force: true });
        }
    }

    // Check if incomplete build exists (directory without marker)
    if (fs.existsSync(layerPath) && !fs.existsSync(completionMarkerPath)) {
        console.log('⚠ Incomplete Prisma layer detected - will be cleaned by buildPrismaLayer()');
    }

    // Build layer
    console.log('📦 Prisma Lambda Layer not found - building automatically...');
    console.log('   Building MINIMAL layer (runtime only, NO CLI)');
    console.log('   CLI is packaged separately in dbMigrate function');
    console.log('   This may take a minute on first deployment.\n');

    // Create lock file with current process PID
    try {
        if (!fs.existsSync(layerPath)) {
            fs.mkdirSync(layerPath, { recursive: true });
        }
        fs.writeFileSync(lockFilePath, process.pid.toString());
    } catch (error) {
        console.warn('⚠ Could not create lock file:', error.message);
    }

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
    } finally {
        // Always remove lock file when done (success or failure)
        if (fs.existsSync(lockFilePath)) {
            try {
                fs.rmSync(lockFilePath, { force: true });
            } catch (error) {
                console.warn('⚠ Could not remove lock file:', error.message);
            }
        }
    }
}

module.exports = {
    ensurePrismaLayerExists,
};

