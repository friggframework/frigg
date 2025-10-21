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
 * @param {Object} appDefinition - Application definition
 * @returns {boolean} True if discovery is needed
 */
function shouldRunDiscovery(appDefinition) {
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

        // Try CloudFormation-first discovery
        const cfDiscovery = new CloudFormationDiscovery(provider);
        const stackResources = await cfDiscovery.discoverFromStack(stackName);

        // Validate CF discovery results - only use if contains useful data
        const hasVpcData = stackResources?.defaultVpcId;
        const hasKmsData = stackResources?.defaultKmsKeyId;
        const hasAuroraData = stackResources?.auroraClusterId;
        const hasSomeUsefulData = hasVpcData || hasKmsData || hasAuroraData;

        if (stackResources && hasSomeUsefulData) {
            console.log('  ✓ Discovered resources from existing CloudFormation stack');
            console.log('✅ Cloud resource discovery completed successfully!');
            return stackResources;
        }

        // In isolated mode, ONLY use CloudFormation discovery for VPC/Aurora
        // But still discover KMS (encryption keys can be safely shared across stages)
        if (appDefinition.managementMode === 'managed' && appDefinition.vpcIsolation === 'isolated') {
            console.log('  ℹ Isolated mode: discovering KMS (shareable) but not VPC/Aurora (isolated)');
            
            // Still run KMS discovery - encryption keys are safe to share
            const kmsDiscovery = new KmsDiscovery(provider);
            const kmsResult = await kmsDiscovery.discover();
            
            if (kmsResult?.defaultKmsKeyId) {
                console.log('  ✓ Found shared KMS key (can be reused across stages)');
                console.log('✅ Cloud resource discovery completed successfully!');
                return kmsResult;
            }
            
            console.log('  ℹ No existing resources found - will create fresh infrastructure');
            console.log('✅ Cloud resource discovery completed successfully!');
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

        // Don't fail the build - return empty resources and let validation handle it
        console.warn(
            '⚠️  Continuing with empty discovered resources. This may cause deployment issues if resources are required.'
        );
        return {};
    }
}

module.exports = {
    shouldRunDiscovery,
    gatherDiscoveredResources,
};

