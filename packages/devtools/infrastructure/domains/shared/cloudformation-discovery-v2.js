/**
 * CloudFormation-based Resource Discovery v2
 *
 * Refactored to return structured DiscoveryResult instead of flat object.
 * Part of the clean resource ownership architecture.
 *
 * Domain Service - Hexagonal Architecture
 */

const { createEmptyDiscoveryResult } = require('./types');

class CloudFormationDiscoveryV2 {
    constructor(provider, config = {}) {
        this.provider = provider;
        this.serviceName = config.serviceName;
        this.stage = config.stage;
    }

    /**
     * Discover resources from an existing CloudFormation stack
     *
     * @param {string} stackName - Name of the CloudFormation stack
     * @returns {Promise<Object>} DiscoveryResult or empty result if stack doesn't exist
     */
    async discoverFromStack(stackName) {
        try {
            // Try to get the stack
            const stack = await this.provider.describeStack(stackName);

            // Get stack resources
            const resources = await this.provider.listStackResources(stackName);

            // Create structured discovery result
            const discovery = createEmptyDiscoveryResult();
            discovery.fromCloudFormation = true;
            discovery.stackName = stackName;
            discovery.region = this.provider.region;

            // Extract stack-managed resources
            await this._extractStackManagedResources(resources || [], discovery);

            // Also keep flat structure for backwards compatibility (temporarily)
            const flatDiscovered = {
                fromCloudFormationStack: true,
                stackName: stackName,
                existingLogicalIds: discovery.stackManaged.map(r => r.logicalId)
            };

            // Extract from outputs (legacy)
            if (stack.Outputs && stack.Outputs.length > 0) {
                this._extractFromOutputs(stack.Outputs, flatDiscovered);
            }

            // Extract flat properties from stackManaged resources
            this._createFlatPropertiesFromStackManaged(discovery, flatDiscovered);

            // Return both structures (flat for backwards compat, structured for new code)
            return {
                ...flatDiscovered,
                _structured: discovery  // New structured format
            };
        } catch (error) {
            // Stack doesn't exist - return empty discovery
            if (error.message && error.message.includes('does not exist')) {
                const empty = createEmptyDiscoveryResult();
                return {
                    fromCloudFormationStack: false,
                    _structured: empty
                };
            }

            // Other errors - log and return empty
            console.warn(`⚠️  CloudFormation discovery failed: ${error.message}`);
            const empty = createEmptyDiscoveryResult();
            return {
                fromCloudFormationStack: false,
                _structured: empty
            };
        }
    }

    /**
     * Extract stack-managed resources into structured format
     * @private
     */
    async _extractStackManagedResources(resources, discovery) {
        console.log(`  DEBUG: Processing ${resources.length} CloudFormation resources...`);

        for (const resource of resources) {
            const { LogicalResourceId, PhysicalResourceId, ResourceType } = resource;

            // Only track Frigg-managed resources
            if (!LogicalResourceId.startsWith('Frigg') && !LogicalResourceId.includes('Migration')) {
                continue;
            }

            // Add to stack-managed list
            const stackResource = {
                logicalId: LogicalResourceId,
                physicalId: PhysicalResourceId,
                resourceType: ResourceType,
                properties: {}  // Will be populated as needed
            };

            discovery.stackManaged.push(stackResource);

            // Query AWS for detailed properties for certain resources
            await this._enrichResourceProperties(stackResource, discovery);
        }

        console.log(`  ✓ Discovered ${discovery.stackManaged.length} stack-managed resources`);
    }

    /**
     * Enrich resource properties by querying AWS APIs
     * @private
     */
    async _enrichResourceProperties(stackResource, discovery) {
        const { logicalId, physicalId, resourceType } = stackResource;

        // Security Group - query to get VPC ID
        if (logicalId === 'FriggLambdaSecurityGroup' && resourceType === 'AWS::EC2::SecurityGroup') {
            console.log(`  ✓ Found security group in stack: ${physicalId}`);

            if (this.provider && this.provider.getEC2Client) {
                try {
                    console.log(`  Querying EC2 to get VPC ID from security group...`);
                    const { DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');
                    const ec2Client = this.provider.getEC2Client();
                    const sgDetails = await ec2Client.send(
                        new DescribeSecurityGroupsCommand({
                            GroupIds: [physicalId]
                        })
                    );

                    if (sgDetails.SecurityGroups && sgDetails.SecurityGroups.length > 0) {
                        const sg = sgDetails.SecurityGroups[0];
                        stackResource.properties.VpcId = sg.VpcId;
                        console.log(`  ✓ Extracted VPC ID from security group: ${sg.VpcId}`);

                        // Also add VPC to stack-managed if not already there
                        const vpcExists = discovery.stackManaged.some(r => r.logicalId === 'FriggVPC');
                        if (!vpcExists && sg.VpcId) {
                            // Note: VPC was created by stack, just not listed in resources yet
                            // We'll add it when we encounter it, or infer it here
                        }
                    }
                } catch (error) {
                    console.warn(`  ⚠️  Could not get VPC from security group: ${error.message}`);
                }
            }
        }

        // Aurora Cluster - query to get endpoint
        if (logicalId === 'FriggAuroraCluster' && resourceType === 'AWS::RDS::DBCluster') {
            console.log(`  ✓ Found Aurora cluster in stack: ${physicalId}`);

            if (this.provider) {
                try {
                    console.log(`  Querying RDS to get Aurora endpoint...`);
                    const { DescribeDBClustersCommand, RDSClient } = require('@aws-sdk/client-rds');

                    const rdsClient = new RDSClient({ region: this.provider.region });
                    const clusterDetails = await rdsClient.send(
                        new DescribeDBClustersCommand({
                            DBClusterIdentifier: physicalId
                        })
                    );

                    if (clusterDetails.DBClusters && clusterDetails.DBClusters.length > 0) {
                        const cluster = clusterDetails.DBClusters[0];
                        stackResource.properties.Endpoint = cluster.Endpoint;
                        stackResource.properties.Port = cluster.Port;
                        stackResource.properties.DBClusterIdentifier = cluster.DBClusterIdentifier;
                        console.log(`  ✓ Extracted Aurora endpoint: ${cluster.Endpoint}:${cluster.Port}`);
                    }
                } catch (error) {
                    console.warn(`  ⚠️  Could not get endpoint from Aurora cluster: ${error.message}`);
                }
            }
        }

        // KMS Key Alias - query to get ARN
        if (logicalId === 'FriggKMSKeyAlias' && resourceType === 'AWS::KMS::Alias') {
            console.log(`  ✓ Found KMS key alias in stack: ${physicalId}`);

            if (this.provider && this.provider.describeKmsKey) {
                try {
                    console.log(`  Querying KMS for alias: ${physicalId}...`);
                    const keyMetadata = await this.provider.describeKmsKey(physicalId);

                    if (keyMetadata) {
                        stackResource.properties.KeyArn = keyMetadata.Arn;
                        console.log(`  ✓ Found KMS key via alias query: ${keyMetadata.Arn}`);
                    }
                } catch (error) {
                    console.warn(`  ⚠️  Could not get key ARN from alias: ${error.message}`);
                }
            }
        }

        // VPC - just log
        if (logicalId === 'FriggVPC' && resourceType === 'AWS::EC2::VPC') {
            console.log(`  ✓ Found VPC in stack: ${physicalId}`);
        }
    }

    /**
     * Create flat properties from stack-managed resources (backwards compatibility)
     * @private
     */
    _createFlatPropertiesFromStackManaged(discovery, flatDiscovered) {
        for (const resource of discovery.stackManaged) {
            const { logicalId, physicalId, properties } = resource;

            // Map to flat property names
            switch (logicalId) {
                case 'FriggVPC':
                    flatDiscovered.defaultVpcId = physicalId;
                    break;
                case 'FriggLambdaSecurityGroup':
                    flatDiscovered.securityGroupId = physicalId;
                    if (properties.VpcId) {
                        flatDiscovered.defaultVpcId = properties.VpcId;
                    }
                    break;
                case 'FriggPrivateSubnet1':
                    flatDiscovered.privateSubnetId1 = physicalId;
                    break;
                case 'FriggPrivateSubnet2':
                    flatDiscovered.privateSubnetId2 = physicalId;
                    break;
                case 'FriggPublicSubnet':
                    flatDiscovered.publicSubnetId1 = physicalId;
                    break;
                case 'FriggPublicSubnet2':
                    flatDiscovered.publicSubnetId2 = physicalId;
                    break;
                case 'FriggNatGateway':
                    flatDiscovered.natGatewayId = physicalId;
                    break;
                case 'FriggLambdaRouteTable':
                    flatDiscovered.routeTableId = physicalId;
                    break;
                case 'FriggVPCEndpointSecurityGroup':
                    flatDiscovered.vpcEndpointSecurityGroupId = physicalId;
                    break;
                case 'FriggS3VPCEndpoint':
                    flatDiscovered.s3VpcEndpointId = physicalId;
                    break;
                case 'FriggDynamoDBVPCEndpoint':
                    flatDiscovered.dynamoDbVpcEndpointId = physicalId;
                    break;
                case 'FriggKMSVPCEndpoint':
                    flatDiscovered.kmsVpcEndpointId = physicalId;
                    break;
                case 'FriggSecretsManagerVPCEndpoint':
                    flatDiscovered.secretsManagerVpcEndpointId = physicalId;
                    break;
                case 'FriggSQSVPCEndpoint':
                    flatDiscovered.sqsVpcEndpointId = physicalId;
                    break;
                case 'FriggAuroraCluster':
                    flatDiscovered.auroraClusterId = physicalId;
                    if (properties.Endpoint) {
                        flatDiscovered.auroraClusterEndpoint = properties.Endpoint;
                    }
                    if (properties.Port) {
                        flatDiscovered.auroraClusterPort = properties.Port;
                        flatDiscovered.auroraPort = properties.Port;
                    }
                    if (properties.DBClusterIdentifier) {
                        flatDiscovered.auroraClusterIdentifier = properties.DBClusterIdentifier;
                    }
                    break;
                case 'FriggKMSKey':
                    flatDiscovered.defaultKmsKeyId = physicalId;
                    break;
                case 'FriggKMSKeyAlias':
                    flatDiscovered.kmsKeyAlias = physicalId;
                    if (properties.KeyArn) {
                        flatDiscovered.defaultKmsKeyId = properties.KeyArn;
                    }
                    break;
                case 'FriggMigrationStatusBucket':
                    flatDiscovered.migrationStatusBucket = physicalId;
                    break;
                case 'DbMigrationQueue':
                    flatDiscovered.migrationQueueUrl = physicalId;
                    break;
            }
        }
    }

    /**
     * Extract discovered resources from CloudFormation stack outputs (legacy)
     * @private
     */
    _extractFromOutputs(outputs, discovered) {
        const outputMap = outputs.reduce((acc, output) => {
            acc[output.OutputKey] = output.OutputValue;
            return acc;
        }, {});

        // VPC outputs
        if (outputMap.VpcId) {
            discovered.defaultVpcId = outputMap.VpcId;
        }

        if (outputMap.PrivateSubnetIds) {
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

        // Database outputs
        if (outputMap.DatabaseEndpoint) {
            discovered.databaseEndpoint = outputMap.DatabaseEndpoint;
        }
    }
}

module.exports = CloudFormationDiscoveryV2;
