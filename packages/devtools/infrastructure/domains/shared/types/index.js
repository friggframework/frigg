/**
 * @fileoverview Central export for all infrastructure types
 */

const { ResourceOwnership, validateOwnership, resolveOwnership } = require('./resource-ownership');

const {
    createEmptyDiscoveryResult,
    findStackResource,
    findExternalResource,
    findAllExternalResources,
    isResourceInStack,
    getStackLogicalIds
} = require('./discovery-result');

const {
    validateAppDefinition,
    getStackName,
    isVpcEnabled,
    isAuroraEnabled,
    isKmsEnabled,
    isSsmEnabled
} = require('./app-definition');

module.exports = {
    // Resource Ownership
    ResourceOwnership,
    validateOwnership,
    resolveOwnership,

    // Discovery Result
    createEmptyDiscoveryResult,
    findStackResource,
    findExternalResource,
    findAllExternalResources,
    isResourceInStack,
    getStackLogicalIds,

    // App Definition
    validateAppDefinition,
    getStackName,
    isVpcEnabled,
    isAuroraEnabled,
    isKmsEnabled,
    isSsmEnabled
};
