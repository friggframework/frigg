const { execSync } = require('child_process');
const axios = require('axios');
const output = require('../utils/output');

async function searchPackages(apiModuleName) {
    const searchCommand = `npm search @friggframework/api-module-${apiModuleName} --json`;
    const result = execSync(searchCommand, { encoding: 'utf8' });
    return JSON.parse(result);
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
        output.error(`No packages found matching ${apiModuleName}`);
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
        output.error(
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

    const selectedPackages = await output.checkbox('Select the packages to install:', choices);
    output.info(`Selected packages: ${selectedPackages.join(', ')}`);

    return selectedPackages.map((choice) => choice.split(' ')[0]);
};

module.exports = {
    validatePackageExists,
    checkPackageExists,
    searchPackages,
    searchAndSelectPackage,
};
