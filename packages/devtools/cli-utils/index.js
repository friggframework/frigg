/**
 * Lightweight CLI utilities for Frigg
 * These utilities have minimal dependencies and can be used globally
 * without loading the full Frigg framework
 */

const {
    findNearestBackendPackageJson,
    validateBackendPath,
} = require('./backend-path');

module.exports = {
    findNearestBackendPackageJson,
    validateBackendPath,
};