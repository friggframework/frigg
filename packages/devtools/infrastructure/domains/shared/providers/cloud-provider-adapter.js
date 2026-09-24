/**
 * Cloud Provider Adapter (Abstract Base Class)
 * 
 * Port - Hexagonal Architecture
 * 
 * Defines the contract for cloud provider implementations.
 * This abstraction enables multi-cloud support by providing a consistent
 * interface for AWS, GCP, Azure, and other cloud providers.
 * 
 * Benefits:
 * - Cloud-agnostic infrastructure code
 * - Easy to add new providers (just implement this interface)
 * - Testable with mock providers
 * - Clear separation between cloud-specific and business logic
 */

class CloudProviderAdapter {
    /**
     * Get provider name
     * @returns {string} Provider name ('aws', 'gcp', 'azure', etc.)
     */
    getName() {
        throw new Error('CloudProviderAdapter.getName() must be implemented by subclass');
    }

    /**
     * Get supported regions for this provider
     * @returns {Array<string>} List of supported region identifiers
     */
    getSupportedRegions() {
        throw new Error('CloudProviderAdapter.getSupportedRegions() must be implemented by subclass');
    }

    // ==================== Discovery Methods ====================

    /**
     * Discover VPC/network resources
     * 
     * @param {Object} config - Discovery configuration
     * @param {string} [config.vpcId] - Specific VPC ID to discover
     * @param {string} [config.vpcName] - VPC name pattern to search for
     * @param {boolean} [config.includeSubnets] - Whether to include subnet details
     * @returns {Promise<Object>} Discovered VPC resources
     * @returns {Promise<Object>} result.vpcId - VPC identifier
     * @returns {Promise<Object>} result.vpcCidr - VPC CIDR block
     * @returns {Promise<Object>} result.subnets - Array of subnet objects
     * @returns {Promise<Object>} result.securityGroups - Array of security group objects
     * @returns {Promise<Object>} result.routeTables - Array of route table objects
     */
    async discoverVpc(config) {
        throw new Error('CloudProviderAdapter.discoverVpc() must be implemented by subclass');
    }

    /**
     * Discover encryption keys (KMS, Cloud KMS, Azure Key Vault, etc.)
     * 
     * @param {Object} config - Discovery configuration
     * @param {string} [config.keyId] - Specific key ID to discover
     * @param {string} [config.keyAlias] - Key alias to search for
     * @returns {Promise<Object>} Discovered encryption key resources
     * @returns {Promise<Object>} result.keyId - Key identifier
     * @returns {Promise<Object>} result.keyArn - Key ARN/resource name
     * @returns {Promise<Object>} result.aliases - Array of key aliases
     */
    async discoverKmsKeys(config) {
        throw new Error('CloudProviderAdapter.discoverKmsKeys() must be implemented by subclass');
    }

    /**
     * Discover database resources (RDS, Cloud SQL, Azure SQL, etc.)
     * 
     * @param {Object} config - Discovery configuration
     * @param {string} [config.databaseId] - Specific database instance/cluster ID
     * @param {string} [config.engine] - Database engine filter ('postgresql', 'mysql', etc.)
     * @returns {Promise<Object>} Discovered database resources
     * @returns {Promise<Object>} result.endpoint - Database connection endpoint
     * @returns {Promise<Object>} result.port - Database port
     * @returns {Promise<Object>} result.engine - Database engine type
     * @returns {Promise<Object>} result.version - Database version
     */
    async discoverDatabase(config) {
        throw new Error('CloudProviderAdapter.discoverDatabase() must be implemented by subclass');
    }

    /**
     * Discover parameter store/secret manager resources
     * 
     * @param {Object} config - Discovery configuration
     * @param {string} [config.parameterPath] - Parameter path prefix to search
     * @param {string} [config.secretName] - Specific secret name to discover
     * @returns {Promise<Object>} Discovered parameter/secret resources
     * @returns {Promise<Object>} result.parameters - Array of parameter objects
     * @returns {Promise<Object>} result.secrets - Array of secret objects
     */
    async discoverParameters(config) {
        throw new Error('CloudProviderAdapter.discoverParameters() must be implemented by subclass');
    }

    // ==================== Provisioning Methods (Future) ====================
    // These will be used for Terraform/Pulumi/CloudFormation generation

    /**
     * Generate VPC provisioning configuration
     * 
     * @param {Object} config - VPC configuration
     * @returns {Promise<Object>} Infrastructure-as-code configuration
     */
    async provisionVpc(config) {
        throw new Error('CloudProviderAdapter.provisionVpc() not yet implemented. Future feature for IaC generation.');
    }

    /**
     * Generate encryption key provisioning configuration
     * 
     * @param {Object} config - Key configuration
     * @returns {Promise<Object>} Infrastructure-as-code configuration
     */
    async provisionKmsKey(config) {
        throw new Error('CloudProviderAdapter.provisionKmsKey() not yet implemented. Future feature for IaC generation.');
    }

    /**
     * Generate database provisioning configuration
     * 
     * @param {Object} config - Database configuration
     * @returns {Promise<Object>} Infrastructure-as-code configuration
     */
    async provisionDatabase(config) {
        throw new Error('CloudProviderAdapter.provisionDatabase() not yet implemented. Future feature for IaC generation.');
    }
}

module.exports = {
    CloudProviderAdapter,
};

