/**
 * CloudFormation-based Resource Discovery
 * 
 * Domain Service - Hexagonal Architecture
 * 
 * Discovers resources from existing CloudFormation stacks as the primary
 * source of truth before falling back to direct AWS API discovery.
 * 
 * Benefits:
 * - Faster discovery (1 CF call vs multiple AWS API calls)
 * - More accurate (stack is source of truth)
 * - Eliminates tagging dependencies
 * - Idempotent (discover mode reuses stack resources)
 */

class CloudFormationDiscovery {
    constructor(provider) {
        this.provider = provider;
    }

    /**
     * Discover resources from an existing CloudFormation stack
     * 
     * @param {string} stackName - Name of the CloudFormation stack
     * @returns {Promise<Object|null>} Discovered resources or null if stack doesn't exist
     */
    async discoverFromStack(stackName) {
        try {
            // Try to get the stack
            const stack = await this.provider.describeStack(stackName);
            
            // Get stack resources
            const resources = await this.provider.listStackResources(stackName);

            // Extract discovered resources from outputs and resources
            const discovered = {};

            // Extract from outputs
            if (stack.Outputs && stack.Outputs.length > 0) {
                this._extractFromOutputs(stack.Outputs, discovered);
            }

            // Extract from resources
            if (resources && resources.length > 0) {
                this._extractFromResources(resources, discovered);
            }

            return discovered;
        } catch (error) {
            // Stack doesn't exist - return null to trigger fallback discovery
            if (error.message && error.message.includes('does not exist')) {
                return null;
            }
            
            // Other errors - log and return null
            console.warn(`⚠️  CloudFormation discovery failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract discovered resources from CloudFormation stack outputs
     * 
     * @private
     * @param {Array} outputs - CloudFormation stack outputs
     * @param {Object} discovered - Object to populate with discovered resources
     */
    _extractFromOutputs(outputs, discovered) {
        const outputMap = outputs.reduce((acc, output) => {
            acc[output.OutputKey] = output.OutputValue;
            return acc;
        }, {});

        // VPC outputs
        if (outputMap.VpcId) {
            discovered.vpcId = outputMap.VpcId;
        }
        
        if (outputMap.PrivateSubnetIds) {
            // Handle comma-separated subnet IDs
            discovered.privateSubnetIds = outputMap.PrivateSubnetIds.split(',').map(id => id.trim());
        }
        
        if (outputMap.PublicSubnetId) {
            discovered.publicSubnetId = outputMap.PublicSubnetId;
        }
        
        if (outputMap.SecurityGroupId) {
            discovered.securityGroupId = outputMap.SecurityGroupId;
        }

        // KMS outputs
        if (outputMap.KMS_KEY_ARN) {
            discovered.defaultKmsKeyId = outputMap.KMS_KEY_ARN;
        }

        // Database outputs (if exposed)
        if (outputMap.DatabaseEndpoint) {
            discovered.databaseEndpoint = outputMap.DatabaseEndpoint;
        }
    }

    /**
     * Extract discovered resources from CloudFormation stack resources
     * 
     * @private
     * @param {Array} resources - CloudFormation stack resources
     * @param {Object} discovered - Object to populate with discovered resources
     */
    _extractFromResources(resources, discovered) {
        for (const resource of resources) {
            const { LogicalResourceId, PhysicalResourceId, ResourceType } = resource;

            // Aurora cluster
            if (LogicalResourceId === 'FriggAuroraCluster' && ResourceType === 'AWS::RDS::DBCluster') {
                discovered.auroraClusterId = PhysicalResourceId;
            }

            // Migration status bucket
            if (LogicalResourceId === 'FriggMigrationStatusBucket' && ResourceType === 'AWS::S3::Bucket') {
                discovered.migrationStatusBucket = PhysicalResourceId;
            }

            // Migration queue
            if (LogicalResourceId === 'DbMigrationQueue' && ResourceType === 'AWS::SQS::Queue') {
                discovered.migrationQueueUrl = PhysicalResourceId;
            }

            // NAT Gateway
            if (LogicalResourceId === 'FriggNatGateway' && ResourceType === 'AWS::EC2::NatGateway') {
                discovered.natGatewayId = PhysicalResourceId;
            }

            // KMS Key (alternative to output)
            if (LogicalResourceId === 'FriggKMSKey' && ResourceType === 'AWS::KMS::Key') {
                // Note: For KMS, we prefer the ARN from outputs, but this is a fallback
                if (!discovered.defaultKmsKeyId) {
                    discovered.defaultKmsKeyId = PhysicalResourceId;
                }
            }
        }
    }
}

module.exports = { CloudFormationDiscovery };

