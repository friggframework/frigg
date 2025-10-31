const path = require('path');
const fs = require('fs-extra');
const { composeServerlessDefinition } = require('./infrastructure-composer');
const { findNearestBackendPackageJson } = require('@friggframework/core');

// Memoization cache to prevent duplicate infrastructure composition
// when serverless framework loads configuration multiple times
let cachedInfrastructure = null;
let isComposing = false;

async function createFriggInfrastructure() {
    // Return cached infrastructure if already composed
    if (cachedInfrastructure) {
        console.log('✓ Using cached infrastructure definition (already composed)');
        return cachedInfrastructure;
    }

    // Wait if another call is currently composing
    if (isComposing) {
        console.log('⏳ Infrastructure composition in progress - waiting...');
        // Poll every 100ms until composition completes
        while (isComposing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        // Return the newly cached infrastructure
        return cachedInfrastructure;
    }

    // Mark as composing to prevent concurrent composition
    isComposing = true;

    try {
        const backendPath = findNearestBackendPackageJson();
        if (!backendPath) {
            throw new Error('Could not find backend package.json');
        }

        const backendDir = path.dirname(backendPath);
        const backendFilePath = path.join(backendDir, 'index.js');
        if (!fs.existsSync(backendFilePath)) {
            throw new Error('Could not find index.js');
        }

        const backend = require(backendFilePath);
        const appDefinition = backend.Definition;

        // const serverlessTemplate = require(path.resolve(
        //     __dirname,
        //     './serverless-template.js'
        // ));
        const definition = await composeServerlessDefinition(
            appDefinition,
        );

        // Cache the composed infrastructure
        cachedInfrastructure = {
            ...definition,
        };

        return cachedInfrastructure;
    } finally {
        // Always clear composing flag
        isComposing = false;
    }
}

module.exports = { createFriggInfrastructure };
