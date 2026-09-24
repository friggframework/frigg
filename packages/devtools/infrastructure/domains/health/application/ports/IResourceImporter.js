/**
 * IResourceImporter Port Interface
 *
 * Defines operations for importing existing cloud resources into CloudFormation stacks.
 * This is used by the "frigg repair --import" command to fix orphaned resources.
 *
 * This is a port in the hexagonal architecture that will be implemented
 * by provider-specific adapters (e.g., AWSResourceImporter).
 *
 * Purpose: Abstract CloudFormation resource import operations from the domain layer
 */

class IResourceImporter {
    /**
     * Check if a resource type supports import
     *
     * @param {string} resourceType - CloudFormation resource type (e.g., AWS::EC2::VPC)
     * @returns {Promise<boolean>} True if resource type can be imported
     */
    async supportsImport(resourceType) {
        throw new Error(
            'IResourceImporter.supportsImport() must be implemented by adapter'
        );
    }

    /**
     * Get the identifier property for a resource type
     * (e.g., "VpcId" for AWS::EC2::VPC, "BucketName" for AWS::S3::Bucket)
     *
     * @param {string} resourceType - CloudFormation resource type
     * @returns {Promise<string>} Property name used as identifier for import
     * @throws {Error} If resource type doesn't support import
     */
    async getIdentifierProperty(resourceType) {
        throw new Error(
            'IResourceImporter.getIdentifierProperty() must be implemented by adapter'
        );
    }

    /**
     * Validate that a resource can be imported
     *
     * @param {Object} params
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {string} params.physicalId - Physical resource ID
     * @param {string} params.region - AWS region
     * @returns {Promise<Object>} Validation result
     * @returns {Promise<Object>} Result with properties:
     *   - canImport: boolean
     *   - reason: string (explanation if cannot import)
     *   - warnings: Array<string> (potential issues with import)
     */
    async validateImport({ resourceType, physicalId, region }) {
        throw new Error(
            'IResourceImporter.validateImport() must be implemented by adapter'
        );
    }

    /**
     * Import a single resource into a stack
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Target stack
     * @param {string} params.logicalId - Desired logical ID for the resource
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {string} params.physicalId - Physical resource ID to import
     * @param {Object} params.properties - Resource properties for template
     * @returns {Promise<Object>} Import operation result
     * @returns {Promise<Object>} Result with properties:
     *   - operationId: string (CloudFormation change set ID)
     *   - status: string (IN_PROGRESS, COMPLETE, FAILED)
     *   - message: string (status message)
     * @throws {Error} If import fails validation or execution
     */
    async importResource({ stackIdentifier, logicalId, resourceType, physicalId, properties }) {
        throw new Error(
            'IResourceImporter.importResource() must be implemented by adapter'
        );
    }

    /**
     * Import multiple resources into a stack in a single operation
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Target stack
     * @param {Array<Object>} params.resources - Resources to import
     * @param {string} params.resources[].logicalId - Desired logical ID
     * @param {string} params.resources[].resourceType - CloudFormation resource type
     * @param {string} params.resources[].physicalId - Physical resource ID
     * @param {Object} params.resources[].properties - Resource properties
     * @returns {Promise<Object>} Import operation result
     * @returns {Promise<Object>} Result with properties:
     *   - operationId: string (CloudFormation change set ID)
     *   - status: string (IN_PROGRESS, COMPLETE, FAILED)
     *   - importedCount: number
     *   - failedCount: number
     *   - message: string
     *   - details: Array<Object> (per-resource status)
     * @throws {Error} If import fails validation or execution
     */
    async importMultipleResources({ stackIdentifier, resources }) {
        throw new Error(
            'IResourceImporter.importMultipleResources() must be implemented by adapter'
        );
    }

    /**
     * Get status of an import operation
     *
     * @param {string} operationId - CloudFormation change set ID
     * @returns {Promise<Object>} Operation status
     * @returns {Promise<Object>} Status with properties:
     *   - operationId: string
     *   - status: string (IN_PROGRESS, COMPLETE, FAILED)
     *   - progress: number (0-100)
     *   - message: string
     *   - completedTime: Date (if complete)
     */
    async getImportStatus(operationId) {
        throw new Error(
            'IResourceImporter.getImportStatus() must be implemented by adapter'
        );
    }

    /**
     * Generate CloudFormation template snippet for an imported resource
     *
     * @param {Object} params
     * @param {string} params.logicalId - Logical ID for the resource
     * @param {string} params.resourceType - CloudFormation resource type
     * @param {Object} params.properties - Current resource properties from cloud
     * @returns {Promise<Object>} Template snippet for the resource
     * @returns {Promise<Object>} Template snippet with CloudFormation resource definition
     */
    async generateTemplateSnippet({ logicalId, resourceType, properties }) {
        throw new Error(
            'IResourceImporter.generateTemplateSnippet() must be implemented by adapter'
        );
    }
}

module.exports = IResourceImporter;
