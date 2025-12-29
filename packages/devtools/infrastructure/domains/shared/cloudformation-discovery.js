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
    constructor(provider, config = {}) {
        this.provider = provider;
        this.serviceName = config.serviceName;
        this.stage = config.stage;
    }

    /**
     * Discover resources from an existing CloudFormation stack
     *
     * @param {string} stackName - Name of the CloudFormation stack
     * @returns {Promise<Object|null>} Discovered resources or null if stack doesn't exist
     */
    async discoverFromStack(stackName) {
        try {
            // Store stack name for use in helper methods
            this.currentStackName = stackName;
            
            // Try to get the stack
            const stack = await this.provider.describeStack(stackName);

            // Get stack resources
            const resources = await this.provider.listStackResources(stackName);

            // Extract discovered resources from outputs and resources
            const discovered = {
                // Metadata to indicate resources came from CloudFormation stack
                fromCloudFormationStack: true,
                stackName: stackName,
                existingLogicalIds: []
            };

            // Extract from outputs
            if (stack.Outputs && stack.Outputs.length > 0) {
                this._extractFromOutputs(stack.Outputs, discovered);
            }

            // Extract from resources (now async to query AWS for details)
            // Always call this even if resources is empty, as it may query AWS for resources
            await this._extractFromResources(resources || [], discovered);

            // Clean up metadata if no resources were discovered
            if (discovered.existingLogicalIds.length === 0) {
                delete discovered.existingLogicalIds;
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
     * Extract external resource references from stack resource properties
     * 
     * When VPC/subnets/NAT are external, they're referenced in routing resources' properties.
     * We query EC2 to get the actual VPC ID, NAT Gateway ID, and subnet IDs from the route table.
     * 
     * @private
     * @param {Array} resources - CloudFormation stack resources
     * @param {Object} discovered - Object to populate with discovered resources
     */
    async _extractExternalReferencesFromStackResources(resources, discovered) {
        if (!this.provider || !this.provider.getEC2Client) {
            console.log('  ℹ Skipping external reference extraction (EC2 client not available)');
            return;
        }

        try {
            // If we found a route table in the stack, query EC2 for its details
            // This gives us VPC ID, NAT Gateway ID, and subnet IDs
            if (discovered.routeTableId) {
                try {
                    console.log(`  ℹ Querying route table ${discovered.routeTableId} for external references...`);
                    const { DescribeRouteTablesCommand } = require('@aws-sdk/client-ec2');
                    const ec2 = this.provider.getEC2Client();
                    const rtResponse = await ec2.send(new DescribeRouteTablesCommand({
                        RouteTableIds: [discovered.routeTableId]
                    }));
                    
                    if (rtResponse.RouteTables && rtResponse.RouteTables.length > 0) {
                        const routeTable = rtResponse.RouteTables[0];
                        
                        // Extract VPC ID
                        if (routeTable.VpcId && !discovered.defaultVpcId) {
                            discovered.defaultVpcId = routeTable.VpcId;
                            console.log(`  ✓ Extracted VPC ID from route table: ${routeTable.VpcId}`);
                        }
                        
                        // Extract NAT Gateway ID from routes
                        const natRoute = routeTable.Routes?.find(r => r.NatGatewayId);
                        if (natRoute && natRoute.NatGatewayId && !discovered.natGatewayId) {
                            discovered.natGatewayId = natRoute.NatGatewayId;
                            discovered.existingNatGatewayId = natRoute.NatGatewayId;
                            console.log(`  ✓ Extracted NAT Gateway ID from routes: ${natRoute.NatGatewayId}`);
                        }
                        
                        // Extract subnet IDs from route table associations
                        const associations = routeTable.Associations || [];
                        const subnetAssociations = associations.filter(a => a.SubnetId);
                        
                        
                        if (subnetAssociations.length >= 1 && !discovered.privateSubnetId1) {
                            discovered.privateSubnetId1 = subnetAssociations[0].SubnetId;
                            console.log(`  ✓ Extracted private subnet 1 from associations: ${subnetAssociations[0].SubnetId}`);
                        }
                        if (subnetAssociations.length >= 2 && !discovered.privateSubnetId2) {
                            discovered.privateSubnetId2 = subnetAssociations[1].SubnetId;
                            console.log(`  ✓ Extracted private subnet 2 from associations: ${subnetAssociations[1].SubnetId}`);
                        }

                        // Query for default security group in the VPC (matches canary behavior)
                        if (routeTable.VpcId && !discovered.defaultSecurityGroupId) {
                            try {
                                const { DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');
                                const sgResponse = await ec2.send(new DescribeSecurityGroupsCommand({
                                    Filters: [
                                        { Name: 'vpc-id', Values: [routeTable.VpcId] },
                                        { Name: 'group-name', Values: ['default'] }
                                    ]
                                }));
                                
                                if (sgResponse.SecurityGroups && sgResponse.SecurityGroups.length > 0) {
                                    discovered.defaultSecurityGroupId = sgResponse.SecurityGroups[0].GroupId;
                                    console.log(`  ✓ Extracted default security group: ${discovered.defaultSecurityGroupId}`);
                                }
                            } catch (error) {
                                console.warn(`  ⚠️  Could not query default security group: ${error.message}`);
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`  ⚠️  Could not query route table for external references: ${error.message}`);
                }
            }
        } catch (error) {
            console.warn(`  ⚠️  Error extracting external references: ${error.message}`);
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

        // Initialize existingLogicalIds array if not present
        if (!discovered.existingLogicalIds) {
            discovered.existingLogicalIds = [];
        }
        
        for (const resource of resources) {
            const { LogicalResourceId, PhysicalResourceId, ResourceType } = resource;

            // Track Frigg-managed resources by logical ID
            // Include VPC endpoints with legacy naming (VPCEndpointS3, VPCEndpointDynamoDB, etc.)
            if (LogicalResourceId.startsWith('Frigg') || 
                LogicalResourceId.includes('Migration') ||
                LogicalResourceId.startsWith('VPCEndpoint')) {
                discovered.existingLogicalIds.push(LogicalResourceId);
            }


            // Security Group - use to get VPC ID
            if (LogicalResourceId === 'FriggLambdaSecurityGroup' && ResourceType === 'AWS::EC2::SecurityGroup') {
                discovered.securityGroupId = PhysicalResourceId;
                console.log(`  ✓ Found security group in stack: ${PhysicalResourceId}`);

                // Query security group to get VPC ID (required because SG resource doesn't include VPC ID)
                if (this.provider && this.provider.getEC2Client && !discovered.defaultVpcId) {
                    try {
                        console.log(`  Querying EC2 to get VPC ID from security group...`);
                        const { DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');
                        const ec2Client = this.provider.getEC2Client();
                        const sgDetails = await ec2Client.send(
                            new DescribeSecurityGroupsCommand({
                                GroupIds: [PhysicalResourceId]
                            })
                        );

                        if (sgDetails.SecurityGroups && sgDetails.SecurityGroups.length > 0) {
                            const vpcId = sgDetails.SecurityGroups[0].VpcId;
                            discovered.defaultVpcId = vpcId;
                            console.log(`  ✓ Extracted VPC ID from security group: ${vpcId}`);
                            
                            // Now query for the default security group in this VPC
                            if (!discovered.defaultSecurityGroupId) {
                                try {
                                    console.log(`  Querying for default security group in VPC...`);
                                    const defaultSgResponse = await ec2Client.send(
                                        new DescribeSecurityGroupsCommand({
                                            Filters: [
                                                { Name: 'vpc-id', Values: [vpcId] },
                                                { Name: 'group-name', Values: ['default'] }
                                            ]
                                        })
                                    );
                                    
                                    if (defaultSgResponse.SecurityGroups && defaultSgResponse.SecurityGroups.length > 0) {
                                        discovered.defaultSecurityGroupId = defaultSgResponse.SecurityGroups[0].GroupId;
                                        console.log(`  ✓ Discovered default security group: ${discovered.defaultSecurityGroupId}`);
                                    }
                                } catch (error) {
                                    console.warn(`  ⚠️  Could not query default security group: ${error.message}`);
                                }
                            }
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

            // Route Table (Lambda route table for external VPC pattern)
            if (LogicalResourceId === 'FriggLambdaRouteTable' && ResourceType === 'AWS::EC2::RouteTable') {
                discovered.routeTableId = PhysicalResourceId;
                discovered.privateRouteTableId = PhysicalResourceId;
                console.log(`  ✓ Found route table in stack: ${PhysicalResourceId}`);
            }

            // NAT Route (proves NAT configuration exists) - support both naming patterns
            if ((LogicalResourceId === 'FriggNATRoute' || LogicalResourceId === 'FriggPrivateRoute') && 
                ResourceType === 'AWS::EC2::Route') {
                discovered.natRoute = PhysicalResourceId;
                console.log(`  ✓ Found NAT route in stack: ${LogicalResourceId}`);
            }

            // Route Table Associations (links subnets to route table)
            if (LogicalResourceId.includes('RouteAssociation') && 
                ResourceType === 'AWS::EC2::SubnetRouteTableAssociation') {
                if (!discovered.routeTableAssociations) {
                    discovered.routeTableAssociations = [];
                }
                discovered.routeTableAssociations.push(PhysicalResourceId);
                console.log(`  ✓ Found route table association: ${LogicalResourceId}`);
                
                // Store association ID to query later for subnet extraction (after loop)
                if (this.provider && this.provider.getEC2Client && 
                    (LogicalResourceId === 'FriggSubnet1RouteAssociation' || LogicalResourceId === 'FriggPrivateSubnet1RouteTableAssociation')) {
                    discovered._subnet1AssociationId = PhysicalResourceId;
                }
                if (this.provider && this.provider.getEC2Client && 
                    (LogicalResourceId === 'FriggSubnet2RouteAssociation' || LogicalResourceId === 'FriggPrivateSubnet2RouteTableAssociation')) {
                    discovered._subnet2AssociationId = PhysicalResourceId;
                }
            }

            // VPC - direct extraction (primary method)
            if (LogicalResourceId === 'FriggVPC' && ResourceType === 'AWS::EC2::VPC') {
                discovered.defaultVpcId = PhysicalResourceId;
                console.log(`  ✓ Found VPC in stack: ${PhysicalResourceId}`);
            }

            // KMS Key (alternative to output)
            if (LogicalResourceId === 'FriggKMSKey' && ResourceType === 'AWS::KMS::Key') {
                // Note: For KMS, we prefer the ARN from outputs, but this is a fallback
                if (!discovered.defaultKmsKeyId) {
                    discovered.defaultKmsKeyId = PhysicalResourceId;
                }
            }

            // KMS Key Alias - query to get the actual key ARN
            if (LogicalResourceId === 'FriggKMSKeyAlias' && ResourceType === 'AWS::KMS::Alias') {
                discovered.kmsKeyAlias = PhysicalResourceId;
                console.log(`  ✓ Found KMS key alias in stack: ${PhysicalResourceId}`);

                // Query KMS to get the key ARN that this alias points to
                // Always query even if key is already set, to ensure consistency
                if (this.provider && this.provider.describeKmsKey) {
                    try {
                        console.log(`  Querying KMS to get key ARN from alias...`);
                        const keyMetadata = await this.provider.describeKmsKey(PhysicalResourceId);

                        if (keyMetadata) {
                            discovered.defaultKmsKeyId = keyMetadata.Arn;
                            console.log(`  ✓ Extracted KMS key ARN from alias: ${discovered.defaultKmsKeyId}`);
                        } else {
                            console.warn(`  ⚠️  KMS key query returned no metadata`);
                        }
                    } catch (error) {
                        console.warn(`  ⚠️  Could not get key ARN from alias: ${error.message}`);
                    }
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
                console.log(`  ✓ Found VPC endpoint security group in stack: ${PhysicalResourceId}`);
            }
            
            // Lambda Security Group (if created in stack)
            if (LogicalResourceId === 'FriggLambdaSecurityGroup' && ResourceType === 'AWS::EC2::SecurityGroup') {
                discovered.lambdaSecurityGroupId = PhysicalResourceId;
                // DO NOT overwrite defaultSecurityGroupId - that should only be the VPC's default SG
                console.log(`  ✓ Found Lambda security group in stack: ${PhysicalResourceId}`);
            }

            // VPC Endpoints - support both old and new naming conventions
            // Initialize vpcEndpoints object for structured access
            if (!discovered.vpcEndpoints) {
                discovered.vpcEndpoints = {};
            }

            // S3 Endpoint (both naming patterns)
            if ((LogicalResourceId === 'FriggS3VPCEndpoint' || LogicalResourceId === 'VPCEndpointS3') && 
                ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.s3VpcEndpointId = PhysicalResourceId;
                discovered.vpcEndpoints.s3 = PhysicalResourceId;
                console.log(`  ✓ Found S3 VPC endpoint in stack: ${PhysicalResourceId}`);
            }
            
            // DynamoDB Endpoint (both naming patterns)
            if ((LogicalResourceId === 'FriggDynamoDBVPCEndpoint' || LogicalResourceId === 'VPCEndpointDynamoDB') && 
                ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.dynamodbVpcEndpointId = PhysicalResourceId; // Note: all lowercase for consistency
                discovered.vpcEndpoints.dynamodb = PhysicalResourceId;
                console.log(`  ✓ Found DynamoDB VPC endpoint in stack: ${PhysicalResourceId}`);
            }
            
            // KMS Endpoint (both naming patterns)
            if ((LogicalResourceId === 'FriggKMSVPCEndpoint' || LogicalResourceId === 'VPCEndpointKMS') && 
                ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.kmsVpcEndpointId = PhysicalResourceId;
                discovered.vpcEndpoints.kms = PhysicalResourceId;
                console.log(`  ✓ Found KMS VPC endpoint in stack: ${PhysicalResourceId}`);
            }
            
            // Secrets Manager Endpoint
            if (LogicalResourceId === 'FriggSecretsManagerVPCEndpoint' && ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.secretsManagerVpcEndpointId = PhysicalResourceId;
                discovered.vpcEndpoints.secretsManager = PhysicalResourceId;
            }
            
            // SQS Endpoint
            if (LogicalResourceId === 'FriggSQSVPCEndpoint' && ResourceType === 'AWS::EC2::VPCEndpoint') {
                discovered.sqsVpcEndpointId = PhysicalResourceId;
                discovered.vpcEndpoints.sqs = PhysicalResourceId;
            }
        }

        // Extract VPC ID and other external references from routing resource properties
        // This handles the pattern where VPC is external but routing is in the stack
        await this._extractExternalReferencesFromStackResources(resources, discovered);

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

        // If we have VPC and route table but no subnets, query VPC for all subnets and filter by route table
        // This approach queries by VPC ID (vpc-id filter) and route table ID (RouteTableIds parameter)
        // Handles edge case where route table Associations array is empty in DescribeRouteTables response
        if (discovered.defaultVpcId && !discovered.privateSubnetId1 && 
            discovered.routeTableId && this.provider && this.provider.getEC2Client) {
            try {
                console.log(`  Querying ALL subnets in VPC ${discovered.defaultVpcId}...`);
                const { DescribeSubnetsCommand } = require('@aws-sdk/client-ec2');
                const ec2 = this.provider.getEC2Client();
                
                const subnetsResponse = await ec2.send(new DescribeSubnetsCommand({
                    Filters: [{ Name: 'vpc-id', Values: [discovered.defaultVpcId] }]
                }));
                
                console.log(`  Found ${subnetsResponse.Subnets?.length || 0} total subnets in VPC`);
                
                if (subnetsResponse.Subnets && subnetsResponse.Subnets.length > 0) {
                    // Get route table to find associated subnets
                    const { DescribeRouteTablesCommand } = require('@aws-sdk/client-ec2');
                    const rtResponse = await ec2.send(new DescribeRouteTablesCommand({
                        RouteTableIds: [discovered.routeTableId]
                    }));
                    
                    if (rtResponse.RouteTables && rtResponse.RouteTables[0]) {
                        const associations = rtResponse.RouteTables[0].Associations || [];
                        const associatedSubnetIds = associations
                            .filter(a => a.SubnetId)
                            .map(a => a.SubnetId);
                        
                        console.log(`  Route table has ${associatedSubnetIds.length} associated subnets: ${associatedSubnetIds.join(', ')}`);
                        
                        // Use the associated subnets if available
                        if (associatedSubnetIds.length >= 2) {
                            discovered.privateSubnetId1 = associatedSubnetIds[0];
                            discovered.privateSubnetId2 = associatedSubnetIds[1];
                            console.log(`  ✓ Extracted subnets from route table associations: ${discovered.privateSubnetId1}, ${discovered.privateSubnetId2}`);
                        } else if (associatedSubnetIds.length === 1) {
                            // Only 1 associated subnet, use another subnet from VPC as backup
                            discovered.privateSubnetId1 = associatedSubnetIds[0];
                            discovered.privateSubnetId2 = subnetsResponse.Subnets.find(s => s.SubnetId !== associatedSubnetIds[0])?.SubnetId;
                            console.log(`  ✓ Extracted subnets (1 from route table, 1 fallback): ${discovered.privateSubnetId1}, ${discovered.privateSubnetId2}`);
                        } else if (subnetsResponse.Subnets.length >= 2) {
                            // Edge case: route table Associations array is empty even when queried by ID
                            // This can happen when associations exist in CloudFormation but AWS API doesn't return them
                            // Fallback: Use first 2 subnets from VPC (all subnets in same VPC should work)
                            discovered.privateSubnetId1 = subnetsResponse.Subnets[0].SubnetId;
                            discovered.privateSubnetId2 = subnetsResponse.Subnets[1].SubnetId;
                            console.log(`  ✓ Using first 2 subnets from VPC (route table Associations empty): ${discovered.privateSubnetId1}, ${discovered.privateSubnetId2}`);
                        }
                    }
                }
            } catch (error) {
                console.warn(`  ⚠️  Could not query subnets from VPC: ${error.message}`);
            }
        }
        
        // FALLBACK: Extract subnet IDs from route table associations (if VPC query didn't work)
        if (!discovered.privateSubnetId1 && discovered._subnet1AssociationId && this.provider && this.provider.getEC2Client) {
            try {
                console.log(`  Querying EC2 for subnet from association ${discovered._subnet1AssociationId}...`);
                const { DescribeRouteTablesCommand } = require('@aws-sdk/client-ec2');
                const ec2 = this.provider.getEC2Client();
                
                // Query route table by association ID to get subnet
                const rtResponse = await ec2.send(new DescribeRouteTablesCommand({
                    Filters: [
                        { Name: 'association.route-table-association-id', Values: [discovered._subnet1AssociationId] }
                    ]
                }));
                
                if (rtResponse.RouteTables && rtResponse.RouteTables[0]) {
                    const assoc = rtResponse.RouteTables[0].Associations.find(a => 
                        a.RouteTableAssociationId === discovered._subnet1AssociationId
                    );
                    if (assoc && assoc.SubnetId) {
                        discovered.privateSubnetId1 = assoc.SubnetId;
                        console.log(`  ✓ Extracted private subnet 1 from association query: ${assoc.SubnetId}`);
                    }
                }
            } catch (error) {
                console.warn(`  ⚠️  Could not query subnet from association: ${error.message}`);
            }
        }

        if (!discovered.privateSubnetId2 && discovered._subnet2AssociationId && this.provider && this.provider.getEC2Client) {
            try {
                const { DescribeRouteTablesCommand } = require('@aws-sdk/client-ec2');
                const ec2 = this.provider.getEC2Client();
                
                const rtResponse = await ec2.send(new DescribeRouteTablesCommand({
                    Filters: [
                        { Name: 'association.route-table-association-id', Values: [discovered._subnet2AssociationId] }
                    ]
                }));
                
                if (rtResponse.RouteTables && rtResponse.RouteTables[0]) {
                    const assoc = rtResponse.RouteTables[0].Associations.find(a => 
                        a.RouteTableAssociationId === discovered._subnet2AssociationId
                    );
                    if (assoc && assoc.SubnetId) {
                        discovered.privateSubnetId2 = assoc.SubnetId;
                        console.log(`  ✓ Extracted private subnet 2 from association query: ${assoc.SubnetId}`);
                    }
                }
            } catch (error) {
                console.warn(`  ⚠️  Could not query subnet from association: ${error.message}`);
            }
        }

        // Clean up temporary association IDs
        delete discovered._subnet1AssociationId;
        delete discovered._subnet2AssociationId;

        // Check for KMS key alias via AWS API if not found in stack resources
        // This handles cases where the alias was created outside CloudFormation
        if (!discovered.defaultKmsKeyId && !discovered.kmsKeyAlias &&
            this.provider && this.provider.describeKmsKey && this.serviceName && this.stage) {
            try {
                const aliasName = `alias/${this.serviceName}-${this.stage}-frigg-kms`;
                console.log(`  Querying KMS for alias: ${aliasName}...`);

                const keyMetadata = await this.provider.describeKmsKey(aliasName);

                if (keyMetadata) {
                    discovered.defaultKmsKeyId = keyMetadata.Arn;
                    discovered.kmsKeyAlias = aliasName;
                    console.log(`  ✓ Found KMS key via alias query: ${discovered.defaultKmsKeyId}`);
                }
            } catch (error) {
                // Alias not found - this is expected if no KMS key exists yet
                console.log(`  ℹ No KMS key alias found via AWS API`);
            }
        }
    }
}

module.exports = { CloudFormationDiscovery };

