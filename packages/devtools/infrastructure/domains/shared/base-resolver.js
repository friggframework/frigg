/**
 * Base Resource Resolver
 *
 * Abstract base class for resource ownership resolution.
 * Each builder has its own resolver (VpcResolver, AuroraResolver, etc.)
 * that extends this base class.
 *
 * Resolver Layer - Hexagonal Architecture
 */

const {
    ResourceOwnership,
    resolveOwnership,
    findStackResource,
    findExternalResource,
    findAllExternalResources,
    isResourceInStack
} = require('./types');

class BaseResourceResolver {
    /**
     * Find resource in CloudFormation stack
     * @protected
     * @param {string} logicalId - Logical resource ID
     * @param {Object} discovery - Discovery result
     * @returns {Object|null} Stack resource or null
     */
    findInStack(logicalId, discovery) {
        return findStackResource(discovery, logicalId);
    }

    /**
     * Find external resource by type
     * @protected
     * @param {string} resourceType - CloudFormation resource type
     * @param {Object} discovery - Discovery result
     * @returns {Object|null} External resource or null
     */
    findExternal(resourceType, discovery) {
        return findExternalResource(discovery, resourceType);
    }

    /**
     * Find all external resources by type
     * @protected
     * @param {Object} discovery - Discovery result
     * @param {string} resourceType - CloudFormation resource type
     * @returns {Object[]} Array of external resources
     */
    findAllExternalResources(discovery, resourceType) {
        return findAllExternalResources(discovery, resourceType);
    }

    /**
     * Check if resource is in stack
     * @protected
     * @param {string} logicalId - Logical resource ID
     * @param {Object} discovery - Discovery result
     * @returns {boolean}
     */
    isInStack(logicalId, discovery) {
        return isResourceInStack(discovery, logicalId);
    }

    /**
     * Validate that external resource IDs are provided when required
     * @protected
     * @param {*} resourceIds - Resource IDs to validate
     * @param {string} resourceName - Name for error message
     * @throws {Error} If resourceIds is not provided
     */
    requireExternalIds(resourceIds, resourceName) {
        if (!resourceIds || (Array.isArray(resourceIds) && resourceIds.length === 0)) {
            throw new Error(
                `ownership='external' for ${resourceName} requires external.${resourceName} to be provided in app definition`
            );
        }
    }

    /**
     * Resolve ownership for a resource
     * @protected
     * @param {string} userIntent - User's ownership intent ('stack' | 'external' | 'auto')
     * @param {string} logicalId - CloudFormation logical ID
     * @param {string} resourceType - CloudFormation resource type
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision
     */
    resolveResourceOwnership(userIntent, logicalId, resourceType, discovery) {
        // Use helper to work with both old flat structure and new structured
        const structured = discovery._structured || discovery;

        const inStack = this.isInStack(logicalId, structured);
        const externalResource = this.findExternal(resourceType, structured);

        const ownership = resolveOwnership(
            userIntent || ResourceOwnership.AUTO,
            inStack,
            externalResource !== null
        );

        const stackResource = inStack ? this.findInStack(logicalId, structured) : null;

        return {
            ownership,
            physicalId: stackResource?.physicalId || externalResource?.physicalId,
            reason: this._buildReasonString(ownership, inStack, externalResource, userIntent),
            metadata: {
                logicalId,
                resourceType,
                userIntent: userIntent || 'auto',
                inStack,
                foundExternal: externalResource !== null
            }
        };
    }

    /**
     * Build human-readable reason string
     * @private
     */
    _buildReasonString(ownership, inStack, externalResource, userIntent) {
        if (userIntent === 'stack') {
            return 'User explicitly specified ownership=stack';
        }

        if (userIntent === 'external') {
            return 'User explicitly specified ownership=external';
        }

        // Auto-decided
        if (ownership === ResourceOwnership.STACK) {
            if (inStack) {
                return 'Found in CloudFormation stack (must keep in template to avoid deletion)';
            }
            return 'No existing resource found - will create in stack';
        }

        if (ownership === ResourceOwnership.EXTERNAL) {
            return 'Found external resource via discovery';
        }

        return 'Ownership resolved via auto-detection';
    }

    /**
     * Create a resource decision for explicit external reference
     * @protected
     * @param {string|string[]} physicalIds - Physical resource ID(s)
     * @param {string} reason - Reason string
     * @returns {Object} Resource decision
     */
    createExternalDecision(physicalIds, reason = 'Using external resource reference') {
        const ids = Array.isArray(physicalIds) ? physicalIds : [physicalIds];

        return {
            ownership: ResourceOwnership.EXTERNAL,
            physicalId: ids[0],
            physicalIds: ids,
            reason,
            metadata: {
                source: 'user-provided'
            }
        };
    }

    /**
     * Create a resource decision for stack-managed resource
     * @protected
     * @param {string} [physicalId] - Physical ID if resource already exists
     * @param {string} reason - Reason string
     * @returns {Object} Resource decision
     */
    createStackDecision(physicalId = null, reason = 'Managed by CloudFormation stack') {
        return {
            ownership: ResourceOwnership.STACK,
            physicalId,
            reason,
            metadata: {
                source: physicalId ? 'discovered' : 'new'
            }
        };
    }
}

module.exports = BaseResourceResolver;
