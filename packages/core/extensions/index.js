/**
 * Frigg Extension System
 *
 * Extensions allow integration developers to extend Frigg Core with:
 * - Custom Prisma models (schema composition)
 * - Encrypted fields (encryption registry merge)
 * - Admin API routes (route mounting)
 * - Bootstrap lifecycle hooks (credential loading, etc.)
 *
 * @module @friggframework/core/extensions
 */

const { loadExtensions, validateExtension, getExtensionSchemaPaths } = require('./extension-loader');
const { composeSchemas, extractModelBlocks, getSchemaFilePaths } = require('./schema-composer');
const { mountExtensionRoutes } = require('./route-mounter');
const { runExtensionBootstraps } = require('./bootstrap-runner');
const { initializeApp, resetInitialization } = require('./initialize-app');

module.exports = {
    // Extension loading & validation
    loadExtensions,
    validateExtension,
    getExtensionSchemaPaths,

    // Schema composition
    composeSchemas,
    extractModelBlocks,
    getSchemaFilePaths,

    // Route mounting
    mountExtensionRoutes,

    // Bootstrap lifecycle
    runExtensionBootstraps,
    initializeApp,
    resetInitialization,
};
