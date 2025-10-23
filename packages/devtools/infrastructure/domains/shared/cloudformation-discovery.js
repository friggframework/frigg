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

            // Extract from resources (now async to query AWS for details)
            if (resources && resources.length > 0) {
                await this._extractFromResources(resources, discovered);
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
            discovered.defaultVpcId = outputMap.VpcId; // VpcBuilder expects 'defaultVpcId'
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
    async _extractFromResources(resources, discovered) {
        console.log(`  DEBUG: Processing ${resources.length} CloudFormation resources...`);
        for (const resource of resources) {
            const { LogicalResourceId, PhysicalResourceId, ResourceType } = resource;

            // Debug Aurora detection
            if (LogicalResourceId.includes('Aurora')) {
                console.log(`  DEBUG: Found Aurora resource: ${LogicalResourceId} (${ResourceType})`);
            }

            // Security Group - use to get VPC ID
            if (LogicalResourceId === 'FriggLambdaSecurityGroup' && ResourceType === 'AWS::EC2::SecurityGroup') {
                discovered.securityGroupId = PhysicalResourceId;
                console.log(`  ✓ Found security group in stack: ${PhysicalResourceId}`);
                // Query security group to get VPC ID
                if (this.provider && !discovered.defaultVpcId) {
                    try {
                        console.log(`  Querying security group to get VPC ID...`);
                        const { DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');
                        const sgDetails = await this.provider.getEC2Client().send(
                            new DescribeSecurityGroupsCommand({
                                GroupIds: [PhysicalResourceId]
                            })
                        );
                        if (sgDetails.SecurityGroups && sgDetails.SecurityGroups.length > 0) {
                            discovered.defaultVpcId = sgDetails.SecurityGroups[0].VpcId; // VpcBuilder expects 'defaultVpcId'
                            console.log(`  ✓ Extracted VPC ID from security group: ${discovered.defaultVpcId}`);
                        } else {
                            console.warn(`  ⚠️  Security group query returned no results`);
                        }
                    } catch (error) {
                        console.warn(`  ⚠️  Could not get VPC from security group: ${error.message}`);
                    }
                }
            }

            // Aurora cluster - query AWS to get endpoint details
            if (LogicalResourceId === 'FriggAuroraCluster' && ResourceType === 'AWS::RDS::DBCluster') {
                discovered.auroraClusterId = PhysicalResourceId;
                console.log(`  ✓ Found Aurora cluster in stack: ${PhysicalResourceId}`);

                // Query RDS to get cluster endpoint
                if (this.provider && !discovered.auroraClusterEndpoint) {
                    try {
                        console.log(`  Querying RDS to get Aurora endpoint...`);
                        const { DescribeDBClustersCommand } = require('@aws-sdk/client-rds');
                        const { RDSClient } = require('@aws-sdk/client-rds');

                        const rdsClient = new RDSClient({ region: this.provider.region });
                        const clusterDetails = await rdsClient.send(
                            new DescribeDBClustersCommand({
                                DBClusterIdentifier: PhysicalResourceId
                            })
                        );

                        if (clusterDetails.DBClusters && clusterDetails.DBClusters.length > 0) {
                            const cluster = clusterDetails.DBClusters[0];
                            discovered.auroraClusterEndpoint = cluster.Endpoint;
                            discovered.auroraClusterPort = cluster.Port;
                            discovered.auroraClusterIdentifier = cluster.DBClusterIdentifier;
                            console.log(`  ✓ Extracted Aurora endpoint: ${cluster.Endpoint}:${cluster.Port}`);
                        } else {
                            console.warn(`  ⚠️  RDS cluster query returned no results`);
                        }
                    } catch (error) {
                        console.warn(`  ⚠️  Could not get endpoint from Aurora cluster: ${error.message}`);
                    }
                }
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

            // Subnets
            if (LogicalResourceId === 'FriggPrivateSubnet1' && ResourceType === 'AWS::EC2::Subnet') {
                discovered.privateSubnetId1 = PhysicalResourceId;
            }
            if (LogicalResourceId === 'FriggPrivateSubnet2' && ResourceType === 'AWS::EC2::Subnet') {
                discovered.privateSubnetId2 = PhysicalResourceId;
            }
            if (LogicalResourceId === 'FriggPublicSubnet' && ResourceType === 'AWS::EC2::Subnet') {
                discovered.publicSubnetId1 = PhysicalResourceId;
            }
            if (LogicalResourceId === 'FriggPublicSubnet2' && ResourceType === 'AWS::EC2::Subnet') {
                discovered.publicSubnetId2 = PhysicalResourceId;
            }

            // Route Tables
            if (LogicalResourceId === 'FriggLambdaRouteTable' && ResourceType === 'AWS::EC2::RouteTable') {
                discovered.routeTableId = PhysicalResourceId;
            }

            // VPC Endpoint Security Group
            if (LogicalResourceId === 'FriggVPCEndpointSecurityGroup' && ResourceType === 'AWS::EC2::SecurityGroup') {
                discovered.vpcEndpointSecurityGroupId = PhysicalResourceId;
            }

            // VPC Endpoints
            if (LogicalResourceId === 'FriggS3VPCEndpoint' && ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.s3VpcEndpointId = PhysicalResourceId;
            }
            if (LogicalResourceId === 'FriggDynamoDBVPCEndpoint' && ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.dynamoDbVpcEndpointId = PhysicalResourceId;
            }
            if (LogicalResourceId === 'FriggKMSVPCEndpoint' && ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.kmsVpcEndpointId = PhysicalResourceId;
            }
            if (LogicalResourceId === 'FriggSecretsManagerVPCEndpoint' && ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.secretsManagerVpcEndpointId = PhysicalResourceId;
            }
            if (LogicalResourceId === 'FriggSQSVPCEndpoint' && ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.sqsVpcEndpointId = PhysicalResourceId;
            }
        }

        // If we have a VPC ID but no subnet IDs, query EC2 for Frigg-managed subnets
        if (discovered.defaultVpcId && this.provider && 
            !discovered.privateSubnetId1 && !discovered.publicSubnetId1) {
            try {
                console.log('  Querying EC2 for Frigg-managed subnets...');
                const { DescribeSubnetsCommand } = require('@aws-sdk/client-ec2');
                const subnetResponse = await this.provider.getEC2Client().send(
                    new DescribeSubnetsCommand({
                        Filters: [
                            { Name: 'vpc-id', Values: [discovered.defaultVpcId] },
                            { Name: 'tag:ManagedBy', Values: ['Frigg'] },
                        ],
                    })
                );

                if (subnetResponse.Subnets && subnetResponse.Subnets.length > 0) {
                    // Extract subnet IDs by logical ID from tags
                    const subnets = subnetResponse.Subnets.map(subnet => ({
                        subnetId: subnet.SubnetId,
                        logicalId: subnet.Tags?.find(t => t.Key === 'aws:cloudformation:logical-id')?.Value,
                        isPublic: subnet.MapPublicIpOnLaunch,
                    }));

                    // Find private subnets
                    const privateSubnets = subnets.filter(s => !s.isPublic).sort((a, b) => 
                        a.logicalId?.localeCompare(b.logicalId) || 0
                    );
                    if (privateSubnets.length >= 1) {
                        discovered.privateSubnetId1 = privateSubnets[0].subnetId;
                    }
                    if (privateSubnets.length >= 2) {
                        discovered.privateSubnetId2 = privateSubnets[1].subnetId;
                    }

                    // Find public subnets
                    const publicSubnets = subnets.filter(s => s.isPublic).sort((a, b) => 
                        a.logicalId?.localeCompare(b.logicalId) || 0
                    );
                    if (publicSubnets.length >= 1) {
                        discovered.publicSubnetId1 = publicSubnets[0].subnetId;
                    }
                    if (publicSubnets.length >= 2) {
                        discovered.publicSubnetId2 = publicSubnets[1].subnetId;
                    }

                    console.log(`  ✓ Found ${subnets.length} Frigg-managed subnets via EC2 query`);
                }
            } catch (error) {
                console.warn(`  ⚠️  Could not query EC2 for subnets: ${error.message}`);
            }
        }
    }
}

module.exports = { CloudFormationDiscovery };

