// Re-export from the lightweight CLI utils package
// This ensures we have a single source of truth for these utilities
const {
    findNearestBackendPackageJson,
    validateBackendPath,
} = require('@friggframework/cli-utils');

module.exports = {
    findNearestBackendPackageJson,
    validateBackendPath,
}; 