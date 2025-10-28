/**
 * SSM Discovery Service
 * 
 * Domain Service - Hexagonal Architecture
 * 
 * Discovers SSM Parameter Store and Secrets Manager resources
 * using the cloud provider adapter.
 */

class SsmDiscovery {
    /**
     * @param {CloudProviderAdapter} provider - Cloud provider adapter instance
     */
    constructor(provider) {
        this.provider = provider;
    }

    /**
     * Discover SSM parameters and secrets
     * 
     * @param {Object} config - Discovery configuration
     * @param {string} [config.parameterPath] - SSM parameter path prefix
     * @param {string} [config.serviceName] - Service name for filtering
     * @param {string} [config.stage] - Deployment stage
     * @param {boolean} [config.includeSecrets] - Whether to include Secrets Manager
     * @returns {Promise<Object>} Discovered parameter resources
     */
    async discover(config) {
        console.log('🔍 Discovering SSM parameters...');

        try {
            // Build parameter path if not provided
            if (!config.parameterPath && config.serviceName && config.stage) {
                config.parameterPath = `/${config.serviceName}/${config.stage}`;
            }

            const rawResources = await this.provider.discoverParameters({
                ...config,
                includeSecrets: config.includeSecrets !== false,
            });

            const result = {
                parameters: rawResources.parameters || [],
                secrets: rawResources.secrets || [],
                parameterPath: config.parameterPath,
            };

            // Find database secret if exists
            if (result.secrets.length > 0) {
                const dbSecret = result.secrets.find(
                    s => s.Name?.includes('database') || s.Name?.includes('rds')
                );
                if (dbSecret) {
                    result.databaseSecretArn = dbSecret.ARN;
                    result.databaseSecretName = dbSecret.Name;
                }
            }

            if (result.parameters.length > 0) {
                console.log(`  ✓ Found ${result.parameters.length} SSM parameters`);
            }
            if (result.secrets.length > 0) {
                console.log(`  ✓ Found ${result.secrets.length} secrets`);
            }
            if (!result.parameters.length && !result.secrets.length) {
                console.log('  ℹ No parameters or secrets found');
            }

            return result;
        } catch (error) {
            console.error('  ✗ SSM discovery failed:', error.message);
            return {
                parameters: [],
                secrets: [],
                parameterPath: config.parameterPath,
            };
        }
    }
}

module.exports = {
    SsmDiscovery,
};

