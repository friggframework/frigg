let EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeRouteTablesCommand, DescribeNatGatewaysCommand, DescribeAddressesCommand;
let KMSClient, ListKeysCommand, DescribeKeyCommand;
let STSClient, GetCallerIdentityCommand;

function loadEC2() {
    if (!EC2Client) {
        ({ EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeRouteTablesCommand, DescribeNatGatewaysCommand, DescribeAddressesCommand } = require('@aws-sdk/client-ec2'));
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
                throw new Error(`No public subnets found in VPC ${vpcId} for NAT Gateway placement`);
            }

            // Return first public subnet for NAT Gateway
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
                // Find a NAT Gateway tagged for Frigg first
                const friggNatGateway = response.NatGateways.find(nat => 
                    nat.Tags && nat.Tags.some(tag => 
                        tag.Key === 'Name' && tag.Value.includes('frigg')
                    )
                );
                
                if (friggNatGateway) {
                    console.log(`Found existing Frigg NAT Gateway: ${friggNatGateway.NatGatewayId}`);
                    return friggNatGateway;
                }
                
                // Return first available NAT Gateway if no Frigg-specific one found
                console.log(`Found existing NAT Gateway: ${response.NatGateways[0].NatGatewayId}`);
                return response.NatGateways[0];
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
     * @returns {Promise<string>} KMS key ARN or wildcard pattern as fallback
     */
    async findDefaultKmsKey() {
        try {
            // First try to find a key with alias/aws/lambda
            const command = new ListKeysCommand({});
            const response = await this.kmsClient.send(command);
            
            if (!response.Keys || response.Keys.length === 0) {
                // Return AWS managed key ARN pattern as fallback
                const accountId = await this.getAccountId();
                return `arn:aws:kms:${this.region}:${accountId}:key/*`;
            }

            // Look for customer managed keys first
            for (const key of response.Keys) {
                try {
                    const describeCommand = new DescribeKeyCommand({ KeyId: key.KeyId });
                    const keyDetails = await this.kmsClient.send(describeCommand);
                    
                    if (keyDetails.KeyMetadata && 
                        keyDetails.KeyMetadata.KeyManager === 'CUSTOMER' &&
                        keyDetails.KeyMetadata.KeyState === 'Enabled') {
                        return keyDetails.KeyMetadata.Arn;
                    }
                } catch (error) {
                    // Continue to next key if we can't describe this one
                    continue;
                }
            }

            // Fallback to wildcard pattern for AWS managed keys
            const accountId = await this.getAccountId();
            return `arn:aws:kms:${this.region}:${accountId}:key/*`;
        } catch (error) {
            console.error('Error finding default KMS key:', error);
            // Return wildcard pattern as ultimate fallback
            return '*';
        }
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
     * @returns {string} return.defaultKmsKeyId - Default KMS key ARN
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
            console.log(`Found KMS key: ${kmsKeyArn}`);
            
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
                publicSubnetId: publicSubnet.SubnetId,
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
}

module.exports = { AWSDiscovery };