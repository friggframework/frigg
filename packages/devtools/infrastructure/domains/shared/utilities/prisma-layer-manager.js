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
const {
    buildPrismaLayer,
    layerBuildInputs,
} = require('../../../scripts/build-prisma-layer');
const { resolveLambdaArchitecture } = require('../lambda-architectures');

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

const LEGACY_MARKER_TARGET = 'rhel-openssl-3.0.x';

/**
 * The inputs a completion marker records. A marker written before the
 * marker became JSON recorded nothing, and every layer then held the rhel
 * engine; its versions are unknown, so it never matches and the layer is
 * rebuilt once.
 * @param {string} markerText
 * @returns {{ prismaBinaryTarget: string, clientPackages: string[]|null, coreVersion: string|null, prismaClientVersion: string|null }}
 */
function parseLayerMarker(markerText) {
    try {
        const marker = JSON.parse(markerText);
        return {
            prismaBinaryTarget: marker.prismaBinaryTarget,
            clientPackages: marker.clientPackages,
            coreVersion: marker.coreVersion,
            prismaClientVersion: marker.prismaClientVersion,
        };
    } catch {
        // A marker written before the JSON format is plain text: treat it as a legacy build
        return {
            prismaBinaryTarget: LEGACY_MARKER_TARGET,
            clientPackages: null,
            coreVersion: null,
            prismaClientVersion: null,
        };
    }
}

function sameLayerInputs(a, b) {
    return (
        a.prismaBinaryTarget === b.prismaBinaryTarget &&
        a.coreVersion === b.coreVersion &&
        a.prismaClientVersion === b.prismaClientVersion &&
        Array.isArray(a.clientPackages) &&
        Array.isArray(b.clientPackages) &&
        a.clientPackages.length === b.clientPackages.length &&
        a.clientPackages.every((pkg, i) => pkg === b.clientPackages[i])
    );
}

/**
 * Ensure Prisma Lambda Layer exists
 *
 * Automatically builds the layer if it doesn't exist.
 * The layer contains ONLY the Prisma runtime client (minimal, ~10-15MB).
 * Prisma CLI is bundled separately in the dbMigrate function.
 *
 * Domain Concept: Build Completion State & Process Locking
 * - Uses .build-complete marker file to track successful builds; it records
 *   the inputs the layer was built from, and a built layer is reused only
 *   when they match the requested ones
 * - Uses .build-lock PID file to prevent concurrent builds
 * - Waits for active builds to complete before starting new one
 * - Cleans stale locks and incomplete builds before retry
 *
 * @param {Object} options
 * @param {Object} options.databaseConfig - Database configuration from app definition
 * @param {string} options.prismaBinaryTarget - The engine the deployed architecture loads
 * @returns {Promise<void>}
 * @throws {Error} If layer build fails
 */
async function ensurePrismaLayerExists({
    databaseConfig = {},
    prismaBinaryTarget = resolveLambdaArchitecture().prismaBinaryTarget,
} = {}) {
    const projectRoot = process.cwd();
    const layerPath = path.join(projectRoot, 'layers/prisma');
    const completionMarkerPath = path.join(layerPath, '.build-complete');
    const lockFilePath = path.join(layerPath, '.build-lock');
    const inputs = layerBuildInputs({ databaseConfig, prismaBinaryTarget });

    const builtLayerMatches = () =>
        fs.existsSync(completionMarkerPath) &&
        sameLayerInputs(
            parseLayerMarker(fs.readFileSync(completionMarkerPath, 'utf-8')),
            inputs
        );

    // Check if build is complete (marker exists)
    if (builtLayerMatches()) {
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
                    if (builtLayerMatches()) {
                        console.log('✓ Concurrent build completed successfully');
                        return;
                    }
                    console.log('⚠ Concurrent build completed for other inputs - rebuilding');
                    fs.rmSync(lockFilePath, { force: true });
                    break;
                }

                // Check if process died
                if (!isProcessRunning(lockPid)) {
                    console.log(`⚠ Build process ${lockPid} terminated - cleaning up stale lock`);
                    fs.rmSync(lockFilePath, { force: true });
                    break;
                }
            }

            // Timeout - check one final time
            if (builtLayerMatches()) {
                console.log('✓ Concurrent build completed');
                return;
            }

            // Still locked after 60s - remove stale lock
            if (fs.existsSync(lockFilePath)) {
                console.log('⚠ Build timeout - removing stale lock and rebuilding');
                fs.rmSync(lockFilePath, { force: true });
            }
        } else {
            // Stale lock file (process not running)
            console.log(`⚠ Stale lock file detected (PID ${lockPid} not running) - cleaning up`);
            fs.rmSync(lockFilePath, { force: true });
        }
    }

    // Check if incomplete build exists (directory without marker)
    if (fs.existsSync(layerPath) && !fs.existsSync(completionMarkerPath)) {
        console.log('⚠ Incomplete Prisma layer detected - will be cleaned by buildPrismaLayer()');
    } else if (fs.existsSync(completionMarkerPath)) {
        console.log(`⚠ Built Prisma layer does not match ${JSON.stringify(inputs)} - rebuilding`);
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
        await buildPrismaLayer({ databaseConfig, prismaBinaryTarget });

        // Create completion marker
        fs.writeFileSync(
            completionMarkerPath,
            JSON.stringify(
                {
                    ...inputs,
                    builtAt: new Date().toISOString(),
                    node: process.version,
                    platform: process.platform,
                },
                null,
                2
            )
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
    parseLayerMarker,
};

