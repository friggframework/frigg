/**
 * IResourceDetector Port Interface
 *
 * Defines operations for detecting cloud resources directly (outside of CloudFormation).
 * This is used to find orphaned resources that exist in the cloud but are not managed
 * by CloudFormation.
 *
 * This is a port in the hexagonal architecture that will be implemented
 * by provider-specific adapters (e.g., AWSResourceDetector).
 *
 * Purpose: Abstract cloud resource discovery APIs from the domain layer
 */

class IResourceDetector {
    /**
     * Detect all resources of a specific type in a region
     *
     * @param {Object} params
     * @param {string} params.resourceType - CloudFormation resource type (e.g., AWS::EC2::VPC)
     * @param {string} params.region - AWS region
     * @param {Object} [params.filters={}] - Optional filters (e.g., tags, names)
     * @returns {Promise<Array<Object>>} Array of detected resources
     * @returns {Promise<Array<Object>>} Resources with properties:
     *   - physicalId: string (actual cloud resource ID)
     *   - resourceType: string (CloudFormation resource type)
     *   - properties: Object (resource properties from cloud API)
     *   - tags: Object (resource tags, if supported)
     *   - createdTime: Date (if available)
     * @throws {Error} If resource type is not supported
     */
    async detectResources({ resourceType, region, filters = {} }) {
        throw new Error(
            'IResourceDetector.detectResources() must be implemented by adapter'
        );
    }

    /**
     * Get details for a specific resource
     *
     * @param {Object} params
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {string} params.physicalId - Physical resource ID
     * @param {string} params.region - AWS region
     * @returns {Promise<Object>} Resource details
     * @returns {Promise<Object>} Resource with properties:
     *   - physicalId: string
     *   - resourceType: string
     *   - properties: Object (complete resource properties)
     *   - tags: Object
     *   - status: string (resource-specific status)
     *   - metadata: Object (additional resource metadata)
     * @throws {Error} If resource does not exist
     */
    async getResourceDetails({ resourceType, physicalId, region }) {
        throw new Error(
            'IResourceDetector.getResourceDetails() must be implemented by adapter'
        );
    }

    /**
     * Check if a resource exists
     *
     * @param {Object} params
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {string} params.physicalId - Physical resource ID
     * @param {string} params.region - AWS region
     * @returns {Promise<boolean>} True if resource exists
     */
    async resourceExists({ resourceType, physicalId, region }) {
        throw new Error(
            'IResourceDetector.resourceExists() must be implemented by adapter'
        );
    }

    /**
     * Get list of supported resource types
     *
     * @returns {Promise<Array<string>>} Array of supported CloudFormation resource types
     */
    async getSupportedResourceTypes() {
        throw new Error(
            'IResourceDetector.getSupportedResourceTypes() must be implemented by adapter'
        );
    }

    /**
     * Detect resources by tags
     *
     * @param {Object} params
     * @param {Object} params.tags - Tags to filter by (key-value pairs)
     * @param {string} params.region - AWS region
     * @param {string[]} [params.resourceTypes] - Optional: limit to specific resource types
     * @returns {Promise<Array<Object>>} Array of resources matching tags
     * @returns {Promise<Array<Object>>} Resources with properties:
     *   - physicalId: string
     *   - resourceType: string
     *   - properties: Object
     *   - tags: Object
     */
    async detectResourcesByTags({ tags, region, resourceTypes = [] }) {
        throw new Error(
            'IResourceDetector.detectResourcesByTags() must be implemented by adapter'
        );
    }

    /**
     * Find orphaned resources (exist in cloud but not in any stack)
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Target stack
     * @param {Object} [params.expectedResources] - Resources from template (logical ID -> resource def)
     * @param {Array} [params.stackResources] - Resources currently in stack (with physicalIds)
     * @returns {Promise<Array<Object>>} Array of orphaned resources
     * @returns {Promise<Array<Object>>} Resources with properties:
     *   - physicalId: string
     *   - resourceType: string
     *   - properties: Object
     *   - tags: Object
     *   - isOrphaned: boolean (always true)
     *   - reason: string (explanation of why it's orphaned)
     */
    async findOrphanedResources({ stackIdentifier, expectedResources, stackResources }) {
        throw new Error(
            'IResourceDetector.findOrphanedResources() must be implemented by adapter'
        );
    }

    /**
     * Check service quotas for resources in template
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Target stack
     * @param {Object} params.expectedResources - Resources from template (logical ID -> resource def)
     * @returns {Promise<Array<Object>>} Array of quota-related issues
     */
    async checkServiceQuotas({ stackIdentifier, expectedResources }) {
        throw new Error(
            'IResourceDetector.checkServiceQuotas() must be implemented by adapter'
        );
    }
}

module.exports = IResourceDetector;
