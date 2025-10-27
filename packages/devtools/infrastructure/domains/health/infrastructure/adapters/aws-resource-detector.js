/**
 * AWSResourceDetector - AWS Resource Discovery Adapter
 *
 * Infrastructure Adapter - Hexagonal Architecture
 *
 * Implements IResourceDetector port for AWS.
 * Discovers cloud resources using AWS SDK v3 (EC2, RDS, KMS).
 *
 * Supports:
 * - EC2: VPC, Subnet, SecurityGroup, RouteTable
 * - RDS: DBCluster
 * - KMS: Key
 *
 * Lazy-loads AWS SDK to minimize cold start time and memory usage.
 */

const IResourceDetector = require('../../application/ports/IResourceDetector');

// Lazy-loaded AWS SDK clients
let EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand,
    DescribeRouteTablesCommand;
let RDSClient, DescribeDBClustersCommand;
let KMSClient, ListKeysCommand, DescribeKeyCommand, ListAliasesCommand;

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

class AWSResourceDetector extends IResourceDetector {
    /**
     * Supported resource types
     * @private
     */
    static SUPPORTED_TYPES = [
        'AWS::EC2::VPC',
        'AWS::EC2::Subnet',
        'AWS::EC2::SecurityGroup',
        'AWS::EC2::RouteTable',
        'AWS::RDS::DBCluster',
        'AWS::KMS::Key',
    ];

    /**
     * Create AWS Resource Detector
     *
     * @param {Object} [config={}]
     * @param {string} [config.region] - AWS region (defaults to AWS_REGION env var)
     */
    constructor(config = {}) {
        super();
        this.region = config.region || process.env.AWS_REGION || 'us-east-1';
        this.ec2Client = null;
        this.rdsClient = null;
        this.kmsClient = null;
    }

    /**
     * Get or create EC2 client
     * @private
     */
    _getEC2Client() {
        if (!this.ec2Client) {
            loadEC2();
            this.ec2Client = new EC2Client({ region: this.region });
        }
        return this.ec2Client;
    }

    /**
     * Get or create RDS client
     * @private
     */
    _getRDSClient() {
        if (!this.rdsClient) {
            loadRDS();
            this.rdsClient = new RDSClient({ region: this.region });
        }
        return this.rdsClient;
    }

    /**
     * Get or create KMS client
     * @private
     */
    _getKMSClient() {
        if (!this.kmsClient) {
            loadKMS();
            this.kmsClient = new KMSClient({ region: this.region });
        }
        return this.kmsClient;
    }

    /**
     * Get list of supported resource types
     */
    async getSupportedResourceTypes() {
        return [...AWSResourceDetector.SUPPORTED_TYPES];
    }

    /**
     * Detect all resources of a specific type in a region
     */
    async detectResources({ resourceType, region, filters = {} }) {
        if (!AWSResourceDetector.SUPPORTED_TYPES.includes(resourceType)) {
            throw new Error(`Resource type ${resourceType} is not supported`);
        }

        switch (resourceType) {
            case 'AWS::EC2::VPC':
                return await this._detectVPCs(filters);
            case 'AWS::EC2::Subnet':
                return await this._detectSubnets(filters);
            case 'AWS::EC2::SecurityGroup':
                return await this._detectSecurityGroups(filters);
            case 'AWS::EC2::RouteTable':
                return await this._detectRouteTables(filters);
            case 'AWS::RDS::DBCluster':
                return await this._detectDBClusters(filters);
            case 'AWS::KMS::Key':
                return await this._detectKMSKeys(filters);
            default:
                throw new Error(`Resource type ${resourceType} is not supported`);
        }
    }

    /**
     * Get details for a specific resource
     */
    async getResourceDetails({ resourceType, physicalId, region }) {
        const resources = await this.detectResources({ resourceType, region });

        const resource = resources.find((r) => r.physicalId === physicalId);

        if (!resource) {
            throw new Error(`Resource ${physicalId} not found`);
        }

        return resource;
    }

    /**
     * Check if a resource exists
     */
    async resourceExists({ resourceType, physicalId, region }) {
        try {
            await this.getResourceDetails({ resourceType, physicalId, region });
            return true;
        } catch (error) {
            if (error.message?.includes('not found')) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Detect resources by tags
     */
    async detectResourcesByTags({ tags, region, resourceTypes = [] }) {
        const types = resourceTypes.length > 0 ? resourceTypes : AWSResourceDetector.SUPPORTED_TYPES;

        const allResources = [];

        for (const resourceType of types) {
            const resources = await this.detectResources({
                resourceType,
                region,
                filters: { tags },
            });

            allResources.push(...resources);
        }

        return allResources;
    }

    /**
     * Find orphaned resources for a specific stack
     *
     * Orphaned resources are resources that:
     * 1. Have frigg:stack tag matching the target stack name
     * 2. Do NOT have aws:cloudformation:stack-name tag (not managed by CloudFormation)
     * 3. Are not default AWS resources (default VPC, AWS-managed KMS keys)
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Target stack
     * @param {Array} params.stackResources - Resources currently in stack template
     * @returns {Promise<Array>} Orphaned resources
     */
    async findOrphanedResources({ stackIdentifier, stackResources }) {
        const orphans = [];

        // Extract unique resource types from stack template
        const resourceTypesInStack = [...new Set(stackResources.map((r) => r.resourceType))];

        // Only check resource types that exist in the stack template
        const typesToCheck = resourceTypesInStack.filter((type) =>
            AWSResourceDetector.SUPPORTED_TYPES.includes(type)
        );

        for (const resourceType of typesToCheck) {
            const resources = await this.detectResources({
                resourceType,
                region: stackIdentifier.region,
            });

            for (const resource of resources) {
                // Rule 1: Must have frigg:stack tag matching target stack
                const friggStackTag = resource.tags?.['frigg:stack'];
                if (friggStackTag !== stackIdentifier.stackName) {
                    continue;
                }

                // Rule 2: Must NOT have aws:cloudformation:stack-name tag
                const cfnStackTag = resource.tags?.['aws:cloudformation:stack-name'];
                if (cfnStackTag) {
                    continue; // Managed by CloudFormation - not orphaned
                }

                // Rule 3: Filter out default AWS resources
                if (this._isDefaultAWSResource(resource)) {
                    continue;
                }

                // This resource has frigg:stack tag but is not in CloudFormation
                orphans.push({
                    ...resource,
                    isOrphaned: true,
                    reason: `Resource ${resource.physicalId} exists in the cloud but is not managed by CloudFormation stack ${stackIdentifier.stackName}.`,
                });
            }
        }

        return orphans;
    }

    /**
     * Check if resource is a default AWS resource that should be ignored
     * @private
     */
    _isDefaultAWSResource(resource) {
        // Default VPC (172.31.0.0/16 CIDR block)
        if (
            resource.resourceType === 'AWS::EC2::VPC' &&
            (resource.properties?.IsDefault === true ||
                resource.properties?.CidrBlock === '172.31.0.0/16')
        ) {
            return true;
        }

        // AWS-managed KMS keys (KeyManager === 'AWS')
        if (
            resource.resourceType === 'AWS::KMS::Key' &&
            resource.properties?.KeyManager === 'AWS'
        ) {
            return true;
        }

        // Default security groups (GroupName === 'default')
        if (
            resource.resourceType === 'AWS::EC2::SecurityGroup' &&
            resource.properties?.GroupName === 'default'
        ) {
            return true;
        }

        return false;
    }

    // ========================================
    // Private Resource Detection Methods
    // ========================================

    /**
     * Detect VPCs
     * @private
     */
    async _detectVPCs(filters) {
        const client = this._getEC2Client();

        const command = new DescribeVpcsCommand({});
        const response = await client.send(command);

        const vpcs = response.Vpcs || [];

        return vpcs
            .filter((vpc) => this._matchesTagFilter(vpc.Tags, filters.tags))
            .map((vpc) => ({
                physicalId: vpc.VpcId,
                resourceType: 'AWS::EC2::VPC',
                properties: {
                    VpcId: vpc.VpcId,
                    CidrBlock: vpc.CidrBlock,
                    State: vpc.State,
                    IsDefault: vpc.IsDefault,
                    EnableDnsHostnames: vpc.EnableDnsHostnames,
                    EnableDnsSupport: vpc.EnableDnsSupport,
                },
                tags: this._parseTags(vpc.Tags),
                createdTime: new Date(), // VPCs don't have creation time in API
            }));
    }

    /**
     * Detect Subnets
     * @private
     */
    async _detectSubnets(filters) {
        const client = this._getEC2Client();

        const command = new DescribeSubnetsCommand({});
        const response = await client.send(command);

        const subnets = response.Subnets || [];

        return subnets
            .filter((subnet) => this._matchesTagFilter(subnet.Tags, filters.tags))
            .map((subnet) => ({
                physicalId: subnet.SubnetId,
                resourceType: 'AWS::EC2::Subnet',
                properties: {
                    SubnetId: subnet.SubnetId,
                    VpcId: subnet.VpcId,
                    CidrBlock: subnet.CidrBlock,
                    AvailabilityZone: subnet.AvailabilityZone,
                    State: subnet.State,
                },
                tags: this._parseTags(subnet.Tags),
                createdTime: new Date(),
            }));
    }

    /**
     * Detect SecurityGroups
     * @private
     */
    async _detectSecurityGroups(filters) {
        const client = this._getEC2Client();

        const command = new DescribeSecurityGroupsCommand({});
        const response = await client.send(command);

        const securityGroups = response.SecurityGroups || [];

        return securityGroups
            .filter((sg) => this._matchesTagFilter(sg.Tags, filters.tags))
            .map((sg) => ({
                physicalId: sg.GroupId,
                resourceType: 'AWS::EC2::SecurityGroup',
                properties: {
                    GroupId: sg.GroupId,
                    GroupName: sg.GroupName,
                    Description: sg.Description,
                    VpcId: sg.VpcId,
                },
                tags: this._parseTags(sg.Tags),
                createdTime: new Date(),
            }));
    }

    /**
     * Detect RouteTables
     * @private
     */
    async _detectRouteTables(filters) {
        const client = this._getEC2Client();

        const command = new DescribeRouteTablesCommand({});
        const response = await client.send(command);

        const routeTables = response.RouteTables || [];

        return routeTables
            .filter((rt) => this._matchesTagFilter(rt.Tags, filters.tags))
            .map((rt) => ({
                physicalId: rt.RouteTableId,
                resourceType: 'AWS::EC2::RouteTable',
                properties: {
                    RouteTableId: rt.RouteTableId,
                    VpcId: rt.VpcId,
                    Routes: rt.Routes,
                    Associations: rt.Associations,
                },
                tags: this._parseTags(rt.Tags),
                createdTime: new Date(),
            }));
    }

    /**
     * Detect RDS DBClusters
     * @private
     */
    async _detectDBClusters(filters) {
        const client = this._getRDSClient();

        const command = new DescribeDBClustersCommand({});
        const response = await client.send(command);

        const dbClusters = response.DBClusters || [];

        return dbClusters
            .filter((cluster) => this._matchesTagFilter(cluster.TagList, filters.tags))
            .map((cluster) => ({
                physicalId: cluster.DBClusterIdentifier,
                resourceType: 'AWS::RDS::DBCluster',
                properties: {
                    DBClusterIdentifier: cluster.DBClusterIdentifier,
                    DBClusterArn: cluster.DBClusterArn,
                    Engine: cluster.Engine,
                    EngineVersion: cluster.EngineVersion,
                    Status: cluster.Status,
                },
                tags: this._parseTags(cluster.TagList),
                createdTime: cluster.ClusterCreateTime,
            }));
    }

    /**
     * Detect KMS Keys
     * @private
     */
    async _detectKMSKeys(filters) {
        const client = this._getKMSClient();

        // List all keys
        const listCommand = new ListKeysCommand({});
        const listResponse = await client.send(listCommand);

        const keys = listResponse.Keys || [];
        const resources = [];

        // Get details for each key
        for (const key of keys) {
            const describeCommand = new DescribeKeyCommand({ KeyId: key.KeyId });
            const describeResponse = await client.send(describeCommand);
            const keyMetadata = describeResponse.KeyMetadata;

            // Get aliases for this key
            const aliasCommand = new ListAliasesCommand({ KeyId: key.KeyId });
            const aliasResponse = await client.send(aliasCommand);

            resources.push({
                physicalId: keyMetadata.KeyId,
                resourceType: 'AWS::KMS::Key',
                properties: {
                    KeyId: keyMetadata.KeyId,
                    Arn: keyMetadata.Arn,
                    Enabled: keyMetadata.Enabled,
                    KeyState: keyMetadata.KeyState,
                    KeyManager: keyMetadata.KeyManager,
                },
                tags: {}, // KMS uses separate tagging API
                createdTime: keyMetadata.CreationDate,
            });
        }

        return resources;
    }

    // ========================================
    // Private Helper Methods
    // ========================================

    /**
     * Parse AWS tags to key-value object
     * @private
     */
    _parseTags(tags) {
        if (!tags || tags.length === 0) {
            return {};
        }

        const result = {};
        for (const tag of tags) {
            result[tag.Key] = tag.Value;
        }
        return result;
    }

    /**
     * Check if resource tags match filter
     * @private
     */
    _matchesTagFilter(resourceTags, filterTags) {
        if (!filterTags || Object.keys(filterTags).length === 0) {
            return true; // No filter, match all
        }

        const tags = this._parseTags(resourceTags);

        // Check if all filter tags match
        for (const [key, value] of Object.entries(filterTags)) {
            if (tags[key] !== value) {
                return false;
            }
        }

        return true;
    }
}

module.exports = AWSResourceDetector;
