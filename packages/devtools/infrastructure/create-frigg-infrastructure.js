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

/**
 * Build for a non-AWS provider.
 *
 * When infrastructure.js is invoked (e.g. `node infrastructure.js package`),
 * but the appDefinition specifies a non-AWS provider, we skip the entire
 * serverless/CloudFormation pipeline and instead:
 *   1. Validate the appDefinition against the provider
 *   2. Generate the provider-specific config (e.g. netlify.toml)
 *   3. Generate function entry points
 *
 * This mirrors what the CLI's buildCommand does for non-AWS providers,
 * but works when invoked directly via `node infrastructure.js package`.
 */
async function buildWithProvider(appDefinition, providerName, backendDir) {
    const { resolveProvider } = require('@friggframework/core/providers/resolve-provider');
    const provider = resolveProvider(appDefinition);

    console.log(`Building for ${providerName} provider (skipping AWS infrastructure)...`);

    // 1. Validate
    if (typeof provider.validate === 'function') {
        const validation = provider.validate(appDefinition);
        if (validation.errors?.length > 0) {
            console.error(`\nValidation errors for ${providerName}:`);
            for (const error of validation.errors) {
                console.error(`  - ${error}`);
            }
            process.exit(1);
        }
        if (validation.warnings?.length > 0) {
            for (const warning of validation.warnings) {
                console.warn(`  Warning: ${warning}`);
            }
        }
    }

    // 2. Generate platform config (e.g. netlify.toml)
    // Written to the project root (one level up from backend/)
    const projectDir = path.dirname(backendDir);
    if (typeof provider.generateConfig === 'function') {
        const config = provider.generateConfig(appDefinition);
        const configFileNames = { netlify: 'netlify.toml' };
        const configFileName = configFileNames[providerName] || `${providerName}.config`;
        const configPath = path.join(projectDir, configFileName);

        fs.writeFileSync(configPath, config, 'utf-8');
        console.log(`  Written ${configFileName}`);
    }

    // 3. Generate function entry points
    if (typeof provider.getFunctionEntryPoints === 'function') {
        const entryPoints = provider.getFunctionEntryPoints(appDefinition);
        const functionsDir = path.join(projectDir, 'netlify', 'functions');

        fs.mkdirSync(functionsDir, { recursive: true });

        for (const [filename, content] of Object.entries(entryPoints)) {
            const filePath = path.join(functionsDir, filename);
            fs.writeFileSync(filePath, content, 'utf-8');
        }

        console.log(`  Generated ${Object.keys(entryPoints).length} function entry points`);
    }

    console.log(`\nBuild complete for ${providerName}.`);

    // Return an empty serverless definition — osls will see no functions
    // and effectively no-op. The real deployment is handled by the provider.
    return {};
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

        // Check if a non-AWS provider is configured.
        // If so, run the provider's build pipeline instead of AWS CloudFormation.
        const providerName = appDefinition.provider || 'aws';
        if (providerName !== 'aws') {
            return buildWithProvider(appDefinition, providerName, backendDir);
        }

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
