const axios = require('axios');
const { execSync } = require('child_process');

async function validatePackageExists(packageName) {
    const packageExists = await checkPackageExists(packageName);
    if (!packageExists) {
        throw new Error(`Package ${packageName} does not exist on npm.`);
    }
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

async function searchPackages(apiModuleName) {
    const searchCommand = `npm search @friggframework/api-module-${apiModuleName} --json`;
    const result = execSync(searchCommand, { encoding: 'utf8' });
    return JSON.parse(result);
}

module.exports = {
    validatePackageExists,
    checkPackageExists,
    searchPackages,
};
