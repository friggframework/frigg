/**
 * AWSStackRepository - AWS CloudFormation Stack Adapter
 *
 * Infrastructure Adapter - Hexagonal Architecture
 *
 * Implements IStackRepository port for AWS CloudFormation.
 * Handles CloudFormation API operations using AWS SDK v3.
 *
 * Lazy-loads AWS SDK to minimize cold start time and memory usage.
 */

const IStackRepository = require('../../application/ports/IStackRepository');
const yaml = require('js-yaml');

// Lazy-loaded AWS SDK CloudFormation client
let CloudFormationClient,
    DescribeStacksCommand,
    ListStackResourcesCommand,
    DescribeStackResourcesCommand,
    DescribeStackResourceCommand,
    GetTemplateCommand,
    DetectStackDriftCommand,
    DescribeStackDriftDetectionStatusCommand,
    DescribeStackResourceDriftsCommand;

/**
 * Lazy load CloudFormation SDK
 */
function loadCloudFormation() {
    if (!CloudFormationClient) {
        const cfModule = require('@aws-sdk/client-cloudformation');
        CloudFormationClient = cfModule.CloudFormationClient;
        DescribeStacksCommand = cfModule.DescribeStacksCommand;
        ListStackResourcesCommand = cfModule.ListStackResourcesCommand;
        DescribeStackResourcesCommand = cfModule.DescribeStackResourcesCommand;
        DescribeStackResourceCommand = cfModule.DescribeStackResourceCommand;
        GetTemplateCommand = cfModule.GetTemplateCommand;
        DetectStackDriftCommand = cfModule.DetectStackDriftCommand;
        DescribeStackDriftDetectionStatusCommand =
            cfModule.DescribeStackDriftDetectionStatusCommand;
        DescribeStackResourceDriftsCommand = cfModule.DescribeStackResourceDriftsCommand;
    }
}

class AWSStackRepository extends IStackRepository {
    /**
     * Create AWS Stack Repository
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
     * Get stack information by identifier
     */
    async getStack(identifier) {
        const client = this._getClient();

        try {
            const command = new DescribeStacksCommand({
                StackName: identifier.stackName,
            });

            const response = await client.send(command);

            if (!response.Stacks || response.Stacks.length === 0) {
                throw new Error(
                    `Stack ${identifier.stackName} does not exist in region ${this.region}`
                );
            }

            const stack = response.Stacks[0];

            // Parse ARN to get account ID
            const arnMatch = stack.StackId.match(/:(\d{12}):/);
            const accountId = arnMatch ? arnMatch[1] : identifier.accountId;

            return {
                stackName: stack.StackName,
                region: this.region,
                accountId,
                stackId: stack.StackId,
                status: stack.StackStatus,
                creationTime: stack.CreationTime,
                lastUpdatedTime: stack.LastUpdatedTime,
                parameters: this._parseParameters(stack.Parameters),
                outputs: this._parseOutputs(stack.Outputs),
                tags: this._parseTags(stack.Tags),
            };
        } catch (error) {
            if (error.name === 'ValidationError' || error.message?.includes('does not exist')) {
                throw new Error(
                    `Stack ${identifier.stackName} does not exist in region ${this.region}`
                );
            }
            throw error;
        }
    }

    /**
     * List all resources in a stack
     */
    async listResources(identifier) {
        const client = this._getClient();
        const resources = [];
        let nextToken = null;

        do {
            const command = new ListStackResourcesCommand({
                StackName: identifier.stackName,
                NextToken: nextToken,
            });

            const response = await client.send(command);

            if (response.StackResourceSummaries) {
                for (const resource of response.StackResourceSummaries) {
                    resources.push({
                        logicalId: resource.LogicalResourceId,
                        physicalId: resource.PhysicalResourceId,
                        resourceType: resource.ResourceType,
                        status: resource.ResourceStatus,
                        lastUpdatedTime: resource.LastUpdatedTimestamp,
                        driftStatus: resource.DriftInformation?.StackResourceDriftStatus || 'NOT_CHECKED',
                    });
                }
            }

            nextToken = response.NextToken;
        } while (nextToken);

        return resources;
    }

    /**
     * Get resource details from stack
     */
    async getResource(identifier, logicalId) {
        const client = this._getClient();

        const command = new DescribeStackResourceCommand({
            StackName: identifier.stackName,
            LogicalResourceId: logicalId,
        });

        const response = await client.send(command);
        const resource = response.StackResourceDetail;

        return {
            logicalId: resource.LogicalResourceId,
            physicalId: resource.PhysicalResourceId,
            resourceType: resource.ResourceType,
            status: resource.ResourceStatus,
            properties: {}, // CloudFormation doesn't return properties directly
            metadata: this._parseMetadata(resource.Metadata),
        };
    }

    /**
     * Get the CloudFormation template for a stack
     */
    async getTemplate(identifier) {
        const client = this._getClient();

        const command = new GetTemplateCommand({
            StackName: identifier.stackName,
            TemplateStage: 'Original',
        });

        const response = await client.send(command);
        const templateBody = response.TemplateBody;

        // Try to parse as JSON first
        try {
            return JSON.parse(templateBody);
        } catch {
            // If not JSON, try YAML
            try {
                return yaml.load(templateBody);
            } catch {
                throw new Error('Failed to parse template body as JSON or YAML');
            }
        }
    }

    /**
     * Check if a stack exists
     */
    async exists(identifier) {
        try {
            const stack = await this.getStack(identifier);

            // Check if stack is in a deleted state
            const deletedStates = ['DELETE_COMPLETE', 'DELETE_IN_PROGRESS'];
            return !deletedStates.includes(stack.status);
        } catch (error) {
            if (error.message?.includes('does not exist')) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Detect drift for the entire stack
     */
    async detectStackDrift(identifier) {
        const client = this._getClient();

        // Initiate drift detection
        const detectCommand = new DetectStackDriftCommand({
            StackName: identifier.stackName,
        });

        const detectResponse = await client.send(detectCommand);
        const driftDetectionId = detectResponse.StackDriftDetectionId;

        // Poll for detection completion
        let detectionStatus = 'DETECTION_IN_PROGRESS';
        let statusResponse;

        while (detectionStatus === 'DETECTION_IN_PROGRESS') {
            await this._sleep(1000); // Wait 1 second between polls

            const statusCommand = new DescribeStackDriftDetectionStatusCommand({
                StackDriftDetectionId: driftDetectionId,
            });

            statusResponse = await client.send(statusCommand);
            detectionStatus = statusResponse.DetectionStatus;
        }

        if (detectionStatus !== 'DETECTION_COMPLETE') {
            throw new Error(`Drift detection failed with status: ${detectionStatus}`);
        }

        return {
            stackDriftStatus: statusResponse.StackDriftStatus,
            driftedResourceCount: statusResponse.DriftedStackResourceCount || 0,
            detectionTime: statusResponse.Timestamp,
        };
    }

    /**
     * Get drift details for a specific resource
     */
    async getResourceDrift(identifier, logicalId) {
        const client = this._getClient();

        const command = new DescribeStackResourceDriftsCommand({
            StackName: identifier.stackName,
            StackResourceDriftStatusFilters: ['MODIFIED', 'DELETED', 'IN_SYNC'],
        });

        const response = await client.send(command);

        // Find the specific resource
        const resourceDrift = response.StackResourceDrifts?.find(
            (drift) => drift.LogicalResourceId === logicalId
        );

        if (!resourceDrift) {
            throw new Error(
                `No drift information found for resource ${logicalId} in stack ${identifier.stackName}`
            );
        }

        return {
            driftStatus: resourceDrift.StackResourceDriftStatus,
            expectedProperties: this._parseProperties(resourceDrift.ExpectedProperties),
            actualProperties: this._parseProperties(resourceDrift.ActualProperties),
            propertyDifferences: resourceDrift.PropertyDifferences || [],
        };
    }

    // ========================================
    // Private Helper Methods
    // ========================================

    /**
     * Parse CloudFormation parameters to key-value object
     * @private
     */
    _parseParameters(parameters) {
        if (!parameters || parameters.length === 0) {
            return {};
        }

        const result = {};
        for (const param of parameters) {
            result[param.ParameterKey] = param.ParameterValue;
        }
        return result;
    }

    /**
     * Parse CloudFormation outputs to key-value object
     * @private
     */
    _parseOutputs(outputs) {
        if (!outputs || outputs.length === 0) {
            return {};
        }

        const result = {};
        for (const output of outputs) {
            result[output.OutputKey] = output.OutputValue;
        }
        return result;
    }

    /**
     * Parse CloudFormation tags to key-value object
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
     * Parse resource metadata
     * @private
     */
    _parseMetadata(metadata) {
        if (!metadata) {
            return {};
        }

        try {
            return JSON.parse(metadata);
        } catch {
            return {};
        }
    }

    /**
     * Parse property JSON string
     * @private
     */
    _parseProperties(propertiesString) {
        if (!propertiesString) {
            return {};
        }

        try {
            return JSON.parse(propertiesString);
        } catch {
            return {};
        }
    }

    /**
     * Sleep for specified milliseconds
     * @private
     */
    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

module.exports = AWSStackRepository;
