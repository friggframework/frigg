/**
 * Environment variable validator for Frigg applications
 * Validates that required environment variables are present based on appDefinition
 */

/**
 * Validate environment variables against appDefinition
 * @param {Object} AppDefinition - Application definition with environment config
 * @returns {Object} Validation results with valid, missing, and warnings arrays
 */
const validateEnvironmentVariables = (AppDefinition) => {
    const results = {
        valid: [],
        missing: [],
        warnings: [],
    };

    if (!AppDefinition.environment) {
        return results;
    }

    console.log('🔍 Validating environment variables...');

    for (const [key, value] of Object.entries(AppDefinition.environment)) {
        if (value === true) {
            if (process.env[key]) {
                results.valid.push(key);
            } else {
                results.missing.push(key);
            }
        }
    }

    // Special handling for certain variables
    if (results.missing.includes('NODE_ENV')) {
        results.warnings.push('NODE_ENV not set, defaulting to "production"');
        // Remove from missing since it has a default
        results.missing = results.missing.filter((v) => v !== 'NODE_ENV');
    }

    // Report results
    if (results.valid.length > 0) {
        console.log(
            `   ✅ Valid: ${results.valid.length} environment variables found`
        );
    }

    if (results.missing.length > 0) {
        console.log(`   ⚠️  Missing: ${results.missing.join(', ')}`);
        results.warnings.push(
            `Missing ${results.missing.length} environment variables. These should be set in your CI/CD environment or .env file`
        );
    }

    if (results.warnings.length > 0) {
        results.warnings.forEach((warning) => {
            console.log(`   ⚠️  ${warning}`);
        });
    }

    return results;
};

/**
 * Check if all required environment variables are present
 * @param {Object} AppDefinition - Application definition
 * @returns {boolean} True if all required variables are present
 */
const hasAllRequiredEnvVars = (AppDefinition) => {
    const results = validateEnvironmentVariables(AppDefinition);
    return results.missing.length === 0;
};

module.exports = {
    validateEnvironmentVariables,
    hasAllRequiredEnvVars,
};
