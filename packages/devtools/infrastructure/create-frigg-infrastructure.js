const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { composeServerlessDefinition } = require('./infrastructure-composer');
const { findNearestBackendPackageJson } = require('@friggframework/core');

// Filesystem-based cache to persist across osls require cache clears
const getCachePath = (backendDir) => {
    return path.join(backendDir, '.frigg-infrastructure-cache.json');
};

const getLockPath = (backendDir) => {
    return path.join(backendDir, '.frigg-infrastructure-lock');
};

// Check if process is still running
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return false;
    }
}

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

    // Check for cached infrastructure (filesystem-based for osls require cache clearing)
    if (fs.existsSync(cachePath)) {
        try {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            // Verify cache is still valid (less than 60 seconds old)
            if (Date.now() - cached.timestamp < 60000) {
                console.log('✓ Using filesystem-cached infrastructure definition');
                return cached.definition;
            } else {
                console.log('⚠️ Cache expired (> 60s), recomposing...');
                fs.removeSync(cachePath);
            }
        } catch (error) {
            console.log('⚠️ Invalid cache file, recomposing...', error.message);
            fs.removeSync(cachePath);
        }
    }

    // Check for active composition process
    if (fs.existsSync(lockPath)) {
        const lockPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);

        if (isProcessRunning(lockPid)) {
            console.log(`⏳ Another composition (PID ${lockPid}) in progress - waiting...`);

            // Wait up to 30 seconds for the other process to complete
            for (let i = 0; i < 30; i++) {
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
                    console.log(`⚠ Composition process ${lockPid} terminated - cleaning up stale lock`);
                    fs.removeSync(lockPath);
                    break;
                }
            }
        } else {
            // Stale lock file
            console.log(`⚠️ Stale lock file detected (PID ${lockPid} not running) - cleaning up`);
            fs.removeSync(lockPath);
        }
    }

    // Create lock file with current process PID
    try {
        fs.writeFileSync(lockPath, process.pid.toString());
    } catch (error) {
        console.warn('⚠ Could not create lock file:', error.message);
    }

    try {
        const backend = require(backendFilePath);
        const appDefinition = backend.Definition;

        const definition = await composeServerlessDefinition(
            appDefinition,
        );

        // Write cache to filesystem (persists across osls require cache clears)
        try {
            fs.writeFileSync(cachePath, JSON.stringify({
                timestamp: Date.now(),
                definition
            }));
            console.log('✓ Infrastructure definition cached to filesystem');
        } catch (error) {
            console.warn('⚠ Could not write cache file:', error.message);
        }

        return definition;
    } catch (error) {
        // Clean up partial cache on error
        if (fs.existsSync(cachePath)) {
            try {
                fs.removeSync(cachePath);
            } catch (cleanupError) {
                console.warn('⚠ Could not clean failed cache:', cleanupError.message);
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
                console.warn('⚠ Could not remove lock file:', error.message);
            }
        }
    }
}

module.exports = { createFriggInfrastructure };
