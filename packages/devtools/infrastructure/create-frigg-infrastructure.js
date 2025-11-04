/**
 * Infrastructure Definition Creation with Caching
 *
 * Application Layer - Hexagonal Architecture
 *
 * Creates serverless infrastructure definitions with filesystem caching
 * to prevent duplicate composition during deployment and health check flows.
 *
 * Cache TTL: 15 minutes (900,000ms) - sufficient for deployment + health check
 */

const path = require('path');
const fs = require('fs-extra');
const { composeServerlessDefinition } = require('./infrastructure-composer');
const { findNearestBackendPackageJson } = require('@friggframework/core');

// Cache configuration
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Get cache file path for infrastructure definition
 * @param {string} backendDir - Backend directory path
 * @returns {string} Cache file path
 */
function getCachePath(backendDir) {
    return path.join(backendDir, '.frigg', 'cache', 'infrastructure.json');
}

/**
 * Get lock file path to prevent concurrent composition
 * @param {string} backendDir - Backend directory path
 * @returns {string} Lock file path
 */
function getLockPath(backendDir) {
    return path.join(backendDir, '.frigg', 'cache', '.lock');
}

/**
 * Check if a process is still running
 * @param {number} pid - Process ID
 * @returns {boolean} True if process is running
 */
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Wait for concurrent composition to complete
 * @param {string} lockPath - Lock file path
 * @param {string} cachePath - Cache file path
 * @param {number} maxWaitSeconds - Maximum seconds to wait
 * @returns {Promise<Object|null>} Cached definition or null
 */
async function waitForConcurrentComposition(lockPath, cachePath, maxWaitSeconds = 30) {
    const lockPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);

    if (!isProcessRunning(lockPid)) {
        console.log(`⚠️ Stale lock file detected (PID ${lockPid} not running) - cleaning up`);
        fs.removeSync(lockPath);
        return null;
    }

    console.log(`⏳ Another composition (PID ${lockPid}) in progress - waiting...`);

    // Wait up to maxWaitSeconds for the other process to complete
    for (let i = 0; i < maxWaitSeconds; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if cache was created by other process
        if (fs.existsSync(cachePath)) {
            try {
                const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
                console.log('✓ Using infrastructure composed by concurrent process');
                return cached.definition;
            } catch (error) {
                // Cache file corrupted, continue to compose ourselves
                break;
            }
        }

        // Check if process died
        if (!isProcessRunning(lockPid)) {
            console.log(`⚠️ Composition process ${lockPid} terminated - cleaning up stale lock`);
            fs.removeSync(lockPath);
            break;
        }
    }

    return null;
}

/**
 * Create Frigg infrastructure definition with caching
 *
 * Uses filesystem-based caching with 15-minute TTL to prevent duplicate
 * infrastructure composition during deployment and health check flows.
 *
 * @returns {Promise<Object>} Serverless infrastructure definition
 */
async function createFriggInfrastructure() {
    const backendPath = findNearestBackendPackageJson();
    if (!backendPath) {
        throw new Error('Could not find backend package.json');
    }

    const backendDir = path.dirname(backendPath);
    const backendFilePath = path.join(backendDir, 'index.js');
    if (!fs.existsSync(backendFilePath)) {
        throw new Error('Could not find index.js');
    }

    const cachePath = getCachePath(backendDir);
    const lockPath = getLockPath(backendDir);

    // Ensure cache directory exists
    fs.ensureDirSync(path.dirname(cachePath));

    // Check for cached infrastructure (15-minute TTL)
    if (fs.existsSync(cachePath)) {
        try {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

            // Verify cache is still valid (less than 15 minutes old)
            if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
                console.log('✓ Using cached infrastructure definition (< 15min old)');
                return cached.definition;
            } else {
                console.log('⚠️  Cache expired (> 15min), recomposing...');
                fs.removeSync(cachePath);
            }
        } catch (error) {
            console.log('⚠️  Invalid cache file, recomposing...', error.message);
            fs.removeSync(cachePath);
        }
    }

    // Check for active composition process
    if (fs.existsSync(lockPath)) {
        const cachedDefinition = await waitForConcurrentComposition(lockPath, cachePath);
        if (cachedDefinition) {
            return cachedDefinition;
        }
    }

    // Create lock file with current process PID
    try {
        fs.writeFileSync(lockPath, process.pid.toString());
    } catch (error) {
        console.warn('⚠️  Could not create lock file:', error.message);
    }

    try {
        const backend = require(backendFilePath);
        const appDefinition = backend.Definition;

        const definition = await composeServerlessDefinition(appDefinition);

        // Write cache to filesystem (persists for 15 minutes)
        try {
            fs.writeFileSync(cachePath, JSON.stringify({
                timestamp: Date.now(),
                definition
            }), 'utf-8');
            console.log('✓ Infrastructure definition cached to .frigg/cache/ (15min TTL)');
        } catch (error) {
            console.warn('⚠️  Could not write cache file:', error.message);
        }

        return definition;
    } catch (error) {
        // Clean up partial cache on error
        if (fs.existsSync(cachePath)) {
            try {
                fs.removeSync(cachePath);
            } catch (cleanupError) {
                console.warn('⚠️  Could not clean failed cache:', cleanupError.message);
            }
        }

        console.error('✗ Failed to compose infrastructure:', error.message);
        throw error;
    } finally {
        // Always remove lock file when done (success or failure)
        if (fs.existsSync(lockPath)) {
            try {
                fs.removeSync(lockPath);
            } catch (error) {
                console.warn('⚠️  Could not remove lock file:', error.message);
            }
        }
    }
}

module.exports = { createFriggInfrastructure };
