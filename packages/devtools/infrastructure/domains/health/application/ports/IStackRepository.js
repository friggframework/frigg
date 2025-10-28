/**
 * IStackRepository Port Interface
 *
 * Defines operations for accessing CloudFormation stack information.
 * This is a port in the hexagonal architecture that will be implemented
 * by provider-specific adapters (e.g., AWSStackRepository).
 *
 * Purpose: Abstract CloudFormation API interactions from the domain layer
 */

class IStackRepository {
    /**
     * Get stack information by identifier
     *
     * @param {StackIdentifier} identifier - Stack identifier
     * @returns {Promise<Object>} Stack information
     * @returns {Promise<Object>} Stack information with properties:
     *   - stackName: string
     *   - region: string
     *   - accountId: string
     *   - stackId: string (ARN)
     *   - status: string (CREATE_COMPLETE, UPDATE_COMPLETE, etc.)
     *   - creationTime: Date
     *   - lastUpdatedTime: Date
     *   - parameters: Object (key-value pairs)
     *   - outputs: Object (key-value pairs)
     *   - tags: Object (key-value pairs)
     * @throws {Error} If stack does not exist
     */
    async getStack(identifier) {
        throw new Error('IStackRepository.getStack() must be implemented by adapter');
    }

    /**
     * List all resources in a stack
     *
     * @param {StackIdentifier} identifier - Stack identifier
     * @returns {Promise<Array>} Array of stack resources
     * @returns {Promise<Array<Object>>} Array of resources with properties:
     *   - logicalId: string (CloudFormation logical ID)
     *   - physicalId: string (actual cloud resource ID)
     *   - resourceType: string (e.g., AWS::EC2::VPC)
     *   - status: string (CREATE_COMPLETE, UPDATE_COMPLETE, etc.)
     *   - lastUpdatedTime: Date
     *   - driftStatus: string (IN_SYNC, MODIFIED, DELETED, NOT_CHECKED)
     * @throws {Error} If stack does not exist
     */
    async listResources(identifier) {
        throw new Error(
            'IStackRepository.listResources() must be implemented by adapter'
        );
    }

    /**
     * Get resource details from stack
     *
     * @param {StackIdentifier} identifier - Stack identifier
     * @param {string} logicalId - Logical resource ID
     * @returns {Promise<Object>} Resource details
     * @returns {Promise<Object>} Resource with properties:
     *   - logicalId: string
     *   - physicalId: string
     *   - resourceType: string
     *   - status: string
     *   - properties: Object (current resource properties)
     *   - metadata: Object (resource metadata from template)
     * @throws {Error} If stack or resource does not exist
     */
    async getResource(identifier, logicalId) {
        throw new Error('IStackRepository.getResource() must be implemented by adapter');
    }

    /**
     * Get the CloudFormation template for a stack
     *
     * @param {StackIdentifier} identifier - Stack identifier
     * @returns {Promise<Object>} CloudFormation template as object
     * @throws {Error} If stack does not exist
     */
    async getTemplate(identifier) {
        throw new Error('IStackRepository.getTemplate() must be implemented by adapter');
    }

    /**
     * Check if a stack exists
     *
     * @param {StackIdentifier} identifier - Stack identifier
     * @returns {Promise<boolean>} True if stack exists
     */
    async exists(identifier) {
        throw new Error('IStackRepository.exists() must be implemented by adapter');
    }

    /**
     * Detect drift for the entire stack
     *
     * @param {StackIdentifier} identifier - Stack identifier
     * @returns {Promise<Object>} Drift detection result
     * @returns {Promise<Object>} Result with properties:
     *   - stackDriftStatus: string (DRIFTED, IN_SYNC, UNKNOWN, NOT_CHECKED)
     *   - driftedResourceCount: number
     *   - detectionTime: Date
     * @throws {Error} If stack does not exist
     */
    async detectStackDrift(identifier) {
        throw new Error(
            'IStackRepository.detectStackDrift() must be implemented by adapter'
        );
    }

    /**
     * Get drift details for a specific resource
     *
     * @param {StackIdentifier} identifier - Stack identifier
     * @param {string} logicalId - Logical resource ID
     * @returns {Promise<Object>} Resource drift details
     * @returns {Promise<Object>} Drift with properties:
     *   - driftStatus: string (IN_SYNC, MODIFIED, DELETED, NOT_CHECKED)
     *   - expectedProperties: Object (from template)
     *   - actualProperties: Object (from cloud)
     *   - propertyDifferences: Array<Object> (list of drifted properties)
     * @throws {Error} If stack or resource does not exist
     */
    async getResourceDrift(identifier, logicalId) {
        throw new Error(
            'IStackRepository.getResourceDrift() must be implemented by adapter'
        );
    }
}

module.exports = IStackRepository;
