/**
 * Resource Discovery Service
 * 
 * Domain Service - Hexagonal Architecture
 * 
 * Orchestrates discovery of cloud resources (VPC, databases, encryption keys, etc.)
 * using the cloud provider abstraction layer and domain-specific discovery services.
 * 
 * This service is cloud-agnostic and delegates to provider-specific implementations.
 */

const { CloudProviderFactory } = require('./providers/provider-factory');
const { CloudFormationDiscovery } = require('./cloudformation-discovery');
const { VpcDiscovery } = require('../networking/vpc-discovery');
const { KmsDiscovery } = require('../security/kms-discovery');
const { AuroraDiscovery } = require('../database/aurora-discovery');
const { SsmDiscovery } = require('../parameters/ssm-discovery');

/**
 * Determine if AWS discovery should run
 *
 * Checks in priority order:
 * 1. AppDefinition.aws.discovery.enabled (explicit opt-in/out)
 * 2. FRIGG_SKIP_AWS_DISCOVERY environment variable
 * 3. Auto-detection based on features enabled (VPC, KMS, SSM, PostgreSQL)
 *
 * @param {Object} appDefinition - Application definition
 * @returns {boolean} True if discovery is needed
 */
function shouldRunDiscovery(appDefinition) {
    // Priority 1: Check AppDefinition-level configuration
    if (appDefinition.aws?.discovery?.enabled !== undefined) {
        const enabled = appDefinition.aws.discovery.enabled;
        console.log(
            `⚙️  Using AppDefinition.aws.discovery.enabled: ${enabled}`
        );
        return enabled;
    }

    // Priority 2: Check environment variable
    console.log(
        '⚙️  Checking FRIGG_SKIP_AWS_DISCOVERY:',
        process.env.FRIGG_SKIP_AWS_DISCOVERY
    );

    if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
        console.log(
            '⚙️  Skipping AWS discovery because FRIGG_SKIP_AWS_DISCOVERY is set.'
        );
        return false;
    }

    // Priority 3: Auto-detect based on enabled features
    return (
        appDefinition.vpc?.enable === true ||
        appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms' ||
        appDefinition.ssm?.enable === true ||
        appDefinition.database?.postgres?.enable === true
    );
}

/**
 * Gather discovered cloud resources
 * 
 * Uses cloud provider abstraction to discover resources in a provider-agnostic way.
 * 
 * @param {Object} appDefinition - Application definition
 * @returns {Promise<Object>} Discovered cloud resources
 */
async function gatherDiscoveredResources(appDefinition) {
    if (!shouldRunDiscovery(appDefinition)) {
        console.log('⚙️  Skipping cloud resource discovery (not required for this configuration)');
        return {};
    }

    console.log('🔍 Running cloud resource discovery...');

    try {
        // Get cloud provider (defaults to AWS, can be overridden via env var)
        const providerName = process.env.CLOUD_PROVIDER || appDefinition.provider || 'aws';
        const region = process.env.AWS_REGION || 'us-east-1';

        console.log(`   Provider: ${providerName}`);
        console.log(`   Region: ${region}`);

        // Create provider adapter
        const provider = CloudProviderFactory.create(providerName, region);

        // Build discovery configuration
        const stage = process.env.SLS_STAGE || 'dev';
        const stackName = `${appDefinition.name || 'create-frigg-app'}-${stage}`;
        const serviceName = appDefinition.name || 'create-frigg-app';

        // Try CloudFormation-first discovery
        const cfDiscovery = new CloudFormationDiscovery(provider, { serviceName, stage });
        const stackResources = await cfDiscovery.discoverFromStack(stackName);

        // Validate CF discovery results - check for ANY useful infrastructure
        const hasVpcData = stackResources?.defaultVpcId;  // VPC resource in stack
        const hasKmsData = stackResources?.defaultKmsKeyId;  // KMS resource in stack
        const hasAuroraData = stackResources?.auroraClusterId;  // Aurora in stack
        
        // Check for routing infrastructure (proves VPC config exists even with external VPC)
        const hasRoutingInfra = stackResources?.routeTableId ||  // FriggLambdaRouteTable
                               stackResources?.natRoute ||        // FriggNATRoute
                               stackResources?.vpcEndpoints?.s3 || // VPC endpoints
                               stackResources?.vpcEndpoints?.dynamodb;
        
        // Stack is useful if it has EITHER actual resources OR routing infrastructure
        const hasSomeUsefulData = hasVpcData || hasKmsData || hasAuroraData || hasRoutingInfra;
        
        if (hasRoutingInfra && !hasVpcData) {
            console.log('  ✓ Found VPC routing infrastructure in stack (external VPC pattern)');
        }

        // Check if we're in isolated mode (each stage gets its own VPC/Aurora)
        const isIsolatedMode = appDefinition.managementMode === 'managed' &&
                               appDefinition.vpcIsolation === 'isolated';

        if (stackResources && hasSomeUsefulData) {
            console.log('  ✓ Discovered resources from existing CloudFormation stack');
            console.log('✅ Cloud resource discovery completed successfully!');
            return stackResources;
        }

        // In isolated mode, NEVER fall back to AWS discovery for VPC/Aurora
        // These resources must be isolated per stage, so we either:
        // 1. Use resources from THIS stage's CloudFormation stack (handled above)
        // 2. Return empty to CREATE fresh isolated resources for this stage
        if (isIsolatedMode) {
            console.log('  ℹ Isolated mode: No CloudFormation stack or no VPC/Aurora in stack');
            console.log('  ℹ Will create fresh isolated VPC/Aurora for this stage');
            console.log('  ℹ Checking for shared KMS key...');

            // KMS keys CAN be shared across stages (encryption keys are safe to reuse)
            const kmsDiscovery = new KmsDiscovery(provider);
            const kmsConfig = {
                serviceName: appDefinition.name || 'create-frigg-app',
                stage,
                keyAlias: `alias/${appDefinition.name || 'create-frigg-app'}-${stage}-frigg-kms`,
            };
            const kmsResult = await kmsDiscovery.discover(kmsConfig);

            if (kmsResult?.defaultKmsKeyId) {
                console.log('  ✓ Found shared KMS key (can be reused across stages)');
                console.log('✅ Cloud resource discovery completed - will create isolated VPC/Aurora!');
                return kmsResult;
            }

            console.log('  ℹ No existing KMS key found - will create new one');
            console.log('✅ Cloud resource discovery completed - will create fresh isolated resources!');
            return {};
        }

        // Fallback to AWS API discovery (fresh deployment, stack not found, or stack has no useful data)
        if (stackResources && !hasSomeUsefulData) {
            console.log('  ℹ Stack found but contains no usable resources - running AWS API discovery...');
        } else {
            console.log('  ℹ No stack found - running AWS API discovery...');
        }

        // Create domain discovery services with provider
        const vpcDiscovery = new VpcDiscovery(provider);
        const kmsDiscovery = new KmsDiscovery(provider);
        const auroraDiscovery = new AuroraDiscovery(provider);
        const ssmDiscovery = new SsmDiscovery(provider);

        const config = {
            serviceName: appDefinition.name || 'create-frigg-app',
            stage,
            vpcId: appDefinition.vpc?.vpcId,
            databaseId: appDefinition.database?.postgres?.clusterId ||
                appDefinition.database?.postgres?.instanceId,
            keyAlias: appDefinition.encryption?.keyAlias,
            includeSecrets: true,
        };

        // Run discoveries in parallel for better performance
        const [vpcResources, kmsResources, dbResources, ssmResources] =
            await Promise.all([
                appDefinition.vpc?.enable ? vpcDiscovery.discover(config) : Promise.resolve({}),
                appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms'
                    ? kmsDiscovery.discover(config)
                    : Promise.resolve({}),
                appDefinition.database?.postgres?.enable
                    ? auroraDiscovery.discover(config)
                    : Promise.resolve({}),
                appDefinition.ssm?.enable
                    ? ssmDiscovery.discover(config)
                    : Promise.resolve({}),
            ]);

        // Aggregate results
        const discoveredResources = {
            ...vpcResources,
            ...kmsResources,
            ...dbResources,
            ...ssmResources,
        };

        console.log('✅ Cloud resource discovery completed successfully!');

        return discoveredResources;
    } catch (error) {
        console.error('❌ Cloud resource discovery failed:', error.message);
        console.error('Stack:', error.stack);

        // Check if discovery failures should fail the deployment
        const failOnError = appDefinition.aws?.discovery?.failOnError ?? false;

        if (failOnError) {
            console.error(
                '❌ Discovery failure blocking deployment (aws.discovery.failOnError = true)'
            );
            throw error;
        }

        // Graceful degradation - return empty resources and let validation handle it
        console.warn(
            '⚠️  Continuing with empty discovered resources. This may cause deployment issues if resources are required.'
        );
        console.warn(
            '💡 Set aws.discovery.failOnError = true in AppDefinition to fail on discovery errors.'
        );
        return {};
    }
}

module.exports = {
    shouldRunDiscovery,
    gatherDiscoveredResources,
};

