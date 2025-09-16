const fs = require('fs');
const path = require('path');
let AWSDiscovery;

function loadAWSDiscovery() {
    if (!AWSDiscovery) {
        ({ AWSDiscovery } = require('./aws-discovery'));
    }
}

/**
 * Build-time AWS resource discovery and configuration injection
 * This utility runs during the build process to discover AWS resources
 * and inject them into the serverless configuration
 */
class BuildTimeDiscovery {
    /**
     * Creates an instance of BuildTimeDiscovery
     * @param {string} [region=process.env.AWS_REGION || 'us-east-1'] - AWS region for discovery
     */
    constructor(region = process.env.AWS_REGION || 'us-east-1') {
        loadAWSDiscovery();
        this.region = region;
        this.discovery = new AWSDiscovery(region);
    }

    /**
     * Discover AWS resources and create a configuration file
     * @param {string} [outputPath='./aws-discovery-config.json'] - Path to write the configuration file
     * @returns {Promise<Object>} Configuration object containing discovered resources
     * @throws {Error} If AWS resource discovery fails
     */
    async discoverAndCreateConfig(outputPath = './aws-discovery-config.json') {
        try {
            console.log('Starting AWS resource discovery for build...');
            
            const resources = await this.discovery.discoverResources();
            
            // Create configuration object
            const config = {
                awsDiscovery: resources,
                generatedAt: new Date().toISOString(),
                region: this.region
            };
            
            // Write configuration to file
            fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
            console.log(`AWS discovery configuration written to: ${outputPath}`);
            
            return config;
        } catch (error) {
            console.error('Error during AWS resource discovery:', error.message);
            throw error;
        }
    }

    /**
     * Replace placeholders in serverless template with discovered values
     * @param {string} templateContent - The template content with placeholders
     * @param {Object} discoveredResources - Object containing discovered AWS resource IDs
     * @returns {string} Updated template content with placeholders replaced
     */
    replaceTemplateVariables(templateContent, discoveredResources) {
        let updatedContent = templateContent;
        
        // Replace AWS discovery placeholders
        const replacements = {
            '${self:custom.awsDiscovery.defaultVpcId}': discoveredResources.defaultVpcId,
            '${self:custom.awsDiscovery.defaultSecurityGroupId}': discoveredResources.defaultSecurityGroupId,
            '${self:custom.awsDiscovery.privateSubnetId1}': discoveredResources.privateSubnetId1,
            '${self:custom.awsDiscovery.privateSubnetId2}': discoveredResources.privateSubnetId2,
            '${self:custom.awsDiscovery.privateRouteTableId}': discoveredResources.privateRouteTableId,
            '${self:custom.awsDiscovery.defaultKmsKeyId}': discoveredResources.defaultKmsKeyId
        };
        
        for (const [placeholder, value] of Object.entries(replacements)) {
            // Use a more targeted replacement to avoid replacing similar strings
            updatedContent = updatedContent.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        }
        
        return updatedContent;
    }

    /**
     * Process serverless configuration and inject discovered resources
     * @param {string} configPath - Path to the serverless configuration file
     * @param {string} [outputPath=null] - Output path for updated config (defaults to overwriting original)
     * @returns {Promise<Object>} Object containing discovered AWS resources
     * @throws {Error} If processing the serverless configuration fails
     */
    async processServerlessConfig(configPath, outputPath = null) {
        try {
            console.log(`Processing serverless configuration: ${configPath}`);
            
            // Read the current serverless configuration
            const configContent = fs.readFileSync(configPath, 'utf8');
            
            // Discover AWS resources
            const resources = await this.discovery.discoverResources();
            
            // Replace placeholders with discovered values
            const updatedContent = this.replaceTemplateVariables(configContent, resources);
            
            // Write to output file or overwrite original
            const finalPath = outputPath || configPath;
            fs.writeFileSync(finalPath, updatedContent);
            
            console.log(`Updated serverless configuration written to: ${finalPath}`);
            
            return resources;
        } catch (error) {
            console.error('Error processing serverless configuration:', error.message);
            throw error;
        }
    }

    /**
     * Generate a custom serverless configuration section for discovered resources
     * @param {Object} discoveredResources - Object containing discovered AWS resource IDs
     * @returns {Object} Custom section object for serverless configuration
     */
    generateCustomSection(discoveredResources) {
        return {
            awsDiscovery: discoveredResources
        };
    }

    /**
     * Pre-build hook to discover resources and prepare configuration
     * @param {Object} appDefinition - Application definition object
     * @param {string} region - AWS region for discovery
     * @returns {Promise<Object|null>} Discovered resources or null if discovery not needed
     * @throws {Error} If pre-build AWS discovery fails
     */
    async preBuildHook(appDefinition, region) {
        try {
            console.log('Running pre-build AWS discovery hook...');
            
            // Only run discovery if VPC, KMS, or SSM features are enabled
            const needsDiscovery = appDefinition.vpc?.enable ||
                                 appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms' ||
                                 appDefinition.ssm?.enable;
            
            if (!needsDiscovery) {
                console.log('No AWS discovery needed based on app definition');
                return null;
            }
            
            // Create discovery instance with specified region
            loadAWSDiscovery();
            const discovery = new AWSDiscovery(region);
            const resources = await discovery.discoverResources();
            
            // Create environment variables for serverless
            const envVars = {
                AWS_DISCOVERY_VPC_ID: resources.defaultVpcId,
                AWS_DISCOVERY_SECURITY_GROUP_ID: resources.defaultSecurityGroupId,
                AWS_DISCOVERY_SUBNET_ID_1: resources.privateSubnetId1,
                AWS_DISCOVERY_SUBNET_ID_2: resources.privateSubnetId2,
                AWS_DISCOVERY_PUBLIC_SUBNET_ID: resources.publicSubnetId,
                AWS_DISCOVERY_ROUTE_TABLE_ID: resources.privateRouteTableId,
                AWS_DISCOVERY_KMS_KEY_ID: resources.defaultKmsKeyId  // Keep consistent naming convention (even though it's an ARN)
            };
            
            // Set environment variables for serverless to use
            Object.assign(process.env, envVars);
            
            console.log('AWS discovery completed and environment variables set');
            return resources;
        } catch (error) {
            console.error('Error in pre-build AWS discovery hook:', error.message);
            throw error;
        }
    }
}

/**
 * CLI utility function for build-time discovery
 * @param {Object} [options={}] - Options for build-time discovery
 * @param {string} [options.region=process.env.AWS_REGION || 'us-east-1'] - AWS region
 * @param {string} [options.outputPath='./aws-discovery-config.json'] - Output path for config file
 * @param {string} [options.configPath=null] - Path to existing serverless config to process
 * @returns {Promise<Object>} Discovered AWS resources
 */
async function runBuildTimeDiscovery(options = {}) {
    const {
        region = process.env.AWS_REGION || 'us-east-1',
        outputPath = './aws-discovery-config.json',
        configPath = null
    } = options;
    
    const discovery = new BuildTimeDiscovery(region);
    
    if (configPath) {
        // Process existing serverless configuration
        return await discovery.processServerlessConfig(configPath);
    } else {
        // Just discover and create config file
        return await discovery.discoverAndCreateConfig(outputPath);
    }
}

module.exports = { 
    BuildTimeDiscovery, 
    runBuildTimeDiscovery 
};