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
    DescribeStackResourceDriftsCommand,
    CreateChangeSetCommand,
    DescribeChangeSetCommand,
    ExecuteChangeSetCommand,
    DescribeStackEventsCommand;

// Lazy-loaded AWS SDK S3 client for large template uploads
let S3Client, PutObjectCommand;

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
        CreateChangeSetCommand = cfModule.CreateChangeSetCommand;
        DescribeChangeSetCommand = cfModule.DescribeChangeSetCommand;
        ExecuteChangeSetCommand = cfModule.ExecuteChangeSetCommand;
        DescribeStackEventsCommand = cfModule.DescribeStackEventsCommand;
    }
}

/**
 * Lazy load S3 SDK for template uploads
 */
function loadS3() {
    if (!S3Client) {
        const s3Module = require('@aws-sdk/client-s3');
        S3Client = s3Module.S3Client;
        PutObjectCommand = s3Module.PutObjectCommand;
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
        this.s3Client = null;
        // S3 bucket for large template uploads (defaults to serverless deployment bucket)
        this.templateBucket = config.templateBucket || null;
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
     * Get or create S3 client
     * @private
     */
    _getS3Client() {
        if (!this.s3Client) {
            loadS3();
            this.s3Client = new S3Client({ region: this.region });
        }
        return this.s3Client;
    }

    /**
     * Upload CloudFormation template to S3 (public API)
     *
     * Exposed as public method for use by other adapters that need to upload
     * templates to S3 before calling UpdateStack/CreateChangeSet.
     *
     * @param {Object} params - Upload parameters
     * @param {string} params.stackName - Stack name for S3 key prefix
     * @param {string} params.templateBody - CloudFormation template JSON string
     * @returns {Promise<string>} S3 URL for uploaded template
     */
    async uploadTemplate({ stackName, templateBody }) {
        return await this._uploadTemplateToS3({ stackName, templateBody });
    }

    /**
     * Upload template to S3 for large templates (> 51,200 bytes) - Internal implementation
     *
     * @param {Object} params - Upload parameters
     * @param {string} params.stackName - Stack name for S3 key prefix
     * @param {string} params.templateBody - CloudFormation template JSON string
     * @returns {Promise<string>} S3 URL for uploaded template
     * @private
     */
    async _uploadTemplateToS3({ stackName, templateBody }) {
        const s3Client = this._getS3Client();

        // Get serverless deployment bucket from stack if not configured
        if (!this.templateBucket) {
            try {
                const stacks = await this._getClient().send(
                    new DescribeStacksCommand({ StackName: stackName })
                );

                // Look for ServerlessDeploymentBucket output
                const bucket = stacks.Stacks[0]?.Outputs?.find(
                    o => o.OutputKey === 'ServerlessDeploymentBucketName'
                )?.OutputValue;

                if (bucket) {
                    this.templateBucket = bucket;
                } else {
                    throw new Error('No S3 bucket configured for template uploads. Set templateBucket in config or ensure ServerlessDeploymentBucket exists.');
                }
            } catch (error) {
                throw new Error(`Failed to find S3 bucket for template upload: ${error.message}`);
            }
        }

        // Generate S3 key with timestamp
        const timestamp = Date.now();
        const key = `cloudformation-templates/${stackName}/import-template-${timestamp}.json`;

        // Upload to S3
        const putCommand = new PutObjectCommand({
            Bucket: this.templateBucket,
            Key: key,
            Body: templateBody,
            ContentType: 'application/json',
        });

        await s3Client.send(putCommand);

        // Return S3 URL
        const s3Url = `https://${this.templateBucket}.s3.${this.region}.amazonaws.com/${key}`;

        if (process.env.DEBUG_IMPORT_TEMPLATE === 'true') {
            console.log(`[DEBUG] Template uploaded to S3: ${s3Url}`);
        }

        return s3Url;
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
    // CloudFormation Change Set Operations
    // ========================================

    /**
     * Create CloudFormation change set for import or update
     *
     * @param {Object} params - Change set parameters
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.changeSetName - Name for the change set
     * @param {string} params.changeSetType - Type of change set ('IMPORT', 'UPDATE', or 'CREATE')
     * @param {Object} params.template - CloudFormation template object
     * @param {Array} [params.resourcesToImport] - Resources to import (required for IMPORT type)
     * @returns {Promise<Object>} Change set result with Id and StackId
     * @throws {Error} If change set creation fails
     */
    async createChangeSet({ stackIdentifier, changeSetName, changeSetType, template, resourcesToImport }) {
        const client = this._getClient();

        // Ensure template is an object (not already stringified)
        const templateObj = typeof template === 'string' ? JSON.parse(template) : template;

        // Validate template structure
        if (!templateObj || typeof templateObj !== 'object') {
            throw new Error(`Invalid template: expected object, got ${typeof templateObj}`);
        }

        if (!templateObj.Resources || typeof templateObj.Resources !== 'object') {
            throw new Error(`Invalid template: missing or invalid Resources section`);
        }

        // DEBUG: Log template structure if debug enabled
        if (process.env.DEBUG_IMPORT_TEMPLATE === 'true') {
            console.log('[DEBUG] Template structure validation:');
            console.log('  - Top-level keys:', Object.keys(templateObj));
            console.log('  - Resources count:', Object.keys(templateObj.Resources).length);
            console.log('  - Resource types:', {
                ...Object.entries(templateObj.Resources).reduce((acc, [id, def]) => {
                    acc[id] = def.Type;
                    return acc;
                }, {})
            });

            if (resourcesToImport) {
                console.log('  - ResourcesToImport:', resourcesToImport.length);
                resourcesToImport.forEach((r, i) => {
                    console.log(`    ${i + 1}. ${r.LogicalResourceId} (${r.ResourceType})`);
                });
            }
        }

        const templateBody = JSON.stringify(templateObj, null, 2);
        const templateSize = templateBody.length;

        // CloudFormation inline template size limit (51,200 bytes)
        const TEMPLATE_SIZE_LIMIT = 51200;
        const useS3 = templateSize > TEMPLATE_SIZE_LIMIT;

        if (process.env.DEBUG_IMPORT_TEMPLATE === 'true') {
            console.log(`[DEBUG] Template size: ${templateSize} bytes (limit: ${TEMPLATE_SIZE_LIMIT})`);
            console.log(`[DEBUG] Using ${useS3 ? 'S3' : 'inline'} template delivery`);
        }

        const params = {
            StackName: stackIdentifier.stackName,
            ChangeSetName: changeSetName,
            ChangeSetType: changeSetType,
            // Add IAM capabilities for templates with IAM resources
            Capabilities: ['CAPABILITY_NAMED_IAM'],
        };

        // Use S3 for large templates, inline for small templates
        if (useS3) {
            const templateUrl = await this._uploadTemplateToS3({
                stackName: stackIdentifier.stackName,
                templateBody,
            });
            params.TemplateURL = templateUrl;
        } else {
            params.TemplateBody = templateBody;
        }

        // Add resources to import for IMPORT change sets
        if (changeSetType === 'IMPORT') {
            if (!resourcesToImport || resourcesToImport.length === 0) {
                throw new Error('resourcesToImport is required for IMPORT change set type');
            }
            params.ResourcesToImport = resourcesToImport;
        }

        try {
            const command = new CreateChangeSetCommand(params);
            const response = await client.send(command);

            return {
                Id: response.Id,
                StackId: response.StackId,
                templateUrl: useS3 ? params.TemplateURL : undefined,
            };
        } catch (error) {
            // Add more context to the error
            if (error.message?.includes('is not expected')) {
                throw new Error(`CloudFormation template format error: ${error.message}. Template size: ${templateSize} bytes, Resources to import: ${resourcesToImport?.length || 0}. Delivery method: ${useS3 ? 'S3' : 'inline'}. First 200 chars: ${templateBody.substring(0, 200)}`);
            }
            throw error;
        }
    }

    /**
     * Wait for change set to be ready (CREATE_COMPLETE status)
     *
     * @param {Object} params - Wait parameters
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.changeSetName - Name of the change set
     * @param {number} [params.maxAttempts=60] - Maximum polling attempts
     * @param {number} [params.delayMs=2000] - Delay between polling attempts in milliseconds
     * @returns {Promise<Object>} Change set details when ready
     * @throws {Error} If change set creation fails or times out
     */
    async waitForChangeSet({ stackIdentifier, changeSetName, maxAttempts = 60, delayMs = 2000 }) {
        const client = this._getClient();

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const command = new DescribeChangeSetCommand({
                StackName: stackIdentifier.stackName,
                ChangeSetName: changeSetName,
            });

            const response = await client.send(command);

            // Check for completion or failure
            // AWS requires BOTH Status and ExecutionStatus checks for import change sets
            if (response.Status === 'CREATE_COMPLETE') {
                // Also verify ExecutionStatus is AVAILABLE (not UNAVAILABLE, EXECUTE_IN_PROGRESS, etc.)
                if (response.ExecutionStatus === 'AVAILABLE') {
                    return response;
                } else if (response.ExecutionStatus === 'UNAVAILABLE') {
                    throw new Error(
                        `Change set cannot be executed: ${response.StatusReason || 'ExecutionStatus is UNAVAILABLE'}`
                    );
                }
                // If ExecutionStatus is EXECUTE_IN_PROGRESS or EXECUTE_COMPLETE, continue waiting
            }

            if (response.Status === 'FAILED') {
                throw new Error(
                    `Change set creation failed: ${response.StatusReason || 'Unknown reason'}`
                );
            }

            // Wait before next attempt
            await this._sleep(delayMs);
        }

        throw new Error(
            `Change set creation timed out after ${maxAttempts} attempts (${(maxAttempts * delayMs) / 1000}s)`
        );
    }

    /**
     * Execute a change set
     *
     * @param {Object} params - Execution parameters
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {string} params.changeSetName - Name of the change set to execute
     * @returns {Promise<Object>} Execution result (empty object on success)
     * @throws {Error} If change set execution fails
     */
    async executeChangeSet({ stackIdentifier, changeSetName }) {
        const client = this._getClient();

        const command = new ExecuteChangeSetCommand({
            StackName: stackIdentifier.stackName,
            ChangeSetName: changeSetName,
        });

        const response = await client.send(command);
        return response;
    }

    /**
     * Get stack events since a specific timestamp
     *
     * @param {Object} params - Event query parameters
     * @param {StackIdentifier} params.stackIdentifier - Stack identifier
     * @param {Date} params.since - Timestamp to filter events from
     * @returns {Promise<Array>} Array of stack events sorted chronologically
     * @returns {Promise<Array<Object>>} Array of events with properties:
     *   - EventId: string
     *   - StackName: string
     *   - LogicalResourceId: string
     *   - PhysicalResourceId: string
     *   - ResourceType: string
     *   - Timestamp: Date
     *   - ResourceStatus: string
     *   - ResourceStatusReason: string
     */
    async getStackEvents({ stackIdentifier, since }) {
        const client = this._getClient();
        const events = [];
        let nextToken = null;

        do {
            const command = new DescribeStackEventsCommand({
                StackName: stackIdentifier.stackName,
                NextToken: nextToken,
            });

            const response = await client.send(command);

            if (response.StackEvents) {
                // Filter events after the 'since' timestamp
                const filteredEvents = response.StackEvents.filter(
                    (event) => event.Timestamp > since
                );
                events.push(...filteredEvents);

                // Stop pagination if we've reached events before 'since'
                if (filteredEvents.length < response.StackEvents.length) {
                    break;
                }
            }

            nextToken = response.NextToken;
        } while (nextToken);

        // Sort chronologically (oldest first)
        return events.sort((a, b) => a.Timestamp - b.Timestamp);
    }

    /**
     * Get current stack status
     *
     * @param {StackIdentifier} identifier - Stack identifier
     * @returns {Promise<string>} Stack status (e.g., 'CREATE_COMPLETE', 'UPDATE_IN_PROGRESS')
     * @throws {Error} If stack does not exist
     */
    async getStackStatus(identifier) {
        const client = this._getClient();

        const command = new DescribeStacksCommand({
            StackName: identifier.stackName,
        });

        const response = await client.send(command);

        if (!response.Stacks || response.Stacks.length === 0) {
            throw new Error(
                `Stack ${identifier.stackName} does not exist in region ${this.region}`
            );
        }

        return response.Stacks[0].StackStatus;
    }

    /**
     * Get stack resources with detailed information
     *
     * @param {StackIdentifier} identifier - Stack identifier
     * @returns {Promise<Array>} Array of stack resources with full details
     * @returns {Promise<Array<Object>>} Array of resources with properties:
     *   - LogicalResourceId: string
     *   - PhysicalResourceId: string
     *   - ResourceType: string
     *   - ResourceStatus: string
     *   - Timestamp: Date
     *   - DriftInformation: Object (if available)
     * @throws {Error} If stack does not exist
     */
    async getStackResources(identifier) {
        const client = this._getClient();

        const command = new DescribeStackResourcesCommand({
            StackName: identifier.stackName,
        });

        const response = await client.send(command);

        return response.StackResources || [];
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
