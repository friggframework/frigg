/**
 * @fileoverview Discovery result types
 *
 * Defines the structure of resource discovery results.
 * Discovery reports FACTS - it doesn't make ownership decisions.
 */

/**
 * Resource that exists in our CloudFormation stack
 * @typedef {Object} StackManagedResource
 * @property {string} logicalId - CloudFormation logical resource ID (e.g., 'FriggLambdaSecurityGroup')
 * @property {string} physicalId - AWS physical resource ID (e.g., 'sg-069629001ade41c9a')
 * @property {string} resourceType - CloudFormation resource type (e.g., 'AWS::EC2::SecurityGroup')
 * @property {Object} [properties] - Resource properties (optional, for detailed info)
 */

/**
 * Resource that exists outside our CloudFormation stack
 * @typedef {Object} ExternalResource
 * @property {string} physicalId - AWS physical resource ID
 * @property {string} resourceType - CloudFormation resource type
 * @property {'tag-search' | 'name-search' | 'aws-api' | 'user-provided'} source - How it was discovered
 * @property {Object} [properties] - Resource properties (optional)
 * @property {Object} [tags] - Resource tags (if available)
 */

/**
 * Complete discovery result
 * @typedef {Object} DiscoveryResult
 * @property {StackManagedResource[]} stackManaged - Resources in OUR CloudFormation stack
 * @property {ExternalResource[]} external - Resources outside our stack
 * @property {string} [stackName] - Name of our CloudFormation stack (if exists)
 * @property {boolean} fromCloudFormation - Whether stack was found in CloudFormation
 * @property {string} [region] - AWS region
 * @property {Object} [metadata] - Additional discovery metadata
 */

/**
 * Create empty discovery result
 * @returns {DiscoveryResult}
 */
function createEmptyDiscoveryResult() {
    return {
        stackManaged: [],
        external: [],
        fromCloudFormation: false
    };
}

/**
 * Find stack-managed resource by logical ID
 * @param {DiscoveryResult} discovery - Discovery result
 * @param {string} logicalId - Logical resource ID to find
 * @returns {StackManagedResource|null}
 */
function findStackResource(discovery, logicalId) {
    return discovery.stackManaged.find(r => r.logicalId === logicalId) || null;
}

/**
 * Find external resource by type
 * @param {DiscoveryResult} discovery - Discovery result
 * @param {string} resourceType - CloudFormation resource type
 * @returns {ExternalResource|null}
 */
function findExternalResource(discovery, resourceType) {
    return discovery.external.find(r => r.resourceType === resourceType) || null;
}

/**
 * Find all external resources by type
 * @param {DiscoveryResult} discovery - Discovery result
 * @param {string} resourceType - CloudFormation resource type
 * @returns {ExternalResource[]}
 */
function findAllExternalResources(discovery, resourceType) {
    return discovery.external.filter(r => r.resourceType === resourceType);
}

/**
 * Check if specific resource exists in stack
 * @param {DiscoveryResult} discovery - Discovery result
 * @param {string} logicalId - Logical resource ID
 * @returns {boolean}
 */
function isResourceInStack(discovery, logicalId) {
    return discovery.stackManaged.some(r => r.logicalId === logicalId);
}

/**
 * Get all stack logical IDs
 * @param {DiscoveryResult} discovery - Discovery result
 * @returns {string[]}
 */
function getStackLogicalIds(discovery) {
    return discovery.stackManaged.map(r => r.logicalId);
}

module.exports = {
    createEmptyDiscoveryResult,
    findStackResource,
    findExternalResource,
    findAllExternalResources,
    isResourceInStack,
    getStackLogicalIds
};
