/**
 * Cloud Provider Factory
 * 
 * Factory Pattern - Hexagonal Architecture
 * 
 * Creates appropriate cloud provider adapter instances based on configuration.
 * This enables runtime provider selection and makes it easy to add new providers.
 */

const { CloudProviderAdapter } = require('./cloud-provider-adapter');
const { AWSProviderAdapter } = require('./aws-provider-adapter');

class CloudProviderFactory {
    /**
     * Create cloud provider adapter instance
     * 
     * @param {string} providerName - Provider name ('aws', 'gcp', 'azure')
     * @param {string} region - Provider region
     * @param {Object} [credentials] - Optional credential configuration
     * @returns {CloudProviderAdapter} Provider adapter instance
     * @throws {Error} If provider is not supported
     */
    static create(providerName, region, credentials = {}) {
        const normalizedProvider = (providerName || 'aws').toLowerCase();

        switch (normalizedProvider) {
            case 'aws':
                return new AWSProviderAdapter(region, credentials);

            case 'gcp':
            case 'google':
                throw new Error(
                    'GCP provider not yet implemented. ' +
                    'AWS is currently the only supported cloud provider. ' +
                    'GCP support is planned for future releases.'
                );

            case 'azure':
            case 'microsoft':
                throw new Error(
                    'Azure provider not yet implemented. ' +
                    'AWS is currently the only supported cloud provider. ' +
                    'Azure support is planned for future releases.'
                );

            default:
                throw new Error(
                    `Unknown cloud provider: "${providerName}". ` +
                    `Supported providers: aws (gcp and azure coming soon)`
                );
        }
    }

    /**
     * Get list of supported providers
     * 
     * @returns {Array<Object>} List of provider metadata
     */
    static getSupportedProviders() {
        return [
            {
                name: 'aws',
                displayName: 'Amazon Web Services',
                status: 'available',
                description: 'AWS cloud provider with support for Lambda, VPC, RDS, KMS, etc.',
            },
            {
                name: 'gcp',
                displayName: 'Google Cloud Platform',
                status: 'planned',
                description: 'GCP cloud provider support coming soon',
            },
            {
                name: 'azure',
                displayName: 'Microsoft Azure',
                status: 'planned',
                description: 'Azure cloud provider support coming soon',
            },
        ];
    }

    /**
     * Check if a provider is supported
     * 
     * @param {string} providerName - Provider name to check
     * @returns {boolean} True if provider is supported
     */
    static isSupported(providerName) {
        const normalized = (providerName || '').toLowerCase();
        return ['aws', 'gcp', 'google', 'azure', 'microsoft'].includes(normalized);
    }

    /**
     * Check if a provider is available (implemented)
     * 
     * @param {string} providerName - Provider name to check
     * @returns {boolean} True if provider is implemented
     */
    static isAvailable(providerName) {
        const normalized = (providerName || '').toLowerCase();
        return normalized === 'aws';
    }
}

module.exports = {
    CloudProviderFactory,
};

