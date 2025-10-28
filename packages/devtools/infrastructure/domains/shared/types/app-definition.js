/**
 * @fileoverview App definition types
 *
 * Defines the structure of the application definition with new ownership-based schema.
 * This replaces the old 'management' mode system.
 */

/**
 * VPC configuration
 * @typedef {Object} VpcDefinition
 * @property {boolean} enable - Whether VPC is enabled
 *
 * @property {Object} [ownership] - Resource ownership configuration
 * @property {'stack'|'external'|'auto'} [ownership.vpc] - VPC ownership
 * @property {'stack'|'external'|'auto'} [ownership.securityGroup] - Security group ownership
 * @property {'stack'|'external'|'auto'} [ownership.subnets] - Subnets ownership
 * @property {'stack'|'external'|'auto'} [ownership.natGateway] - NAT gateway ownership
 * @property {'stack'|'external'|'auto'} [ownership.vpcEndpoints] - VPC endpoints ownership
 *
 * @property {Object} [external] - External resource references (required if ownership='external')
 * @property {string} [external.vpcId] - External VPC ID
 * @property {string[]} [external.securityGroupIds] - External security group IDs
 * @property {string[]} [external.subnetIds] - External subnet IDs
 * @property {string} [external.natGatewayId] - External NAT gateway ID
 * @property {Object} [external.vpcEndpointIds] - External VPC endpoint IDs
 * @property {string} [external.vpcEndpointIds.s3] - S3 endpoint ID
 * @property {string} [external.vpcEndpointIds.dynamodb] - DynamoDB endpoint ID
 * @property {string} [external.vpcEndpointIds.kms] - KMS endpoint ID
 * @property {string} [external.vpcEndpointIds.secretsManager] - Secrets Manager endpoint ID
 * @property {string} [external.vpcEndpointIds.sqs] - SQS endpoint ID
 *
 * @property {Object} [config] - Configuration preferences
 * @property {boolean} [config.selfHeal] - Auto-configure NAT/routes/etc (default: false)
 * @property {string} [config.cidrBlock] - CIDR block for stack-owned VPC (default: '10.0.0.0/16')
 * @property {boolean} [config.enableVpcEndpoints] - Enable VPC endpoints (default: true)
 * @property {Object} [config.natGateway] - NAT Gateway configuration
 * @property {boolean} [config.natGateway.enable] - Enable NAT Gateway (default: true)
 */

/**
 * Aurora PostgreSQL configuration
 * @typedef {Object} AuroraDefinition
 * @property {boolean} enable - Whether Aurora is enabled
 *
 * @property {Object} [ownership] - Resource ownership configuration
 * @property {'stack'|'external'|'auto'} [ownership.cluster] - Aurora cluster ownership
 * @property {'stack'|'external'|'auto'} [ownership.subnetGroup] - DB subnet group ownership
 * @property {'stack'|'external'|'auto'} [ownership.secret] - Secrets Manager secret ownership
 *
 * @property {Object} [external] - External resource references
 * @property {string} [external.clusterId] - External cluster identifier
 * @property {string} [external.clusterEndpoint] - External cluster endpoint
 * @property {number} [external.port] - External cluster port
 * @property {string} [external.secretArn] - External Secrets Manager ARN
 *
 * @property {Object} [config] - Configuration preferences
 * @property {'aurora-postgresql'|'aurora-mysql'} [config.engine] - Database engine
 * @property {number} [config.minCapacity] - Min serverless capacity (default: 0.5)
 * @property {number} [config.maxCapacity] - Max serverless capacity (default: 1)
 * @property {string} [config.database] - Database name (default: 'frigg')
 * @property {boolean} [config.publiclyAccessible] - Public access (default: false)
 * @property {boolean} [config.autoCreateCredentials] - Auto-create credentials in Secrets Manager
 */

/**
 * KMS encryption configuration
 * @typedef {Object} KmsDefinition
 * @property {boolean} enable - Whether KMS is enabled
 *
 * @property {Object} [ownership] - Resource ownership configuration
 * @property {'stack'|'external'|'auto'} [ownership.key] - KMS key ownership
 *
 * @property {Object} [external] - External resource references
 * @property {string} [external.keyId] - External KMS key ID or ARN
 * @property {string} [external.keyAlias] - External KMS key alias
 *
 * @property {Object} [config] - Configuration preferences
 * @property {boolean} [config.enableKeyRotation] - Enable automatic key rotation
 * @property {string} [config.description] - Key description
 */

/**
 * SSM Parameter Store configuration
 * @typedef {Object} SsmDefinition
 * @property {boolean} enable - Whether SSM is enabled
 * @property {string[]} [parameterPaths] - Parameter paths to grant access to
 */

/**
 * Database migration configuration
 * @typedef {Object} MigrationDefinition
 * @property {boolean} enable - Whether migrations are enabled
 * @property {string} [migrationPath] - Path to migration files
 */

/**
 * WebSocket configuration
 * @typedef {Object} WebsocketDefinition
 * @property {boolean} enable - Whether WebSocket API is enabled
 */

/**
 * Integration configuration
 * @typedef {Object} IntegrationDefinition
 * @property {Object} Definition - Integration definition object
 * @property {string} Definition.name - Integration name
 */

/**
 * Complete application definition
 * @typedef {Object} AppDefinition
 * @property {string} name - Application name
 * @property {string} stage - Deployment stage (e.g., 'dev', 'production')
 * @property {string} provider - Cloud provider (e.g., 'aws')
 * @property {string} region - AWS region
 *
 * @property {VpcDefinition} [vpc] - VPC configuration
 * @property {Object} [database] - Database configuration
 * @property {AuroraDefinition} [database.postgres] - PostgreSQL configuration
 * @property {KmsDefinition} [encryption] - KMS encryption configuration
 * @property {SsmDefinition} [ssm] - SSM Parameter Store configuration
 * @property {MigrationDefinition} [migrations] - Database migration configuration
 * @property {WebsocketDefinition} [websockets] - WebSocket API configuration
 * @property {IntegrationDefinition[]} [integrations] - Integration definitions
 *
 * @property {Object} [environment] - Environment variables
 */

/**
 * Validate app definition has required fields
 * @param {AppDefinition} appDefinition - App definition to validate
 * @throws {Error} If required fields are missing
 */
function validateAppDefinition(appDefinition) {
    if (!appDefinition) {
        throw new Error('App definition is required');
    }

    if (!appDefinition.name) {
        throw new Error('App definition must have a name');
    }

    if (!appDefinition.provider) {
        throw new Error('App definition must have a provider');
    }

    if (!appDefinition.region) {
        throw new Error('App definition must have a region');
    }
}

/**
 * Get stack name from app definition
 * @param {AppDefinition} appDefinition - App definition
 * @returns {string} Stack name
 */
function getStackName(appDefinition) {
    const stage = appDefinition.stage || 'dev';
    return `${appDefinition.name}-${stage}`;
}

/**
 * Check if VPC is enabled
 * @param {AppDefinition} appDefinition - App definition
 * @returns {boolean}
 */
function isVpcEnabled(appDefinition) {
    return appDefinition.vpc?.enable === true;
}

/**
 * Check if Aurora is enabled
 * @param {AppDefinition} appDefinition - App definition
 * @returns {boolean}
 */
function isAuroraEnabled(appDefinition) {
    return appDefinition.database?.postgres?.enable === true;
}

/**
 * Check if KMS is enabled
 * @param {AppDefinition} appDefinition - App definition
 * @returns {boolean}
 */
function isKmsEnabled(appDefinition) {
    return appDefinition.encryption?.enable === true;
}

/**
 * Check if SSM is enabled
 * @param {AppDefinition} appDefinition - App definition
 * @returns {boolean}
 */
function isSsmEnabled(appDefinition) {
    return appDefinition.ssm?.enable === true;
}

module.exports = {
    validateAppDefinition,
    getStackName,
    isVpcEnabled,
    isAuroraEnabled,
    isKmsEnabled,
    isSsmEnabled
};
