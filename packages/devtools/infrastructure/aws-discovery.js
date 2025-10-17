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
let RDSClient, DescribeDBClustersCommand, DescribeDBSubnetGroupsCommand;
let SecretsManagerClient, ListSecretsCommand, DescribeSecretCommand;

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
            ListAliasesCommand,
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

function loadRDS() {
    if (!RDSClient) {
        ({
            RDSClient,
            DescribeDBClustersCommand,
            DescribeDBSubnetGroupsCommand,
        } = require('@aws-sdk/client-rds'));
    }
}

function loadSecretsManager() {
    if (!SecretsManagerClient) {
        ({
            SecretsManagerClient,
            ListSecretsCommand,
            DescribeSecretCommand,
        } = require('@aws-sdk/client-secrets-manager'));
    }
}

class AWSDiscovery {
    constructor(region = 'us-east-1') {
        console.log('[AWSDiscovery] Initializing AWSDiscovery...');
        console.log('[AWSDiscovery] Region:', region);
        console.log('[AWSDiscovery] System time:', new Date().toISOString());
        console.log('[AWSDiscovery] AWS_PROFILE:', process.env.AWS_PROFILE);
        console.log('[AWSDiscovery] AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'SET (hidden)' : 'NOT SET');
        console.log('[AWSDiscovery] AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'SET (hidden)' : 'NOT SET');
        console.log('[AWSDiscovery] NODE_TLS_REJECT_UNAUTHORIZED:', process.env.NODE_TLS_REJECT_UNAUTHORIZED);

        this.region = region;
        loadEC2();
        loadKMS();
        loadSTS();
        loadRDS();
        loadSecretsManager();
        this.ec2Client = new EC2Client({ region });
        this.kmsClient = new KMSClient({ region });
        this.stsClient = new STSClient({ region });
        this.rdsClient = new RDSClient({ region });
        this.secretsManagerClient = new SecretsManagerClient({ region });

        console.log('[AWSDiscovery] AWS clients initialized successfully');
    }

    async validateCredentials() {
        console.log('[AWSDiscovery] Validating AWS credentials...');

        try {
            const command = new GetCallerIdentityCommand({});
            const startTime = Date.now();
            const response = await this.stsClient.send(command);
            const duration = Date.now() - startTime;

            console.log('[AWSDiscovery] ✅ Credentials are VALID');
            console.log('[AWSDiscovery]   Account ID:', response.Account);
            console.log('[AWSDiscovery]   User ARN:', response.Arn);
            console.log('[AWSDiscovery]   User ID:', response.UserId);
            console.log('[AWSDiscovery]   Validation took', duration, 'ms');

            return {
                valid: true,
                accountId: response.Account,
                arn: response.Arn,
                userId: response.UserId
            };
        } catch (error) {
            console.error('[AWSDiscovery] ❌ CREDENTIAL VALIDATION FAILED');
            console.error('[AWSDiscovery]   Error:', error.message);
            console.error('[AWSDiscovery]   Error Code:', error.Code || error.code);

            // Provide specific guidance based on error type
            if (error.Code === 'RequestExpired' || error.message.includes('expired')) {
                console.error('\n[AWSDiscovery] 🔍 DIAGNOSIS: Expired Credentials');
                console.error('[AWSDiscovery]   Your AWS credentials have expired.');
                console.error('[AWSDiscovery]   This commonly happens with:');
                console.error('[AWSDiscovery]     - Temporary STS credentials (AWS_ACCESS_KEY_ID starting with "ASIA")');
                console.error('[AWSDiscovery]     - AWS SSO sessions that have timed out');
                console.error('[AWSDiscovery]     - Hardcoded credentials in .env files');
                console.error('\n[AWSDiscovery] 💡 SOLUTIONS:');
                if (process.env.AWS_ACCESS_KEY_ID?.startsWith('ASIA')) {
                    console.error('[AWSDiscovery]   1. Comment out AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file');
                    console.error('[AWSDiscovery]   2. Use AWS_PROFILE instead: AWS_PROFILE=your-profile npm run deploy');
                } else if (process.env.AWS_PROFILE) {
                    console.error('[AWSDiscovery]   1. Refresh your AWS SSO login: aws sso login --profile', process.env.AWS_PROFILE);
                    console.error('[AWSDiscovery]   2. Or regenerate credentials if using IAM user');
                } else {
                    console.error('[AWSDiscovery]   1. Set up AWS profile: aws configure --profile your-profile');
                    console.error('[AWSDiscovery]   2. Or use AWS SSO: aws sso login');
                }
            } else if (error.Code === 'InvalidClientTokenId' || error.Code === 'SignatureDoesNotMatch') {
                console.error('\n[AWSDiscovery] 🔍 DIAGNOSIS: Invalid Credentials');
                console.error('[AWSDiscovery]   Your AWS credentials are not recognized or incorrect.');
                console.error('\n[AWSDiscovery] 💡 SOLUTIONS:');
                console.error('[AWSDiscovery]   1. Check AWS credentials file: cat ~/.aws/credentials');
                console.error('[AWSDiscovery]   2. Verify profile exists: aws configure list-profiles');
                console.error('[AWSDiscovery]   3. Test credentials: aws sts get-caller-identity --profile', process.env.AWS_PROFILE || 'default');
            } else if (error.message.includes('Could not load credentials')) {
                console.error('\n[AWSDiscovery] 🔍 DIAGNOSIS: No Credentials Found');
                console.error('[AWSDiscovery]   AWS SDK cannot find any credentials.');
                console.error('\n[AWSDiscovery] 💡 SOLUTIONS:');
                console.error('[AWSDiscovery]   1. Set AWS_PROFILE: export AWS_PROFILE=your-profile');
                console.error('[AWSDiscovery]   2. Or configure default profile: aws configure');
                console.error('[AWSDiscovery]   3. Or use AWS SSO: aws sso login');
            } else {
                console.error('\n[AWSDiscovery] 💡 GENERAL TROUBLESHOOTING:');
                console.error('[AWSDiscovery]   1. Test credentials manually: aws sts get-caller-identity');
                console.error('[AWSDiscovery]   2. Check ~/.aws/credentials file exists');
                console.error('[AWSDiscovery]   3. Verify network connectivity to AWS');
            }

            console.error('\n[AWSDiscovery] ⛔ Cannot proceed with AWS discovery until credentials are valid.\n');

            throw new Error(`AWS credential validation failed: ${error.message}. See detailed guidance above.`);
        }
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
            console.log('[AWSDiscovery.findDefaultVpc] Starting VPC discovery...');
            console.log('[AWSDiscovery.findDefaultVpc] Request timestamp:', new Date().toISOString());
            console.log('[AWSDiscovery.findDefaultVpc] Region:', this.region);

            const command = new DescribeVpcsCommand({
                Filters: [
                    {
                        Name: 'is-default',
                        Values: ['true'],
                    },
                ],
            });

            console.log('[AWSDiscovery.findDefaultVpc] Sending DescribeVpcsCommand (default VPC)...');
            console.log('[AWSDiscovery.findDefaultVpc] Request time before send:', new Date().toISOString());

            const requestStart = Date.now();
            const response = await this.ec2Client.send(command);
            const requestDuration = Date.now() - requestStart;

            console.log('[AWSDiscovery.findDefaultVpc] Request completed in', requestDuration, 'ms');
            console.log('[AWSDiscovery.findDefaultVpc] Response time:', new Date().toISOString());
            console.log('[AWSDiscovery.findDefaultVpc] Found', response.Vpcs?.length || 0, 'default VPC(s)');

            if (response.Vpcs && response.Vpcs.length > 0) {
                console.log('[AWSDiscovery.findDefaultVpc] Using default VPC:', response.Vpcs[0].VpcId);
                return response.Vpcs[0];
            }

            console.log('[AWSDiscovery.findDefaultVpc] No default VPC found, fetching all VPCs...');
            const allVpcsCommand = new DescribeVpcsCommand({});

            console.log('[AWSDiscovery.findDefaultVpc] Sending DescribeVpcsCommand (all VPCs)...');
            const allVpcsRequestStart = Date.now();
            const allVpcsResponse = await this.ec2Client.send(allVpcsCommand);
            const allVpcsRequestDuration = Date.now() - allVpcsRequestStart;

            console.log('[AWSDiscovery.findDefaultVpc] All VPCs request completed in', allVpcsRequestDuration, 'ms');
            console.log('[AWSDiscovery.findDefaultVpc] Found', allVpcsResponse.Vpcs?.length || 0, 'VPC(s)');

            if (allVpcsResponse.Vpcs && allVpcsResponse.Vpcs.length > 0) {
                console.log('No default VPC found, using first available VPC');
                console.log('[AWSDiscovery.findDefaultVpc] Using VPC:', allVpcsResponse.Vpcs[0].VpcId);
                return allVpcsResponse.Vpcs[0];
            }

            throw new Error('No VPC found in the account');
        } catch (error) {
            console.error('[AWSDiscovery.findDefaultVpc] ERROR occurred at:', new Date().toISOString());
            console.error('[AWSDiscovery.findDefaultVpc] Error type:', error.constructor.name);
            console.error('[AWSDiscovery.findDefaultVpc] Error code:', error.Code || error.code);
            console.error('[AWSDiscovery.findDefaultVpc] Error message:', error.message);
            console.error('[AWSDiscovery.findDefaultVpc] Error $fault:', error.$fault);
            console.error('[AWSDiscovery.findDefaultVpc] Error $metadata:', JSON.stringify(error.$metadata, null, 2));

            if (error.$response) {
                console.error('[AWSDiscovery.findDefaultVpc] Response status:', error.$response.statusCode);
                console.error('[AWSDiscovery.findDefaultVpc] Response headers:', JSON.stringify(error.$response.headers, null, 2));
            }

            console.error('[AWSDiscovery.findDefaultVpc] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
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
                return { primary: null, secondary: null, all: [] };
            }

            // Sort by AZ to get subnets in different zones
            const sortedByAz = publicSubnets.sort((a, b) =>
                a.AvailabilityZone.localeCompare(b.AvailabilityZone)
            );

            // Get subnets from different AZs if possible
            const primary = sortedByAz[0];
            const secondary = sortedByAz.find(s => s.AvailabilityZone !== primary.AvailabilityZone)
                || sortedByAz[1]
                || sortedByAz[0]; // Fallback to same subnet if only one exists

            console.log(
                `Found ${publicSubnets.length} public subnet(s)`
            );
            console.log(`  Primary (NAT Gateway): ${primary.SubnetId} (${primary.AvailabilityZone})`);
            if (secondary.SubnetId !== primary.SubnetId) {
                console.log(`  Secondary (Aurora): ${secondary.SubnetId} (${secondary.AvailabilityZone})`);
            } else {
                console.warn(`  ⚠️  Only one public subnet found - Aurora public deployments will require creating a second subnet`);
            }

            return { primary, secondary, all: publicSubnets };
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

    async findKmsAlias(aliasName) {
        try {
            console.log(`[KMS Alias Discovery] Checking for alias: ${aliasName}`);
            const command = new ListAliasesCommand({});
            const response = await this.kmsClient.send(command);

            if (!response.Aliases || response.Aliases.length === 0) {
                console.log('[KMS Alias Discovery] No aliases found in account');
                return null;
            }

            const targetAlias = response.Aliases.find(
                alias => alias.AliasName === aliasName
            );

            if (targetAlias) {
                console.log(`[KMS Alias Discovery] ✅ Found existing alias: ${aliasName}`);
                console.log(`[KMS Alias Discovery]    Target Key: ${targetAlias.TargetKeyId}`);
                return targetAlias;
            }

            console.log(`[KMS Alias Discovery] Alias ${aliasName} does not exist`);
            return null;
        } catch (error) {
            console.warn(
                `[KMS Alias Discovery] Error checking for alias ${aliasName}:`,
                error.message
            );
            return null;
        }
    }

    async findAuroraCluster(clusterIdentifier = null, serviceName = null, stage = null) {
        try {
            console.log('[AWSDiscovery.findAuroraCluster] Starting Aurora cluster discovery...');

            const command = new DescribeDBClustersCommand({});
            const response = await this.rdsClient.send(command);

            if (!response.DBClusters || response.DBClusters.length === 0) {
                console.log('[AWSDiscovery.findAuroraCluster] No Aurora clusters found');
                return null;
            }

            console.log(`[AWSDiscovery.findAuroraCluster] Found ${response.DBClusters.length} Aurora cluster(s)`);

            // Filter for Aurora PostgreSQL clusters
            const postgresClusters = response.DBClusters.filter(
                cluster => cluster.Engine === 'aurora-postgresql' && cluster.Status === 'available'
            );

            if (postgresClusters.length === 0) {
                console.log('[AWSDiscovery.findAuroraCluster] No available Aurora PostgreSQL clusters found');
                return null;
            }

            // Priority 1: User-specified cluster identifier
            if (clusterIdentifier) {
                const targetCluster = postgresClusters.find(
                    cluster => cluster.DBClusterIdentifier === clusterIdentifier
                );
                if (targetCluster) {
                    console.log(`[AWSDiscovery.findAuroraCluster] Found specified cluster: ${clusterIdentifier}`);
                    return this._formatAuroraCluster(targetCluster);
                }
                console.warn(`[AWSDiscovery.findAuroraCluster] Specified cluster ${clusterIdentifier} not found`);
                return null;
            }

            // Priority 2: Frigg-managed cluster with matching service and stage tags
            if (serviceName && stage) {
                const friggCluster = postgresClusters.find(cluster => {
                    const tags = cluster.TagList || [];
                    const isFrigg = this._isFriggManaged(tags);
                    const matchesService = tags.some(tag => tag.Key === 'Service' && tag.Value === serviceName);
                    const matchesStage = tags.some(tag => tag.Key === 'Stage' && tag.Value === stage);
                    return isFrigg && matchesService && matchesStage;
                });

                if (friggCluster) {
                    console.log(`[AWSDiscovery.findAuroraCluster] Found Frigg-managed cluster: ${friggCluster.DBClusterIdentifier}`);
                    return this._formatAuroraCluster(friggCluster);
                }
            }

            // Priority 3: Any Frigg-managed cluster
            const anyFriggCluster = postgresClusters.find(cluster =>
                this._isFriggManaged(cluster.TagList || [])
            );

            if (anyFriggCluster) {
                console.log(`[AWSDiscovery.findAuroraCluster] Found Frigg-managed cluster: ${anyFriggCluster.DBClusterIdentifier}`);
                return this._formatAuroraCluster(anyFriggCluster);
            }

            // Priority 4: First available cluster
            console.log(`[AWSDiscovery.findAuroraCluster] Using first available cluster: ${postgresClusters[0].DBClusterIdentifier}`);
            return this._formatAuroraCluster(postgresClusters[0]);

        } catch (error) {
            console.error('[AWSDiscovery.findAuroraCluster] Error finding Aurora cluster:', error.message);
            return null;
        }
    }

    async findDBSubnetGroup(vpcId) {
        try {
            console.log(`[AWSDiscovery.findDBSubnetGroup] Looking for DB subnet groups in VPC ${vpcId}...`);

            const command = new DescribeDBSubnetGroupsCommand({});
            const response = await this.rdsClient.send(command);

            if (!response.DBSubnetGroups || response.DBSubnetGroups.length === 0) {
                console.log('[AWSDiscovery.findDBSubnetGroup] No DB subnet groups found');
                return null;
            }

            // Filter by VPC ID
            const vpcSubnetGroups = response.DBSubnetGroups.filter(
                group => group.VpcId === vpcId
            );

            if (vpcSubnetGroups.length === 0) {
                console.log(`[AWSDiscovery.findDBSubnetGroup] No DB subnet groups found in VPC ${vpcId}`);
                return null;
            }

            // Priority 1: Frigg-managed subnet group
            const friggSubnetGroup = vpcSubnetGroups.find(group =>
                this._isFriggManaged(group.Tags || [])
            );

            if (friggSubnetGroup) {
                console.log(`[AWSDiscovery.findDBSubnetGroup] Found Frigg-managed subnet group: ${friggSubnetGroup.DBSubnetGroupName}`);
                return {
                    name: friggSubnetGroup.DBSubnetGroupName,
                    vpcId: friggSubnetGroup.VpcId,
                    subnets: friggSubnetGroup.Subnets.map(s => s.SubnetIdentifier),
                    description: friggSubnetGroup.DBSubnetGroupDescription
                };
            }

            // Priority 2: First available subnet group
            const subnetGroup = vpcSubnetGroups[0];
            console.log(`[AWSDiscovery.findDBSubnetGroup] Found subnet group: ${subnetGroup.DBSubnetGroupName}`);
            return {
                name: subnetGroup.DBSubnetGroupName,
                vpcId: subnetGroup.VpcId,
                subnets: subnetGroup.Subnets.map(s => s.SubnetIdentifier),
                description: subnetGroup.DBSubnetGroupDescription
            };

        } catch (error) {
            console.error('[AWSDiscovery.findDBSubnetGroup] Error finding DB subnet group:', error.message);
            return null;
        }
    }

    async findDatabaseSecret(serviceName, stage) {
        try {
            console.log(`[AWSDiscovery.findDatabaseSecret] Looking for database secret (service: ${serviceName}, stage: ${stage})...`);

            const command = new ListSecretsCommand({
                Filters: [
                    {
                        Key: 'tag-key',
                        Values: ['ManagedBy']
                    }
                ]
            });
            const response = await this.secretsManagerClient.send(command);

            if (!response.SecretList || response.SecretList.length === 0) {
                console.log('[AWSDiscovery.findDatabaseSecret] No secrets found');
                return null;
            }

            // Filter for Frigg-managed database secrets
            const friggSecrets = response.SecretList.filter(secret => {
                const tags = secret.Tags || [];
                const isFrigg = this._isFriggManaged(tags);
                const isDatabase = secret.Name?.includes('aurora') || secret.Name?.includes('database');
                return isFrigg && isDatabase;
            });

            if (friggSecrets.length === 0) {
                console.log('[AWSDiscovery.findDatabaseSecret] No Frigg-managed database secrets found');
                return null;
            }

            // Priority 1: Secret with matching service and stage tags
            if (serviceName && stage) {
                const matchingSecret = friggSecrets.find(secret => {
                    const tags = secret.Tags || [];
                    const matchesService = tags.some(tag => tag.Key === 'Service' && tag.Value === serviceName);
                    const matchesStage = tags.some(tag => tag.Key === 'Stage' && tag.Value === stage);
                    return matchesService && matchesStage;
                });

                if (matchingSecret) {
                    console.log(`[AWSDiscovery.findDatabaseSecret] Found matching secret: ${matchingSecret.Name}`);
                    return {
                        arn: matchingSecret.ARN,
                        name: matchingSecret.Name
                    };
                }
            }

            // Priority 2: First Frigg-managed database secret
            const secret = friggSecrets[0];
            console.log(`[AWSDiscovery.findDatabaseSecret] Found Frigg-managed secret: ${secret.Name}`);
            return {
                arn: secret.ARN,
                name: secret.Name
            };

        } catch (error) {
            console.error('[AWSDiscovery.findDatabaseSecret] Error finding database secret:', error.message);
            return null;
        }
    }

    async discoverAuroraResources(options = {}) {
        try {
            console.log('\n🔍 Discovering Aurora PostgreSQL resources...');
            console.log('═'.repeat(60));

            const {
                vpcId,
                serviceName,
                stage,
                management = 'discover',
                clusterIdentifier = null
            } = options;

            const result = {
                clusterIdentifier: null,
                endpoint: null,
                port: null,
                engine: null,
                engineVersion: null,
                status: null,
                dbSubnetGroupName: null,
                secretArn: null,
                secretName: null,
                needsCreation: false
            };

            // For 'use-existing' mode, cluster identifier is required
            if (management === 'use-existing' && !clusterIdentifier) {
                throw new Error('clusterIdentifier is required when management mode is "use-existing"');
            }

            // For 'create-new' mode, skip discovery
            if (management === 'create-new') {
                console.log('💡 Management mode is "create-new" - will provision new Aurora cluster');
                result.needsCreation = true;
                return result;
            }

            // Discover Aurora cluster
            const cluster = await this.findAuroraCluster(clusterIdentifier, serviceName, stage);

            if (!cluster) {
                if (management === 'discover') {
                    console.log('⚠️  No Aurora cluster found - will provision new cluster');
                    result.needsCreation = true;
                    return result;
                }
                throw new Error(`No Aurora cluster found with identifier: ${clusterIdentifier}`);
            }

            result.clusterIdentifier = cluster.identifier;
            result.endpoint = cluster.endpoint;
            result.port = cluster.port;
            result.engine = cluster.engine;
            result.engineVersion = cluster.engineVersion;
            result.status = cluster.status;
            result.masterUsername = cluster.masterUsername;
            result.isFriggManaged = cluster.isFriggManaged;

            console.log(`\n✅ Found Aurora Cluster: ${cluster.identifier}`);
            console.log(`   Endpoint: ${cluster.endpoint}:${cluster.port}`);
            console.log(`   Engine: ${cluster.engine} ${cluster.engineVersion}`);
            console.log(`   Status: ${cluster.status}`);

            // Discover DB subnet group
            const subnetGroup = await this.findDBSubnetGroup(vpcId);
            if (subnetGroup) {
                result.dbSubnetGroupName = subnetGroup.name;
                console.log(`\n✅ Found DB Subnet Group: ${subnetGroup.name}`);
                console.log(`   Subnets: ${subnetGroup.subnets.join(', ')}`);
            }

            // Discover database secret
            const secret = await this.findDatabaseSecret(serviceName, stage);
            if (secret) {
                result.secretArn = secret.arn;
                result.secretName = secret.name;
                console.log(`\n✅ Found Database Secret: ${secret.name}`);
            }

            console.log(`\n${'═'.repeat(60)}`);
            console.log('📋 Aurora Discovery Summary:');
            console.log(`  Cluster: ${result.clusterIdentifier || 'Not found'}`);
            console.log(`  Subnet Group: ${result.dbSubnetGroupName || 'Not found'}`);
            console.log(`  Secret: ${result.secretName || 'Not found'}`);
            console.log(`${'═'.repeat(60)}\n`);

            return result;

        } catch (error) {
            console.error('❌ Aurora resource discovery failed:', error.message);
            throw error;
        }
    }

    _formatAuroraCluster(cluster) {
        return {
            identifier: cluster.DBClusterIdentifier,
            endpoint: cluster.Endpoint,
            readerEndpoint: cluster.ReaderEndpoint,
            port: cluster.Port,
            engine: cluster.Engine,
            engineVersion: cluster.EngineVersion,
            status: cluster.Status,
            masterUsername: cluster.MasterUsername,
            databaseName: cluster.DatabaseName,
            vpcSecurityGroups: (cluster.VpcSecurityGroups || []).map(sg => sg.VpcSecurityGroupId),
            dbSubnetGroup: cluster.DBSubnetGroup,
            arn: cluster.DBClusterArn,
            isFriggManaged: this._isFriggManaged(cluster.TagList || [])
        };
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

            // Validate credentials before attempting any AWS operations
            await this.validateCredentials();
            console.log(''); // Add spacing after validation

            const vpc = await this.findDefaultVpc();
            console.log(`\n✅ Found VPC: ${vpc.VpcId}`);

            const autoConvert = options.vpc?.selfHeal || false;

            const privateSubnets = await this.findPrivateSubnets(
                vpc.VpcId,
                autoConvert
            );
            console.log(
                `\n✅ Selected subnets for Lambda: ${privateSubnets
                    .map((s) => s.SubnetId)
                    .join(', ')}`
            );

            const publicSubnets = await this.findPublicSubnets(vpc.VpcId);
            if (publicSubnets.primary) {
                console.log(
                    `\n✅ Found public subnet(s) for NAT Gateway and Aurora`
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

            // Check if KMS alias already exists
            let kmsAliasExists = false;
            if (options.serviceName && options.stage) {
                const aliasName = `alias/${options.serviceName}-${options.stage}-frigg-kms`;
                const existingAlias = await this.findKmsAlias(aliasName);
                kmsAliasExists = existingAlias !== null;
            }

            // Discover Aurora PostgreSQL resources if enabled
            let auroraResources = {};
            if (options.database?.postgres?.enable) {
                auroraResources = await this.discoverAuroraResources({
                    vpcId: vpc.VpcId,
                    serviceName: options.serviceName,
                    stage: options.stage,
                    management: options.database.postgres.management,
                    clusterIdentifier: options.database.postgres.clusterIdentifier,
                });
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
                `  NAT Subnet: ${publicSubnet?.SubnetId || 'None (needs creation)'
                }`
            );
            console.log(
                `  NAT Gateway: ${natGatewayId || 'None (will be created)'}`
            );
            console.log(
                `  Elastic IP: ${elasticIpAllocationId || 'None (will be allocated)'
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
                publicSubnetId: publicSubnets.primary?.SubnetId || null, // Keep for NAT Gateway backward compat
                publicSubnetId1: publicSubnets.primary?.SubnetId || null,
                publicSubnetId2: publicSubnets.secondary?.SubnetId || null,
                privateRouteTableId: routeTable.RouteTableId,
                defaultKmsKeyId: kmsKeyArn,
                kmsAliasExists: kmsAliasExists,
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
                aurora: auroraResources,
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
