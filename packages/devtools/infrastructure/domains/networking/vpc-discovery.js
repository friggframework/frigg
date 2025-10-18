/**
 * VPC Discovery Service
 * 
 * Domain Service - Hexagonal Architecture
 * 
 * Discovers VPC and networking resources using the cloud provider adapter.
 * Adds domain-specific validation and transformation logic.
 */

class VpcDiscovery {
    /**
     * @param {CloudProviderAdapter} provider - Cloud provider adapter instance
     */
    constructor(provider) {
        this.provider = provider;
    }

    /**
     * Discover VPC and networking resources
     * 
     * @param {Object} config - Discovery configuration
     * @param {string} [config.vpcId] - Specific VPC ID to discover
     * @param {string} [config.serviceName] - Service name for tagging/filtering
     * @param {string} [config.stage] - Deployment stage
     * @returns {Promise<Object>} Discovered VPC resources with friendly property names
     */
    async discover(config) {
        console.log('🔍 Discovering VPC resources...');

        try {
            const rawResources = await this.provider.discoverVpc(config);

            // Transform to Frigg-friendly format
            const result = {
                defaultVpcId: rawResources.vpcId,
                vpcCidr: rawResources.vpcCidr,
                subnets: rawResources.subnets,
                securityGroups: rawResources.securityGroups,
                routeTables: rawResources.routeTables,
                natGateways: rawResources.natGateways,
                internetGateways: rawResources.internetGateways,
            };

            // Extract specific subnet types
            const privateSubnets = rawResources.subnets.filter(
                s => !s.MapPublicIpOnLaunch
            );
            const publicSubnets = rawResources.subnets.filter(
                s => s.MapPublicIpOnLaunch
            );

            // Set subnet IDs for Frigg infrastructure
            if (privateSubnets.length >= 1) {
                result.privateSubnetId1 = privateSubnets[0].SubnetId;
            }
            if (privateSubnets.length >= 2) {
                result.privateSubnetId2 = privateSubnets[1].SubnetId;
            }
            if (publicSubnets.length >= 1) {
                result.publicSubnetId = publicSubnets[0].SubnetId;
                result.publicSubnetId1 = publicSubnets[0].SubnetId;
            }
            if (publicSubnets.length >= 2) {
                result.publicSubnetId2 = publicSubnets[1].SubnetId;
            }

            // Find default security group
            const defaultSg = rawResources.securityGroups.find(
                sg => sg.GroupName === 'default'
            );
            if (defaultSg) {
                result.defaultSecurityGroupId = defaultSg.GroupId;
            }

            // Find default route table
            const defaultRt = rawResources.routeTables.find(
                rt => rt.Associations?.some(a => a.Main)
            );
            if (defaultRt) {
                result.defaultRouteTableId = defaultRt.RouteTableId;
                result.privateRouteTableId = defaultRt.RouteTableId;
            }

            // Find NAT gateway
            const activeNat = rawResources.natGateways.find(
                nat => nat.State === 'available'
            );
            if (activeNat) {
                result.existingNatGatewayId = activeNat.NatGatewayId;

                // Check if NAT is in private subnet (configuration error)
                const natSubnet = rawResources.subnets.find(
                    s => s.SubnetId === activeNat.SubnetId
                );
                result.natGatewayInPrivateSubnet = natSubnet && !natSubnet.MapPublicIpOnLaunch;

                // Get elastic IP allocation
                if (activeNat.NatGatewayAddresses && activeNat.NatGatewayAddresses.length > 0) {
                    result.existingElasticIpAllocationId =
                        activeNat.NatGatewayAddresses[0].AllocationId;
                }
            }

            // Find Internet Gateway
            if (rawResources.internetGateways.length > 0) {
                result.internetGatewayId = rawResources.internetGateways[0].InternetGatewayId;
            }

            // Find VPC Endpoints
            if (rawResources.vpcEndpoints) {
                const s3Endpoint = rawResources.vpcEndpoints.find(
                    ep => ep.ServiceName && ep.ServiceName.includes('.s3')
                );
                const dynamodbEndpoint = rawResources.vpcEndpoints.find(
                    ep => ep.ServiceName && ep.ServiceName.includes('.dynamodb')
                );

                if (s3Endpoint) {
                    result.s3VpcEndpointId = s3Endpoint.VpcEndpointId;
                }
                if (dynamodbEndpoint) {
                    result.dynamodbVpcEndpointId = dynamodbEndpoint.VpcEndpointId;
                }
            }

            console.log(`  ✓ Found VPC: ${result.defaultVpcId}`);
            if (result.privateSubnetId1) {
                console.log(`  ✓ Found private subnets: ${result.privateSubnetId1}, ${result.privateSubnetId2 || 'N/A'}`);
            }
            if (result.publicSubnetId) {
                console.log(`  ✓ Found public subnet: ${result.publicSubnetId}`);
            }
            if (result.existingNatGatewayId) {
                console.log(`  ✓ Found NAT Gateway: ${result.existingNatGatewayId}`);
            }
            if (result.s3VpcEndpointId || result.dynamodbVpcEndpointId) {
                console.log(`  ✓ Found VPC Endpoints: S3=${result.s3VpcEndpointId ? 'Yes' : 'No'}, DynamoDB=${result.dynamodbVpcEndpointId ? 'Yes' : 'No'}`);
            }

            return result;
        } catch (error) {
            console.error('  ✗ VPC discovery failed:', error.message);
            return {
                defaultVpcId: null,
                vpcCidr: null,
                privateSubnetId1: null,
                privateSubnetId2: null,
                publicSubnetId: null,
                defaultSecurityGroupId: null,
                defaultRouteTableId: null,
            };
        }
    }
}

module.exports = {
    VpcDiscovery,
};

