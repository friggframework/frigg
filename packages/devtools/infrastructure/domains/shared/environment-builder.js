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

const {
    isSsmOffloadActive,
    getOffloadedKeys,
} = require('../parameters/offload-utils');

// OTLP-family exporters read their endpoint/headers from these standard env
// vars (ADR-011). When such an exporter is configured we auto-register them as
// Serverless passthroughs so the deployed Lambda inherits them from the deploy
// environment — no need for the adopter to also list them under `environment`.
//
// NOTE (VPC egress): a Lambda in a private subnet needs a NAT gateway or a VPC
// endpoint to reach an external OTLP backend (Honeycomb/Datadog). Without egress
// the exporter fails silently within its flush timeout — see the deploy docs.
const OTLP_EXPORTER_TYPES = new Set(['otlp', 'honeycomb', 'datadog']);
const OTEL_PASSTHROUGH_VARS = [
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_HEADERS',
];

function addTelemetryEnvPassthrough(appDefinition, envVars) {
    const exporterType = appDefinition?.telemetry?.exporter?.type;
    if (!OTLP_EXPORTER_TYPES.has(exporterType)) return;

    // A passthrough var that is also marked for SSM offload must NOT be baked
    // as a direct `${env:KEY, ''}` Lambda var: the deploy shell has no such var
    // (it lives only in Parameter Store), so it resolves to '' at package time,
    // and at runtime '' !== undefined blocks the SSM loader from ever populating
    // it. Leave it out here so it lives only in FRIGG_SSM_OFFLOADED_KEYS. When
    // offload is inactive (local mode / ssm disabled) it still gets the
    // passthrough, matching the local-fallback contract.
    const offloadedKeys = isSsmOffloadActive(appDefinition)
        ? new Set(getOffloadedKeys(appDefinition))
        : null;
    for (const key of OTEL_PASSTHROUGH_VARS) {
        if (offloadedKeys?.has(key)) continue;
        envVars[key] = `\${env:${key}, ''}`;
    }
}

/**
 * Get environment variables from AppDefinition
 *
 * Extracts environment variable definitions where value is true,
 * and creates Serverless variable references.
 *
 * A value of 'ssm' offloads the variable to Parameter Store when offload is
 * active (see SsmBuilder), keeping it out of the Lambda env map. When offload
 * is not active (local mode / ssm disabled) it falls back to the same
 * `${env:KEY, ''}` reference as `true` so `frigg start` + dotenv keeps working.
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

    addTelemetryEnvPassthrough(appDefinition, envVars);

    const environment = appDefinition.environment || {};

    console.log('📋 Loading environment variables from appDefinition...');
    const envKeys = [];
    const skippedKeys = [];
    const offloadedKeys = [];
    const offloadActive = isSsmOffloadActive(appDefinition);

    for (const [key, value] of Object.entries(environment)) {
        if (value === 'ssm' && offloadActive) {
            offloadedKeys.push(key);
            continue;
        }
        if (value !== true && value !== 'ssm') continue;
        if (reservedVars.has(key)) {
            skippedKeys.push(key);
            continue;
        }
        envVars[key] = `\${env:${key}, ''}`;
        envKeys.push(key);
    }

    // Keys declared only in ssm.parameters (no matching `environment` entry)
    // get the same local-fallback treatment as `environment`-valued 'ssm' keys.
    const ssmOnlyKeys = getOffloadedKeys(appDefinition).filter(
        (key) => !(key in environment)
    );
    for (const key of ssmOnlyKeys) {
        if (offloadActive) {
            offloadedKeys.push(key);
            continue;
        }
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
            `   ⚠️  Skipped ${
                skippedKeys.length
            } reserved AWS Lambda variables: ${skippedKeys.join(', ')}`
        );
    }
    if (offloadedKeys.length > 0) {
        console.log(
            `   🔒 Offloaded ${
                offloadedKeys.length
            } variables to SSM: ${offloadedKeys.join(', ')}`
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
        STAGE: '${self:provider.stage}', // Used by encryption bypass logic
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
        environment.DATABASE_PORT = String(
            discoveredResources.auroraPort || 5432
        );
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
