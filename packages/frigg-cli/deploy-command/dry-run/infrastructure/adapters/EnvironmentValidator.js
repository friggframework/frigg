const { ValidationResult } = require('../../domain/value-objects/ValidationResult');

class EnvironmentValidator {
    constructor(config = {}) {
        this.region = config.region || process.env.AWS_REGION || 'us-east-1';
        this._stsClient = null; // Lazy-loaded
    }

    _getSTSClient() {
        if (!this._stsClient) {
            const { STSClient } = require('@aws-sdk/client-sts');
            this._stsClient = new STSClient({ region: this.region });
        }
        return this._stsClient;
    }

    /**
     * Validates environment variables from app definition
     * @param {Object} appDefinition - Application definition with environment config
     * @returns {Promise<ValidationResult>} Validation result with metadata
     */
    async validateEnvironmentVariables(appDefinition) {
        if (!appDefinition || !appDefinition.environment) {
            return ValidationResult.success({
                required: { present: [], missing: [] },
                optional: { present: [], missing: [] },
            });
        }

        const environment = appDefinition.environment;
        const errors = [];
        const warnings = [];
        const requiredPresent = [];
        const requiredMissing = [];
        const optionalPresent = [];
        const optionalMissing = [];

        for (const [varName, config] of Object.entries(environment)) {
            const isRequired = this._isRequired(config);
            const isPresent = this._isVariablePresent(varName);

            if (isRequired) {
                if (isPresent) {
                    requiredPresent.push(varName);
                } else {
                    requiredMissing.push(varName);
                    errors.push(`Missing required environment variable: ${varName}`);
                }
            } else {
                if (isPresent) {
                    optionalPresent.push(varName);
                } else {
                    optionalMissing.push(varName);
                    warnings.push(`Optional environment variable not set: ${varName}`);
                }
            }
        }

        const metadata = {
            required: {
                present: requiredPresent,
                missing: requiredMissing,
            },
            optional: {
                present: optionalPresent,
                missing: optionalMissing,
            },
        };

        if (errors.length > 0) {
            return ValidationResult.failure(errors, warnings, metadata);
        }

        if (warnings.length > 0) {
            return ValidationResult.withWarnings(warnings, metadata);
        }

        return ValidationResult.success(metadata);
    }

    _isRequired(config) {
        if (typeof config === 'boolean') {
            return config;
        }
        if (typeof config === 'object' && config !== null) {
            return config.required !== false;
        }
        return true;
    }

    _isVariablePresent(varName) {
        return process.env[varName] !== undefined;
    }

    /**
     * Validates AWS credentials using STS GetCallerIdentity
     * @returns {Promise<ValidationResult>} Validation result with AWS account details
     */
    async validateAwsCredentials() {
        try {
            const { GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
            const client = this._getSTSClient();
            const command = new GetCallerIdentityCommand({});

            const response = await client.send(command);

            return ValidationResult.success({
                accountId: response.Account,
                region: this.region,
            });
        } catch (error) {
            return this._handleAwsError(error);
        }
    }

    _handleAwsError(error) {
        const errors = [];
        const metadata = {
            accountId: null,
            region: this.region,
        };

        if (error.name === 'InvalidClientTokenId' || error.name === 'ExpiredTokenException') {
            errors.push('AWS credentials are invalid or expired');
        } else if (error.name === 'CredentialsProviderError') {
            errors.push('AWS credentials not found. Please configure AWS credentials.');
        } else if (error.name === 'AccessDeniedException') {
            errors.push('Access denied. Check your AWS IAM permissions.');
        } else if (error.name === 'Throttling') {
            errors.push('AWS API throttling error. Please retry later.');
        } else if (error.name === 'ServiceUnavailableException') {
            errors.push(`AWS service unavailable: ${error.message}`);
        } else if (error.code === 'NetworkingError') {
            errors.push(`Network error connecting to AWS: ${error.message}`);
        } else {
            errors.push(`Failed to validate AWS credentials: ${error.message}`);
        }

        return ValidationResult.failure(errors, [], metadata);
    }
}

module.exports = { EnvironmentValidator };
