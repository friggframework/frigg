/**
 * Aurora Discovery Service
 * 
 * Domain Service - Hexagonal Architecture
 * 
 * Discovers Aurora/RDS database resources using the cloud provider adapter.
 * Adds domain-specific validation and connection string generation.
 */

class AuroraDiscovery {
    /**
     * @param {CloudProviderAdapter} provider - Cloud provider adapter instance
     */
    constructor(provider) {
        this.provider = provider;
    }

    /**
     * Discover Aurora/RDS database resources
     * 
     * @param {Object} config - Discovery configuration
     * @param {string} [config.databaseId] - Specific database cluster/instance ID
     * @param {string} [config.serviceName] - Service name for filtering
     * @param {string} [config.stage] - Deployment stage
     * @returns {Promise<Object>} Discovered database resources
     */
    async discover(config) {
        console.log('🔍 Discovering Aurora/RDS databases...');

        try {
            const rawResources = await this.provider.discoverDatabase(config);

            const result = {
                auroraClusterEndpoint: null,
                auroraPort: null,
                auroraEngine: null,
                databaseEndpoint: null,
                databasePort: null,
                databaseEngine: null,
                clusters: rawResources.clusters,
                instances: rawResources.instances,
            };

            // Set discovered endpoint
            if (rawResources.endpoint) {
                result.auroraClusterEndpoint = rawResources.endpoint;
                result.databaseEndpoint = rawResources.endpoint;
                result.auroraPort = rawResources.port || 5432;
                result.databasePort = rawResources.port || 5432;
                result.auroraEngine = rawResources.engine || 'aurora-postgresql';
                result.databaseEngine = rawResources.engine || 'aurora-postgresql';

                console.log(`  ✓ Found database: ${result.auroraClusterEndpoint}:${result.auroraPort}`);
                console.log(`  ✓ Engine: ${result.auroraEngine}`);
            } else {
                console.log('  ℹ No database found');
            }

            // Look for associated secrets in Secrets Manager
            // This would be discovered via the provider's discoverParameters method
            // with includeSecrets flag if needed

            return result;
        } catch (error) {
            console.error('  ✗ Database discovery failed:', error.message);
            return {
                auroraClusterEndpoint: null,
                auroraPort: null,
                auroraEngine: null,
                databaseEndpoint: null,
                databasePort: null,
                databaseEngine: null,
            };
        }
    }
}

module.exports = {
    AuroraDiscovery,
};

