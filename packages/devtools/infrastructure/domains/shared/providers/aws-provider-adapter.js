/**
 * AWS Provider Adapter
 * 
 * Adapter - Hexagonal Architecture
 * 
 * Implements CloudProviderAdapter interface for Amazon Web Services.
 * Handles AWS-specific resource discovery using AWS SDK v3.
 * 
 * This adapter lazy-loads AWS SDK clients to minimize cold start time
 * and memory usage when not all discovery features are needed.
 */

const { CloudProviderAdapter } = require('./cloud-provider-adapter');

// Lazy-loaded AWS SDK clients
let EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand,
    DescribeRouteTablesCommand, DescribeNatGatewaysCommand, DescribeInternetGatewaysCommand,
    DescribeVpcEndpointsCommand;
let KMSClient, ListKeysCommand, DescribeKeyCommand, ListAliasesCommand;
let RDSClient, DescribeDBClustersCommand, DescribeDBInstancesCommand;
let SSMClient, GetParameterCommand, GetParametersByPathCommand;
let SecretsManagerClient, ListSecretsCommand, GetSecretValueCommand;

/**
 * Lazy load EC2 SDK
 */
function loadEC2() {
    if (!EC2Client) {
        const ec2Module = require('@aws-sdk/client-ec2');
        EC2Client = ec2Module.EC2Client;
        DescribeVpcsCommand = ec2Module.DescribeVpcsCommand;
        DescribeSubnetsCommand = ec2Module.DescribeSubnetsCommand;
        DescribeSecurityGroupsCommand = ec2Module.DescribeSecurityGroupsCommand;
        DescribeRouteTablesCommand = ec2Module.DescribeRouteTablesCommand;
        DescribeNatGatewaysCommand = ec2Module.DescribeNatGatewaysCommand;
        DescribeInternetGatewaysCommand = ec2Module.DescribeInternetGatewaysCommand;
        DescribeVpcEndpointsCommand = ec2Module.DescribeVpcEndpointsCommand;
    }
}

/**
 * Lazy load KMS SDK
 */
function loadKMS() {
    if (!KMSClient) {
        const kmsModule = require('@aws-sdk/client-kms');
        KMSClient = kmsModule.KMSClient;
        ListKeysCommand = kmsModule.ListKeysCommand;
        DescribeKeyCommand = kmsModule.DescribeKeyCommand;
        ListAliasesCommand = kmsModule.ListAliasesCommand;
    }
}

/**
 * Lazy load RDS SDK
 */
function loadRDS() {
    if (!RDSClient) {
        const rdsModule = require('@aws-sdk/client-rds');
        RDSClient = rdsModule.RDSClient;
        DescribeDBClustersCommand = rdsModule.DescribeDBClustersCommand;
        DescribeDBInstancesCommand = rdsModule.DescribeDBInstancesCommand;
    }
}

/**
 * Lazy load SSM SDK
 */
function loadSSM() {
    if (!SSMClient) {
        const ssmModule = require('@aws-sdk/client-ssm');
        SSMClient = ssmModule.SSMClient;
        GetParameterCommand = ssmModule.GetParameterCommand;
        GetParametersByPathCommand = ssmModule.GetParametersByPathCommand;
    }
}

/**
 * Lazy load Secrets Manager SDK
 */
function loadSecretsManager() {
    if (!SecretsManagerClient) {
        const smModule = require('@aws-sdk/client-secrets-manager');
        SecretsManagerClient = smModule.SecretsManagerClient;
        ListSecretsCommand = smModule.ListSecretsCommand;
        GetSecretValueCommand = smModule.GetSecretValueCommand;
    }
}

class AWSProviderAdapter extends CloudProviderAdapter {
    constructor(region, credentials = {}) {
        super();
        this.region = region || process.env.AWS_REGION || 'us-east-1';
        this.credentials = credentials;

        // Initialize clients as null - will be lazy loaded
        this.ec2 = null;
        this.kms = null;
        this.rds = null;
        this.ssm = null;
        this.secretsManager = null;
    }

    /**
     * Get EC2 client (lazy loaded)
     */
    getEC2Client() {
        if (!this.ec2) {
            loadEC2();
            this.ec2 = new EC2Client({
                region: this.region,
                ...this.credentials,
            });
        }
        return this.ec2;
    }

    /**
     * Get KMS client (lazy loaded)
     */
    getKMSClient() {
        if (!this.kms) {
            loadKMS();
            this.kms = new KMSClient({
                region: this.region,
                ...this.credentials,
            });
        }
        return this.kms;
    }

    /**
     * Get RDS client (lazy loaded)
     */
    getRDSClient() {
        if (!this.rds) {
            loadRDS();
            this.rds = new RDSClient({
                region: this.region,
                ...this.credentials,
            });
        }
        return this.rds;
    }

    /**
     * Get SSM client (lazy loaded)
     */
    getSSMClient() {
        if (!this.ssm) {
            loadSSM();
            this.ssm = new SSMClient({
                region: this.region,
                ...this.credentials,
            });
        }
        return this.ssm;
    }

    /**
     * Get Secrets Manager client (lazy loaded)
     */
    getSecretsManagerClient() {
        if (!this.secretsManager) {
            loadSecretsManager();
            this.secretsManager = new SecretsManagerClient({
                region: this.region,
                ...this.credentials,
            });
        }
        return this.secretsManager;
    }

    getName() {
        return 'aws';
    }

    getSupportedRegions() {
        return [
            'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
            'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
            'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
            'sa-east-1', 'ca-central-1',
        ];
    }

    /**
     * Discover VPC resources
     * 
     * @param {Object} config - Discovery configuration
     * @returns {Promise<Object>} Discovered VPC resources
     */
    async discoverVpc(config) {
        const ec2 = this.getEC2Client();
        const result = {
            vpcId: null,
            vpcCidr: null,
            subnets: [],
            securityGroups: [],
            routeTables: [],
            natGateways: [],
            internetGateways: [],
            vpcEndpoints: [],
        };

        try {
            // Discover VPC
            const vpcFilter = config.vpcId
                ? [{ Name: 'vpc-id', Values: [config.vpcId] }]
                : [{ Name: 'isDefault', Values: ['true'] }];

            const vpcsResponse = await ec2.send(new DescribeVpcsCommand({
                Filters: vpcFilter,
            }));

            if (vpcsResponse.Vpcs && vpcsResponse.Vpcs.length > 0) {
                const vpc = vpcsResponse.Vpcs[0];
                result.vpcId = vpc.VpcId;
                result.vpcCidr = vpc.CidrBlock;

                // Discover subnets in VPC
                const subnetsResponse = await ec2.send(new DescribeSubnetsCommand({
                    Filters: [{ Name: 'vpc-id', Values: [result.vpcId] }],
                }));
                result.subnets = subnetsResponse.Subnets || [];

                // Discover security groups
                const sgResponse = await ec2.send(new DescribeSecurityGroupsCommand({
                    Filters: [{ Name: 'vpc-id', Values: [result.vpcId] }],
                }));
                result.securityGroups = sgResponse.SecurityGroups || [];

                // Discover route tables
                const rtResponse = await ec2.send(new DescribeRouteTablesCommand({
                    Filters: [{ Name: 'vpc-id', Values: [result.vpcId] }],
                }));
                result.routeTables = rtResponse.RouteTables || [];

                // Discover NAT gateways
                const natResponse = await ec2.send(new DescribeNatGatewaysCommand({
                    Filter: [{ Name: 'vpc-id', Values: [result.vpcId] }],
                }));
                result.natGateways = natResponse.NatGateways || [];

                // Discover Internet gateways
                const igwResponse = await ec2.send(new DescribeInternetGatewaysCommand({
                    Filters: [
                        { Name: 'attachment.vpc-id', Values: [result.vpcId] },
                    ],
                }));
                result.internetGateways = igwResponse.InternetGateways || [];

                // Discover VPC Endpoints
                const vpcEndpointsResponse = await ec2.send(new DescribeVpcEndpointsCommand({
                    Filters: [
                        { Name: 'vpc-id', Values: [result.vpcId] },
                    ],
                }));
                result.vpcEndpoints = vpcEndpointsResponse.VpcEndpoints || [];
            }
        } catch (error) {
            console.error('AWS VPC discovery failed:', error);
            throw new Error(`Failed to discover AWS VPC: ${error.message}`);
        }

        return result;
    }

    /**
     * Discover KMS keys
     * 
     * @param {Object} config - Discovery configuration
     * @returns {Promise<Object>} Discovered KMS keys
     */
    async discoverKmsKeys(config) {
        const kms = this.getKMSClient();
        const result = {
            keys: [],
            aliases: [],
            defaultKey: null,
        };

        try {
            // List KMS keys
            const keysResponse = await kms.send(new ListKeysCommand({}));

            if (keysResponse.Keys && keysResponse.Keys.length > 0) {
                // Get details for each key
                for (const key of keysResponse.Keys) {
                    try {
                        const keyDetails = await kms.send(new DescribeKeyCommand({
                            KeyId: key.KeyId,
                        }));

                        if (keyDetails.KeyMetadata && keyDetails.KeyMetadata.Enabled) {
                            result.keys.push(keyDetails.KeyMetadata);

                            // Set first enabled key as default
                            if (!result.defaultKey) {
                                result.defaultKey = keyDetails.KeyMetadata;
                            }
                        }
                    } catch (error) {
                        // Skip keys we can't access
                        console.warn(`Could not describe key ${key.KeyId}:`, error.message);
                    }
                }
            }

            // List KMS aliases
            const aliasesResponse = await kms.send(new ListAliasesCommand({}));
            result.aliases = aliasesResponse.Aliases || [];

            // If a specific alias is requested, find it
            if (config.keyAlias) {
                const alias = result.aliases.find(a => a.AliasName === config.keyAlias);
                if (alias && alias.TargetKeyId) {
                    const key = result.keys.find(k => k.KeyId === alias.TargetKeyId);
                    if (key) {
                        result.defaultKey = key;
                    }
                }
            }
        } catch (error) {
            console.error('AWS KMS discovery failed:', error);
            throw new Error(`Failed to discover AWS KMS keys: ${error.message}`);
        }

        return result;
    }

    /**
     * Discover database resources (RDS/Aurora)
     * 
     * @param {Object} config - Discovery configuration
     * @returns {Promise<Object>} Discovered database resources
     */
    async discoverDatabase(config) {
        const rds = this.getRDSClient();
        const result = {
            clusters: [],
            instances: [],
            endpoint: null,
            port: null,
            engine: null,
            securityGroupIds: [],
        };

        try {
            // Discover Aurora clusters
            const clustersResponse = await rds.send(new DescribeDBClustersCommand({}));

            if (clustersResponse.DBClusters) {
                result.clusters = clustersResponse.DBClusters;

                // Find cluster matching config
                if (config.databaseId) {
                    const cluster = result.clusters.find(c =>
                        c.DBClusterIdentifier === config.databaseId
                    );
                    if (cluster) {
                        result.endpoint = cluster.Endpoint;
                        result.port = cluster.Port;
                        result.engine = cluster.Engine;
                        result.securityGroupIds = (cluster.VpcSecurityGroups || []).map(sg => sg.VpcSecurityGroupId);
                    }
                } else if (result.clusters.length > 0) {
                    // Use first available cluster
                    const cluster = result.clusters[0];
                    result.endpoint = cluster.Endpoint;
                    result.port = cluster.Port;
                    result.engine = cluster.Engine;
                    result.securityGroupIds = (cluster.VpcSecurityGroups || []).map(sg => sg.VpcSecurityGroupId);
                }
            }

            // Discover RDS instances (if no cluster found)
            if (!result.endpoint) {
                const instancesResponse = await rds.send(new DescribeDBInstancesCommand({}));
                if (instancesResponse.DBInstances) {
                    result.instances = instancesResponse.DBInstances;

                    if (config.databaseId) {
                        const instance = result.instances.find(i =>
                            i.DBInstanceIdentifier === config.databaseId
                        );
                        if (instance) {
                            result.endpoint = instance.Endpoint?.Address;
                            result.port = instance.Endpoint?.Port;
                            result.engine = instance.Engine;
                        }
                    } else if (result.instances.length > 0) {
                        const instance = result.instances[0];
                        result.endpoint = instance.Endpoint?.Address;
                        result.port = instance.Endpoint?.Port;
                        result.engine = instance.Engine;
                    }
                }
            }
        } catch (error) {
            console.error('AWS RDS discovery failed:', error);
            throw new Error(`Failed to discover AWS databases: ${error.message}`);
        }

        return result;
    }

    /**
     * Discover SSM parameters
     * 
     * @param {Object} config - Discovery configuration
     * @returns {Promise<Object>} Discovered parameters
     */
    async discoverParameters(config) {
        const ssm = this.getSSMClient();
        const result = {
            parameters: [],
            secrets: [],
        };

        try {
            if (config.parameterPath) {
                const response = await ssm.send(new GetParametersByPathCommand({
                    Path: config.parameterPath,
                    Recursive: true,
                }));
                result.parameters = response.Parameters || [];
            }

            // Discover secrets if enabled
            if (config.includeSecrets) {
                const sm = this.getSecretsManagerClient();
                const secretsResponse = await sm.send(new ListSecretsCommand({}));
                result.secrets = secretsResponse.SecretList || [];
            }
        } catch (error) {
            console.error('AWS SSM discovery failed:', error);
            throw new Error(`Failed to discover AWS parameters: ${error.message}`);
        }

        return result;
    }
}

module.exports = {
    AWSProviderAdapter,
};

