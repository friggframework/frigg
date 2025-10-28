class IEnvironmentValidator {
    /**
     * Validates required environment variables
     * @param {Object} appDefinition - Application definition with environment config
     * @returns {Promise<Object>} Validation result
     * @returns {Promise<Object>} result.valid - Whether validation passed
     * @returns {Promise<Array>} result.required - Required variables status
     * @returns {Promise<Array>} result.optional - Optional variables status
     * @returns {Promise<Array>} result.errors - Validation errors
     * @returns {Promise<Array>} result.warnings - Validation warnings
     */
    async validateEnvironmentVariables(appDefinition) {
        throw new Error('IEnvironmentValidator.validateEnvironmentVariables() must be implemented');
    }

    /**
     * Validates AWS credentials and account access
     * @returns {Promise<Object>} AWS credentials validation result
     * @returns {Promise<Object>} result.valid - Whether credentials are valid
     * @returns {Promise<string>} result.accountId - AWS account ID
     * @returns {Promise<string>} result.region - AWS region
     * @returns {Promise<Array>} result.errors - Validation errors
     */
    async validateAwsCredentials() {
        throw new Error('IEnvironmentValidator.validateAwsCredentials() must be implemented');
    }
}

module.exports = { IEnvironmentValidator };
