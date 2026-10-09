/**
 * KMS Discovery Service
 * 
 * Domain Service - Hexagonal Architecture
 * 
 * Discovers KMS encryption keys using the cloud provider adapter.
 * Adds domain-specific validation and key selection logic.
 */

class KmsDiscovery {
    /**
     * @param {CloudProviderAdapter} provider - Cloud provider adapter instance
     */
    constructor(provider) {
        this.provider = provider;
    }

    /**
     * Discover KMS encryption keys
     * 
     * @param {Object} config - Discovery configuration
     * @param {string} [config.keyId] - Specific key ID to discover
     * @param {string} [config.keyAlias] - Key alias to search for
     * @param {string} [config.serviceName] - Service name for filtering
     * @param {string} [config.stage] - Deployment stage
     * @returns {Promise<Object>} Discovered KMS key resources
     */
    async discover(config) {
        console.log('🔍 Discovering KMS keys...');

        try {
            const rawResources = await this.provider.discoverKmsKeys(config);

            const result = {
                kmsKeyId: null,
                kmsKeyArn: null,
                kmsKeyAlias: null,
                keys: rawResources.keys,
                aliases: rawResources.aliases,
            };

            // Use default key if found
            if (rawResources.defaultKey) {
                result.kmsKeyId = rawResources.defaultKey.Arn;
                result.kmsKeyArn = rawResources.defaultKey.Arn;
                result.defaultKmsKeyId = rawResources.defaultKey.Arn;

                // Find alias for this key
                const keyAlias = rawResources.aliases.find(
                    a => a.TargetKeyId === rawResources.defaultKey.KeyId
                );
                if (keyAlias) {
                    result.kmsKeyAlias = keyAlias.AliasName;
                }

                console.log(`  ✓ Found KMS key: ${result.kmsKeyId}`);
                if (result.kmsKeyAlias) {
                    console.log(`  ✓ Key alias: ${result.kmsKeyAlias}`);
                }
            } else {
                console.log('  ℹ No KMS key found');
            }

            return result;
        } catch (error) {
            console.error('  ✗ KMS discovery failed:', error.message);
            return {
                kmsKeyId: null,
                kmsKeyArn: null,
                defaultKmsKeyId: null,
                kmsKeyAlias: null,
            };
        }
    }
}

module.exports = {
    KmsDiscovery,
};

