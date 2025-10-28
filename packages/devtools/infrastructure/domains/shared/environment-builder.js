/**
 * Environment Builder Service
 * 
 * Domain Service - Hexagonal Architecture
 * 
 * Builds Lambda environment variable configuration from:
 * 1. AppDefinition environment flags
 * 2. Discovered AWS resources (VPC IDs, KMS keys, etc.)
 * 3. Generated resource references
 */

/**
 * Get environment variables from AppDefinition
 * 
 * Extracts environment variable definitions where value is true,
 * and creates Serverless variable references.
 * 
 * @param {Object} appDefinition - Application definition
 * @returns {Object} Environment variable mappings
 */
function getAppEnvironmentVars(appDefinition) {
    const envVars = {};
    const reservedVars = new Set([
        '_HANDLER',
        '_X_AMZN_TRACE_ID',
        'AWS_DEFAULT_REGION',
        'AWS_EXECUTION_ENV',
        'AWS_REGION',
        'AWS_LAMBDA_FUNCTION_NAME',
        'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
        'AWS_LAMBDA_FUNCTION_VERSION',
        'AWS_LAMBDA_INITIALIZATION_TYPE',
        'AWS_LAMBDA_LOG_GROUP_NAME',
        'AWS_LAMBDA_LOG_STREAM_NAME',
        'AWS_ACCESS_KEY',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
    ]);

    if (!appDefinition.environment) {
        return envVars;
    }

    console.log('📋 Loading environment variables from appDefinition...');
    const envKeys = [];
    const skippedKeys = [];

    for (const [key, value] of Object.entries(appDefinition.environment)) {
        if (value !== true) continue;
        if (reservedVars.has(key)) {
            skippedKeys.push(key);
            continue;
        }
        envVars[key] = `\${env:${key}, ''}`;
        envKeys.push(key);
    }

    if (envKeys.length > 0) {
        console.log(
            `   Found ${envKeys.length} environment variables: ${envKeys.join(
                ', '
            )}`
        );
    }
    if (skippedKeys.length > 0) {
        console.log(
            `   ⚠️  Skipped ${skippedKeys.length
            } reserved AWS Lambda variables: ${skippedKeys.join(', ')}`
        );
    }

    return envVars;
}

/**
 * Build complete environment configuration for Lambda functions
 * 
 * Combines app environment vars with discovered AWS resource references
 * 
 * @param {Object} appEnvironmentVars - Environment vars from AppDefinition
 * @param {Object} discoveredResources - Discovered AWS resources
 * @returns {Object} Complete environment configuration
 */
function buildEnvironment(appEnvironmentVars, discoveredResources) {
    const environment = {
        ...appEnvironmentVars,
        STAGE: '${self:provider.stage}',  // Used by encryption bypass logic
        FRIGG_STACK: '${self:service}',
        FRIGG_STAGE: '${self:provider.stage}',
        FRIGG_REGION: '${self:provider.region}',
    };

    // Add KMS key if discovered or created
    if (discoveredResources.kmsKeyId) {
        environment.KMS_KEY_ARN = discoveredResources.kmsKeyId;
    } else if (discoveredResources.kmsKeyArn) {
        environment.KMS_KEY_ARN = discoveredResources.kmsKeyArn;
    }

    // Add database connection info if discovered
    if (discoveredResources.auroraClusterEndpoint) {
        environment.DATABASE_HOST = discoveredResources.auroraClusterEndpoint;
        environment.DATABASE_PORT = String(discoveredResources.auroraPort || 5432);
    }

    // Add secrets manager secret ARN if discovered
    if (discoveredResources.databaseSecretArn) {
        environment.DATABASE_SECRET_ARN = discoveredResources.databaseSecretArn;
    }

    return environment;
}

module.exports = {
    getAppEnvironmentVars,
    buildEnvironment,
};

