const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

async function loadModule(moduleIdentifier) {
    let modulePath;
    let searchedPaths = [];

    // 1. Check if it's a relative/absolute path
    if (moduleIdentifier.startsWith('.') || moduleIdentifier.startsWith('/')) {
        modulePath = path.resolve(process.cwd(), moduleIdentifier);
        if (!fs.existsSync(modulePath)) {
            throw new Error(`Module path not found: ${modulePath}`);
        }
    }
    // 2. Check if it's a scoped package name
    else if (moduleIdentifier.startsWith('@')) {
        modulePath = resolveFromNodeModules(moduleIdentifier, searchedPaths);
        if (!modulePath) {
            throw new Error(
                `Could not find module: ${moduleIdentifier}\nSearched paths:\n${searchedPaths.map(p => `  - ${p}`).join('\n')}`
            );
        }
    }
    // 3. Assume it's a short name like "attio" -> "@friggframework/api-module-attio"
    else {
        const fullName = `@friggframework/api-module-${moduleIdentifier}`;
        modulePath = resolveFromNodeModules(fullName, searchedPaths);

        // If not found, try local src/api-modules path
        if (!modulePath) {
            const localPath = path.join(process.cwd(), 'src', 'api-modules', moduleIdentifier);
            searchedPaths.push(localPath);
            if (fs.existsSync(localPath)) {
                modulePath = localPath;
            }
        }

        // Also try backend/src/api-modules (common Frigg structure)
        if (!modulePath) {
            const backendLocalPath = path.join(process.cwd(), 'backend', 'src', 'api-modules', moduleIdentifier);
            searchedPaths.push(backendLocalPath);
            if (fs.existsSync(backendLocalPath)) {
                modulePath = backendLocalPath;
            }
        }

        if (!modulePath) {
            throw new Error(
                `Could not find module: ${moduleIdentifier}\nTried:\n` +
                `  - ${fullName}\n` +
                `Searched paths:\n${searchedPaths.map(p => `  - ${p}`).join('\n')}`
            );
        }
    }

    console.log(chalk.gray(`Loading module from: ${modulePath}`));

    // Load the module
    let moduleExports;
    try {
        moduleExports = require(modulePath);
    } catch (err) {
        throw new Error(`Failed to load module from ${modulePath}: ${err.message}`);
    }

    // Extract Definition and Api
    const definition = moduleExports.Definition || moduleExports.definition;
    const Api = definition?.API || moduleExports.Api || moduleExports.API;

    if (!definition) {
        throw new Error(
            `Module ${moduleIdentifier} does not export a Definition.\n` +
            `Expected exports: { Definition } or { definition }`
        );
    }

    if (!Api) {
        throw new Error(
            `Module ${moduleIdentifier} does not export an API class.\n` +
            `Expected Definition.API or exports.Api`
        );
    }

    return { definition, Api, modulePath };
}

function resolveFromNodeModules(packageName, searchedPaths = []) {
    const pathsToCheck = [
        // Current working directory
        path.join(process.cwd(), 'node_modules', packageName),
        // Backend subdirectory (common Frigg structure)
        path.join(process.cwd(), 'backend', 'node_modules', packageName),
        // Parent directory (for monorepos)
        path.join(process.cwd(), '..', 'node_modules', packageName),
        // Global installation location (via npm root -g)
        path.join(process.execPath, '..', '..', 'lib', 'node_modules', packageName),
    ];

    for (const checkPath of pathsToCheck) {
        searchedPaths.push(checkPath);
        if (fs.existsSync(checkPath)) {
            return checkPath;
        }
    }

    return null;
}

function validateModule(definition) {
    const errors = [];

    // Check required fields
    const requiredFields = ['moduleName', 'API'];
    for (const field of requiredFields) {
        if (!definition[field]) {
            errors.push(`Missing required field: ${field}`);
        }
    }

    // Check requiredAuthMethods
    if (!definition.requiredAuthMethods) {
        errors.push('Missing requiredAuthMethods object');
    } else {
        const requiredMethods = ['getEntityDetails', 'testAuthRequest', 'apiPropertiesToPersist'];
        for (const method of requiredMethods) {
            if (!definition.requiredAuthMethods[method]) {
                errors.push(`Missing required auth method: ${method}`);
            }
        }

        // getToken is required for OAuth2, optional for API-Key
        // getCredentialDetails is recommended but not strictly required
    }

    if (errors.length > 0) {
        throw new Error(
            `Module validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`
        );
    }

    console.log(chalk.green(`✓ Module validation passed: ${definition.moduleName}`));
}

function getAuthType(Api) {
    // Check the requesterType static property
    if (Api.requesterType) {
        return Api.requesterType;
    }

    // Check prototype chain for OAuth2Requester or ApiKeyRequester
    const className = Api.name;
    const protoChain = [];
    let proto = Api;
    while (proto && proto.name) {
        protoChain.push(proto.name);
        proto = Object.getPrototypeOf(proto);
    }

    if (protoChain.some(name => name.includes('OAuth2') || name.includes('Oauth2'))) {
        return 'oauth2';
    }

    if (protoChain.some(name => name.includes('ApiKey') || name.includes('APIKey'))) {
        return 'apiKey';
    }

    // Default to oauth2
    return 'oauth2';
}

module.exports = { loadModule, validateModule, getAuthType };
