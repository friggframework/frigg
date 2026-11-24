/**
 * AWSResourceImporter - AWS CloudFormation Resource Import Adapter
 *
 * Infrastructure Adapter - Hexagonal Architecture
 *
 * Implements IResourceImporter port for AWS CloudFormation.
 * Handles resource import operations using CloudFormation change sets.
 *
 * Lazy-loads AWS SDK to minimize cold start time and memory usage.
 */

const IResourceImporter = require('../../application/ports/IResourceImporter');

// Lazy-loaded AWS SDK CloudFormation client
let CloudFormationClient,
    CreateChangeSetCommand,
    DescribeChangeSetCommand,
    ExecuteChangeSetCommand,
    GetTemplateCommand;

/**
 * Lazy load CloudFormation SDK
 */
function loadCloudFormation() {
    if (!CloudFormationClient) {
        const cfModule = require('@aws-sdk/client-cloudformation');
        CloudFormationClient = cfModule.CloudFormationClient;
        CreateChangeSetCommand = cfModule.CreateChangeSetCommand;
        DescribeChangeSetCommand = cfModule.DescribeChangeSetCommand;
        ExecuteChangeSetCommand = cfModule.ExecuteChangeSetCommand;
        GetTemplateCommand = cfModule.GetTemplateCommand;
    }
}

class AWSResourceImporter extends IResourceImporter {
    /**
     * Resource types that support import
     * Maps CloudFormation resource type to identifier property
     * @private
     */
    static IMPORTABLE_TYPES = {
        'AWS::EC2::VPC': 'VpcId',
        'AWS::EC2::Subnet': 'SubnetId',
        'AWS::EC2::SecurityGroup': 'GroupId',
        'AWS::EC2::RouteTable': 'RouteTableId',
        'AWS::RDS::DBCluster': 'DBClusterIdentifier',
        'AWS::KMS::Key': 'KeyId',
    };

    /**
     * Create AWS Resource Importer
     *
     * @param {Object} [config={}]
     * @param {string} [config.region] - AWS region (defaults to AWS_REGION env var)
     */
    constructor(config = {}) {
        super();
        this.region = config.region || process.env.AWS_REGION || 'us-east-1';
        this.client = null;
    }

    /**
     * Get or create CloudFormation client
     * @private
     */
    _getClient() {
        if (!this.client) {
            loadCloudFormation();
            this.client = new CloudFormationClient({ region: this.region });
        }
        return this.client;
    }

    /**
     * Check if a resource type supports import
     */
    async supportsImport(resourceType) {
        return resourceType in AWSResourceImporter.IMPORTABLE_TYPES;
    }

    /**
     * Get the identifier property for a resource type
     */
    async getIdentifierProperty(resourceType) {
        if (!(await this.supportsImport(resourceType))) {
            throw new Error(`Resource type ${resourceType} does not support import`);
        }

        return AWSResourceImporter.IMPORTABLE_TYPES[resourceType];
    }

    /**
     * Validate that a resource can be imported
     */
    async validateImport({ resourceType, physicalId, region }) {
        const canImport = await this.supportsImport(resourceType);

        if (!canImport) {
            return {
                canImport: false,
                reason: `Resource type ${resourceType} is not supported for import`,
                warnings: [],
            };
        }

        // Add resource-specific warnings
        const warnings = [];
        if (resourceType === 'AWS::RDS::DBCluster') {
            warnings.push(
                'Ensure DBCluster has required properties (Engine, MasterUsername, etc.)'
            );
        }

        return {
            canImport: true,
            reason: '',
            warnings,
        };
    }

    /**
     * Import a single resource into a stack
     */
    async importResource({ stackIdentifier, logicalId, resourceType, physicalId, properties }) {
        // Validate resource type
        if (!(await this.supportsImport(resourceType))) {
            throw new Error(`Resource type ${resourceType} does not support import`);
        }

        const client = this._getClient();

        // Get identifier property
        const identifierProperty = await this.getIdentifierProperty(resourceType);

        // Create change set for import
        const changeSetName = `import-${logicalId}-${Date.now()}`;

        const createChangeSetCommand = new CreateChangeSetCommand({
            StackName: stackIdentifier.stackName,
            ChangeSetName: changeSetName,
            ChangeSetType: 'IMPORT',
            ResourcesToImport: [
                {
                    ResourceType: resourceType,
                    LogicalResourceId: logicalId,
                    ResourceIdentifier: {
                        [identifierProperty]: physicalId,
                    },
                },
            ],
            TemplateBody: JSON.stringify({
                Resources: {
                    [logicalId]: {
                        Type: resourceType,
                        Properties: properties,
                    },
                },
            }),
        });

        const createResponse = await client.send(createChangeSetCommand);

        // Execute the change set
        const executeCommand = new ExecuteChangeSetCommand({
            ChangeSetName: changeSetName,
            StackName: stackIdentifier.stackName,
        });

        await client.send(executeCommand);

        return {
            operationId: createResponse.Id,
            status: 'IN_PROGRESS',
            message: `Resource import initiated via change set ${createResponse.Id}`,
        };
    }

    /**
     * Import multiple resources into a stack in a single operation
     */
    async importMultipleResources({ stackIdentifier, resources }) {
        const client = this._getClient();

        // Filter to only supported resources
        const supportedResources = [];
        const unsupportedResources = [];

        for (const resource of resources) {
            if (await this.supportsImport(resource.resourceType)) {
                supportedResources.push(resource);
            } else {
                unsupportedResources.push(resource);
            }
        }

        if (supportedResources.length === 0) {
            return {
                operationId: null,
                status: 'FAILED',
                importedCount: 0,
                failedCount: resources.length,
                message: 'No supported resources to import',
                details: [],
            };
        }

        // Build resources to import
        const resourcesToImport = [];
        const templateResources = {};

        for (const resource of supportedResources) {
            const identifierProperty = await this.getIdentifierProperty(resource.resourceType);

            resourcesToImport.push({
                ResourceType: resource.resourceType,
                LogicalResourceId: resource.logicalId,
                ResourceIdentifier: {
                    [identifierProperty]: resource.physicalId,
                },
            });

            templateResources[resource.logicalId] = {
                Type: resource.resourceType,
                Properties: resource.properties,
            };
        }

        // Create change set for import
        const changeSetName = `import-multi-${Date.now()}`;

        const createChangeSetCommand = new CreateChangeSetCommand({
            StackName: stackIdentifier.stackName,
            ChangeSetName: changeSetName,
            ChangeSetType: 'IMPORT',
            ResourcesToImport: resourcesToImport,
            TemplateBody: JSON.stringify({
                Resources: templateResources,
            }),
        });

        const createResponse = await client.send(createChangeSetCommand);

        // Execute the change set
        const executeCommand = new ExecuteChangeSetCommand({
            ChangeSetName: changeSetName,
            StackName: stackIdentifier.stackName,
        });

        await client.send(executeCommand);

        return {
            operationId: createResponse.Id,
            status: 'IN_PROGRESS',
            importedCount: supportedResources.length,
            failedCount: unsupportedResources.length,
            message: `Import operation initiated for ${supportedResources.length} resources`,
            details: [],
        };
    }

    /**
     * Get status of an import operation
     */
    async getImportStatus(operationId) {
        const client = this._getClient();

        const command = new DescribeChangeSetCommand({
            ChangeSetName: operationId,
        });

        const response = await client.send(command);

        // Map CloudFormation status to our status
        let status = 'IN_PROGRESS';
        let progress = 0;

        if (response.ExecutionStatus === 'EXECUTE_COMPLETE') {
            status = 'COMPLETE';
            progress = 100;
        } else if (response.Status === 'FAILED' || response.ExecutionStatus === 'EXECUTE_FAILED') {
            status = 'FAILED';
            progress = 0;
        } else if (response.Status === 'CREATE_COMPLETE') {
            status = 'IN_PROGRESS';
            progress = 50;
        } else if (response.Status === 'CREATE_PENDING') {
            status = 'IN_PROGRESS';
            progress = 25;
        }

        return {
            operationId,
            status,
            progress,
            message: response.StatusReason || '',
            completedTime: status === 'COMPLETE' ? response.CreationTime : null,
        };
    }

    /**
     * Generate CloudFormation template snippet for an imported resource
     */
    async generateTemplateSnippet({ logicalId, resourceType, properties }) {
        // Validate resource type
        if (!(await this.supportsImport(resourceType))) {
            throw new Error(`Resource type ${resourceType} does not support import`);
        }

        return {
            [logicalId]: {
                Type: resourceType,
                Properties: properties,
            },
        };
    }
}

module.exports = AWSResourceImporter;
