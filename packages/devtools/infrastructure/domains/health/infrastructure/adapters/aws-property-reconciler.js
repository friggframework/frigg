/**
 * AWSPropertyReconciler - AWS Property Drift Reconciliation Adapter
 *
 * Infrastructure Adapter - Hexagonal Architecture
 *
 * Implements IPropertyReconciler port for AWS.
 * Handles property drift reconciliation via template or resource updates.
 *
 * Lazy-loads AWS SDK to minimize cold start time and memory usage.
 */

const IPropertyReconciler = require('../../application/ports/IPropertyReconciler');

// Lazy-loaded AWS SDK clients
let CloudFormationClient, UpdateStackCommand, GetTemplateCommand;
let EC2Client, ModifyVpcAttributeCommand;
let LambdaClient, UpdateFunctionConfigurationCommand;

/**
 * Lazy load CloudFormation SDK
 */
function loadCloudFormation() {
    if (!CloudFormationClient) {
        const cfModule = require('@aws-sdk/client-cloudformation');
        CloudFormationClient = cfModule.CloudFormationClient;
        UpdateStackCommand = cfModule.UpdateStackCommand;
        GetTemplateCommand = cfModule.GetTemplateCommand;
    }
}

/**
 * Lazy load EC2 SDK
 */
function loadEC2() {
    if (!EC2Client) {
        const ec2Module = require('@aws-sdk/client-ec2');
        EC2Client = ec2Module.EC2Client;
        ModifyVpcAttributeCommand = ec2Module.ModifyVpcAttributeCommand;
    }
}

/**
 * Lazy load Lambda SDK
 */
function loadLambda() {
    if (!LambdaClient) {
        const lambdaModule = require('@aws-sdk/client-lambda');
        LambdaClient = lambdaModule.LambdaClient;
        UpdateFunctionConfigurationCommand = lambdaModule.UpdateFunctionConfigurationCommand;
    }
}

class AWSPropertyReconciler extends IPropertyReconciler {
    /**
     * Resource types that support reconciliation
     * @private
     */
    static SUPPORTED_TYPES = {
        'AWS::EC2::VPC': {
            templateUpdate: true,
            resourceUpdate: true,
            recommendedMode: 'template',
            limitations: ['Some VPC properties require resource replacement (e.g., CidrBlock)'],
        },
        'AWS::EC2::Subnet': {
            templateUpdate: true,
            resourceUpdate: false,
            recommendedMode: 'template',
            limitations: ['Most Subnet properties are immutable'],
        },
        'AWS::EC2::SecurityGroup': {
            templateUpdate: true,
            resourceUpdate: true,
            recommendedMode: 'template',
            limitations: ['Rule changes may cause brief connectivity interruption'],
        },
        'AWS::EC2::RouteTable': {
            templateUpdate: true,
            resourceUpdate: false,
            recommendedMode: 'template',
            limitations: ['Route changes require CloudFormation update'],
        },
        'AWS::RDS::DBCluster': {
            templateUpdate: true,
            resourceUpdate: false,
            recommendedMode: 'template',
            limitations: ['Many DBCluster properties require specific update windows'],
        },
        'AWS::KMS::Key': {
            templateUpdate: true,
            resourceUpdate: false,
            recommendedMode: 'template',
            limitations: ['Key policy changes must be done via CloudFormation'],
        },
        'AWS::Lambda::Function': {
            templateUpdate: true,
            resourceUpdate: true,
            recommendedMode: 'template',
            limitations: [
                'VpcConfig changes may take several minutes to propagate',
                'Code updates are handled separately via UpdateFunctionCode',
                'Environment variable changes may cause brief invocation errors during update',
            ],
        },
    };

    /**
     * Create AWS Property Reconciler
     *
     * @param {Object} [config={}]
     * @param {string} [config.region] - AWS region (defaults to AWS_REGION env var)
     * @param {Object} [config.cloudFormationRepository] - CloudFormation repository for monitoring
     */
    constructor(config = {}) {
        super();
        this.region = config.region || process.env.AWS_REGION || 'us-east-1';
        this.cfClient = null;
        this.ec2Client = null;
        this.lambdaClient = null;
        this.cfRepo = config.cloudFormationRepository || null;
    }

    /**
     * Get or create CloudFormation client
     * @private
     */
    _getCFClient() {
        if (!this.cfClient) {
            loadCloudFormation();
            this.cfClient = new CloudFormationClient({ region: this.region });
        }
        return this.cfClient;
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
     * Get or create Lambda client
     * @private
     */
    _getLambdaClient() {
        if (!this.lambdaClient) {
            loadLambda();
            this.lambdaClient = new LambdaClient({ region: this.region });
        }
        return this.lambdaClient;
    }

    /**
     * Check if a property mismatch can be auto-fixed
     */
    async canReconcile(mismatch) {
        // Immutable properties cannot be reconciled (require replacement)
        if (mismatch.requiresReplacement()) {
            return false;
        }

        // Mutable and conditional properties can be reconciled
        // Note: CONDITIONAL may require additional validation, but we treat it as reconcilable
        return true;
    }

    /**
     * Reconcile a single property mismatch
     */
    async reconcileProperty({ stackIdentifier, logicalId, mismatch, mode = 'template' }) {
        if (mode === 'template') {
            return await this._reconcileViaTemplate({
                stackIdentifier,
                logicalId,
                mismatch,
            });
        } else {
            return await this._reconcileViaResource({
                stackIdentifier,
                logicalId,
                mismatch,
            });
        }
    }

    /**
     * Reconcile multiple property mismatches for a resource
     *
     * IMPORTANT: Batches all property updates into a SINGLE UpdateStack call
     * to avoid "stack is already updating" errors from CloudFormation.
     *
     * MONITORING: After calling UpdateStack, monitors the stack until UPDATE_COMPLETE
     * or UPDATE_FAILED to ensure the update actually succeeded.
     */
    async reconcileMultipleProperties({
        stackIdentifier,
        logicalId,
        physicalId,
        resourceType,
        mismatches,
        mode = 'template',
        progressMonitor = null, // Optional UpdateProgressMonitor for async tracking
    }) {
        // Route to appropriate reconciliation method based on mode
        if (mode === 'resource') {
            return await this._reconcileMultiplePropertiesViaResource({
                stackIdentifier,
                logicalId,
                physicalId,
                resourceType,
                mismatches,
            });
        }

        // Template mode (original implementation)
        const results = [];
        let reconciledCount = 0;
        let failedCount = 0;

        try {
            const client = this._getCFClient();

            // 1. Get current template ONCE
            const getTemplateCommand = new GetTemplateCommand({
                StackName: stackIdentifier.stackName,
                TemplateStage: 'Original',
            });

            const templateResponse = await client.send(getTemplateCommand);
            const template = JSON.parse(templateResponse.TemplateBody);

            // 2. Apply ALL property changes to the template
            for (const mismatch of mismatches) {
                try {
                    // Navigate to the property in the template
                    // AWS drift detection returns paths without 'Properties.' prefix (e.g., 'VpcConfig.SubnetIds')
                    // But CloudFormation templates have 'Properties' section, so we need to navigate there
                    const pathParts = mismatch.propertyPath.split('.');
                    let current = template.Resources[logicalId];

                    // Ensure Properties section exists
                    if (!current.Properties) {
                        current.Properties = {};
                    }

                    // Start navigation at Properties level
                    current = current.Properties;

                    // Create nested objects if they don't exist
                    for (let i = 0; i < pathParts.length - 1; i++) {
                        if (!current[pathParts[i]]) {
                            current[pathParts[i]] = {};
                        }
                        current = current[pathParts[i]];
                    }

                    // Update the property value
                    const lastPart = pathParts[pathParts.length - 1];
                    current[lastPart] = mismatch.actualValue;

                    // Track as pending (will be confirmed by monitor)
                    results.push({
                        success: true,
                        mode: 'template',
                        propertyPath: mismatch.propertyPath,
                        oldValue: mismatch.expectedValue,
                        newValue: mismatch.actualValue,
                        message: 'Property updated in template',
                    });
                    reconciledCount++;
                } catch (error) {
                    // Track as failed
                    results.push({
                        success: false,
                        mode: 'template',
                        propertyPath: mismatch.propertyPath,
                        message: `Failed to update property: ${error.message}`,
                    });
                    failedCount++;
                }
            }

            // 3. If any properties were updated, call UpdateStack ONCE with all changes
            if (reconciledCount > 0) {
                const templateBody = JSON.stringify(template);
                const templateSize = templateBody.length;
                const TEMPLATE_SIZE_LIMIT = 51200; // CloudFormation inline template limit

                // Use S3 for large templates, inline for small templates
                const updateParams = {
                    StackName: stackIdentifier.stackName,
                };

                if (templateSize > TEMPLATE_SIZE_LIMIT && this.cfRepo) {
                    // Upload template to S3 and use TemplateURL
                    const templateUrl = await this.cfRepo.uploadTemplate({
                        stackName: stackIdentifier.stackName,
                        templateBody,
                    });
                    updateParams.TemplateURL = templateUrl;
                } else {
                    // Use inline template body
                    updateParams.TemplateBody = templateBody;
                }

                // Add capabilities required for IAM resources
                updateParams.Capabilities = ['CAPABILITY_NAMED_IAM'];

                const updateCommand = new UpdateStackCommand(updateParams);
                await client.send(updateCommand);

                // 4. Monitor UpdateStack operation if CloudFormation repository available
                if (this.cfRepo) {
                    const { UpdateProgressMonitor } = require('../../domain/services/update-progress-monitor');
                    const monitor = new UpdateProgressMonitor({
                        cloudFormationRepository: this.cfRepo,
                    });

                    const monitorResult = await monitor.monitorUpdate({
                        stackIdentifier,
                        resourceLogicalIds: [logicalId],
                        onProgress: (progress) => {
                            // Progress callback for UI updates (optional)
                            if (progress.status === 'FAILED') {
                                console.log(`  ⚠ ${progress.logicalId}: Update failed - ${progress.reason}`);
                            }
                        },
                    });

                    // If monitoring detected failures, update results
                    if (!monitorResult.success) {
                        reconciledCount = 0;
                        failedCount = mismatches.length;
                        results.forEach(r => {
                            r.success = false;
                            r.message = 'CloudFormation update failed';
                        });

                        return {
                            reconciledCount,
                            failedCount,
                            results,
                            message: `Update failed: ${monitorResult.failedResources.map(f => f.reason).join(', ')}`,
                        };
                    }
                }
            }
        } catch (error) {
            // If UpdateStack fails, mark all as failed
            return {
                reconciledCount: 0,
                failedCount: mismatches.length,
                results: mismatches.map(m => ({
                    success: false,
                    mode: 'template',
                    propertyPath: m.propertyPath,
                    message: `UpdateStack failed: ${error.message}`,
                })),
                message: `UpdateStack failed: ${error.message}`,
            };
        }

        return {
            reconciledCount,
            failedCount,
            results,
            message: `Reconciled ${reconciledCount} of ${mismatches.length} properties in single UpdateStack call`,
        };
    }

    /**
     * Preview property reconciliation without applying changes
     */
    async previewReconciliation({ stackIdentifier, logicalId, mismatch, mode = 'template' }) {
        const canReconcile = await this.canReconcile(mismatch);

        const warnings = [];
        if (mismatch.requiresReplacement()) {
            warnings.push('Property is immutable - requires resource replacement');
        }

        let impact = '';
        if (mode === 'template') {
            impact = 'Will update CloudFormation template to match actual resource state';
        } else {
            impact = 'Will update cloud resource to match template definition';
        }

        return {
            canReconcile,
            mode,
            propertyPath: mismatch.propertyPath,
            currentValue: mismatch.expectedValue,
            proposedValue: mismatch.actualValue,
            impact,
            warnings,
        };
    }

    /**
     * Update CloudFormation template property
     */
    async updateTemplateProperty({ stackIdentifier, logicalId, propertyPath, newValue }) {
        const client = this._getCFClient();

        // Get current template
        const getTemplateCommand = new GetTemplateCommand({
            StackName: stackIdentifier.stackName,
            TemplateStage: 'Original',
        });

        const templateResponse = await client.send(getTemplateCommand);
        const template = JSON.parse(templateResponse.TemplateBody);

        // Update property in template
        const pathParts = propertyPath.split('.');
        let current = template.Resources[logicalId];

        for (let i = 0; i < pathParts.length - 1; i++) {
            if (!current[pathParts[i]]) {
                current[pathParts[i]] = {};
            }
            current = current[pathParts[i]];
        }

        const lastPart = pathParts[pathParts.length - 1];
        current[lastPart] = newValue;

        // Update stack with new template
        const updateCommand = new UpdateStackCommand({
            StackName: stackIdentifier.stackName,
            TemplateBody: JSON.stringify(template),
            Capabilities: ['CAPABILITY_NAMED_IAM'],
        });

        const updateResponse = await client.send(updateCommand);

        return {
            success: true,
            changeSetId: updateResponse.StackId,
            message: 'Template property updated successfully',
        };
    }

    /**
     * Update cloud resource property directly
     */
    async updateResourceProperty({ resourceType, physicalId, region, propertyPath, newValue }) {
        // Only VPC properties are supported for direct resource updates in this implementation
        if (resourceType === 'AWS::EC2::VPC') {
            return await this._updateVpcProperty({ physicalId, propertyPath, newValue });
        }

        throw new Error(`Resource type ${resourceType} updates not supported`);
    }

    /**
     * Get reconciliation strategy for a resource type
     */
    async getReconciliationStrategy(resourceType) {
        if (!(resourceType in AWSPropertyReconciler.SUPPORTED_TYPES)) {
            throw new Error(`Resource type ${resourceType} not supported`);
        }

        const config = AWSPropertyReconciler.SUPPORTED_TYPES[resourceType];

        return {
            supportsTemplateUpdate: config.templateUpdate,
            supportsResourceUpdate: config.resourceUpdate,
            recommendedMode: config.recommendedMode,
            limitations: config.limitations,
        };
    }

    // ========================================
    // Private Helper Methods
    // ========================================

    /**
     * Reconcile via template update
     * @private
     */
    async _reconcileViaTemplate({ stackIdentifier, logicalId, mismatch }) {
        await this.updateTemplateProperty({
            stackIdentifier,
            logicalId,
            propertyPath: mismatch.propertyPath,
            newValue: mismatch.actualValue,
        });

        return {
            success: true,
            mode: 'template',
            propertyPath: mismatch.propertyPath,
            oldValue: mismatch.expectedValue,
            newValue: mismatch.actualValue,
            message: 'Template updated to match actual resource state',
        };
    }

    /**
     * Reconcile via resource update
     * @private
     */
    async _reconcileViaResource({ stackIdentifier, logicalId, mismatch }) {
        // This is a simplified implementation
        // In production, would need resource type detection and proper API calls

        // For now, only support VPC properties
        if (!mismatch.propertyPath.includes('EnableDns')) {
            throw new Error('Resource property update not supported for this property');
        }

        // Mock resource update (in real implementation, would use EC2 API)
        const client = this._getEC2Client();
        const command = new ModifyVpcAttributeCommand({
            VpcId: 'vpc-placeholder',
            EnableDnsSupport: { Value: mismatch.expectedValue },
        });

        await client.send(command);

        return {
            success: true,
            mode: 'resource',
            propertyPath: mismatch.propertyPath,
            oldValue: mismatch.actualValue,
            newValue: mismatch.expectedValue,
            message: 'Resource updated to match template definition',
        };
    }

    /**
     * Update VPC property directly
     * @private
     */
    async _updateVpcProperty({ physicalId, propertyPath, newValue }) {
        const client = this._getEC2Client();

        // Map property paths to VPC attribute names
        if (propertyPath === 'Properties.EnableDnsSupport') {
            const command = new ModifyVpcAttributeCommand({
                VpcId: physicalId,
                EnableDnsSupport: { Value: newValue },
            });

            await client.send(command);
        } else if (propertyPath === 'Properties.EnableDnsHostnames') {
            const command = new ModifyVpcAttributeCommand({
                VpcId: physicalId,
                EnableDnsHostnames: { Value: newValue },
            });

            await client.send(command);
        } else {
            throw new Error(`Property ${propertyPath} cannot be updated directly`);
        }

        return {
            success: true,
            message: `VPC property ${propertyPath} updated successfully`,
            updatedAt: new Date(),
        };
    }

    /**
     * Reconcile multiple properties via resource update (resource mode)
     *
     * Domain Service - Hexagonal Architecture
     * Coordinates AWS API calls to update cloud resources directly
     *
     * @private
     */
    async _reconcileMultiplePropertiesViaResource({
        stackIdentifier,
        logicalId,
        physicalId,
        resourceType,
        mismatches,
    }) {
        // Validate resource type supports resource mode
        if (resourceType !== 'AWS::Lambda::Function') {
            throw new Error(`Resource mode reconciliation not supported for ${resourceType}`);
        }

        const results = [];
        let reconciledCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        try {
            // Separate mutable from immutable properties
            const mutableMismatches = [];
            const mutableIndexMap = new Map(); // Track original index for mutable properties

            for (let i = 0; i < mismatches.length; i++) {
                const mismatch = mismatches[i];
                if (mismatch.requiresReplacement()) {
                    skippedCount++;
                } else {
                    mutableIndexMap.set(mismatch, i);
                    mutableMismatches.push(mismatch);
                }
            }

            // If no mutable properties, return early with all marked as skipped
            if (mutableMismatches.length === 0) {
                const skippedResults = mismatches.map(m => ({
                    success: false,
                    mode: 'resource',
                    propertyPath: m.propertyPath,
                    message: `Skipped: Property is immutable and cannot be updated without replacement`,
                }));

                return {
                    reconciledCount: 0,
                    failedCount: 0,
                    skippedCount,
                    results: skippedResults,
                    message: `All ${mismatches.length} properties are immutable and cannot be reconciled in resource mode`,
                };
            }

            // Route to resource-specific updater
            let lambdaResults = [];
            if (resourceType === 'AWS::Lambda::Function') {
                const lambdaResult = await this._updateLambdaFunction({
                    physicalId,
                    mismatches: mutableMismatches,
                });

                reconciledCount = lambdaResult.reconciledCount;
                failedCount = lambdaResult.failedCount;
                lambdaResults = lambdaResult.results;
            }

            // Build results array in original input order
            for (let i = 0; i < mismatches.length; i++) {
                const mismatch = mismatches[i];
                if (mismatch.requiresReplacement()) {
                    // Immutable - add skip result
                    results.push({
                        success: false,
                        mode: 'resource',
                        propertyPath: mismatch.propertyPath,
                        message: `Skipped: Property is immutable and cannot be updated without replacement`,
                    });
                } else {
                    // Mutable - find corresponding result from Lambda update
                    const lambdaResult = lambdaResults.find(r => r.propertyPath === mismatch.propertyPath);
                    if (lambdaResult) {
                        results.push(lambdaResult);
                    }
                }
            }
        } catch (error) {
            // If update fails, mark all as failed
            return {
                reconciledCount: 0,
                failedCount: mismatches.length,
                skippedCount: 0,
                results: mismatches.map(m => ({
                    success: false,
                    mode: 'resource',
                    propertyPath: m.propertyPath,
                    message: `Failed to update Lambda: ${error.message}`,
                })),
                message: `Failed to update Lambda: ${error.message}`,
            };
        }

        // Determine appropriate message based on outcome
        let message;
        if (failedCount > 0 && reconciledCount === 0) {
            message = `Failed to update Lambda: ${results.find(r => !r.success)?.message || 'Unknown error'}`;
        } else if (failedCount > 0) {
            message = `Partially updated Lambda VpcConfig (${reconciledCount} succeeded, ${failedCount} failed)`;
        } else {
            message = `Lambda VpcConfig updated via UpdateFunctionConfiguration (${reconciledCount} properties reconciled)`;
        }

        return {
            reconciledCount,
            failedCount,
            skippedCount,
            results,
            message,
        };
    }

    /**
     * Update Lambda function configuration via AWS Lambda API
     *
     * Infrastructure Adapter
     * Translates domain mismatches to AWS Lambda UpdateFunctionConfiguration call
     *
     * @private
     */
    async _updateLambdaFunction({ physicalId, mismatches }) {
        const client = this._getLambdaClient();
        const results = [];
        let reconciledCount = 0;
        let failedCount = 0;

        try {
            // Build VpcConfig update from mismatches
            const vpcConfigUpdate = {};
            const vpcConfigMismatches = mismatches.filter(m =>
                m.propertyPath.startsWith('VpcConfig')
            );

            for (const mismatch of vpcConfigMismatches) {
                // Property path format: "VpcConfig.SubnetIds" or "VpcConfig.SecurityGroupIds"
                const parts = mismatch.propertyPath.split('.');
                if (parts.length === 2 && parts[0] === 'VpcConfig') {
                    vpcConfigUpdate[parts[1]] = mismatch.expectedValue;
                }
            }

            // If we have VpcConfig updates, call UpdateFunctionConfiguration
            if (Object.keys(vpcConfigUpdate).length > 0) {
                const command = new UpdateFunctionConfigurationCommand({
                    FunctionName: physicalId,
                    VpcConfig: vpcConfigUpdate,
                });

                await client.send(command);

                // Mark all VpcConfig properties as successful
                for (const mismatch of vpcConfigMismatches) {
                    results.push({
                        success: true,
                        mode: 'resource',
                        propertyPath: mismatch.propertyPath,
                        oldValue: mismatch.actualValue,
                        newValue: mismatch.expectedValue,
                        message: 'Lambda VpcConfig updated successfully',
                    });
                    reconciledCount++;
                }
            }

            // Handle non-VpcConfig properties (currently unsupported)
            const otherMismatches = mismatches.filter(m =>
                !m.propertyPath.startsWith('VpcConfig')
            );
            for (const mismatch of otherMismatches) {
                results.push({
                    success: false,
                    mode: 'resource',
                    propertyPath: mismatch.propertyPath,
                    message: `Property ${mismatch.propertyPath} updates not yet supported in resource mode`,
                });
                failedCount++;
            }
        } catch (error) {
            // If Lambda API call fails, mark all as failed
            for (const mismatch of mismatches) {
                results.push({
                    success: false,
                    mode: 'resource',
                    propertyPath: mismatch.propertyPath,
                    message: `Lambda update failed: ${error.message}`,
                });
                failedCount++;
            }
            reconciledCount = 0;
        }

        return {
            reconciledCount,
            failedCount,
            results,
        };
    }
}

module.exports = AWSPropertyReconciler;
