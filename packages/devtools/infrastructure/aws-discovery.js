let EC2Client,
    DescribeVpcsCommand,
    DescribeSubnetsCommand,
    DescribeSecurityGroupsCommand,
    DescribeRouteTablesCommand,
    DescribeNatGatewaysCommand,
    DescribeAddressesCommand,
    DescribeInternetGatewaysCommand;
let KMSClient, ListKeysCommand, DescribeKeyCommand;
let STSClient, GetCallerIdentityCommand;

function loadEC2() {
    if (!EC2Client) {
        ({
            EC2Client,
            DescribeVpcsCommand,
            DescribeSubnetsCommand,
            DescribeSecurityGroupsCommand,
            DescribeRouteTablesCommand,
            DescribeNatGatewaysCommand,
            DescribeAddressesCommand,
            DescribeInternetGatewaysCommand,
        } = require('@aws-sdk/client-ec2'));
    }
}

function loadKMS() {
    if (!KMSClient) {
        ({
            KMSClient,
            ListKeysCommand,
            DescribeKeyCommand,
        } = require('@aws-sdk/client-kms'));
    }
}

function loadSTS() {
    if (!STSClient) {
        ({
            STSClient,
            GetCallerIdentityCommand,
        } = require('@aws-sdk/client-sts'));
    }
}

class AWSDiscovery {
    constructor(region = 'us-east-1') {
        this.region = region;
        loadEC2();
        loadKMS();
        loadSTS();
        this.ec2Client = new EC2Client({ region });
        this.kmsClient = new KMSClient({ region });
        this.stsClient = new STSClient({ region });
    }

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

    async findDefaultVpc() {
        try {
            const command = new DescribeVpcsCommand({
                Filters: [
                    {
                        Name: 'is-default',
                        Values: ['true'],
                    },
                ],
            });

            const response = await this.ec2Client.send(command);

            if (response.Vpcs && response.Vpcs.length > 0) {
                return response.Vpcs[0];
            }

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

    async findPrivateSubnets(vpcId, autoConvert = false) {
        try {
            const subnets = await this._fetchSubnets(vpcId);

            if (subnets.length === 0) {
                throw new Error(`No subnets found in VPC ${vpcId}`);
            }

            console.log(`\n🔍 Analyzing ${subnets.length} subnets in VPC ${vpcId}...`);

            const { privateSubnets, publicSubnets } = await this._classifySubnets(
                subnets,
                { logDetails: true }
            );

            this._logSubnetSummary(privateSubnets.length, publicSubnets.length);

            const selection = this._selectSubnetsForLambda({
                privateSubnets,
                publicSubnets,
                autoConvert,
                vpcId,
            });

            if (selection) {
                return selection;
            }

            throw new Error(`No subnets found in VPC ${vpcId}`);
        } catch (error) {
            console.error('Error finding private subnets:', error);
            throw error;
        }
    }

    async isSubnetPublic(subnetId, vpcId) {
        const isPrivate = await this.isSubnetPrivate(subnetId, vpcId);
        return !isPrivate;
    }

    async isSubnetPrivate(subnetId, vpcId) {
        try {
            const targetVpcId = vpcId || (await this._getSubnetVpcId(subnetId));

            const routeTables = await this.findRouteTables(targetVpcId);
            const routeTable = this._findRouteTableForSubnet(routeTables, subnetId);

            if (!routeTable) {
                console.warn(`No route table found for subnet ${subnetId}`);
                return true;
            }

            const gatewayId = this._findIgwRoute(routeTable);
            if (gatewayId) {
                console.log(
                    `✅ Subnet ${subnetId} is PUBLIC (has route to IGW ${gatewayId})`
                );
                return false;
            }

            console.log(
                `🔒 Subnet ${subnetId} is PRIVATE (no IGW route found)`
            );
            return true;
        } catch (error) {
            console.warn(
                `Could not determine if subnet ${subnetId} is private:`,
                error
            );
            return true;
        }
    }

    async findDefaultSecurityGroup(vpcId) {
        try {
            const friggGroup = await this._findSecurityGroupByName(
                vpcId,
                'frigg-lambda-sg'
            );
            if (friggGroup) {
                return friggGroup;
            }

            const defaultGroup = await this._findSecurityGroupByName(vpcId, 'default');
            if (defaultGroup) {
                return defaultGroup;
            }

            throw new Error(`No security group found for VPC ${vpcId}`);
        } catch (error) {
            console.error('Error finding default security group:', error);
            throw error;
        }
    }

    async findPublicSubnets(vpcId) {
        try {
            const subnets = await this._fetchSubnets(vpcId);

            if (subnets.length === 0) {
                throw new Error(`No subnets found in VPC ${vpcId}`);
            }

            const { publicSubnets } = await this._classifySubnets(subnets);

            if (publicSubnets.length === 0) {
                console.warn(
                    `WARNING: No public subnets found in VPC ${vpcId}`
                );
                console.warn(
                    'A public subnet with Internet Gateway route is required for NAT Gateway placement'
                );
                console.warn(
                    'Please create a public subnet or use VPC endpoints instead'
                );
                return null;
            }

            console.log(
                `Found ${publicSubnets.length} public subnets, using ${publicSubnets[0].SubnetId} for NAT Gateway`
            );
            return publicSubnets[0];
        } catch (error) {
            console.error('Error finding public subnets:', error);
            throw error;
        }
    }

    async findPrivateRouteTable(vpcId) {
        try {
            const routeTables = await this.findRouteTables(vpcId);

            if (routeTables.length === 0) {
                throw new Error(`No route tables found for VPC ${vpcId}`);
            }

            const privateTable = routeTables.find(
                (rt) => !this._findIgwRoute(rt)
            );

            return privateTable || routeTables[0];
        } catch (error) {
            console.error('Error finding private route table:', error);
            throw error;
        }
    }

    async findExistingNatGateway(vpcId) {
        try {
            const command = new DescribeNatGatewaysCommand({
                Filter: [
                    {
                        Name: 'vpc-id',
                        Values: [vpcId],
                    },
                    {
                        Name: 'state',
                        Values: ['available'],
                    },
                ],
            });

            const response = await this.ec2Client.send(command);

            const natGateways = (response.NatGateways || []).filter((nat) => {
                if (nat.State !== 'available') {
                    console.warn(
                        `Skipping NAT Gateway ${nat.NatGatewayId} with state: ${nat.State}`
                    );
                    return false;
                }
                return true;
            });

            if (natGateways.length === 0) {
                console.warn('No truly available NAT Gateways found in VPC');
                return null;
            }

            const sortedNatGateways = natGateways.sort((a, b) => {
                const aIsFrigg = this._isFriggManaged(a.Tags);
                const bIsFrigg = this._isFriggManaged(b.Tags);

                if (aIsFrigg && !bIsFrigg) return -1;
                if (!aIsFrigg && bIsFrigg) return 1;
                return 0;
            });

            for (const natGateway of sortedNatGateways) {
                const subnetId = natGateway.SubnetId;
                const isPrivate = await this.isSubnetPrivate(
                    subnetId,
                    natGateway.VpcId
                );
                const isFriggNat = this._isFriggManaged(natGateway.Tags);

                if (isPrivate) {
                    console.warn(
                        `WARNING: NAT Gateway ${natGateway.NatGatewayId} is in subnet ${subnetId} which appears to be private`
                    );

                    if (isFriggNat) {
                        console.warn(
                            'This is a Frigg-managed NAT Gateway that may have been misconfigured by route table changes'
                        );
                        console.warn(
                            'Consider enabling selfHeal: true to fix this automatically'
                        );
                        natGateway._isInPrivateSubnet = true;
                        return natGateway;
                    }

                    console.warn(
                        'NAT Gateways MUST be placed in public subnets with Internet Gateway routes'
                    );
                    console.warn('Skipping this misconfigured NAT Gateway...');
                    continue;
                }

                if (isFriggNat) {
                    console.log(
                        `Found existing Frigg-managed NAT Gateway: ${natGateway.NatGatewayId} (State: ${natGateway.State})`
                    );
                    natGateway._isInPrivateSubnet = false;
                    return natGateway;
                }

                console.log(
                    `Found existing NAT Gateway in public subnet: ${natGateway.NatGatewayId} (State: ${natGateway.State})`
                );
                natGateway._isInPrivateSubnet = false;
                return natGateway;
            }

            console.error(
                `ERROR: Found ${(response.NatGateways || []).length} NAT Gateway(s) but all non-Frigg ones are in private subnets!`
            );
            console.error(
                'These NAT Gateways will not provide internet connectivity without route table fixes'
            );
            console.error(
                'Enable selfHeal: true to fix automatically or create a new NAT Gateway'
            );
            return null;
        } catch (error) {
            console.warn('Error finding existing NAT Gateway:', error.message);
            return null;
        }
    }

    async findAvailableElasticIP() {
        try {
            const command = new DescribeAddressesCommand({});
            const response = await this.ec2Client.send(command);

            if (response.Addresses && response.Addresses.length > 0) {
                const availableEIP = response.Addresses.find(
                    (eip) =>
                        !eip.AssociationId &&
                        !eip.InstanceId &&
                        !eip.NetworkInterfaceId
                );

                if (availableEIP) {
                    console.log(
                        `Found available Elastic IP: ${availableEIP.AllocationId}`
                    );
                    return availableEIP;
                }

                const friggEIP = response.Addresses.find((eip) =>
                    this._isFriggManaged(eip.Tags)
                );

                if (friggEIP) {
                    console.log(
                        `Found Frigg-tagged Elastic IP: ${friggEIP.AllocationId}`
                    );
                    return friggEIP;
                }
            }

            return null;
        } catch (error) {
            console.warn('Error finding available Elastic IP:', error.message);
            return null;
        }
    }

    async findDefaultKmsKey() {
        console.log('KMS Discovery Starting...');
        try {
            console.log(`[KMS Discovery] Running in region: ${this.region}`);
            try {
                const accountId = await this.getAccountId();
                console.log(`[KMS Discovery] AWS Account ID: ${accountId}`);
            } catch (error) {
                console.warn(
                    '[KMS Discovery] Could not retrieve account ID:',
                    error.message
                );
            }

            const command = new ListKeysCommand({});
            const response = await this.kmsClient.send(command);

            if (!response.Keys || response.Keys.length === 0) {
                console.log('[KMS Discovery] No KMS keys found in account');
                return null;
            }

            console.log(
                `[KMS Discovery] Found ${response.Keys.length} total keys in account`
            );
            let keysExamined = 0;
            let customerManagedKeys = 0;
            let enabledKeys = 0;
            let pendingDeletionKeys = 0;

            for (const key of response.Keys) {
                try {
                    const describeCommand = new DescribeKeyCommand({
                        KeyId: key.KeyId,
                    });
                    const keyDetails = await this.kmsClient.send(
                        describeCommand
                    );
                    keysExamined++;

                    const metadata = keyDetails.KeyMetadata;
                    if (!metadata) {
                        continue;
                    }

                    console.log(`[KMS Discovery] Key ${key.KeyId}:`, {
                        KeyManager: metadata.KeyManager,
                        KeyState: metadata.KeyState,
                        Enabled: metadata.Enabled,
                        DeletionDate:
                            metadata.DeletionDate || 'Not scheduled for deletion',
                        Arn: metadata.Arn,
                    });

                    if (metadata.KeyManager === 'CUSTOMER') {
                        customerManagedKeys++;

                        if (metadata.KeyState === 'Enabled') {
                            enabledKeys++;
                        } else if (metadata.KeyState === 'PendingDeletion') {
                            pendingDeletionKeys++;
                            console.warn(
                                `[KMS Discovery] Skipping key ${key.KeyId} - State: PendingDeletion, DeletionDate: ${metadata.DeletionDate}`
                            );
                        }

                        if (
                            metadata.KeyState === 'Enabled' &&
                            !metadata.DeletionDate
                        ) {
                            console.log(
                                `[KMS Discovery] Found eligible customer managed KMS key: ${metadata.Arn}`
                            );
                            return metadata.Arn;
                        } else if (
                            metadata.KeyState === 'Enabled' &&
                            metadata.DeletionDate
                        ) {
                            console.error(
                                `[KMS Discovery] WARNING: Key ${key.KeyId} has KeyState='Enabled' but DeletionDate is set: ${metadata.DeletionDate}`
                            );
                        }
                    }
                } catch (error) {
                    console.warn(
                        `[KMS Discovery] Could not describe key ${key.KeyId}:`,
                        error.message
                    );
                    continue;
                }
            }

            console.log('[KMS Discovery] Summary:', {
                totalKeys: response.Keys.length,
                keysExamined,
                customerManagedKeys,
                enabledKeys,
                pendingDeletionKeys,
            });

            if (customerManagedKeys === 0) {
                console.log(
                    '[KMS Discovery] No customer managed KMS keys found in account'
                );
            } else if (enabledKeys === 0) {
                console.warn(
                    '[KMS Discovery] Found customer managed keys but none are in Enabled state'
                );
            } else {
                console.warn(
                    '[KMS Discovery] Found enabled customer managed keys but none met all criteria'
                );
            }

            return null;
        } catch (error) {
            console.error(
                '[KMS Discovery] Error finding default KMS key:',
                error
            );
            return null;
        }
    }

    async detectMisconfiguredResources(vpcId) {
        try {
            const misconfigurations = {
                natGatewaysInPrivateSubnets: [],
                orphanedElasticIps: [],
                misconfiguredRouteTables: [],
                privateSubnetsWithoutNatRoute: [],
            };

            const natCommand = new DescribeNatGatewaysCommand({
                Filter: [
                    { Name: 'vpc-id', Values: [vpcId] },
                    { Name: 'state', Values: ['available'] },
                ],
            });
            const natResponse = await this.ec2Client.send(natCommand);

            for (const nat of natResponse.NatGateways || []) {
                const isPrivate = await this.isSubnetPrivate(nat.SubnetId, vpcId);
                if (isPrivate) {
                    misconfigurations.natGatewaysInPrivateSubnets.push({
                        natGatewayId: nat.NatGatewayId,
                        subnetId: nat.SubnetId,
                        tags: nat.Tags,
                    });
                }
            }

            const eipCommand = new DescribeAddressesCommand({});
            const eipResponse = await this.ec2Client.send(eipCommand);

            for (const eip of eipResponse.Addresses || []) {
                if (
                    !eip.InstanceId &&
                    !eip.NetworkInterfaceId &&
                    !eip.AssociationId &&
                    this._isFriggManaged(eip.Tags)
                ) {
                    misconfigurations.orphanedElasticIps.push({
                        allocationId: eip.AllocationId,
                        publicIp: eip.PublicIp,
                        tags: eip.Tags,
                    });
                }
            }

            const subnets = await this.findPrivateSubnets(vpcId);
            const routeTables = await this.findRouteTables(vpcId);

            for (const subnet of subnets) {
                const hasNatRoute = routeTables.some((rt) => {
                    const isAssociated = (rt.Associations || []).some(
                        (assoc) => assoc.SubnetId === subnet.SubnetId
                    );
                    if (!isAssociated) {
                        return false;
                    }
                    return (rt.Routes || []).some(
                        (route) =>
                            route.NatGatewayId &&
                            route.DestinationCidrBlock === '0.0.0.0/0'
                    );
                });

                if (!hasNatRoute) {
                    misconfigurations.privateSubnetsWithoutNatRoute.push({
                        subnetId: subnet.SubnetId,
                        availabilityZone: subnet.AvailabilityZone,
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
                privateSubnetsWithoutNatRoute: [],
            };
        }
    }

    getHealingRecommendations(misconfigurations) {
        const recommendations = [];

        if (misconfigurations.natGatewaysInPrivateSubnets.length > 0) {
            recommendations.push({
                severity: 'critical',
                issue: 'NAT Gateway in private subnet',
                recommendation:
                    'Recreate NAT Gateway in public subnet or fix route tables',
                affectedResources:
                    misconfigurations.natGatewaysInPrivateSubnets.map(
                        (n) => n.natGatewayId
                    ),
            });
        }

        if (misconfigurations.orphanedElasticIps.length > 0) {
            recommendations.push({
                severity: 'warning',
                issue: 'Orphaned Elastic IPs',
                recommendation: 'Release unused Elastic IPs to avoid charges',
                affectedResources: misconfigurations.orphanedElasticIps.map(
                    (e) => e.allocationId
                ),
            });
        }

        if (misconfigurations.privateSubnetsWithoutNatRoute.length > 0) {
            recommendations.push({
                severity: 'critical',
                issue: 'Private subnets without NAT route',
                recommendation:
                    'Add NAT Gateway route to private subnet route tables',
                affectedResources:
                    misconfigurations.privateSubnetsWithoutNatRoute.map(
                        (s) => s.subnetId
                    ),
            });
        }

        recommendations.sort((a, b) => {
            const severityOrder = { critical: 0, warning: 1, info: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });

        return recommendations;
    }

    async discoverResources(options = {}) {
        try {
            console.log(
                '\n🚀 Discovering AWS resources for Frigg deployment...'
            );
            console.log('═'.repeat(60));

            const vpc = await this.findDefaultVpc();
            console.log(`\n✅ Found VPC: ${vpc.VpcId}`);

            const autoConvert = options.selfHeal || false;

            const privateSubnets = await this.findPrivateSubnets(
                vpc.VpcId,
                autoConvert
            );
            console.log(
                `\n✅ Selected subnets for Lambda: ${privateSubnets
                    .map((s) => s.SubnetId)
                    .join(', ')}`
            );

            const publicSubnet = await this.findPublicSubnets(vpc.VpcId);
            if (publicSubnet) {
                console.log(
                    `\n✅ Found public subnet for NAT Gateway: ${publicSubnet.SubnetId}`
                );
            } else {
                console.log(
                    `\n⚠️  No public subnet found - NAT Gateway creation may fail`
                );
            }

            const securityGroup = await this.findDefaultSecurityGroup(
                vpc.VpcId
            );
            console.log(`\n✅ Found security group: ${securityGroup.GroupId}`);

            const routeTable = await this.findPrivateRouteTable(vpc.VpcId);
            console.log(`✅ Found route table: ${routeTable.RouteTableId}`);

            const kmsKeyArn = await this.findDefaultKmsKey();
            if (kmsKeyArn) {
                console.log(`✅ Found KMS key: ${kmsKeyArn}`);
            } else {
                console.log('ℹ️  No KMS key found');
            }

            const existingNatGateway = await this.findExistingNatGateway(
                vpc.VpcId
            );
            let natGatewayId = null;
            let elasticIpAllocationId = null;
            let natGatewayInPrivateSubnet = false;

            if (existingNatGateway) {
                natGatewayId = existingNatGateway.NatGatewayId;
                natGatewayInPrivateSubnet =
                    existingNatGateway._isInPrivateSubnet || false;

                if (
                    existingNatGateway.NatGatewayAddresses &&
                    existingNatGateway.NatGatewayAddresses.length > 0
                ) {
                    elasticIpAllocationId =
                        existingNatGateway.NatGatewayAddresses[0].AllocationId;
                }
            } else {
                const availableEIP = await this.findAvailableElasticIP();
                if (availableEIP) {
                    elasticIpAllocationId = availableEIP.AllocationId;
                }
            }

            const subnet1IsActuallyPrivate = privateSubnets[0]
                ? await this.isSubnetPrivate(
                      privateSubnets[0].SubnetId,
                      privateSubnets[0].VpcId || vpc.VpcId
                  )
                : false;
            const subnet2IsActuallyPrivate = privateSubnets[1]
                ? await this.isSubnetPrivate(
                      privateSubnets[1].SubnetId,
                      privateSubnets[1].VpcId || vpc.VpcId
                  )
                : subnet1IsActuallyPrivate;

            const subnetStatus = {
                requiresConversion:
                    !subnet1IsActuallyPrivate || !subnet2IsActuallyPrivate,
                subnet1NeedsConversion: !subnet1IsActuallyPrivate,
                subnet2NeedsConversion: !subnet2IsActuallyPrivate,
            };

            if (subnetStatus.requiresConversion) {
                console.log(`\n⚠️  SUBNET CONFIGURATION WARNING:`);
                if (subnetStatus.subnet1NeedsConversion && privateSubnets[0]) {
                    console.log(
                        `  - Subnet ${privateSubnets[0].SubnetId} is currently PUBLIC but will be used for Lambda`
                    );
                }
                if (subnetStatus.subnet2NeedsConversion && privateSubnets[1]) {
                    console.log(
                        `  - Subnet ${privateSubnets[1].SubnetId} is currently PUBLIC but will be used for Lambda`
                    );
                }
                console.log(
                    `  💡 Enable selfHeal: true to automatically fix this`
                );
            }

            console.log(`\n${'═'.repeat(60)}`);
            console.log('📋 Discovery Summary:');
            console.log(`  VPC: ${vpc.VpcId}`);
            console.log(
                `  Lambda Subnets: ${privateSubnets
                    .map((s) => s.SubnetId)
                    .join(', ')}`
            );
            console.log(
                `  NAT Subnet: ${
                    publicSubnet?.SubnetId || 'None (needs creation)'
                }`
            );
            console.log(
                `  NAT Gateway: ${natGatewayId || 'None (will be created)'}`
            );
            console.log(
                `  Elastic IP: ${
                    elasticIpAllocationId || 'None (will be allocated)'
                }`
            );
            if (subnetStatus.requiresConversion) {
                console.log(`  ⚠️  Subnet Conversion Required: Yes`);
            }
            console.log(`${'═'.repeat(60)}\n`);

            return {
                defaultVpcId: vpc.VpcId,
                vpcCidr: vpc.CidrBlock,
                defaultSecurityGroupId: securityGroup.GroupId,
                privateSubnetId1: privateSubnets[0]?.SubnetId,
                privateSubnetId2:
                    privateSubnets[1]?.SubnetId || privateSubnets[0]?.SubnetId,
                publicSubnetId: publicSubnet?.SubnetId || null,
                privateRouteTableId: routeTable.RouteTableId,
                defaultKmsKeyId: kmsKeyArn,
                existingNatGatewayId: natGatewayId,
                existingElasticIpAllocationId: elasticIpAllocationId,
                natGatewayInPrivateSubnet: natGatewayInPrivateSubnet,
                subnetConversionRequired: subnetStatus.requiresConversion,
                privateSubnetsWithWrongRoutes: (() => {
                    const wrongRoutes = [];
                    if (
                        subnetStatus.subnet1NeedsConversion &&
                        privateSubnets[0]
                    ) {
                        wrongRoutes.push(privateSubnets[0].SubnetId);
                    }
                    if (
                        subnetStatus.subnet2NeedsConversion &&
                        privateSubnets[1]
                    ) {
                        wrongRoutes.push(privateSubnets[1].SubnetId);
                    }
                    return wrongRoutes;
                })(),
            };
        } catch (error) {
            console.error('Error discovering AWS resources:', error);
            throw error;
        }
    }

    async findInternetGateway(vpcId) {
        try {
            const command = new DescribeInternetGatewaysCommand({
                Filters: [
                    {
                        Name: 'attachment.vpc-id',
                        Values: [vpcId],
                    },
                    {
                        Name: 'attachment.state',
                        Values: ['available'],
                    },
                ],
            });

            const response = await this.ec2Client.send(command);

            if (
                response.InternetGateways &&
                response.InternetGateways.length > 0
            ) {
                console.log(
                    `Found existing Internet Gateway: ${response.InternetGateways[0].InternetGatewayId}`
                );
                return response.InternetGateways[0];
            }

            return null;
        } catch (error) {
            console.warn('Error finding Internet Gateway:', error.message);
            return null;
        }
    }

    async findFriggManagedResources(serviceName, stage) {
        const results = {
            natGateways: [],
            elasticIps: [],
            routeTables: [],
            subnets: [],
            securityGroups: [],
        };

        try {
            const filters = [
                {
                    Name: 'tag:ManagedBy',
                    Values: ['Frigg'],
                },
            ];

            if (serviceName) {
                filters.push({
                    Name: 'tag:Service',
                    Values: [serviceName],
                });
            }

            if (stage) {
                filters.push({
                    Name: 'tag:Stage',
                    Values: [stage],
                });
            }

            const fetchWithFallback = async (Command, input, field, label) => {
                try {
                    const response = await this.ec2Client.send(
                        new Command(input)
                    );
                    return response[field] || [];
                } catch (err) {
                    console.warn(
                        `Error finding Frigg ${label}:`,
                        err.message
                    );
                    return [];
                }
            };

            results.natGateways = await fetchWithFallback(
                DescribeNatGatewaysCommand,
                {
                    Filter: [
                        ...filters,
                        {
                            Name: 'state',
                            Values: ['available'],
                        },
                    ],
                },
                'NatGateways',
                'NAT Gateways'
            );

            results.elasticIps = await fetchWithFallback(
                DescribeAddressesCommand,
                { Filters: filters },
                'Addresses',
                'Elastic IPs'
            );

            results.routeTables = await fetchWithFallback(
                DescribeRouteTablesCommand,
                { Filters: filters },
                'RouteTables',
                'Route Tables'
            );

            results.subnets = await fetchWithFallback(
                DescribeSubnetsCommand,
                { Filters: filters },
                'Subnets',
                'Subnets'
            );

            results.securityGroups = await fetchWithFallback(
                DescribeSecurityGroupsCommand,
                { Filters: filters },
                'SecurityGroups',
                'Security Groups'
            );

            console.log('Found Frigg-managed resources:', {
                natGateways: results.natGateways.length,
                elasticIps: results.elasticIps.length,
                routeTables: results.routeTables.length,
                subnets: results.subnets.length,
                securityGroups: results.securityGroups.length,
            });

            return results;
        } catch (error) {
            console.error('Error finding Frigg-managed resources:', error);
            return results;
        }
    }

    async findRouteTables(vpcId) {
        const command = new DescribeRouteTablesCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [vpcId],
                },
            ],
        });
        const response = await this.ec2Client.send(command);
        return response.RouteTables || [];
    }

    async _fetchSubnets(vpcId) {
        const command = new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [vpcId],
                },
            ],
        });
        const response = await this.ec2Client.send(command);
        return response.Subnets || [];
    }

    async _getSubnetVpcId(subnetId) {
        const command = new DescribeSubnetsCommand({
            SubnetIds: [subnetId],
        });
        const response = await this.ec2Client.send(command);

        if (!response.Subnets || response.Subnets.length === 0) {
            throw new Error(`Subnet ${subnetId} not found`);
        }

        return response.Subnets[0].VpcId;
    }

    async _classifySubnets(subnets, { logDetails = false } = {}) {
        const privateSubnets = [];
        const publicSubnets = [];

        for (const subnet of subnets) {
            const isPrivate = await this.isSubnetPrivate(
                subnet.SubnetId,
                subnet.VpcId
            );
            if (isPrivate) {
                privateSubnets.push(subnet);
                if (logDetails) {
                    console.log(
                        `  🔒 Private subnet: ${subnet.SubnetId} (AZ: ${subnet.AvailabilityZone})`
                    );
                }
            } else {
                publicSubnets.push(subnet);
                if (logDetails) {
                    console.log(
                        `  🌐 Public subnet: ${subnet.SubnetId} (AZ: ${subnet.AvailabilityZone})`
                    );
                }
            }
        }

        return { privateSubnets, publicSubnets };
    }

    _logSubnetSummary(privateCount, publicCount) {
        console.log(`\n📊 Subnet Analysis Results:`);
        console.log(`  - Private subnets: ${privateCount}`);
        console.log(`  - Public subnets: ${publicCount}`);
    }

    _selectSubnetsForLambda({ privateSubnets, publicSubnets, autoConvert, vpcId }) {
        if (privateSubnets.length >= 2) {
            console.log(
                `✅ Found ${privateSubnets.length} private subnets for Lambda deployment`
            );
            return privateSubnets.slice(0, 2);
        }

        if (privateSubnets.length === 1) {
            console.warn(
                `⚠️  Only 1 private subnet found. Need at least 2 for high availability.`
            );
            if (publicSubnets.length > 0 && autoConvert) {
                console.log(
                    `🔄 Will convert 1 public subnet to private for high availability...`
                );
            }
            return [...privateSubnets, ...publicSubnets].slice(0, 2);
        }

        if (privateSubnets.length === 0 && publicSubnets.length > 0) {
            console.error(
                `❌ CRITICAL: No private subnets found, but ${publicSubnets.length} public subnets exist`
            );
            console.error(
                `❌ Lambda functions should NOT be deployed in public subnets!`
            );

            if (autoConvert && publicSubnets.length >= 3) {
                console.log(
                    `\n🔧 AUTO-CONVERSION: Will configure subnets for proper isolation...`
                );
                console.log(
                    `  - Keeping ${publicSubnets[0].SubnetId} as public (for NAT Gateway)`
                );
                console.log(
                    `  - Converting ${publicSubnets[1].SubnetId} to private (for Lambda)`
                );
                if (publicSubnets[2]) {
                    console.log(
                        `  - Converting ${publicSubnets[2].SubnetId} to private (for Lambda)`
                    );
                }
                return publicSubnets.slice(1, 3);
            }

            if (autoConvert && publicSubnets.length >= 2) {
                console.log(
                    `\n🔧 AUTO-CONVERSION: Only ${publicSubnets.length} subnets available`
                );
                console.log(
                    `  - Will need to create new subnets or reconfigure existing ones`
                );
                return publicSubnets.slice(0, 2);
            }

            console.error(`\n⚠️  CONFIGURATION ERROR:`);
            console.error(
                `  Found ${publicSubnets.length} public subnets but no private subnets.`
            );
            console.error(
                `  Lambda functions require private subnets for security.`
            );
            console.error(`\n  Options:`);
            console.error(
                `  1. Enable selfHeal: true in vpc configuration`
            );
            console.error(`  2. Create private subnets manually`);
            console.error(
                `  3. Set subnets.management: 'create' to create new private subnets`
            );

            throw new Error(
                `No private subnets found in VPC ${vpcId}. ` +
                    `Found ${publicSubnets.length} public subnets. ` +
                    `Lambda requires private subnets. Enable selfHeal or create private subnets.`
            );
        }

        return null;
    }

    _findRouteTableForSubnet(routeTables, subnetId) {
        for (const rt of routeTables) {
            for (const assoc of rt.Associations || []) {
                if (assoc.SubnetId === subnetId) {
                    return rt;
                }
            }
        }

        for (const rt of routeTables) {
            for (const assoc of rt.Associations || []) {
                if (assoc.Main === true) {
                    return rt;
                }
            }
        }

        return null;
    }

    _findIgwRoute(routeTable) {
        for (const route of routeTable.Routes || []) {
            if (route.GatewayId && route.GatewayId.startsWith('igw-')) {
                return route.GatewayId;
            }
        }
        return null;
    }

    _isFriggManaged(tags) {
        if (!tags) {
            return false;
        }

        return tags.some(
            (tag) =>
                (tag.Key === 'ManagedBy' && tag.Value === 'Frigg') ||
                (tag.Key === 'Name' &&
                    typeof tag.Value === 'string' &&
                    tag.Value.includes('frigg'))
        );
    }

    async _findSecurityGroupByName(vpcId, groupName) {
        const command = new DescribeSecurityGroupsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [vpcId],
                },
                {
                    Name: 'group-name',
                    Values: [groupName],
                },
            ],
        });

        const response = await this.ec2Client.send(command);
        const groups = response.SecurityGroups || [];
        return groups[0] || null;
    }
}

module.exports = { AWSDiscovery };
