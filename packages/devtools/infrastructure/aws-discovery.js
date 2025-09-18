let EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeRouteTablesCommand, DescribeNatGatewaysCommand, DescribeAddressesCommand, DescribeInternetGatewaysCommand;
let KMSClient, ListKeysCommand, DescribeKeyCommand;
let STSClient, GetCallerIdentityCommand;

function loadEC2() {
    if (!EC2Client) {
        ({ EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeRouteTablesCommand, DescribeNatGatewaysCommand, DescribeAddressesCommand, DescribeInternetGatewaysCommand } = require('@aws-sdk/client-ec2'));
    }
}

function loadKMS() {
    if (!KMSClient) {
        ({ KMSClient, ListKeysCommand, DescribeKeyCommand } = require('@aws-sdk/client-kms'));
    }
}

function loadSTS() {
    if (!STSClient) {
        ({ STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts'));
    }
}

/**
 * AWS Resource Discovery utilities for Frigg applications
 * These functions use AWS credentials to discover default resources during build time
 */
class AWSDiscovery {
    /**
     * Creates an instance of AWSDiscovery
     * @param {string} [region='us-east-1'] - AWS region to use for discovery
     */
    constructor(region = 'us-east-1') {
        this.region = region;
        loadEC2();
        loadKMS();
        loadSTS();
        this.ec2Client = new EC2Client({ region });
        this.kmsClient = new KMSClient({ region });
        this.stsClient = new STSClient({ region });
    }

    /**
     * Get AWS account ID
     * @returns {Promise<string>} The AWS account ID
     * @throws {Error} If unable to retrieve account ID
     */
    async getAccountId() {
        try {
            const command = new GetCallerIdentityCommand({});
            const response = await this.stsClient.send(command);
            return response.Account;
        } catch (error) {
            console.error('Error getting AWS account ID:', error.message);
            throw error;
        }
    }

    /**
     * Find the default VPC for the account
     * @returns {Promise<Object>} VPC object containing VpcId and other properties
     * @throws {Error} If no VPC is found in the account
     */
    async findDefaultVpc() {
        try {
            const command = new DescribeVpcsCommand({
                Filters: [
                    {
                        Name: 'is-default',
                        Values: ['true']
                    }
                ]
            });
            
            const response = await this.ec2Client.send(command);
            
            if (response.Vpcs && response.Vpcs.length > 0) {
                return response.Vpcs[0];
            }
            
            // If no default VPC, get the first available VPC
            const allVpcsCommand = new DescribeVpcsCommand({});
            const allVpcsResponse = await this.ec2Client.send(allVpcsCommand);
            
            if (allVpcsResponse.Vpcs && allVpcsResponse.Vpcs.length > 0) {
                console.log('No default VPC found, using first available VPC');
                return allVpcsResponse.Vpcs[0];
            }
            
            throw new Error('No VPC found in the account');
        } catch (error) {
            console.error('Error finding default VPC:', error.message);
            throw error;
        }
    }

    /**
     * Find private subnets for the given VPC
     * @param {string} vpcId - The VPC ID to search within
     * @returns {Promise<Array>} Array of subnet objects (at least 2 for high availability)
     * @throws {Error} If no subnets are found in the VPC
     */
    async findPrivateSubnets(vpcId) {
        try {
            const command = new DescribeSubnetsCommand({
                Filters: [
                    {
                        Name: 'vpc-id',
                        Values: [vpcId]
                    }
                ]
            });
            
            const response = await this.ec2Client.send(command);
            
            if (!response.Subnets || response.Subnets.length === 0) {
                throw new Error(`No subnets found in VPC ${vpcId}`);
            }

            // Prefer private subnets (no direct route to IGW)
            const privateSubnets = [];
            const publicSubnets = [];

            for (const subnet of response.Subnets) {
                // Check route tables to determine if subnet is private
                const isPrivate = await this.isSubnetPrivate(subnet.SubnetId);
                if (isPrivate) {
                    privateSubnets.push(subnet);
                } else {
                    publicSubnets.push(subnet);
                }
            }

            // Return at least 2 subnets for high availability
            const selectedSubnets = privateSubnets.length >= 2 ? 
                privateSubnets.slice(0, 2) : 
                response.Subnets.slice(0, 2);

            return selectedSubnets;
        } catch (error) {
            console.error('Error finding private subnets:', error);
            throw error;
        }
    }

    /**
     * Check if a subnet is private (no direct route to Internet Gateway)
     * @param {string} subnetId - The subnet ID to check
     * @returns {Promise<boolean>} True if subnet is private, false if public
     */
    async isSubnetPrivate(subnetId) {
        try {
            // First, get the subnet details to find its VPC
            const subnetCommand = new DescribeSubnetsCommand({
                SubnetIds: [subnetId]
            });
            const subnetResponse = await this.ec2Client.send(subnetCommand);
            
            if (!subnetResponse.Subnets || subnetResponse.Subnets.length === 0) {
                throw new Error(`Subnet ${subnetId} not found`);
            }
            
            const subnet = subnetResponse.Subnets[0];
            const vpcId = subnet.VpcId;
            
            // Get all route tables for this VPC
            const routeTablesCommand = new DescribeRouteTablesCommand({
                Filters: [
                    {
                        Name: 'vpc-id',
                        Values: [vpcId]
                    }
                ]
            });
            
            const routeTablesResponse = await this.ec2Client.send(routeTablesCommand);
            
            // Find the route table for this subnet
            let routeTable = null;
            
            // First check for explicit association
            for (const rt of routeTablesResponse.RouteTables || []) {
                for (const assoc of rt.Associations || []) {
                    if (assoc.SubnetId === subnetId) {
                        routeTable = rt;
                        break;
                    }
                }
                if (routeTable) break;
            }
            
            // If no explicit association, use the main route table
            if (!routeTable) {
                for (const rt of routeTablesResponse.RouteTables || []) {
                    for (const assoc of rt.Associations || []) {
                        if (assoc.Main === true) {
                            routeTable = rt;
                            break;
                        }
                    }
                    if (routeTable) break;
                }
            }
            
            if (!routeTable) {
                console.warn(`No route table found for subnet ${subnetId}`);
                return true; // Default to private for safety
            }
            
            // Check if route table has a route to an Internet Gateway
            for (const route of routeTable.Routes || []) {
                if (route.GatewayId && route.GatewayId.startsWith('igw-')) {
                    return false; // It's a public subnet
                }
            }
            
            return true; // No IGW route found, it's private
        } catch (error) {
            console.warn(`Could not determine if subnet ${subnetId} is private:`, error);
            return true; // Default to private for safety
        }
    }

    /**
     * Find or create a default security group for Lambda functions
     * @param {string} vpcId - The VPC ID to search within
     * @returns {Promise<Object>} Security group object containing GroupId and other properties
     * @throws {Error} If no security group is found for the VPC
     */
    async findDefaultSecurityGroup(vpcId) {
        try {
            // First try to find existing Frigg security group
            const friggSgCommand = new DescribeSecurityGroupsCommand({
                Filters: [
                    {
                        Name: 'vpc-id',
                        Values: [vpcId]
                    },
                    {
                        Name: 'group-name',
                        Values: ['frigg-lambda-sg']
                    }
                ]
            });
            
            const friggResponse = await this.ec2Client.send(friggSgCommand);
            if (friggResponse.SecurityGroups && friggResponse.SecurityGroups.length > 0) {
                return friggResponse.SecurityGroups[0];
            }

            // Fall back to default security group
            const defaultSgCommand = new DescribeSecurityGroupsCommand({
                Filters: [
                    {
                        Name: 'vpc-id',
                        Values: [vpcId]
                    },
                    {
                        Name: 'group-name',
                        Values: ['default']
                    }
                ]
            });
            
            const defaultResponse = await this.ec2Client.send(defaultSgCommand);
            if (defaultResponse.SecurityGroups && defaultResponse.SecurityGroups.length > 0) {
                return defaultResponse.SecurityGroups[0];
            }
            
            throw new Error(`No security group found for VPC ${vpcId}`);
        } catch (error) {
            console.error('Error finding default security group:', error);
            throw error;
        }
    }

    /**
     * Find public subnets for NAT Gateway placement
     * @param {string} vpcId - The VPC ID to search within
     * @returns {Promise<Object>} First public subnet object for NAT Gateway placement
     * @throws {Error} If no public subnets are found in the VPC
     */
    async findPublicSubnets(vpcId) {
        try {
            const command = new DescribeSubnetsCommand({
                Filters: [
                    {
                        Name: 'vpc-id',
                        Values: [vpcId]
                    }
                ]
            });

            const response = await this.ec2Client.send(command);

            if (!response.Subnets || response.Subnets.length === 0) {
                throw new Error(`No subnets found in VPC ${vpcId}`);
            }

            // Find public subnets (have direct route to IGW)
            const publicSubnets = [];

            for (const subnet of response.Subnets) {
                // Check route tables to determine if subnet is public
                const isPrivate = await this.isSubnetPrivate(subnet.SubnetId);
                if (!isPrivate) {
                    publicSubnets.push(subnet);
                }
            }

            if (publicSubnets.length === 0) {
                // If no public subnets found, we need to create one or inform the user
                console.warn(`WARNING: No public subnets found in VPC ${vpcId}`);
                console.warn('A public subnet with Internet Gateway route is required for NAT Gateway placement');
                console.warn('Please create a public subnet or use VPC endpoints instead');
                return null; // Return null instead of throwing to allow graceful handling
            }

            // Return first public subnet for NAT Gateway
            console.log(`Found ${publicSubnets.length} public subnets, using ${publicSubnets[0].SubnetId} for NAT Gateway`);
            return publicSubnets[0];
        } catch (error) {
            console.error('Error finding public subnets:', error);
            throw error;
        }
    }

    /**
     * Find private route table for VPC endpoints
     * @param {string} vpcId - The VPC ID to search within
     * @returns {Promise<Object>} Route table object containing RouteTableId and other properties
     * @throws {Error} If no route tables are found for the VPC
     */
    async findPrivateRouteTable(vpcId) {
        try {
            const command = new DescribeRouteTablesCommand({
                Filters: [
                    {
                        Name: 'vpc-id',
                        Values: [vpcId]
                    }
                ]
            });
            
            const response = await this.ec2Client.send(command);
            
            if (!response.RouteTables || response.RouteTables.length === 0) {
                throw new Error(`No route tables found for VPC ${vpcId}`);
            }

            // Find a route table that doesn't have direct IGW route (private)
            for (const routeTable of response.RouteTables) {
                let hasIgwRoute = false;
                for (const route of routeTable.Routes || []) {
                    if (route.GatewayId && route.GatewayId.startsWith('igw-')) {
                        hasIgwRoute = true;
                        break;
                    }
                }
                if (!hasIgwRoute) {
                    return routeTable;
                }
            }

            // If no private route table found, return the first one
            return response.RouteTables[0];
        } catch (error) {
            console.error('Error finding private route table:', error);
            throw error;
        }
    }

    /**
     * Find existing NAT Gateways in the VPC
     * @param {string} vpcId - The VPC ID to search within
     * @returns {Promise<Object|null>} NAT Gateway object or null if none found
     */
    async findExistingNatGateway(vpcId) {
        try {
            const command = new DescribeNatGatewaysCommand({
                Filter: [
                    {
                        Name: 'vpc-id',
                        Values: [vpcId]
                    },
                    {
                        Name: 'state',
                        Values: ['available']
                    }
                ]
            });

            const response = await this.ec2Client.send(command);

            if (response.NatGateways && response.NatGateways.length > 0) {
                // Sort NAT Gateways to prioritize Frigg-managed ones
                const sortedNatGateways = response.NatGateways.sort((a, b) => {
                    const aIsFrigg = a.Tags && a.Tags.some(tag =>
                        (tag.Key === 'ManagedBy' && tag.Value === 'Frigg') ||
                        (tag.Key === 'Name' && tag.Value.includes('frigg'))
                    );
                    const bIsFrigg = b.Tags && b.Tags.some(tag =>
                        (tag.Key === 'ManagedBy' && tag.Value === 'Frigg') ||
                        (tag.Key === 'Name' && tag.Value.includes('frigg'))
                    );

                    if (aIsFrigg && !bIsFrigg) return -1;
                    if (!aIsFrigg && bIsFrigg) return 1;
                    return 0;
                });

                // Check each NAT Gateway to ensure it's properly configured
                for (const natGateway of sortedNatGateways) {
                    const subnetId = natGateway.SubnetId;
                    const isPrivate = await this.isSubnetPrivate(subnetId);

                    // Check if it's a Frigg-managed NAT Gateway
                    const isFriggNat = natGateway.Tags && natGateway.Tags.some(tag =>
                        (tag.Key === 'ManagedBy' && tag.Value === 'Frigg') ||
                        (tag.Key === 'Name' && tag.Value.includes('frigg'))
                    );

                    if (isPrivate) {
                        // NAT Gateway appears to be in a private subnet
                        // This could be due to route table misconfiguration
                        console.warn(`WARNING: NAT Gateway ${natGateway.NatGatewayId} is in subnet ${subnetId} which appears to be private`);

                        if (isFriggNat) {
                            console.warn('This is a Frigg-managed NAT Gateway that may have been misconfigured by route table changes');
                            console.warn('Consider enabling selfHeal: true to fix this automatically');
                            // Return it anyway if it's Frigg-managed - we can fix the routes
                            return natGateway;
                        } else {
                            console.warn('NAT Gateways MUST be placed in public subnets with Internet Gateway routes');
                            console.warn('Skipping this misconfigured NAT Gateway...');
                            continue; // Skip non-Frigg NAT Gateways in private subnets
                        }
                    }

                    if (isFriggNat) {
                        console.log(`Found existing Frigg-managed NAT Gateway: ${natGateway.NatGatewayId}`);
                        return natGateway;
                    }

                    // Return first valid NAT Gateway that's in a public subnet
                    console.log(`Found existing NAT Gateway in public subnet: ${natGateway.NatGatewayId}`);
                    return natGateway;
                }

                // All non-Frigg NAT Gateways are in private subnets
                console.error(`ERROR: Found ${response.NatGateways.length} NAT Gateway(s) but all non-Frigg ones are in private subnets!`);
                console.error('These NAT Gateways will not provide internet connectivity without route table fixes');
                console.error('Enable selfHeal: true to fix automatically or create a new NAT Gateway');
                return null; // Return null to trigger creation of new NAT Gateway
            }

            return null;
        } catch (error) {
            console.warn('Error finding existing NAT Gateway:', error.message);
            return null;
        }
    }

    /**
     * Find available Elastic IPs
     * @returns {Promise<Object|null>} Available EIP object or null if none found
     */
    async findAvailableElasticIP() {
        try {
            const command = new DescribeAddressesCommand({});
            const response = await this.ec2Client.send(command);
            
            if (response.Addresses && response.Addresses.length > 0) {
                // Find an unassociated EIP first
                const availableEIP = response.Addresses.find(eip => 
                    !eip.AssociationId && !eip.InstanceId && !eip.NetworkInterfaceId
                );
                
                if (availableEIP) {
                    console.log(`Found available Elastic IP: ${availableEIP.AllocationId}`);
                    return availableEIP;
                }
                
                // Check for EIPs tagged for Frigg
                const friggEIP = response.Addresses.find(eip => 
                    eip.Tags && eip.Tags.some(tag => 
                        tag.Key === 'Name' && tag.Value.includes('frigg')
                    )
                );
                
                if (friggEIP) {
                    console.log(`Found Frigg-tagged Elastic IP: ${friggEIP.AllocationId}`);
                    return friggEIP;
                }
            }
            
            return null;
        } catch (error) {
            console.warn('Error finding available Elastic IP:', error.message);
            return null;
        }
    }

    /**
     * Find the default KMS key for the account
     * @returns {Promise<string|null>} KMS key ARN or null if no key found
     */
    async findDefaultKmsKey() {
        try {
            const command = new ListKeysCommand({});
            const response = await this.kmsClient.send(command);
            
            if (!response.Keys || response.Keys.length === 0) {
                console.log('No KMS keys found in account');
                return null;
            }

            // Look for customer managed keys first
            for (const key of response.Keys) {
                try {
                    const describeCommand = new DescribeKeyCommand({ KeyId: key.KeyId });
                    const keyDetails = await this.kmsClient.send(describeCommand);
                    
                    if (keyDetails.KeyMetadata && 
                        keyDetails.KeyMetadata.KeyManager === 'CUSTOMER' &&
                        keyDetails.KeyMetadata.KeyState === 'Enabled') {
                        console.log(`Found customer managed KMS key: ${keyDetails.KeyMetadata.Arn}`);
                        return keyDetails.KeyMetadata.Arn;
                    }
                } catch (error) {
                    // Continue to next key if we can't describe this one
                    console.warn(`Could not describe key ${key.KeyId}:`, error.message);
                    continue;
                }
            }

            console.log('No customer managed KMS keys found');
            return null;
        } catch (error) {
            console.error('Error finding default KMS key:', error);
            return null;
        }
    }

    /**
     * Find Frigg-managed resources by tags
     * @param {string} vpcId - The VPC ID to search within
     * @returns {Promise<Object>} Object containing Frigg-managed resources
     */
    async findFriggManagedResources(vpcId) {
        try {
            const resources = {
                natGateways: [],
                elasticIps: [],
                subnets: [],
                routeTables: []
            };

            // Find NAT Gateways with Frigg tags
            const natCommand = new DescribeNatGatewaysCommand({
                Filter: [
                    { Name: 'vpc-id', Values: [vpcId] },
                    { Name: 'state', Values: ['available'] }
                ]
            });
            const natResponse = await this.ec2Client.send(natCommand);

            if (natResponse.NatGateways) {
                resources.natGateways = natResponse.NatGateways.filter(nat =>
                    nat.Tags && nat.Tags.some(tag =>
                        tag.Key === 'ManagedBy' && tag.Value === 'Frigg'
                    )
                );
            }

            // Find Elastic IPs with Frigg tags
            const eipCommand = new DescribeAddressesCommand({});
            const eipResponse = await this.ec2Client.send(eipCommand);

            if (eipResponse.Addresses) {
                resources.elasticIps = eipResponse.Addresses.filter(eip =>
                    eip.Tags && eip.Tags.some(tag =>
                        tag.Key === 'ManagedBy' && tag.Value === 'Frigg'
                    )
                );
            }

            // Find Route Tables with Frigg tags
            const rtCommand = new DescribeRouteTablesCommand({
                Filters: [
                    { Name: 'vpc-id', Values: [vpcId] }
                ]
            });
            const rtResponse = await this.ec2Client.send(rtCommand);

            if (rtResponse.RouteTables) {
                resources.routeTables = rtResponse.RouteTables.filter(rt =>
                    rt.Tags && rt.Tags.some(tag =>
                        tag.Key === 'ManagedBy' && tag.Value === 'Frigg'
                    )
                );
            }

            return resources;
        } catch (error) {
            console.error('Error finding Frigg-managed resources:', error);
            return {
                natGateways: [],
                elasticIps: [],
                subnets: [],
                routeTables: []
            };
        }
    }

    /**
     * Detect misconfigured resources that need healing
     * @param {string} vpcId - The VPC ID to check
     * @returns {Promise<Object>} Object containing misconfiguration details
     */
    async detectMisconfiguredResources(vpcId) {
        try {
            const misconfigurations = {
                natGatewaysInPrivateSubnets: [],
                orphanedElasticIps: [],
                misconfiguredRouteTables: [],
                privateSubnetsWithoutNatRoute: []
            };

            // Find NAT Gateways in private subnets
            const natCommand = new DescribeNatGatewaysCommand({
                Filter: [
                    { Name: 'vpc-id', Values: [vpcId] },
                    { Name: 'state', Values: ['available'] }
                ]
            });
            const natResponse = await this.ec2Client.send(natCommand);

            if (natResponse.NatGateways) {
                for (const nat of natResponse.NatGateways) {
                    const isPrivate = await this.isSubnetPrivate(nat.SubnetId);
                    if (isPrivate) {
                        misconfigurations.natGatewaysInPrivateSubnets.push({
                            natGatewayId: nat.NatGatewayId,
                            subnetId: nat.SubnetId,
                            tags: nat.Tags
                        });
                    }
                }
            }

            // Find orphaned Elastic IPs
            const eipCommand = new DescribeAddressesCommand({});
            const eipResponse = await this.ec2Client.send(eipCommand);

            if (eipResponse.Addresses) {
                for (const eip of eipResponse.Addresses) {
                    if (!eip.InstanceId && !eip.NetworkInterfaceId && !eip.AssociationId) {
                        // Check if it's Frigg-managed
                        const isFriggManaged = eip.Tags && eip.Tags.some(tag =>
                            tag.Key === 'ManagedBy' && tag.Value === 'Frigg'
                        );
                        if (isFriggManaged) {
                            misconfigurations.orphanedElasticIps.push({
                                allocationId: eip.AllocationId,
                                publicIp: eip.PublicIp,
                                tags: eip.Tags
                            });
                        }
                    }
                }
            }

            // Find private subnets without NAT route
            const subnets = await this.findPrivateSubnets(vpcId);
            const routeTables = await this.findRouteTables(vpcId);

            for (const subnet of subnets) {
                let hasNatRoute = false;

                // Find route table for this subnet
                for (const rt of routeTables) {
                    const isAssociated = rt.Associations && rt.Associations.some(
                        assoc => assoc.SubnetId === subnet.SubnetId
                    );

                    if (isAssociated) {
                        hasNatRoute = rt.Routes && rt.Routes.some(
                            route => route.NatGatewayId &&
                                    route.DestinationCidrBlock === '0.0.0.0/0'
                        );
                        break;
                    }
                }

                if (!hasNatRoute) {
                    misconfigurations.privateSubnetsWithoutNatRoute.push({
                        subnetId: subnet.SubnetId,
                        availabilityZone: subnet.AvailabilityZone
                    });
                }
            }

            return misconfigurations;
        } catch (error) {
            console.error('Error detecting misconfigurations:', error);
            return {
                natGatewaysInPrivateSubnets: [],
                orphanedElasticIps: [],
                misconfiguredRouteTables: [],
                privateSubnetsWithoutNatRoute: []
            };
        }
    }

    /**
     * Get healing recommendations based on detected issues
     * @param {Object} misconfigurations - Object from detectMisconfiguredResources
     * @returns {Array} Array of healing recommendations
     */
    getHealingRecommendations(misconfigurations) {
        const recommendations = [];

        if (misconfigurations.natGatewaysInPrivateSubnets.length > 0) {
            recommendations.push({
                severity: 'critical',
                issue: 'NAT Gateway in private subnet',
                recommendation: 'Recreate NAT Gateway in public subnet or fix route tables',
                affectedResources: misconfigurations.natGatewaysInPrivateSubnets.map(n => n.natGatewayId)
            });
        }

        if (misconfigurations.orphanedElasticIps.length > 0) {
            recommendations.push({
                severity: 'warning',
                issue: 'Orphaned Elastic IPs',
                recommendation: 'Release unused Elastic IPs to avoid charges',
                affectedResources: misconfigurations.orphanedElasticIps.map(e => e.allocationId)
            });
        }

        if (misconfigurations.privateSubnetsWithoutNatRoute.length > 0) {
            recommendations.push({
                severity: 'critical',
                issue: 'Private subnets without NAT route',
                recommendation: 'Add NAT Gateway route to private subnet route tables',
                affectedResources: misconfigurations.privateSubnetsWithoutNatRoute.map(s => s.subnetId)
            });
        }

        // Sort by severity
        recommendations.sort((a, b) => {
            const severityOrder = { critical: 0, warning: 1, info: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });

        return recommendations;
    }

    /**
     * Discover all AWS resources needed for Frigg deployment
     * @returns {Promise<Object>} Object containing discovered resource IDs:
     * @returns {string} return.defaultVpcId - The default VPC ID
     * @returns {string} return.defaultSecurityGroupId - The default security group ID
     * @returns {string} return.privateSubnetId1 - First private subnet ID
     * @returns {string} return.privateSubnetId2 - Second private subnet ID
     * @returns {string} return.publicSubnetId - Public subnet ID for NAT Gateway
     * @returns {string} return.privateRouteTableId - Private route table ID
     * @returns {string|null} return.defaultKmsKeyId - Default KMS key ARN or null if not found
     * @throws {Error} If resource discovery fails
     */
    async discoverResources() {
        try {
            console.log('Discovering AWS resources for Frigg deployment...');
            
            const vpc = await this.findDefaultVpc();
            console.log(`Found VPC: ${vpc.VpcId}`);
            
            const privateSubnets = await this.findPrivateSubnets(vpc.VpcId);
            console.log(`Found ${privateSubnets.length} private subnets: ${privateSubnets.map(s => s.SubnetId).join(', ')}`);
            
            const publicSubnet = await this.findPublicSubnets(vpc.VpcId);
            console.log(`Found public subnet for NAT Gateway: ${publicSubnet.SubnetId}`);
            
            const securityGroup = await this.findDefaultSecurityGroup(vpc.VpcId);
            console.log(`Found security group: ${securityGroup.GroupId}`);
            
            const routeTable = await this.findPrivateRouteTable(vpc.VpcId);
            console.log(`Found route table: ${routeTable.RouteTableId}`);
            
            const kmsKeyArn = await this.findDefaultKmsKey();
            if (kmsKeyArn) {
                console.log(`Found KMS key: ${kmsKeyArn}`);
            } else {
                console.log('No KMS key found');
            }
            
            // Try to find existing NAT Gateway
            const existingNatGateway = await this.findExistingNatGateway(vpc.VpcId);
            let natGatewayId = null;
            let elasticIpAllocationId = null;
            
            if (existingNatGateway) {
                natGatewayId = existingNatGateway.NatGatewayId;
                // Get the EIP allocation ID from the NAT Gateway
                if (existingNatGateway.NatGatewayAddresses && existingNatGateway.NatGatewayAddresses.length > 0) {
                    elasticIpAllocationId = existingNatGateway.NatGatewayAddresses[0].AllocationId;
                }
            } else {
                // If no NAT Gateway exists, check for available EIP
                const availableEIP = await this.findAvailableElasticIP();
                if (availableEIP) {
                    elasticIpAllocationId = availableEIP.AllocationId;
                }
            }

            return {
                defaultVpcId: vpc.VpcId,
                defaultSecurityGroupId: securityGroup.GroupId,
                privateSubnetId1: privateSubnets[0]?.SubnetId,
                privateSubnetId2: privateSubnets[1]?.SubnetId || privateSubnets[0]?.SubnetId,
                publicSubnetId: publicSubnet?.SubnetId || null, // May be null if no public subnet exists
                privateRouteTableId: routeTable.RouteTableId,
                defaultKmsKeyId: kmsKeyArn,
                existingNatGatewayId: natGatewayId,
                existingElasticIpAllocationId: elasticIpAllocationId
            };
        } catch (error) {
            console.error('Error discovering AWS resources:', error);
            throw error;
        }
    }

    /**
     * Find an existing Internet Gateway attached to the VPC
     * @param {string} vpcId - VPC ID to search in
     * @returns {Promise<Object|null>} Internet Gateway object or null if none found
     */
    async findInternetGateway(vpcId) {
        try {
            const command = new DescribeInternetGatewaysCommand({
                Filters: [
                    {
                        Name: 'attachment.vpc-id',
                        Values: [vpcId]
                    },
                    {
                        Name: 'attachment.state',
                        Values: ['available']
                    }
                ]
            });

            const response = await this.ec2Client.send(command);

            if (response.InternetGateways && response.InternetGateways.length > 0) {
                console.log(`Found existing Internet Gateway: ${response.InternetGateways[0].InternetGatewayId}`);
                return response.InternetGateways[0];
            }

            return null;
        } catch (error) {
            console.warn('Error finding Internet Gateway:', error.message);
            return null;
        }
    }

    /**
     * Find Frigg-managed resources by tags
     * @param {string} serviceName - The service name to search for
     * @param {string} stage - The deployment stage
     * @returns {Promise<Object>} Object containing found Frigg-managed resources
     */
    async findFriggManagedResources(serviceName, stage) {
        try {
            const results = {
                natGateways: [],
                elasticIps: [],
                routeTables: [],
                subnets: [],
                securityGroups: []
            };

            // Common filter for Frigg-managed resources
            const friggFilters = [
                {
                    Name: 'tag:ManagedBy',
                    Values: ['Frigg']
                }
            ];

            if (serviceName) {
                friggFilters.push({
                    Name: 'tag:Service',
                    Values: [serviceName]
                });
            }

            if (stage) {
                friggFilters.push({
                    Name: 'tag:Stage',
                    Values: [stage]
                });
            }

            // Find NAT Gateways
            try {
                const natCommand = new DescribeNatGatewaysCommand({
                    Filter: [
                        ...friggFilters,
                        {
                            Name: 'state',
                            Values: ['available']
                        }
                    ]
                });
                const natResponse = await this.ec2Client.send(natCommand);
                results.natGateways = natResponse.NatGateways || [];
            } catch (err) {
                console.warn('Error finding Frigg NAT Gateways:', err.message);
            }

            // Find Elastic IPs
            try {
                const eipCommand = new DescribeAddressesCommand({
                    Filters: friggFilters
                });
                const eipResponse = await this.ec2Client.send(eipCommand);
                results.elasticIps = eipResponse.Addresses || [];
            } catch (err) {
                console.warn('Error finding Frigg Elastic IPs:', err.message);
            }

            // Find Route Tables
            try {
                const rtCommand = new DescribeRouteTablesCommand({
                    Filters: friggFilters
                });
                const rtResponse = await this.ec2Client.send(rtCommand);
                results.routeTables = rtResponse.RouteTables || [];
            } catch (err) {
                console.warn('Error finding Frigg Route Tables:', err.message);
            }

            // Find Subnets
            try {
                const subnetCommand = new DescribeSubnetsCommand({
                    Filters: friggFilters
                });
                const subnetResponse = await this.ec2Client.send(subnetCommand);
                results.subnets = subnetResponse.Subnets || [];
            } catch (err) {
                console.warn('Error finding Frigg Subnets:', err.message);
            }

            // Find Security Groups
            try {
                const sgCommand = new DescribeSecurityGroupsCommand({
                    Filters: friggFilters
                });
                const sgResponse = await this.ec2Client.send(sgCommand);
                results.securityGroups = sgResponse.SecurityGroups || [];
            } catch (err) {
                console.warn('Error finding Frigg Security Groups:', err.message);
            }

            console.log('Found Frigg-managed resources:', {
                natGateways: results.natGateways.length,
                elasticIps: results.elasticIps.length,
                routeTables: results.routeTables.length,
                subnets: results.subnets.length,
                securityGroups: results.securityGroups.length
            });

            return results;
        } catch (error) {
            console.error('Error finding Frigg-managed resources:', error);
            return {
                natGateways: [],
                elasticIps: [],
                routeTables: [],
                subnets: [],
                securityGroups: []
            };
        }
    }
}

module.exports = { AWSDiscovery };