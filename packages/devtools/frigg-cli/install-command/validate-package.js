const spawn = require('cross-spawn');
const axios = require('axios');
const { logError } = require('./logger');
const { checkbox } = require('@inquirer/prompts');

const API_MODULE_PREFIX = '@friggframework/api-module-';

async function searchPackages(apiModuleName) {
    // Arguments are passed as an array (no shell), so the search term can
    // never be interpreted as a command.
    const result = spawn.sync(
        'npm',
        ['search', `${API_MODULE_PREFIX}${apiModuleName}`, '--json'],
        { encoding: 'utf8' }
    );
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`npm search failed: ${result.stderr || result.status}`);
    }
    // npm search is a full-text search; keep only Frigg API modules.
    return JSON.parse(result.stdout || '[]').filter(
        (pkg) => pkg && pkg.name && pkg.name.startsWith(API_MODULE_PREFIX)
    );
}

async function checkPackageExists(packageName) {
    try {
        const response = await axios.get(
            `https://registry.npmjs.org/${packageName}`
        );
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

async function validatePackageExists(packageName) {
    const packageExists = await checkPackageExists(packageName);
    if (!packageExists) {
        throw new Error(`Package ${packageName} does not exist on npm.`);
    }
}

const searchAndSelectPackage = async (apiModuleName) => {
    const searchResults = await searchPackages(apiModuleName || '');

    if (searchResults.length === 0) {
        logError(`No packages found matching ${apiModuleName}`);
        process.exit(1);
    }

    const filteredResults = searchResults.filter((pkg) => {
        const version = pkg.version ? pkg.version.split('.').map(Number) : [];
        return version[0] >= 1;
    });

    if (filteredResults.length === 0) {
        const earlierVersions = searchResults
            .map((pkg) => `${pkg.name} (${pkg.version})`)
            .join(', ');
        logError(
            `No packages found with version 1.0.0 or above for ${apiModuleName}. Found earlier versions: ${earlierVersions}`
        );
        process.exit(1);
    }

    const choices = filteredResults.map((pkg) => {
        return {
            name: `${pkg.name} (${pkg.version})`,
            value: pkg.name,
            checked: filteredResults.length === 1, // Automatically select if only one result
        };
    });

    // Without a terminal to prompt on, take the exact match
    // (`frigg install hubspot` -> @friggframework/api-module-hubspot).
    if (!process.stdin.isTTY) {
        const exact = `${API_MODULE_PREFIX}${apiModuleName}`;
        if (filteredResults.some((pkg) => pkg.name === exact)) {
            return [exact];
        }
        logError(
            `No exact match for ${exact}, and there is no terminal to choose from: ${filteredResults
                .map((pkg) => pkg.name)
                .join(', ')}`
        );
        process.exit(1);
    }

    const selectedPackages = await checkbox({
        message: 'Select the packages to install:',
        choices,
    });
    console.log('Selected packages:', selectedPackages);

    return selectedPackages.map((choice) => choice.split(' ')[0]);
};

module.exports = {
    API_MODULE_PREFIX,
    validatePackageExists,
    checkPackageExists,
    searchPackages,
    searchAndSelectPackage,
};
